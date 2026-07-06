export const dynamic = "force-dynamic";

import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { createReviewItemOnce } from "@/lib/firestore-app-data";
import { decryptOAuthTokenFields, encryptOAuthTokenFields } from "@/lib/oauth-token-encryption";
import { generateGeminiText } from "@/lib/gemini";

const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const MAX_EMAILS_PER_RUN = 40;
const MAX_PDF_ATTACHMENTS_PER_EMAIL = 2;
const MAX_PDF_BYTES = 5 * 1024 * 1024;
const MAX_STATEMENT_TRANSACTIONS = 80;
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

type GmailPdfAttachment = {
  attachmentId: string;
  filename: string;
  mimeType: string;
  size: number;
};

function collectPdfAttachments(payload: any, items: GmailPdfAttachment[] = []) {
  if (!payload) return items;
  const filename = String(payload.filename ?? "");
  const mimeType = String(payload.mimeType ?? "");
  const attachmentId = payload.body?.attachmentId ? String(payload.body.attachmentId) : "";
  const size = Number(payload.body?.size ?? 0);
  const isPdf = attachmentId && (mimeType.toLowerCase().includes("pdf") || /\.pdf$/i.test(filename));
  if (isPdf) {
    items.push({ attachmentId, filename: filename || "statement.pdf", mimeType: mimeType || "application/pdf", size });
  }
  for (const part of payload.parts ?? []) collectPdfAttachments(part, items);
  return items;
}

function looksLikeStatementEmail(input: { subject: string; from: string; snippet: string; body: string; pdfs: GmailPdfAttachment[] }) {
  const text = `${input.subject} ${input.from} ${input.snippet} ${input.body} ${input.pdfs.map((pdf) => pdf.filename).join(" ")}`.toLowerCase();
  return /\b(e-?statement|statement|monthly\s+statement|card\s+statement|credit\s+card\s+statement|bank\s+statement|account\s+statement)\b/.test(text) ||
    (input.pdfs.length > 0 && /\b(credit\s+card|debit\s+card|bank|statement|transactions?)\b/.test(text));
}

async function extractPdfText(buffer: Buffer) {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return String(result.text ?? "").replace(/\s+\n/g, "\n").trim();
  } finally {
    await parser.destroy().catch(() => null);
  }
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
  if (!process.env.GEMINI_API_KEY) {
    const fallback = parseSpendWithRegex(`${input.snippet}\n${input.body}`, input.subject);
    return fallback ? { ...fallback, confidence: 0.55, reason: "AI not configured; regex fallback used." } : null;
  }

  let text = "";
  try {
    text = await generateGeminiText({
      maxOutputTokens: 500,
      timeoutMs: 25000,
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
    });
  } catch {
    const fallback = parseSpendWithRegex(`${input.snippet}\n${input.body}`, input.subject);
    return fallback ? { ...fallback, confidence: 0.55, reason: "AI unavailable; regex fallback used." } : null;
  }

  const raw = cleanAiJson(text || "{}");
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

type StatementTransaction = {
  date: string;
  merchant: string;
  amount: number;
  currency: string;
  cardLast4: string;
  transactionId: string;
  category: string;
  confidence: number;
  reason: string;
};

