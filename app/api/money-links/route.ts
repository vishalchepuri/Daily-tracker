export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

function parseAmount(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = (session.user as any)?.id;
    const { searchParams } = new URL(req.url);
    const offset = Math.max(0, Number(searchParams.get("offset") ?? 0) || 0);
    const limit = Math.min(100, Math.max(20, Number(searchParams.get("limit") ?? 50) || 50));
    const moneyLinks = await prisma.moneyLink.findMany({
      where: { userId },
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
    return NextResponse.json({ error: error?.message ?? "Failed" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = (session.user as any)?.id;
    const data = await req.json();
    const type = data?.type === "borrow" ? "borrow" : "lend";
    if (!data?.person || !data?.amount) return NextResponse.json({ error: "Person and amount are required" }, { status: 400 });
    const moneyLink = await prisma.moneyLink.create({
      data: {
        userId,
        person: data.person,
        type,
        amount: parseAmount(data.amount),
        currency: data.currency || "INR",
        notes: data.notes || null,
        date: data.date ? new Date(data.date) : new Date(),
      },
    });
    return NextResponse.json({ moneyLink });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Failed" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = (session.user as any)?.id;
    const data = await req.json();
    if (!data?.id) return NextResponse.json({ error: "ID required" }, { status: 400 });
    const existing = await prisma.moneyLink.findUnique({ where: { id: data.id } });
    if (!existing || existing.userId !== userId) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const moneyLink = await prisma.moneyLink.update({
      where: { id: data.id },
      data: {
        person: data.person ?? existing.person,
        type: data.type === "borrow" || data.type === "lend" ? data.type : existing.type,
        amount: data.amount == null ? existing.amount : parseAmount(data.amount),
        currency: data.currency || existing.currency,
        notes: data.notes ?? existing.notes,
        settled: typeof data.settled === "boolean" ? data.settled : existing.settled,
        date: data.date ? new Date(data.date) : existing.date,
      },
    });
    return NextResponse.json({ moneyLink });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Failed" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = (session.user as any)?.id;
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });
    const existing = await prisma.moneyLink.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await prisma.moneyLink.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Failed" }, { status: 500 });
  }
}
