export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(req: Request) {
  try {
    const user = await requireCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = user.id;
    const { searchParams } = new URL(req.url);
    const offset = Math.max(0, Number(searchParams.get("offset") ?? 0) || 0);
    const limit = Math.min(100, Math.max(20, Number(searchParams.get("limit") ?? 30) || 30));
    const entries = await prisma.progressEntry.findMany({
      where: { userId },
      orderBy: { date: "desc" },
      skip: offset,
      take: limit + 1,
      select: { id: true, date: true, weight: true, chest: true, arms: true, waist: true, hips: true, thighs: true, notes: true, createdAt: true },
    });
    return NextResponse.json({
      entries: entries.slice(0, limit).reverse(),
      nextOffset: offset + Math.min(entries.length, limit),
      hasMore: entries.length > limit,
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
    const entry = await prisma.progressEntry.create({
      data: { userId, ...data, date: data.date ? new Date(data.date) : new Date() },
    });
    return NextResponse.json({ entry });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Failed" }, { status: 500 });
  }
}
