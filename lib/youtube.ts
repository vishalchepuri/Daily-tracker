import { prisma } from "@/lib/db";
import { decryptOAuthTokenFields, encryptOAuthTokenFields } from "@/lib/oauth-token-encryption";

const YOUTUBE_SCOPE = "https://www.googleapis.com/auth/youtube.readonly";

export async function getGoogleAccount(userId: string) {
  const accounts = await prisma.account.findMany({
    where: { userId, provider: "google" },
  });
  const decrypted = accounts.map((account) => decryptOAuthTokenFields(account));
  return (
    decrypted.find((account) => account.access_token && !googleNeedsReconnect(account.scope)) ??
    decrypted.find((account) => !googleNeedsReconnect(account.scope)) ??
    decrypted.find((account) => account.access_token) ??
    decrypted[0] ??
    null
  );
}

export function googleNeedsReconnect(scope?: string | null) {
  return !scope?.split(/\s+/).includes(YOUTUBE_SCOPE);
}

async function refreshGoogleAccessToken(account: Awaited<ReturnType<typeof getGoogleAccount>>) {
  if (!account?.refresh_token || !process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return null;
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: account.refresh_token,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) return null;

  const updated = await prisma.account.update({
    where: { id: account.id },
    data: {
      ...encryptOAuthTokenFields({
        access_token: data.access_token,
        refresh_token: data.refresh_token ?? account.refresh_token,
      }),
      expires_at: data.expires_in ? Math.floor(Date.now() / 1000) + Number(data.expires_in) : account.expires_at,
      token_type: data.token_type ?? account.token_type,
      scope: data.scope ? Array.from(new Set(`${account.scope ?? ""} ${data.scope}`.split(/\s+/).filter(Boolean))).join(" ") : account.scope,
    },
  });
  return decryptOAuthTokenFields(updated);
}

function youtubeErrorPayload(data: any, status: number) {
  const errorReason = data?.error?.details?.find?.((detail: any) => detail?.reason)?.reason;
  const activationUrl = data?.error?.details?.find?.((detail: any) => detail?.metadata?.activationUrl)?.metadata?.activationUrl;
  if (errorReason === "SERVICE_DISABLED") {
    return {
      error:
        "YouTube Data API v3 is disabled in Google Cloud. Enable it for this project, wait a few minutes, then refresh YT Summary.",
      actionUrl: activationUrl,
      needsConnection: false,
    };
  }

  const message =
    data?.error?.message ||
    data?.error_description ||
    data?.message ||
    "Could not read YouTube. Please reconnect Google with YouTube access.";
  const reason = data?.error?.errors?.[0]?.reason || data?.error;
  return {
    error: String(message),
    needsConnection:
      status === 401 ||
      reason === "insufficientPermissions" ||
      /insufficient|permission|auth|credential|token/i.test(String(message)),
  };
}

export async function youtubeFetch(userId: string, url: string) {
  let account: any = await getGoogleAccount(userId);
  if (!account?.access_token || googleNeedsReconnect(account.scope)) {
    return {
      ok: false as const,
      status: 400,
      data: {
        error: "Connect Google with YouTube access first.",
        needsConnection: true,
      },
    };
  }

  if (account.expires_at && account.expires_at < Math.floor(Date.now() / 1000) + 60) {
    account = await refreshGoogleAccessToken(account);
  }

  if (!account?.access_token) {
    return {
      ok: false as const,
      status: 400,
      data: {
        error: "Connect Google with YouTube access first.",
        needsConnection: true,
      },
    };
  }

  let res = await fetch(url, {
    headers: { Authorization: `Bearer ${account.access_token}` },
  });
  let data = await res.json().catch(() => ({}));

  if (res.status === 401 && account.refresh_token) {
    const refreshed = await refreshGoogleAccessToken(account);
    if (refreshed?.access_token) {
      account = refreshed;
      res = await fetch(url, {
        headers: { Authorization: `Bearer ${account.access_token}` },
      });
      data = await res.json().catch(() => ({}));
    }
  }

  if (!res.ok) {
    return {
      ok: false as const,
      status: res.status,
      data: youtubeErrorPayload(data, res.status),
    };
  }
  return { ok: res.ok as boolean, status: res.status, data };
}

export function htmlDecode(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

export async function getPublicTranscript(videoId: string) {
  try {
    const watchRes = await fetch(`https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!watchRes.ok) return "";
    const html = await watchRes.text();
    const match = html.match(/"captionTracks":(\[.*?\])/);
    if (!match?.[1]) return "";
    const tracks = JSON.parse(match[1].replace(/\\"/g, '"'));
    const track = tracks.find((item: any) => item.languageCode?.startsWith?.("en")) ?? tracks[0];
    if (!track?.baseUrl) return "";
    const transcriptRes = await fetch(`${track.baseUrl}&fmt=srv3`);
    if (!transcriptRes.ok) return "";
    const xml = await transcriptRes.text();
    return htmlDecode(
      xml
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
    );
  } catch {
    return "";
  }
}
