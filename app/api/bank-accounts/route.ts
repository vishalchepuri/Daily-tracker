export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

function parseAmount(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function GET() {
  try {
    const user = await requireCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = user.id;
    const bankAccounts = await prisma.bankAccount.findMany({
      where: { userId, active: true },
      orderBy: { createdAt: "desc" },
    });
    const transfers = await prisma.bankTransfer.findMany({
      where: { userId },
      include: {
        fromAccount: { select: { id: true, name: true, bankName: true, last4: true } },
        toAccount: { select: { id: true, name: true, bankName: true, last4: true } },
      },
      orderBy: { date: "desc" },
      take: 30,
    });
    return NextResponse.json({ bankAccounts, transfers });
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
    if (!data?.name) return NextResponse.json({ error: "Account name is required" }, { status: 400 });
    const bankAccount = await prisma.bankAccount.create({
      data: {
        userId,
        name: data.name,
        bankName: data.bankName || null,
        accountType: data.accountType || "savings",
        last4: data.last4 || null,
        balance: parseAmount(data.balance),
        currency: data.currency || "INR",
      },
    });
    return NextResponse.json({ bankAccount });
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
    if (data?.transfer) {
      const fromId = String(data.fromBankAccountId ?? "");
      const toId = String(data.toBankAccountId ?? "");
      const amount = parseAmount(data.amount);
      if (!fromId || !toId || fromId === "none" || toId === "none") return NextResponse.json({ error: "Choose both bank accounts" }, { status: 400 });
      if (fromId === toId) return NextResponse.json({ error: "Choose different bank accounts" }, { status: 400 });
      if (amount <= 0) return NextResponse.json({ error: "Enter transfer amount" }, { status: 400 });
      const [fromAccount, toAccount] = await Promise.all([
        prisma.bankAccount.findUnique({ where: { id: fromId } }),
        prisma.bankAccount.findUnique({ where: { id: toId } }),
      ]);
      if (!fromAccount || fromAccount.userId !== userId || !fromAccount.active) return NextResponse.json({ error: "From account not found" }, { status: 404 });
      if (!toAccount || toAccount.userId !== userId || !toAccount.active) return NextResponse.json({ error: "To account not found" }, { status: 404 });
      const [fromBankAccount, toBankAccount, transfer] = await prisma.$transaction([
        prisma.bankAccount.update({ where: { id: fromId }, data: { balance: { decrement: amount } } }),
        prisma.bankAccount.update({ where: { id: toId }, data: { balance: { increment: amount } } }),
        prisma.bankTransfer.create({
          data: {
            userId,
            fromAccountId: fromId,
            toAccountId: toId,
            amount,
            currency: fromAccount.currency || toAccount.currency || "INR",
            notes: data.notes || null,
            date: data.date ? new Date(data.date) : new Date(),
          },
          include: {
            fromAccount: { select: { id: true, name: true, bankName: true, last4: true } },
            toAccount: { select: { id: true, name: true, bankName: true, last4: true } },
          },
        }),
      ]);
      return NextResponse.json({ fromBankAccount, toBankAccount, transfer });
    }
    if (!data?.id) return NextResponse.json({ error: "ID required" }, { status: 400 });
    const existing = await prisma.bankAccount.findUnique({ where: { id: data.id } });
    if (!existing || existing.userId !== userId) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const bankAccount = await prisma.bankAccount.update({
      where: { id: data.id },
      data: {
        name: data.name || existing.name,
        bankName: data.bankName || null,
        accountType: data.accountType || existing.accountType,
        last4: data.last4 || null,
        balance: parseAmount(data.balance),
        currency: data.currency || "INR",
      },
    });
    return NextResponse.json({ bankAccount });
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
    const existing = await prisma.bankAccount.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await prisma.bankAccount.update({ where: { id }, data: { active: false } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: process.env.NODE_ENV === "production" ? "Failed" : error?.message ?? "Failed" }, { status: 500 });
  }
}
