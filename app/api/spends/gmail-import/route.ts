export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { createReviewItemOnce } from "@/lib/firestore-app-data";
import { decryptOAuthTokenFields, encryptOAuthTokenFields } from "@/lib/oauth-token-encryption";

const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const MAX_EMAILS_PER_RUN = 40;
const receiptQuery = "newer_than:90d";
const candidatePattern =
  /(receipt|invoice|order|payment|paid|purchase|transaction|debited|credited|spent|charged|upi|card|statement|rs\.?|inr|₹|\$)/i;
const sensitiveCodePattern =
  /\b(otp|one[-\s]?time password|verification code|security code|login code|auth code|2fa|two[-\s]?factor|password reset|reset password|passcode)\b/i;
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

function parseSpendWithRegex(text: string, subject: string) {
  const haystack = `${subject}\n${text}`.replace(/\s+/g, " ");
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
  const last4 = extractLast4(haystack);
  const transactionId = extractTransactionId(haystack);

  const needsReview = merchant === "Gmail Transaction" || /upi txn|check details|^view$/i.test(merchant);
  return { merchant, amount, currency, last4, transactionId, needsReview };
}

function cleanAiJson(value: string) {
  return value.replace(/^```json\n?/i, "").replace(/^```\n?/i, "").replace(/\n?```$/, "").trim();
}

async function aiExtractSpend(input: { subject: string; from: string; snippet: string; body: string }) {
  if (!process.env.ABACUSAI_API_KEY) {
    const fallback = parseSpendWithRegex(`${input.snippet}\n${input.body}`, input.subject);
    return fallback ? { ...fallback, confidence: 0.55, reason: "AI not configured; regex fallback used." } : null;
  }

  const response = await fetch("https://apps.abacus.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.ABACUSAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-5.4-mini",
      stream: false,
      max_tokens: 500,
      messages: [
        {
          role: "system",
          content:
            "You extract completed bank/card/UPI/debit/credit transaction details from Gmail emails. Decide from the email content, not keyword filters. Return ONLY JSON. If it is not an actual completed money transaction, set isTransaction false. Exclude OTP/security/login/marketing/delivery/bill reminder emails. For real debit/spend transactions, extract merchant/payee, amount, currency, card/account last4 when visible, and the bank transaction/reference id such as UTR, RRN, UPI Ref, transaction id, ref no, auth code, IMPS/NEFT/RTGS ref. Same amount can repeat only if transactionId differs.",
        },
        {
          role: "user",
          content: `Return JSON with this exact shape:
{"isTransaction":true,"direction":"debit","merchant":"RSP*INSTAMART","amount":515,"currency":"INR","last4":"4363","transactionId":"123456789012","confidence":0.92,"needsReview":false,"reason":"short reason"}

Email:
Subject: ${input.subject}
From: ${input.from}
Snippet: ${input.snippet}
Body:
${input.body.slice(0, 10000)}`,
        },
      ],
    }),
  });

  if (!response.ok) return null;
  const data = await response.json().catch(() => ({}));
  const raw = cleanAiJson(data?.choices?.[0]?.message?.content ?? "{}");
  const parsed = JSON.parse(raw);
  if (!parsed?.isTransaction || parsed.direction === "credit") return null;

  const amount = Number(parsed.amount);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const fallback = parseSpendWithRegex(`${input.snippet}\n${input.body}`, input.subject);
  return {
    merchant: sanitizeMerchant(String(parsed.merchant || fallback?.merchant || "Gmail Transaction")) || "Gmail Transaction",
    amount,
    currency: String(parsed.currency || fallback?.currency || "INR").toUpperCase(),
    last4: String(parsed.last4 || fallback?.last4 || "").replace(/\D/g, "").slice(-4),
    transactionId: normalizeTransactionId(parsed.transactionId) || fallback?.transactionId || "",
    needsReview: Boolean(parsed.needsReview) || Number(parsed.confidence ?? 0) < 0.75 || !parsed.merchant,
    confidence: Number(parsed.confidence ?? 0),
    reason: String(parsed.reason ?? ""),
  };
}

function normalizeTransactionId(value?: string | null) {
  const clean = String(value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return clean.length >= 8 && clean.length <= 32 ? clean : "";
}

function extractTransactionId(text: string) {
  const patterns = [
    /\b(?:txn|transaction|trans|ref|reference|rrn|utr|upi\s*ref|upi\s*reference|imps\s*ref|neft\s*ref|auth(?:orization)?\s*code)\s*(?:id|no|number|#)?\s*[:\-]?\s*([A-Z0-9][A-Z0-9/-]{7,31})\b/i,
    /\b(?:UPI|P2M|P2A|IMPS|NEFT|RTGS)[/-]([A-Z0-9]{8,24})\b/i,
    /\b(?:UPI|P2M|P2A|IMPS|NEFT|RTGS)[/-][A-Z0-9/-]*?[/-]([A-Z0-9]{8,24})\b/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    const id = normalizeTransactionId(match?.[1]);
    if (id) return id;
  }
  return "";
}

function extractLast4(text: string) {
  const patterns = [
    /(?:card|a\/c|account|ending|xx|x{2,}|\*{2,})\s*(?:no\.?|number|ending)?\s*(?:in|with)?\s*[:\-]?\s*(\d{4})\b/i,
    /\b(?:debit|credit)\s+card\s+\*{0,4}(\d{4})\b/i,
    /\b(?:ending|ends)\s+(?:with|in)\s+(\d{4})\b/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1];
  }
  return "";
}

async function findPaymentAccount(userId: string, last4: string) {
  if (!last4) return { creditCardId: null as string | null, bankAccountId: null as string | null, matchedName: "" };
  const [creditCard, bankAccount] = await Promise.all([
    prisma.creditCard.findFirst({ where: { userId, active: true, last4 }, select: { id: true, name: true } }),
    prisma.bankAccount.findFirst({ where: { userId, active: true, last4 }, select: { id: true, name: true } }),
  ]);
  if (creditCard) return { creditCardId: creditCard.id, bankAccountId: null, matchedName: creditCard.name };
  if (bankAccount) return { creditCardId: null, bankAccountId: bankAccount.id, matchedName: bankAccount.name };
  return { creditCardId: null, bankAccountId: null, matchedName: "" };
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
    const user = await requireCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = user.id;
    const email = user.email?.trim().toLowerCase();
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

    account = decryptOAuthTokenFields(account);

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
      const msgFetch = await gmailFetch(
        account,
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${message.id}?format=full`
      );
      account = msgFetch.account;
      const msgRes = msgFetch.res;
      if (!msgRes.ok) continue;
      fullReads += 1;

      const msg = await msgRes.json();
      const parsed = await aiExtractSpend({ subject, from, snippet: msg.snippet ?? metadata.snippet ?? "", body: bodyText(msg.payload) });
      if (!parsed) {
        filteredOut += 1;
        continue;
      }
      if (!parsed.transactionId) {
        await createReviewItemOnce(currentUser.id, {
          type: "gmail_spend_transaction_review",
          title: `Gmail spend needs transaction ID: ${parsed.merchant}`,
          detail: `${parsed.currency} ${parsed.amount.toFixed(2)} was not added because no transaction/reference ID was found. This prevents duplicate bank alerts from creating repeated spends.`,
          priority: "high",
          payload: { gmailMessageId: message.id, subject, merchant: parsed.merchant, amount: parsed.amount, currency: parsed.currency, last4: parsed.last4 || null },
        });
        filteredOut += 1;
        continue;
      }
      const existingTransaction = await prisma.spend.findUnique({
        where: { userId_transactionId: { userId: currentUser.id, transactionId: parsed.transactionId } },
      });
      if (existingTransaction) {
        skippedDuplicates += 1;
        continue;
      }
      const payment = await findPaymentAccount(currentUser.id, parsed.last4);
      if (!parsed.last4 || (!payment.creditCardId && !payment.bankAccountId)) {
        await createReviewItemOnce(currentUser.id, {
          type: "gmail_spend_payment_review",
          title: `Gmail spend needs card: ${parsed.merchant}`,
          detail: parsed.last4
            ? `${parsed.currency} ${parsed.amount.toFixed(2)} mentions card/account ${parsed.last4}, but it is not saved yet. Add the card/account last 4 digits before importing.`
            : `${parsed.currency} ${parsed.amount.toFixed(2)} has no card/account last 4 digits, so it was not added to spends.`,
          priority: "high",
          payload: { gmailMessageId: message.id, transactionId: parsed.transactionId, subject, merchant: parsed.merchant, amount: parsed.amount, currency: parsed.currency, last4: parsed.last4 || null },
        });
        filteredOut += 1;
        continue;
      }

      const spend = await prisma.spend.create({
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
          transactionId: parsed.transactionId,
          bankAccountId: payment.bankAccountId,
          creditCardId: payment.creditCardId,
          notes: `Imported from Gmail${payment.matchedName ? ` and matched to ${payment.matchedName}` : ""}. Transaction ID: ${parsed.transactionId}. Raw email content was not stored.`,
          date: new Date(Number(msg.internalDate ?? Date.now())),
        },
      });
      if (parsed.needsReview) {
        await createReviewItemOnce(currentUser.id, {
          type: "gmail_spend_review",
          title: `Review Gmail spend: ${parsed.merchant}`,
          detail: `${parsed.currency} ${parsed.amount.toFixed(2)} imported from Gmail may need a better merchant name.`,
          priority: "normal",
          payload: { spendId: spend.id, gmailMessageId: message.id, transactionId: parsed.transactionId, subject },
        });
      }
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
    return NextResponse.json({ error: process.env.NODE_ENV === "production" ? "Gmail import failed" : error?.message ?? "Gmail import failed" }, { status: 500 });
  }
}
