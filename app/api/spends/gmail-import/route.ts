export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const MAX_EMAILS_PER_RUN = 40;
const receiptQuery = 'newer_than:90d (receipt OR invoice OR "order total" OR payment OR paid OR purchase OR debited OR credited OR transaction)';
const candidatePattern =
  /(receipt|invoice|order|payment|paid|purchase|transaction|debited|credited|spent|charged|upi|card|statement|rs\.?|inr|₹|\$)/i;
const STORE_GMAIL_METADATA = process.env.STORE_GMAIL_METADATA === "true";

function decodeBase64Url(value?: string) {
  if (!value) return "";
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized, "base64").toString("utf8");
}

function findHeader(headers: any[] = [], name: string) {
  return headers.find((header) => header.name?.toLowerCase?.() === name.toLowerCase())?.value ?? "";
}

function sanitizeMerchant(value: string) {
  return value
    .replace(/<[^>]+>/g, "")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "")
    .replace(/\b\d{10,}\b/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

function bodyText(payload: any): string {
  if (!payload) return "";
  if (payload.body?.data) return decodeBase64Url(payload.body.data);
  return (payload.parts ?? []).map((part: any) => bodyText(part)).join("\n");
}

function hasScope(scope?: string | null) {
  return Boolean(scope?.split(/\s+/).includes(GMAIL_SCOPE));
}

async function refreshGoogleAccessToken(account: any) {
  if (!account?.refresh_token || !process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) return account;

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
  if (!res.ok || !data.access_token) return account;

  return prisma.account.update({
    where: { id: account.id },
    data: {
      access_token: data.access_token,
      expires_at: data.expires_in ? Math.floor(Date.now() / 1000) + Number(data.expires_in) : account.expires_at,
      token_type: data.token_type ?? account.token_type,
      scope: data.scope
        ? Array.from(new Set(`${account.scope ?? ""} ${data.scope}`.split(/\s+/).filter(Boolean))).join(" ")
        : account.scope,
    },
  });
}

function parseSpend(text: string, subject: string) {
  const haystack = `${subject}\n${text}`.replace(/\s+/g, " ");
  const amountMatch =
    haystack.match(/(?:total|amount|paid|charged|payment|order total|debited|credited|spent)[^\d$₹€£]{0,40}([$₹€£]?\s?\d{1,8}(?:[,.]\d{2})?)/i) ??
    haystack.match(/([$₹€£]\s?\d{1,8}(?:[,.]\d{2})?)/) ??
    haystack.match(/(?:rs\.?|inr)\s?(\d{1,8}(?:[,.]\d{2})?)/i);
  if (!amountMatch) return null;

  const amountToken = amountMatch[1];
  const rawAmount = amountToken.replace(/[^\d.,]/g, "").replace(/,/g, "");
  const amount = Number(rawAmount);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const currencySymbol = amountToken.match(/[$₹€£]/)?.[0];
  const currency = /₹|inr|rs\.?/i.test(amountToken) || /₹|inr|rs\.?/i.test(haystack)
    ? "INR"
    : currencySymbol === "€"
      ? "EUR"
      : currencySymbol === "£"
        ? "GBP"
        : "USD";
  const merchant = sanitizeMerchant(subject
    .replace(/receipt|invoice|payment|paid|order|purchase|confirmation|transaction|debited|credited/gi, "")
    .replace(/[:#|].*$/, "")
  ) || "Gmail Receipt";

  return { merchant, amount, currency };
}

async function gmailFetch(account: any, url: string) {
  return fetch(url, { headers: { Authorization: `Bearer ${account.access_token}` } });
}

export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = (session.user as any)?.id;

    let account = await prisma.account.findFirst({
      where: { userId, provider: "google" },
      orderBy: { id: "desc" },
    });

    if (!account?.access_token || !hasScope(account.scope)) {
      return NextResponse.json(
        {
          error: "Gmail is not connected. Click Connect Gmail, approve Gmail read-only access, then import again.",
          needsConnection: true,
        },
        { status: 400 }
      );
    }

    if (account.expires_at && account.expires_at < Math.floor(Date.now() / 1000) + 60) {
      account = await refreshGoogleAccessToken(account);
    }

    const listRes = await gmailFetch(
      account,
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(receiptQuery)}&maxResults=${MAX_EMAILS_PER_RUN}`
    );
    if (!listRes.ok) {
      return NextResponse.json({ error: "Could not read Gmail. Please reconnect Google." }, { status: 400 });
    }

    const listData = await listRes.json();
    const messages = (listData.messages ?? []).slice(0, MAX_EMAILS_PER_RUN);
    let scanned = 0;
    let skippedDuplicates = 0;
    let filteredOut = 0;
    let fullReads = 0;
    let imported = 0;

    for (const message of messages) {
      scanned += 1;
      const existing = await prisma.spend.findUnique({
        where: { userId_gmailMessageId: { userId, gmailMessageId: message.id } },
      });
      if (existing) {
        skippedDuplicates += 1;
        continue;
      }

      const metadataRes = await gmailFetch(
        account,
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${message.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`
      );
      if (!metadataRes.ok) continue;

      const metadata = await metadataRes.json();
      const subject = findHeader(metadata.payload?.headers, "subject").slice(0, 200);
      const from = findHeader(metadata.payload?.headers, "from").slice(0, 200);
      const quickText = `${subject}\n${from}\n${metadata.snippet ?? ""}`;
      if (!candidatePattern.test(quickText)) {
        filteredOut += 1;
        continue;
      }

      const msgRes = await gmailFetch(
        account,
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${message.id}?format=full`
      );
      if (!msgRes.ok) continue;
      fullReads += 1;

      const msg = await msgRes.json();
      const parsed = parseSpend(`${msg.snippet ?? ""}\n${bodyText(msg.payload)}`, subject);
      if (!parsed) continue;

      await prisma.spend.create({
        data: {
          userId,
          merchant: parsed.merchant,
          amount: parsed.amount,
          currency: parsed.currency,
          category: "Imported",
          source: "gmail",
          emailSubject: STORE_GMAIL_METADATA ? subject : null,
          emailFrom: STORE_GMAIL_METADATA ? from : null,
          gmailMessageId: message.id,
          notes: "Imported from Gmail. Raw email content was not stored.",
          date: new Date(Number(msg.internalDate ?? Date.now())),
        },
      });
      imported += 1;
    }

    return NextResponse.json({
      summary: {
        scanned,
        fullReads,
        imported,
        skippedDuplicates,
        filteredOut,
        limit: MAX_EMAILS_PER_RUN,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Gmail import failed" }, { status: 500 });
  }
}
