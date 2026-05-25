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
    return NextResponse.json({ bankAccounts });
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
    const existing = await prisma.bankAccount.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await prisma.bankAccount.update({ where: { id }, data: { active: false } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Failed" }, { status: 500 });
  }
}
