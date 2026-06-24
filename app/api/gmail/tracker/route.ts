export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { listGmailTrackedMessages, upsertGmailTrackedMessage } from "@/lib/firestore-app-data";
import { decryptOAuthTokenFields, encryptOAuthTokenFields } from "@/lib/oauth-token-encryption";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";

const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const DEFAULT_QUERY = "newer_than:45d -category:promotions";
const MAX_SYNC_EMAILS = 60;

const categoryRules = [
  {
    category: "bills",
    keywords: ["bill", "due", "electricity", "current bill", "recharge", "invoice due", "payment reminder", "statement"],
  },
  {
    category: "finance",
    keywords: ["bank", "upi", "debited", "credited", "payment", "receipt", "card", "account", "inr", "transaction", "refund"],
  },
  {
    category: "orders",
    keywords: ["order", "shipped", "delivered", "dispatch", "amazon", "flipkart", "myntra", "swiggy", "zomato", "zepto"],
  },
  {
    category: "travel",
    keywords: ["flight", "train", "irctc", "boarding", "booking", "hotel", "uber", "ola", "ticket", "trip"],
  },
  {
    category: "health",
    keywords: ["health", "medical", "doctor", "appointment", "lab", "report", "pharmacy", "medicine", "prescription"],
  },
  {
    category: "security",
    keywords: ["security alert", "verification", "otp", "password", "login", "sign-in", "2fa", "recovery"],
  },
  {
    category: "work",
    keywords: ["meeting", "calendar", "jira", "github", "slack", "notion", "office", "interview", "offer", "deadline"],
  },
  {
    category: "subscriptions",
    keywords: ["subscription", "renewal", "membership", "plan renews", "trial ends"],
  },
  {
    category: "social",
    keywords: ["linkedin", "instagram", "facebook", "whatsapp", "twitter", "x.com"],
  },
  {
    category: "updates",
    keywords: ["newsletter", "digest", "update", "release", "alert", "announcement"],
  },
] as const;

function hasScope(scope?: string | null) {
  return Boolean(scope?.split(/\s+/).includes(GMAIL_SCOPE));
}

function findHeader(headers: any[] = [], name: string) {
  return headers.find((header) => header.name?.toLowerCase?.() === name.toLowerCase())?.value ?? "";
}

function extractEmail(value: string) {
  return value.match(/<([^>]+)>/)?.[1] ?? value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? "";
}

function trimText(value: string, max = 220) {
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function hasAttachments(payload: any): boolean {
  if (!payload) return false;
  if (payload.filename) return true;
  return (payload.parts ?? []).some((part: any) => hasAttachments(part));
}

function classifyMessage(input: { subject: string; from: string; snippet: string; labelIds: string[] }) {
  const text = `${input.subject} ${input.from} ${input.snippet} ${input.labelIds.join(" ")}`.toLowerCase();
  const matched = categoryRules.find((rule) => rule.keywords.some((keyword) => text.includes(keyword)));
  const category = matched?.category ?? (text.includes("personal") ? "personal" : "other");
  const urgentWords = ["due", "overdue", "last date", "action required", "security alert", "failed", "blocked", "expires", "pay by"];
  const lowWords = ["newsletter", "digest", "promotion", "offer", "sale"];
  const importance = urgentWords.some((word) => text.includes(word))
    ? "high"
    : lowWords.some((word) => text.includes(word))
      ? "low"
      : ["bills", "security", "work"].includes(category)
        ? "high"
        : "medium";
  return { category, importance };
}

function summarizeCounts(items: any[]) {
  return items.reduce<Record<string, number>>((acc, item) => {
    const key = String(item.category ?? "other");
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
}

async function findGmailAccount(userId: string) {
  const accounts = await prisma.account.findMany({
    where: { userId, provider: "google" },
  });
  const decrypted = accounts.map((account) => decryptOAuthTokenFields(account));
  return (
    decrypted.find((account) => account.access_token && hasScope(account.scope)) ??
    decrypted.find((account) => hasScope(account.scope)) ??
    decrypted.find((account) => account.access_token) ??
    decrypted[0] ??
    null
  );
}

async function refreshGoogleAccessToken(account: any) {
  if (!account?.refresh_token || !process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) return null;

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
      scope: data.scope
        ? Array.from(new Set(`${account.scope ?? ""} ${data.scope}`.split(/\s+/).filter(Boolean))).join(" ")
        : account.scope,
    },
  });
  return decryptOAuthTokenFields(updated);
}

