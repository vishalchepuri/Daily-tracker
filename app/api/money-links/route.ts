export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

function parseAmount(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizePersonName(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

async function resolveBankAccount(userId: string, bankAccountId?: unknown) {
  if (!bankAccountId || bankAccountId === "none") return null;
  const account = await prisma.bankAccount.findUnique({ where: { id: String(bankAccountId) } });
  if (!account || account.userId !== userId || !account.active) return null;
  return account;
}

export async function GET(req: Request) {
  try {
    const user = await requireCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = user.id;
    const { searchParams } = new URL(req.url);
    const offset = Math.max(0, Number(searchParams.get("offset") ?? 0) || 0);
    const limit = Math.min(100, Math.max(20, Number(searchParams.get("limit") ?? 50) || 50));
    const moneyLinks = await prisma.moneyLink.findMany({
      where: { userId },
      include: { bankAccount: { select: { id: true, name: true, bankName: true, last4: true } } },
      orderBy: [{ settled: "asc" }, { date: "desc" }],
      skip: offset,
      take: limit + 1,
    });
    return NextResponse.json({
      moneyLinks: moneyLinks.slice(0, limit),
      nextOffset: offset + Math.min(moneyLinks.length, limit),
      hasMore: moneyLinks.length > limit,
    });
  } catch (error: any) {
    return NextResponse.json({ error: process.env.NODE_ENV === "production" ? "Failed" : error?.message ?? "Failed" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = user.id;
    const data = await req.json();
    const type = data?.type === "borrow" ? "borrow" : "lend";
    const person = normalizePersonName(data?.person);
    if (!person || !data?.amount) return NextResponse.json({ error: "Person and amount are required" }, { status: 400 });
    const bankAccount = await resolveBankAccount(userId, data.bankAccountId);
    if (type === "lend" && !bankAccount) return NextResponse.json({ error: "Choose the bank account used for this transaction" }, { status: 400 });
    if (data?.bankAccountId && data.bankAccountId !== "none" && !bankAccount) return NextResponse.json({ error: "Bank account not found" }, { status: 404 });
    const amount = parseAmount(data.amount);
    const moneyLink = await prisma.$transaction(async (tx) => {
      const created = await tx.moneyLink.create({
        data: {
          userId,
          bankAccountId: bankAccount?.id ?? null,
          person,
          type,
          amount,
          currency: data.currency || "INR",
          notes: data.notes || null,
          date: data.date ? new Date(data.date) : new Date(),
        },
        include: { bankAccount: { select: { id: true, name: true, bankName: true, last4: true } } },
      });
      if (bankAccount) {
        await tx.bankAccount.update({
          where: { id: bankAccount.id },
          data: { balance: type === "lend" ? { decrement: amount } : { increment: amount } },
        });
      }
      if (type === "borrow" && !bankAccount && data.createSpendFromBorrow) {
        await tx.spend.create({
          data: {
            userId,
            merchant: data.spendMerchant || `Borrowed from ${person}`,
            amount,
            currency: data.currency || "INR",
            category: data.spendCategory || "Other",
            date: data.date ? new Date(data.date) : new Date(),
            notes: data.notes ? `Borrowed from ${person}. ${data.notes}` : `Borrowed from ${person}.`,
            source: "manual",
            balanceApplied: false,
          },
        });
      }
      return created;
    });
    return NextResponse.json({ moneyLink });
  } catch (error: any) {
    return NextResponse.json({ error: process.env.NODE_ENV === "production" ? "Failed" : error?.message ?? "Failed" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const user = await requireCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = user.id;
    const data = await req.json();
    if (!data?.id) return NextResponse.json({ error: "ID required" }, { status: 400 });
    const existing = await prisma.moneyLink.findUnique({ where: { id: data.id } });
    if (!existing || existing.userId !== userId) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const settleAmount = data.settleAmount == null ? 0 : parseAmount(data.settleAmount);
    const settleBankAccount = settleAmount > 0 ? await resolveBankAccount(userId, data.bankAccountId) : null;
    if (settleAmount > 0 && !settleBankAccount) return NextResponse.json({ error: "Choose bank account for settlement" }, { status: 400 });
    const moneyLink = await prisma.$transaction(async (tx) => {
      if (settleAmount > 0 && settleBankAccount) {
        const remaining = Math.max(0, existing.amount - existing.settledAmount);
        const applied = Math.min(settleAmount, remaining);
        if (applied > 0) {
          await tx.bankAccount.update({
            where: { id: settleBankAccount.id },
            data: { balance: existing.type === "lend" ? { increment: applied } : { decrement: applied } },
          });
          return tx.moneyLink.update({
            where: { id: data.id },
            data: {
              settledAmount: { increment: applied },
              settled: existing.settledAmount + applied >= existing.amount,
            },
            include: { bankAccount: { select: { id: true, name: true, bankName: true, last4: true } } },
          });
        }
      }
      return tx.moneyLink.update({
        where: { id: data.id },
        data: {
          person: data.person == null ? existing.person : normalizePersonName(data.person),
          type: data.type === "borrow" || data.type === "lend" ? data.type : existing.type,
          amount: data.amount == null ? existing.amount : parseAmount(data.amount),
          currency: data.currency || existing.currency,
          notes: data.notes ?? existing.notes,
          settled: typeof data.settled === "boolean" ? data.settled : existing.settled,
          date: data.date ? new Date(data.date) : existing.date,
        },
        include: { bankAccount: { select: { id: true, name: true, bankName: true, last4: true } } },
      });
    });
    return NextResponse.json({ moneyLink });
  } catch (error: any) {
    return NextResponse.json({ error: process.env.NODE_ENV === "production" ? "Failed" : error?.message ?? "Failed" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await requireCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = user.id;
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });
    const existing = await prisma.moneyLink.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await prisma.moneyLink.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: process.env.NODE_ENV === "production" ? "Failed" : error?.message ?? "Failed" }, { status: 500 });
  }
}
