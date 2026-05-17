import { prisma } from "@/lib/db";

export async function getGoogleAccount(userId: string) {
  return prisma.account.findFirst({
    where: { userId, provider: "google" },
    orderBy: { id: "desc" },
  });
}

export function googleNeedsReconnect(scope?: string | null) {
  return !scope?.includes("youtube.readonly");
}

export async function youtubeFetch(userId: string, url: string) {
  const account = await getGoogleAccount(userId);
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

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${account.access_token}` },
  });
  const data = await res.json().catch(() => ({}));
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