async function gmailFetch(account: any, url: string) {
  let res = await fetch(url, { headers: { Authorization: `Bearer ${account.access_token}` } });
  if (res.status !== 401 || !account.refresh_token) return { res, account };

  const refreshed = await refreshGoogleAccessToken(account);
  if (!refreshed?.access_token) return { res, account };
  res = await fetch(url, { headers: { Authorization: `Bearer ${refreshed.access_token}` } });
  return { res, account: refreshed };
}

export async function GET(req: Request) {
  const user = await requireCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const limit = Number(url.searchParams.get("limit") ?? 60);
  const category = url.searchParams.get("category") ?? "all";
  const items = await listGmailTrackedMessages(user.id, { limit, category });
  return NextResponse.json({
    items,
    groupedCounts: summarizeCounts(items),
  });
}

export async function POST(req: Request) {
  try {
    const user = await requireCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const limited = rateLimit(req, "gmail-tracker-sync", { limit: 12, windowMs: 60 * 60 * 1000, userId: user.id });
    if (!limited.ok) {
      return NextResponse.json(
        { error: "Too many Gmail tracker syncs. Please try again later." },
        { status: 429, headers: rateLimitHeaders(limited) }
      );
    }

    const body = await req.json().catch(() => ({}));
    const limit = Math.min(Math.max(Number(body?.limit ?? MAX_SYNC_EMAILS), 1), MAX_SYNC_EMAILS);
    const query = trimText(String(body?.query || DEFAULT_QUERY), 120);

    let account: any = await findGmailAccount(user.id);
    if (!account?.access_token || !hasScope(account.scope)) {
      return NextResponse.json(
        {
          error: "Gmail is not connected. Connect Gmail with read-only access first.",
          needsConnection: true,
        },
        { status: 400 }
      );
    }

    if (account.expires_at && account.expires_at < Math.floor(Date.now() / 1000) + 60) {
      account = await refreshGoogleAccessToken(account);
    }
    if (!account?.access_token) {
      return NextResponse.json(
        {
          error: "Gmail access expired. Please reconnect Gmail read-only access.",
          needsConnection: true,
        },
        { status: 400 }
      );
    }

    const listFetch = await gmailFetch(
      account,
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=${limit}`
    );
    account = listFetch.account;
    const listRes = listFetch.res;
    if (!listRes.ok) {
      const data = await listRes.json().catch(() => ({}));
      return NextResponse.json(
        {
          error: data?.error?.message || "Could not read Gmail. Please reconnect Gmail read-only access.",
          needsConnection: listRes.status === 401 || listRes.status === 403,
        },
        { status: 400 }
      );
    }

    const listData = await listRes.json();
    const messages = (listData.messages ?? []).slice(0, limit);
    const syncedItems: any[] = [];
    let scanned = 0;
    let skipped = 0;

    for (const message of messages) {
      scanned += 1;
      const metadataFetch = await gmailFetch(
        account,
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${message.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date&metadataHeaders=To&metadataHeaders=List-Unsubscribe`
      );
      account = metadataFetch.account;
      const metadataRes = metadataFetch.res;
      if (!metadataRes.ok) {
        skipped += 1;
        continue;
      }

      const metadata = await metadataRes.json();
      const subject = trimText(findHeader(metadata.payload?.headers, "subject") || "(No subject)", 180);
      const from = trimText(findHeader(metadata.payload?.headers, "from"), 180);
      const labelIds = Array.isArray(metadata.labelIds) ? metadata.labelIds.map(String) : [];
      const snippet = trimText(metadata.snippet ?? "", 260);
      const classified = classifyMessage({ subject, from, snippet, labelIds });

      const item = await upsertGmailTrackedMessage(user.id, message.id, {
        threadId: metadata.threadId ?? message.threadId ?? null,
        from,
        fromEmail: extractEmail(from),
        subject,
        snippet,
        labelIds,
        hasAttachments: hasAttachments(metadata.payload),
        internalDate: metadata.internalDate ? Number(metadata.internalDate) : Date.now(),
        category: classified.category,
        importance: classified.importance,
      });
      syncedItems.push(item);
    }

    const items = await listGmailTrackedMessages(user.id, { limit: Math.max(limit, 60) });
    return NextResponse.json({
      summary: {
        scanned,
        synced: syncedItems.length,
        skipped,
        query,
        limit,
      },
      items,
      groupedCounts: summarizeCounts(items),
      needsConnection: false,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: process.env.NODE_ENV === "production" ? "Gmail tracker sync failed" : error?.message ?? "Gmail tracker sync failed" },
      { status: 500 }
    );
  }
}
