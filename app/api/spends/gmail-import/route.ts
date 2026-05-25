export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";

const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const MAX_EMAILS_PER_RUN = 40;
const receiptQuery = 'newer_than:90d ("payment successful" OR "payment received" OR "amount debited" OR "amount credited" OR "debited from" OR "credited to" OR "transaction successful" OR "card charged" OR receipt)';
const candidatePattern =
  /(receipt|invoice|order|payment|paid|purchase|transaction|debited|credited|spent|charged|upi|card|statement|rs\.?|inr|₹|\$)/i;
const sensitiveCodePattern =
  /\b(otp|one[-\s]?time password|verification code|security code|login code|auth code|2fa|two[-\s]?factor|password reset|reset password|passcode)\b/i;
const strictTransactionPattern =
  /(payment successful|payment received|paid|debited|credited|charged|spent|transaction successful|receipt|upi transaction|card transaction)/i;
const nonTransactionPattern =
  /(out for delivery|delivered|picked up|shipped|arriving|track your order|last day to pay|pay your bill|bill due|e-?bill|statement|summary|subscription has ended|subscription ended|renew now|offer|sale|discount|elevate your|experience|marketing|newsletter|verification|otp|password|jioairfiber|fixedvoice)/i;
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

function titleCaseMerchant(value: string) {
  return value
    .toLowerCase()
    .replace(/\b[a-z]/g, (char) => char.toUpperCase())
    .replace(/\bUpi\b/g, "UPI")
    .replace(/\bRsp\b/g, "RSP")
    .trim();
}

