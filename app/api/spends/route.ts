export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

function parseAmount(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function resolveCreditCardId(userId: string, creditCardId?: unknown) {
  if (!creditCardId || creditCardId === "none") return null;
  const card = await prisma.creditCard.findUnique({ where: { id: String(creditCardId) } });
  if (!card || card.userId !== userId || !card.active) return null;
  return card.id;
}

async function resolveBankAccountId(userId: string, bankAccountId?: unknown) {
  if (!bankAccountId || bankAccountId === "none") return null;
  const account = await prisma.bankAccount.findUnique({ where: { id: String(bankAccountId) } });
  if (!account || account.userId !== userId || !account.active) return null;
  return account.id;
}

export async function GET(req: Request) {
  try {
    const user = await requireCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = user.id;
    const { searchParams } = new URL(req.url);
    const offset = Math.max(0, Number(searchParams.get("offset") ?? 0) || 0);
    const limit = Math.min(100, Math.max(20, Number(searchParams.get("limit") ?? 50) || 50));
    const spends = await prisma.spend.findMany({
      where: { userId },
      select: {
        id: true,
        date: true,
        merchant: true,
        amount: true,
        currency: true,
        category: true,
        source: true,
        transactionId: true,
        bankAccountId: true,
        creditCardId: true,
        balanceApplied: true,
        notes: true,
        createdAt: true,
        updatedAt: true,
        bankAccount: { select: { id: true, name: true, bankName: true, accountType: true, last4: true, currency: true, active: true } },
        creditCard: { select: { id: true, name: true, bankName: true, last4: true, currentDue: true, dueDay: true, active: true } },
      },
      orderBy: { date: "desc" },
      skip: offset,
      take: limit + 1,
    });
    return NextResponse.json({
      spends: spends.slice(0, limit),
      nextOffset: offset + Math.min(spends.length, limit),
      hasMore: spends.length > limit,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Failed" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = user.id;
    const data = await req.json();
    if (data?.restoreSpend) {
      const restored = data.restoreSpend;
      const restoredLinks = Array.isArray(data.restoreMoneyLinks) ? data.restoreMoneyLinks : [];
      const restoredSpend = await prisma.$transaction(async (tx) => {
        const bankAccountId = await resolveBankAccountId(userId, restored.bankAccountId);
        const creditCardId = await resolveCreditCardId(userId, restored.creditCardId);
        const amount = parseAmount(restored.amount);
        const created = await tx.spend.create({
          data: {
            userId,
            merchant: restored.merchant,
            amount,
            currency: restored.currency || "INR",
            category: restored.category || null,
            date: restored.date ? new Date(restored.date) : new Date(),
            notes: restored.notes || null,
            source: restored.source || "manual",
            transactionId: restored.transactionId || null,
            bankAccountId,
            creditCardId,
            balanceApplied: Boolean(bankAccountId || creditCardId),
          },
          include: { bankAccount: true, creditCard: true },
        });
        if (bankAccountId) await tx.bankAccount.update({ where: { id: bankAccountId }, data: { balance: { decrement: amount } } });
        if (creditCardId) await tx.creditCard.update({ where: { id: creditCardId }, data: { currentDue: { increment: amount } } });
        for (const link of restoredLinks) {
          await tx.moneyLink.create({
            data: {
              userId,
              person: link.person,
              type: link.type === "borrow" ? "borrow" : "lend",
              amount: parseAmount(link.amount),
              currency: link.currency || "INR",
              notes: link.notes || null,
              settled: Boolean(link.settled),
              date: link.date ? new Date(link.date) : new Date(),
            },
          });
        }
        return created;
      });
      return NextResponse.json({ spend: restoredSpend, restored: true });
    }

    if (!data?.merchant || !data?.amount) {
      return NextResponse.json({ error: "Merchant and amount are required" }, { status: 400 });
    }

    const amount = parseAmount(data.amount);
    const bankAccountId = await resolveBankAccountId(userId, data.bankAccountId);
    const creditCardId = await resolveCreditCardId(userId, data.creditCardId);
    const spend = await prisma.$transaction(async (tx) => {
      const created = await tx.spend.create({
        data: {
          userId,
          merchant: data.merchant,
          amount,
          currency: data.currency || "INR",
          category: data.category || null,
          date: data.date ? new Date(data.date) : new Date(),
          notes: data.notes || null,
          source: "manual",
          transactionId: data.transactionId || null,
          bankAccountId,
          creditCardId,
          balanceApplied: Boolean(bankAccountId || creditCardId),
        },
        include: { bankAccount: true, creditCard: true },
      });
      if (bankAccountId) {
        await tx.bankAccount.update({
          where: { id: bankAccountId },
          data: { balance: { decrement: amount } },
        });
      }
      if (creditCardId) {
        await tx.creditCard.update({
          where: { id: creditCardId },
          data: { currentDue: { increment: amount } },
        });
      }
      return created;
    });
    return NextResponse.json({ spend });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Failed" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const user = await requireCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = user.id;
    const data = await req.json();
    if (!data?.id) return NextResponse.json({ error: "ID required" }, { status: 400 });

    const existing = await prisma.spend.findUnique({ where: { id: data.id } });
    if (!existing || existing.userId !== userId) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const nextAmount = parseAmount(data.amount);
    const nextBankAccountId = await resolveBankAccountId(userId, data.bankAccountId);
    const nextCreditCardId = await resolveCreditCardId(userId, data.creditCardId);
    const spend = await prisma.$transaction(async (tx) => {
      if (existing.balanceApplied && existing.bankAccountId) {
        await tx.bankAccount.update({
          where: { id: existing.bankAccountId },
          data: { balance: { increment: existing.amount } },
        });
      }
      if (nextBankAccountId) {
        await tx.bankAccount.update({
          where: { id: nextBankAccountId },
          data: { balance: { decrement: nextAmount } },
        });
      }
      if (existing.balanceApplied && existing.creditCardId) {
        await tx.creditCard.update({
          where: { id: existing.creditCardId },
          data: { currentDue: { decrement: existing.amount } },
        });
      }
      if (nextCreditCardId) {
        await tx.creditCard.update({
          where: { id: nextCreditCardId },
          data: { currentDue: { increment: nextAmount } },
        });
      }
      return tx.spend.update({
        where: { id: data.id },
        data: {
          merchant: data.merchant,
          amount: nextAmount,
          currency: data.currency || "INR",
          category: data.category || null,
          date: data.date ? new Date(data.date) : undefined,
          notes: data.notes || null,
          transactionId: data.transactionId || existing.transactionId || null,
          bankAccountId: nextBankAccountId,
          creditCardId: nextCreditCardId,
          balanceApplied: Boolean(nextBankAccountId || nextCreditCardId),
        },
        include: { bankAccount: true, creditCard: true },
      });
    });
    return NextResponse.json({ spend });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Failed" }, { status: 500 });
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

    const existing = await prisma.spend.findUnique({ where: { id }, include: { creditCard: true } });
    if (!existing || existing.userId !== userId) return NextResponse.json({ error: "Not found" }, { status: 404 });
    let deletedMoneyLinks: any[] = [];
    await prisma.$transaction(async (tx) => {
      if (existing.balanceApplied && existing.bankAccountId) {
        await tx.bankAccount.update({
          where: { id: existing.bankAccountId },
          data: { balance: { increment: existing.amount } },
        });
      }
      if (existing.balanceApplied && existing.creditCardId) {
        await tx.creditCard.update({
          where: { id: existing.creditCardId },
          data: { currentDue: { decrement: existing.amount } },
        });
      }
      const linkedWhere = {
          userId,
          type: "lend",
          OR: [
            { notes: { contains: `Spend ID: ${id}` } },
            existing.creditCard
              ? {
                  amount: existing.amount,
                  notes: { contains: existing.creditCard.name },
                }
              : undefined,
          ].filter(Boolean) as any,
        };
      deletedMoneyLinks = await tx.moneyLink.findMany({ where: linkedWhere });
      await tx.moneyLink.deleteMany({ where: linkedWhere });
      await tx.spend.delete({ where: { id } });
    });
    return NextResponse.json({ success: true, deletedSpend: existing, deletedMoneyLinks });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Failed" }, { status: 500 });
  }
}
