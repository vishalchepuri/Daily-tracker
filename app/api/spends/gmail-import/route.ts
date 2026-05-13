export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

const receiptQuery = 'newer_than:90d (receipt OR invoice OR "order total" OR payment OR paid OR purchase)';

function decodeBase64Url(value?: string) {
  if (!value) return "";
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized, "base64").toString("utf8");
}

function findHeader(headers: any[] = [], name: string) {
  return headers.find((header) => header.name?.toLowerCase?.() === name.toLowerCase())?.value ?? "";
}

function bodyText(payload: any): string {
  if (!payload) return "";
  if (payload.body?.data) return decodeBase64Url(payload.body.data);
  return (payload.parts ?? []).map((part: any) => bodyText(part)).join("\n");
}

function parseSpend(text: string, subject: string) {
  const haystack = `${subject}\n${text}`.replace(/\s+/g, " ");
  const amountMatch = haystack.match(/(?:total|amount|paid|charged|payment|order total)[^\d$₹€£]{0,25}([$₹€£]?\s?\d{1,6}(?:[,.]\d{2})?)/i)
    ?? haystack.match(/([$₹€£]\s?\d{1,6}(?:[,.]\d{2})?)/);
  if (!amountMatch) return null;

  const rawAmount = amountMatch[1].replace(/[^\d.,]/g, "").replace(",", "");
  const amount = Number(rawAmount);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const currencySymbol = amountMatch[1].match(/[$₹€£]/)?.[0];
  const currency = currencySymbol === "₹" ? "INR" : currencySymbol === "€" ? "EUR" : currencySymbol === "£" ? "GBP" : "USD";
  const merchant = subject
    .replace(/receipt|invoice|payment|paid|order|purchase|confirmation/gi, "")
    .replace(/[:#|].*$/, "")
    .trim()
    .slice(0, 80) || "Gmail Receipt";

  return { merchant, amount, currency };
}

export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = (session.user as any)?.id;

    const account = await prisma.account.findFirst({
      where: { userId, provider: "google" },
      orderBy: { id: "desc" },
    });

    if (!account?.access_token) {
      return NextResponse.json(
        {
          error: "Gmail is not connected. Configure GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET, then sign in with Google.",
          needsConnection: true,
        },
        { status: 400 }
      );
    }

    const listRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(receiptQuery)}&maxResults=25`,
      { headers: { Authorization: `Bearer ${account.access_token}` } }
    );
    if (!listRes.ok) {
      return NextResponse.json({ error: "Could not read Gmail. Please reconnect Google." }, { status: 400 });
    }

    const listData = await listRes.json();
    const messages = listData.messages ?? [];
    let imported = 0;
    let scanned = 0;

    for (const message of messages) {
      scanned += 1;
      const existing = await prisma.spend.findUnique({
        where: { userId_gmailMessageId: { userId, gmailMessageId: message.id } },
      });
      if (existing) continue;

      const msgRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${message.id}?format=full`,
        { headers: { Authorization: `Bearer ${account.access_token}` } }
      );
      if (!msgRes.ok) continue;

      const msg = await msgRes.json();
      const subject = findHeader(msg.payload?.headers, "subject");
      const from = findHeader(msg.payload?.headers, "from");
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
          emailSubject: subject,
          emailFrom: from,
          gmailMessageId: message.id,
          notes: "Imported from Gmail receipt scan.",
          date: new Date(Number(msg.internalDate ?? Date.now())),
        },
      });
      imported += 1;
    }

    return NextResponse.json({ summary: { scanned, imported } });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Gmail import failed" }, { status: 500 });
  }
}