function extractMerchantFromText(text: string, subject: string) {
  const haystack = `${subject}\n${text}`.replace(/\s+/g, " ");
  const patterns = [
    /(?:towards|at|to|for)\s+([A-Z0-9][A-Z0-9\s&*._/-]{2,80}?)(?:\s+on\s+\d{1,2}\s+[A-Z][a-z]{2}|\s+on\s+\d{1,2}[/-]|\s+via\b|\s+ref\b|\s+txn\b|\.|,|$)/i,
    /(?:merchant|payee)\s*[:\-]\s*([A-Z0-9][A-Z0-9\s&*._/-]{2,80}?)(?:\.|,|$)/i,
  ];
  for (const pattern of patterns) {
    const match = haystack.match(pattern);
    const merchant = sanitizeMerchant(match?.[1] ?? "")
      .replace(/\b(?:your|hdfc|sbi|icici|axis|kotak|bank|credit|debit|card|account|upi|txn|transaction|check details)\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (merchant && merchant.length > 2) return titleCaseMerchant(merchant);
  }

  const cleanedSubject = sanitizeMerchant(subject
    .replace(/^(re|fw):\s*/i, "")
    .replace(/you have done a upi txn\.?\s*check details!?/i, "")
    .replace(/view$/i, "")
    .replace(/receipt|invoice|payment|paid|order|purchase|confirmation|transaction|debited|credited/gi, "")
    .replace(/[:#|].*$/, "")
  );
  return cleanedSubject && cleanedSubject.length > 2 ? titleCaseMerchant(cleanedSubject) : "Gmail Transaction";
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

  return prisma.account.update({
    where: { id: account.id },
    data: {
      access_token: data.access_token,
      refresh_token: data.refresh_token ?? account.refresh_token,
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
  if (nonTransactionPattern.test(haystack)) return null;
  if (!strictTransactionPattern.test(haystack)) return null;
  const strictAmountMatch =
    haystack.match(/(?:paid|charged|payment(?:\s+of)?|amount(?:\s+of)?|debited|credited|spent|transaction(?:\s+of)?)[^\d$]{0,50}([$]?\s?\d{1,8}(?:[,.]\d{2})?)/i) ??
    haystack.match(/(?:paid|charged|payment(?:\s+of)?|amount(?:\s+of)?|debited|credited|spent|transaction(?:\s+of)?)[^\d]{0,50}(?:rs\.?|inr)\s?(\d{1,8}(?:[,.]\d{2})?)/i) ??
    haystack.match(/(?:rs\.?|inr)\s?(\d{1,8}(?:[,.]\d{2})?)[^\w]{0,50}(?:paid|charged|debited|credited|spent|payment|transaction successful)/i);
  if (!strictAmountMatch) return null;
  const amountMatch =
    haystack.match(/(?:total|amount|paid|charged|payment|order total|debited|credited|spent)[^\d$₹€£]{0,40}([$₹€£]?\s?\d{1,8}(?:[,.]\d{2})?)/i) ??
    haystack.match(/([$₹€£]\s?\d{1,8}(?:[,.]\d{2})?)/) ??
    haystack.match(/(?:rs\.?|inr)\s?(\d{1,8}(?:[,.]\d{2})?)/i);
  if (!amountMatch) return null;

  const amountToken = strictAmountMatch[1];
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
  const merchant = extractMerchantFromText(text, subject);

  return { merchant, amount, currency };
}

async function gmailFetch(account: any, url: string) {
  let res = await fetch(url, { headers: { Authorization: `Bearer ${account.access_token}` } });
  if (res.status !== 401 || !account.refresh_token) return { res, account };

  const refreshed = await refreshGoogleAccessToken(account);
  if (!refreshed?.access_token) return { res, account };

  res = await fetch(url, { headers: { Authorization: `Bearer ${refreshed.access_token}` } });
  return { res, account: refreshed };
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = (session.user as any)?.id;
    const email = session.user.email?.trim().toLowerCase();
    const limited = rateLimit(req, "gmail-import", { limit: 6, windowMs: 60 * 60 * 1000, userId });
    if (!limited.ok) {
      return NextResponse.json(
        { error: "Too many Gmail imports. Please try again later." },
        { status: 429, headers: rateLimitHeaders(limited) }
      );
    }

    const currentUser = email
      ? await prisma.user.findUnique({ where: { email }, select: { id: true } })
      : userId
        ? await prisma.user.findUnique({ where: { id: userId }, select: { id: true } })
        : null;

    if (!currentUser) {
      return NextResponse.json({ error: "Your session is no longer valid. Please sign in again." }, { status: 401 });
    }

    let account = email
      ? await prisma.account.findFirst({
          where: { provider: "google", user: { email } },
          orderBy: { id: "desc" },
        })
      : await prisma.account.findFirst({
          where: { userId: currentUser.id, provider: "google" },
          orderBy: { id: "desc" },
        });

    if (!account?.access_token || !hasScope(account.scope)) {
      return NextResponse.json(
        {
          error: `Gmail is not connected for ${email ?? "this account"}. Click Connect Gmail, approve Gmail read-only access, then import again.`,
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
          error: "Gmail access expired. Please reconnect Google and approve Gmail read-only access.",
          needsConnection: true,
        },
        { status: 400 }
      );
    }

    const listFetch = await gmailFetch(
      account,
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(receiptQuery)}&maxResults=${MAX_EMAILS_PER_RUN}`
    );
    account = listFetch.account;
    const listRes = listFetch.res;
    if (!listRes.ok) {
      const data = await listRes.json().catch(() => ({}));
      const message = data?.error?.message || "Could not read Gmail. Please reconnect Google and approve Gmail read-only access.";
      return NextResponse.json(
        {
          error: message,
          needsConnection: listRes.status === 401 || listRes.status === 403,
        },
        { status: 400 }
      );
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
        where: { userId_gmailMessageId: { userId: currentUser.id, gmailMessageId: message.id } },
      });
      if (existing) {
        skippedDuplicates += 1;
        continue;
      }

      const metadataFetch = await gmailFetch(
        account,
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${message.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`
      );
      account = metadataFetch.account;
      const metadataRes = metadataFetch.res;
      if (!metadataRes.ok) continue;

      const metadata = await metadataRes.json();
      const subject = findHeader(metadata.payload?.headers, "subject").slice(0, 200);
      const from = findHeader(metadata.payload?.headers, "from").slice(0, 200);
      const quickText = `${subject}\n${from}\n${metadata.snippet ?? ""}`;
      if (sensitiveCodePattern.test(quickText)) {
        filteredOut += 1;
        continue;
      }
      if (nonTransactionPattern.test(quickText) || !strictTransactionPattern.test(quickText)) {
        filteredOut += 1;
        continue;
      }

      const msgFetch = await gmailFetch(
        account,
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${message.id}?format=full`
      );
      account = msgFetch.account;
      const msgRes = msgFetch.res;
      if (!msgRes.ok) continue;
      fullReads += 1;

      const msg = await msgRes.json();
      const parsed = parseSpend(`${msg.snippet ?? ""}\n${bodyText(msg.payload)}`, subject);
      if (!parsed) continue;

      await prisma.spend.create({
        data: {
          userId: currentUser.id,
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