function normalizeDateKey(value: unknown, fallback: Date) {
  const raw = String(value ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = raw ? new Date(raw) : fallback;
  if (!Number.isFinite(parsed.getTime())) return fallback.toISOString().slice(0, 10);
  return parsed.toISOString().slice(0, 10);
}

function normalizeCardLast4(value: unknown) {
  return String(value ?? "").replace(/\D/g, "").slice(-4);
}

function statementHash(input: unknown) {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex").slice(0, 22).toUpperCase();
}

function stableStatementTransactionId(messageId: string, item: StatementTransaction, index: number) {
  if (item.transactionId) return item.transactionId;
  return `STMT${statementHash({ messageId, index, date: item.date, merchant: item.merchant, amount: item.amount, last4: item.cardLast4 })}`;
}

async function aiExtractStatementTransactions(input: {
  subject: string;
  from: string;
  snippet: string;
  emailDate: Date;
  pdfFilename: string;
  pdfText: string;
}) {
  if (!process.env.GEMINI_API_KEY || !input.pdfText.trim()) return [] as StatementTransaction[];

  let text = "";
  try {
    text = await generateGeminiText({
      maxOutputTokens: 5000,
      timeoutMs: 35000,
      messages: [
        {
          role: "system",
          content:
            "Extract spend transactions from Indian bank or credit card statement PDF text. Return ONLY JSON array. Include only user purchases/debit spends/fees that should appear in an expense tracker. Exclude payments received, credits, reversals, cashback, reward points, opening/closing balances, totals, minimum due, interest summary lines, and duplicated header/footer rows. Each item must have date as YYYY-MM-DD when possible, merchant, positive amount, currency, cardLast4 if visible, transactionId/refNo/authCode if visible, category, confidence 0-1, and reason. If no real spend transactions are present return [].",
        },
        {
          role: "user",
          content: `Email date: ${input.emailDate.toISOString().slice(0, 10)}
Subject: ${input.subject}
From: ${input.from}
Snippet: ${input.snippet}
PDF filename: ${input.pdfFilename}

PDF text:
${input.pdfText.slice(0, 24000)}`,
        },
      ],
    });
  } catch {
    return [];
  }

  const raw = cleanAiJson(text || "[]");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) return [];

  return parsed.slice(0, MAX_STATEMENT_TRANSACTIONS).flatMap((item: any, index: number) => {
    const amount = Number(String(item?.amount ?? "").replace(/,/g, ""));
    const merchant = sanitizeMerchant(String(item?.merchant ?? ""));
    if (!Number.isFinite(amount) || amount <= 0 || !merchant) return [];
    const tx: StatementTransaction = {
      date: normalizeDateKey(item?.date, input.emailDate),
      merchant: titleCaseMerchant(merchant),
      amount,
      currency: String(item?.currency || "INR").toUpperCase(),
      cardLast4: normalizeCardLast4(item?.cardLast4),
      transactionId: normalizeTransactionId(item?.transactionId || item?.refNo || item?.authCode),
      category: sanitizeMerchant(String(item?.category || "Imported")).slice(0, 40) || "Imported",
      confidence: Math.max(0, Math.min(1, Number(item?.confidence ?? 0))),
      reason: String(item?.reason ?? `Statement row ${index + 1}`).slice(0, 180),
    };
    return [tx];
  });
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

function simpleToken(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

async function findStatementCreditCard(userId: string, last4: string, context: string) {
  if (last4) {
    const payment = await findPaymentAccount(userId, last4);
    if (payment.creditCardId) return { creditCardId: payment.creditCardId, matchedName: payment.matchedName };
  }

  const cards = await prisma.creditCard.findMany({
    where: { userId, active: true },
    select: { id: true, name: true, bankName: true, last4: true },
  });
  const haystack = simpleToken(context);
  const matches = cards.filter((card) => {
    const cardTokens = [card.name, card.bankName, card.last4].filter(Boolean).map((value) => simpleToken(String(value)));
    return cardTokens.some((token) => token.length >= 3 && haystack.includes(token));
  });
  if (matches.length === 1) return { creditCardId: matches[0].id, matchedName: matches[0].name };
  if (cards.length === 1 && /\b(credit\s+card|card\s+statement|statement)\b/i.test(context)) {
    return { creditCardId: cards[0].id, matchedName: cards[0].name };
  }
  return { creditCardId: null as string | null, matchedName: "" };
}

async function gmailFetch(account: any, url: string) {
  let res = await fetch(url, { headers: { Authorization: `Bearer ${account.access_token}` } });
  if (res.status !== 401 || !account.refresh_token) return { res, account };

  const refreshed = await refreshGoogleAccessToken(account);
  if (!refreshed?.access_token) return { res, account };

  res = await fetch(url, { headers: { Authorization: `Bearer ${refreshed.access_token}` } });
  return { res, account: refreshed };
}

async function gmailAttachmentFetch(account: any, messageId: string, attachmentId: string) {
  const result = await gmailFetch(
    account,
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`
  );
  const data = await result.res.json().catch(() => ({}));
  if (!result.res.ok || !data?.data) return { account: result.account, buffer: null as Buffer | null };
  return { account: result.account, buffer: Buffer.from(String(data.data).replace(/-/g, "+").replace(/_/g, "/"), "base64") };
}

async function createImportedSpend(input: {
  userId: string;
  merchant: string;
  amount: number;
  currency: string;
  category: string;
  source: string;
  gmailMessageId: string;
  transactionId: string;
  bankAccountId?: string | null;
  creditCardId?: string | null;
  notes: string;
  date: Date;
  subject: string;
  from: string;
}) {
  return prisma.$transaction(async (tx) => {
    const spend = await tx.spend.create({
      data: {
        userId: input.userId,
        merchant: input.merchant,
        amount: input.amount,
        currency: input.currency,
        category: input.category,
        source: input.source,
        emailSubject: STORE_GMAIL_METADATA ? input.subject : null,
        emailFrom: STORE_GMAIL_METADATA ? input.from : null,
        gmailMessageId: input.gmailMessageId,
        transactionId: input.transactionId,
        bankAccountId: input.bankAccountId ?? null,
        creditCardId: input.creditCardId ?? null,
        balanceApplied: Boolean(input.bankAccountId || input.creditCardId),
        notes: input.notes,
        date: input.date,
      },
    });
    if (input.bankAccountId) {
      await tx.bankAccount.update({ where: { id: input.bankAccountId }, data: { balance: { decrement: input.amount } } });
    }
    if (input.creditCardId) {
      await tx.creditCard.update({ where: { id: input.creditCardId }, data: { currentDue: { increment: input.amount } } });
    }
    return spend;
  });
}

export async function POST(req: Request) {
  try {
    const user = await requireCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = user.id;
    const email = user.email?.trim().toLowerCase();
    const limited = await rateLimit(req, "gmail-import", { limit: 6, windowMs: 60 * 60 * 1000, userId });
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

    const googleAccounts = email
      ? await prisma.account.findMany({
          where: { provider: "google", user: { email } },
        })
      : await prisma.account.findMany({
          where: { userId: currentUser.id, provider: "google" },
        });
    const decryptedGoogleAccounts = googleAccounts.map((item) => decryptOAuthTokenFields(item));
    let account: any =
      decryptedGoogleAccounts.find((item) => item.access_token && hasScope(item.scope)) ??
      decryptedGoogleAccounts.find((item) => hasScope(item.scope)) ??
      decryptedGoogleAccounts.find((item) => item.access_token) ??
      decryptedGoogleAccounts[0] ??
      null;

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
    let statementPdfs = 0;
    let statementTransactions = 0;
    let statementReviews = 0;

    for (const message of messages) {
      scanned += 1;
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
      const emailBody = bodyText(msg.payload);
      const emailDate = new Date(Number(msg.internalDate ?? metadata.internalDate ?? Date.now()));
      const pdfs = collectPdfAttachments(msg.payload).slice(0, MAX_PDF_ATTACHMENTS_PER_EMAIL);
      const statementCandidate = looksLikeStatementEmail({
        subject,
        from,
        snippet: msg.snippet ?? metadata.snippet ?? "",
        body: emailBody.slice(0, 1200),
        pdfs,
      });

      if (statementCandidate && pdfs.length > 0) {
        let importedFromStatement = 0;
        for (const pdf of pdfs) {
          if (pdf.size > MAX_PDF_BYTES) {
            await createReviewItemOnce(currentUser.id, {
              type: "gmail_statement_pdf_too_large",
              title: `Statement PDF too large: ${pdf.filename}`,
              detail: `${pdf.filename} is larger than ${Math.round(MAX_PDF_BYTES / 1024 / 1024)}MB, so Dayza skipped it to keep imports fast.`,
              priority: "normal",
              payload: { gmailMessageId: message.id, subject, filename: pdf.filename, size: pdf.size },
            });
            statementReviews += 1;
            continue;
          }

          const attachment = await gmailAttachmentFetch(account, message.id, pdf.attachmentId);
          account = attachment.account;
          if (!attachment.buffer) continue;
          statementPdfs += 1;

          let pdfText = "";
          try {
            pdfText = await extractPdfText(attachment.buffer);
          } catch (error: any) {
            await createReviewItemOnce(currentUser.id, {
              type: "gmail_statement_pdf_unreadable",
              title: `Could not read statement PDF: ${pdf.filename}`,
              detail: `Dayza found a statement PDF but could not read it. If it is password-protected, add transactions manually for now.`,
              priority: "high",
              payload: { gmailMessageId: message.id, subject, filename: pdf.filename, reason: error?.message ?? "PDF parse failed" },
            });
            statementReviews += 1;
            continue;
          }

          const rows = await aiExtractStatementTransactions({
            subject,
            from,
            snippet: msg.snippet ?? metadata.snippet ?? "",
            emailDate,
            pdfFilename: pdf.filename,
            pdfText,
          });
          const seenRows = new Set<string>();
          for (const row of rows) {
            const transactionId = stableStatementTransactionId(message.id, row, seenRows.size);
            const rowKey = `${row.date}|${row.merchant}|${row.amount}|${row.cardLast4}|${transactionId}`;
            if (seenRows.has(rowKey)) continue;
            seenRows.add(rowKey);

            const existingTransaction = await prisma.spend.findUnique({
              where: { userId_transactionId: { userId: currentUser.id, transactionId } },
            });
            if (existingTransaction) {
              skippedDuplicates += 1;
              continue;
            }

            const card = await findStatementCreditCard(currentUser.id, row.cardLast4, `${subject}\n${from}\n${pdf.filename}\n${pdfText.slice(0, 3000)}`);
            if (!card.creditCardId) {
              await createReviewItemOnce(currentUser.id, {
                type: "gmail_statement_card_review",
                title: `Statement needs card match: ${pdf.filename}`,
                detail: `${row.currency} ${row.amount.toFixed(2)} at ${row.merchant} was found, but Dayza could not safely match the statement to one saved credit card.`,
                priority: "high",
                payload: { gmailMessageId: message.id, subject, filename: pdf.filename, merchant: row.merchant, amount: row.amount, currency: row.currency, last4: row.cardLast4 || null },
              });
              statementReviews += 1;
              continue;
            }

            const spend = await createImportedSpend({
              userId: currentUser.id,
              merchant: row.merchant,
              amount: row.amount,
              currency: row.currency,
              category: row.category || "Imported",
              source: "gmail_statement",
              gmailMessageId: `${message.id}:${transactionId}`,
              transactionId,
              creditCardId: card.creditCardId,
              notes: `Imported from Gmail statement ${pdf.filename}${card.matchedName ? ` and matched to ${card.matchedName}` : ""}. Raw PDF text was not stored.`,
              date: new Date(`${row.date}T00:00:00.000Z`),
              subject,
              from,
            });
            if (row.confidence < 0.75) {
              await createReviewItemOnce(currentUser.id, {
                type: "gmail_statement_spend_review",
                title: `Review statement spend: ${row.merchant}`,
                detail: `${row.currency} ${row.amount.toFixed(2)} imported from ${pdf.filename} may need checking.`,
                priority: "normal",
                payload: { spendId: spend.id, gmailMessageId: message.id, transactionId, subject, reason: row.reason },
              });
              statementReviews += 1;
            }
            imported += 1;
            importedFromStatement += 1;
            statementTransactions += 1;
          }
        }
        if (importedFromStatement > 0) continue;
      }

      const existing = await prisma.spend.findUnique({
        where: { userId_gmailMessageId: { userId: currentUser.id, gmailMessageId: message.id } },
      });
      if (existing) {
        skippedDuplicates += 1;
        continue;
      }

      const parsed = await aiExtractSpend({ subject, from, snippet: msg.snippet ?? metadata.snippet ?? "", body: emailBody });
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

      const spend = await createImportedSpend({
        userId: currentUser.id,
        merchant: parsed.merchant,
        amount: parsed.amount,
        currency: parsed.currency,
        category: "Imported",
        source: "gmail",
        gmailMessageId: message.id,
        transactionId: parsed.transactionId,
        bankAccountId: payment.bankAccountId,
        creditCardId: payment.creditCardId,
        notes: `Imported from Gmail${payment.matchedName ? ` and matched to ${payment.matchedName}` : ""}. Transaction ID: ${parsed.transactionId}. Raw email content was not stored.`,
        date: emailDate,
        subject,
        from,
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
        statementPdfs,
        statementTransactions,
        statementReviews,
        skippedDuplicates,
        filteredOut,
        limit: MAX_EMAILS_PER_RUN,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: process.env.NODE_ENV === "production" ? "Gmail import failed" : error?.message ?? "Gmail import failed" }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const user = await requireCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const email = user.email?.trim().toLowerCase();
    const currentUser = email
      ? await prisma.user.findUnique({ where: { email }, select: { id: true } })
      : await prisma.user.findUnique({ where: { id: user.id }, select: { id: true } });

    if (!currentUser) {
      return NextResponse.json({ error: "Your session is no longer valid. Please sign in again." }, { status: 401 });
    }

    const importedSpends = await prisma.spend.findMany({
      where: {
        userId: currentUser.id,
        source: { in: ["gmail", "gmail_statement"] },
      },
      select: { id: true, amount: true, balanceApplied: true, bankAccountId: true, creditCardId: true },
    });

    await prisma.$transaction(async (tx) => {
      for (const spend of importedSpends) {
        if (spend.balanceApplied && spend.bankAccountId) {
          await tx.bankAccount.update({ where: { id: spend.bankAccountId }, data: { balance: { increment: spend.amount } } });
        }
        if (spend.balanceApplied && spend.creditCardId) {
          await tx.creditCard.update({ where: { id: spend.creditCardId }, data: { currentDue: { decrement: spend.amount } } });
        }
      }
      await tx.spend.deleteMany({
        where: {
          userId: currentUser.id,
          source: { in: ["gmail", "gmail_statement"] },
        },
      });
    });

    return NextResponse.json({ deleted: importedSpends.length });
  } catch (error: any) {
    return NextResponse.json(
      { error: process.env.NODE_ENV === "production" ? "Could not clear Gmail-imported spends" : error?.message ?? "Could not clear Gmail-imported spends" },
      { status: 500 }
    );
  }
}
