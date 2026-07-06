export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  deleteGmailTrackedMessagesForUser,
  listGmailTrackedMessages,
  upsertGmailTrackedMessage,
} from "@/lib/firestore-app-data";
import { decryptOAuthTokenFields, encryptOAuthTokenFields } from "@/lib/oauth-token-encryption";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { generateGeminiText } from "@/lib/gemini";

const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const DEFAULT_QUERY = "newer_than:45d -category:promotions";
const MAX_SYNC_EMAILS = 60;
const MAX_EMAIL_LOOKBACK_DAYS = 15;
const VALID_GMAIL_CATEGORIES = new Set([
  "bills",
  "finance",
  "orders",
  "travel",
  "health",
  "work",
  "security",
  "subscriptions",
  "social",
  "updates",
  "personal",
  "other",
]);

const categoryRules = [
  {
    category: "bills",
    keywords: ["bill", "due", "electricity", "current bill", "recharge", "invoice due", "payment reminder", "utility"],
  },
  {
    category: "finance",
    keywords: ["bank", "upi", "debited", "credited", "payment", "receipt", "card", "account", "inr", "transaction", "refund", "statement", "e-statement"],
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

function senderDomain(value: string) {
  return extractEmail(value).split("@")[1]?.toLowerCase() ?? "";
}

function trimText(value: string, max = 220) {
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function hasAttachments(payload: any): boolean {
  if (!payload) return false;
  if (payload.filename) return true;
  return (payload.parts ?? []).some((part: any) => hasAttachments(part));
}

function classifyMessage(input: { subject: string; from: string; snippet: string; labelIds: string[]; hasAttachments?: boolean }) {
  const text = `${input.subject} ${input.from} ${input.snippet} ${input.labelIds.join(" ")}`.toLowerCase();
  const matched = categoryRules.find((rule) => rule.keywords.some((keyword) => text.includes(keyword)));
  const domain = senderDomain(input.from);
  const category =
    matched?.category ??
    (/\b(gmail|yahoo|outlook|hotmail|icloud)\./i.test(domain) ? "personal" : text.includes("personal") ? "personal" : "other");
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

function cleanAiJson(value: string) {
  return value.replace(/^```json\n?/i, "").replace(/^```\n?/i, "").replace(/\n?```$/, "").trim();
}

function normalizeCategory(value: any) {
  const category = String(value ?? "").trim().toLowerCase();
  return VALID_GMAIL_CATEGORIES.has(category) ? category : "other";
}

function normalizeImportance(value: any) {
  const importance = String(value ?? "").trim().toLowerCase();
  return ["high", "medium", "low"].includes(importance) ? importance : "medium";
}

type GmailClassification = { category: string; importance: string; reason?: string; confidence?: number };

async function aiClassifyMessages(messages: Array<{ id: string; subject: string; from: string; snippet: string; labelIds: string[]; hasAttachments?: boolean }>) {
  if (!process.env.GEMINI_API_KEY || messages.length === 0) return new Map<string, GmailClassification>();
  try {
    const text = await generateGeminiText({
      maxOutputTokens: 3000,
      timeoutMs: 25000,
      messages: [
        {
          role: "system",
          content:
            "You are Dayza's Gmail organizer for an Indian personal dashboard. Think about the sender, sender domain, subject intent, Gmail labels, snippet, date, and attachment presence. Return ONLY JSON array. Category must be exactly one of: bills, finance, orders, travel, health, work, security, subscriptions, social, updates, personal, other. Use finance for bank/card statements, debit/credit alerts, UPI, refunds, investment, salary, tax, and wallet emails. Use bills only for payable utilities or due reminders. Use orders for ecommerce/food delivery/shipping. Use security only for login, OTP, password, account safety. Use work for office/task/career/project emails. Use personal for human-to-human messages. Importance must be high, medium, or low. High only when the user likely needs action soon, money/security risk, due dates, travel changes, work deadlines, or failed payments. Low for newsletters, promos, FYI updates. Include a short reason and confidence 0-1.",
        },
        {
          role: "user",
          content: JSON.stringify(
            messages.map((message) => ({
              id: message.id,
              subject: message.subject,
              from: message.from,
              senderDomain: senderDomain(message.from),
              snippet: message.snippet,
              labels: message.labelIds,
              hasAttachments: Boolean((message as any).hasAttachments),
            }))
          ),
        },
      ],
    });
    const parsed = JSON.parse(cleanAiJson(text || "[]"));
    if (!Array.isArray(parsed)) return new Map();
    const entries: Array<[string, GmailClassification]> = parsed
        .map((item: any) => [
          String(item?.id ?? ""),
          {
            category: normalizeCategory(item?.category),
            importance: normalizeImportance(item?.importance),
            reason: trimText(String(item?.reason ?? ""), 180),
            confidence: Math.max(0, Math.min(1, Number(item?.confidence ?? 0))),
          },
        ] as [string, GmailClassification])
        .filter(([id]: [string, GmailClassification]) => Boolean(id));
    return new Map(entries);
  } catch {
    return new Map();
  }
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function gmailDate(value: string) {
  return value.replace(/-/g, "/");
}

function dateRangeError(message: string) {
  return Object.assign(new Error(message), { code: "GMAIL_DATE_RANGE" });
}

function utcDateStart(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function parseDateKey(value?: string | null) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) throw dateRangeError("Choose a valid start date.");
  const parsed = new Date(`${trimmed}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== trimmed) {
    throw dateRangeError("Choose a valid start date.");
  }
  return trimmed;
}

function normalizeStartDate(value?: string | null) {
  const startDate = parseDateKey(value);
  if (!startDate) return "";

  const start = new Date(`${startDate}T00:00:00.000Z`);
  const today = utcDateStart();
  const earliest = addDays(today, -MAX_EMAIL_LOOKBACK_DAYS);

  if (start < earliest) {
    throw dateRangeError(`Start date can be at most ${MAX_EMAIL_LOOKBACK_DAYS} days old.`);
  }
  if (start > today) {
    throw dateRangeError("Start date cannot be in the future.");
  }
  return startDate;
}

function rangeEndDate() {
  return addDays(utcDateStart(), 1).toISOString().slice(0, 10);
}

function appDateKey(value?: string | null) {
  if (!value) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function buildGmailQuery(baseQuery: string, startDate?: string) {
  if (!startDate) return baseQuery;
  const cleaned = baseQuery.replace(/\bafter:\S+/gi, "").replace(/\bbefore:\S+/gi, "").replace(/\s+/g, " ").trim();
  return `${cleaned} after:${gmailDate(startDate)} before:${gmailDate(rangeEndDate())}`.trim();
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
  try {
    const user = await requireCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(req.url);
    const limit = Number(url.searchParams.get("limit") ?? 60);
    const category = url.searchParams.get("category") ?? "all";
    const startDate = normalizeStartDate(url.searchParams.get("startDate") ?? url.searchParams.get("date") ?? "");
    const todayEnd = rangeEndDate();
    const items = (await listGmailTrackedMessages(user.id, { limit, category })).filter((item) => {
      const dateKey = appDateKey(item.internalDate);
      return !startDate || (dateKey >= startDate && dateKey < todayEnd);
    });
    return NextResponse.json({
      items,
      groupedCounts: summarizeCounts(items),
      startDate: startDate || null,
    });
  } catch (error: any) {
    if (error?.code === "GMAIL_DATE_RANGE") {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Could not load Gmail tracker" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const limited = await rateLimit(req, "gmail-tracker-sync", { limit: 12, windowMs: 60 * 60 * 1000, userId: user.id });
    if (!limited.ok) {
      return NextResponse.json(
        { error: "Too many Gmail tracker syncs. Please try again later." },
        { status: 429, headers: rateLimitHeaders(limited) }
      );
    }

    const body = await req.json().catch(() => ({}));
    const limit = Math.min(Math.max(Number(body?.limit ?? MAX_SYNC_EMAILS), 1), MAX_SYNC_EMAILS);
    const startDate = normalizeStartDate(body?.startDate ?? body?.date ?? "");
    const baseQuery = trimText(String(body?.query || DEFAULT_QUERY), 160);
    const query = buildGmailQuery(baseQuery, startDate);

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
    const metadataRows: any[] = [];
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
      const messageHasAttachments = hasAttachments(metadata.payload);
      const fallbackClassification = classifyMessage({ subject, from, snippet, labelIds, hasAttachments: messageHasAttachments });
      metadataRows.push({
        id: message.id,
        message,
        metadata,
        subject,
        from,
        fromEmail: extractEmail(from),
        labelIds,
        snippet,
        hasAttachments: messageHasAttachments,
        fallbackClassification,
      });
    }

    const aiClassifications = await aiClassifyMessages(metadataRows);
    const syncedItems: any[] = [];

    for (const row of metadataRows) {
      const classified = aiClassifications.get(row.id) ?? row.fallbackClassification;
      const item = await upsertGmailTrackedMessage(user.id, row.id, {
        threadId: row.metadata.threadId ?? row.message.threadId ?? null,
        from: row.from,
        fromEmail: row.fromEmail,
        subject: row.subject,
        snippet: row.snippet,
        labelIds: row.labelIds,
        hasAttachments: hasAttachments(row.metadata.payload),
        internalDate: row.metadata.internalDate ? Number(row.metadata.internalDate) : Date.now(),
        category: classified.category,
        importance: classified.importance,
        classificationReason: classified.reason ?? "",
        classificationConfidence: classified.confidence ?? null,
      });
      syncedItems.push(item);
    }

    const items = startDate
      ? syncedItems.sort((a, b) => new Date(b.internalDate ?? 0).getTime() - new Date(a.internalDate ?? 0).getTime())
      : await listGmailTrackedMessages(user.id, { limit: Math.max(limit, 60) });
    return NextResponse.json({
      summary: {
        scanned,
        synced: syncedItems.length,
        skipped,
        query,
        startDate: startDate || null,
        limit,
      },
      items,
      groupedCounts: summarizeCounts(items),
      needsConnection: false,
    });
  } catch (error: any) {
    if (error?.code === "GMAIL_DATE_RANGE") {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: process.env.NODE_ENV === "production" ? "Gmail tracker sync failed" : error?.message ?? "Gmail tracker sync failed" },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    const user = await requireCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const deleted = await deleteGmailTrackedMessagesForUser(user.id);
    return NextResponse.json({ deleted });
  } catch (error: any) {
    return NextResponse.json(
      { error: process.env.NODE_ENV === "production" ? "Could not clear Gmail cache" : error?.message ?? "Could not clear Gmail cache" },
      { status: 500 }
    );
  }
}
