export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

function parseAmount(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseDueDay(value: unknown) {
  if (value === "" || value == null) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.min(31, Math.max(1, Math.round(parsed)));
}

async function resolveBankAccount(userId: string, bankAccountId?: unknown) {
  if (!bankAccountId || bankAccountId === "none") return null;
  const account = await prisma.bankAccount.findUnique({ where: { id: String(bankAccountId) } });
  if (!account || account.userId !== userId || !account.active) return null;
  return account;
}

export async function GET() {
  try {
    const user = await requireCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = user.id;
    const creditCards = await prisma.creditCard.findMany({
      where: { userId, active: true },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ creditCards });
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
    if (!data?.name) return NextResponse.json({ error: "Card name is required" }, { status: 400 });
    const creditCard = await prisma.creditCard.create({
      data: {
        userId,
        name: data.name,
        bankName: data.bankName || null,
        last4: data.last4 || null,
        creditLimit: null,
        currentDue: parseAmount(data.currentDue),
        dueDay: parseDueDay(data.dueDay),
      },
    });
    return NextResponse.json({ creditCard });
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
    const existing = await prisma.creditCard.findUnique({ where: { id: data.id } });
    if (!existing || existing.userId !== userId) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (data.settleAmount != null || data.settleFull) {
      const bankAccount = await resolveBankAccount(userId, data.bankAccountId);
      if (!bankAccount) return NextResponse.json({ error: "Choose bank account for card payment" }, { status: 400 });
      const requestedAmount = data.settleFull ? existing.currentDue : parseAmount(data.settleAmount);
      const applied = Math.min(Math.max(0, requestedAmount), Math.max(0, existing.currentDue));
      if (applied <= 0) return NextResponse.json({ error: "Enter settlement amount" }, { status: 400 });
      const creditCard = await prisma.$transaction(async (tx) => {
        await tx.bankAccount.update({
          where: { id: bankAccount.id },
          data: { balance: { decrement: applied } },
        });
        return tx.creditCard.update({
          where: { id: data.id },
          data: { currentDue: { decrement: applied } },
        });
      });
      return NextResponse.json({ creditCard });
    }
    const creditCard = await prisma.creditCard.update({
      where: { id: data.id },
      data: {
        name: data.name || existing.name,
        bankName: data.bankName || null,
        last4: data.last4 || null,
        creditLimit: null,
        currentDue: parseAmount(data.currentDue),
        dueDay: parseDueDay(data.dueDay),
      },
    });
    return NextResponse.json({ creditCard });
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
    const existing = await prisma.creditCard.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await prisma.creditCard.update({ where: { id }, data: { active: false } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: process.env.NODE_ENV === "production" ? "Failed" : error?.message ?? "Failed" }, { status: 500 });
  }
}
