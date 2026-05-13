export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

async function ensureDefaultList(userId: string) {
  const existing = await prisma.reminderList.findFirst({ where: { userId } });
  if (existing) return;
  await prisma.reminderList.create({
    data: { userId, name: "Reminders", color: "#22c55e" },
  });
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = (session.user as any)?.id;
    await ensureDefaultList(userId);
    const lists = await prisma.reminderList.findMany({
      where: { userId },
      include: { _count: { select: { reminders: true } } },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json({ lists });
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
    if (!data?.name) return NextResponse.json({ error: "List name is required" }, { status: 400 });
    const list = await prisma.reminderList.create({
      data: { userId, name: data.name, color: data.color || "#22c55e" },
    });
    return NextResponse.json({ list });
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
    const existing = await prisma.reminderList.findUnique({ where: { id: data.id } });
    if (!existing || existing.userId !== userId) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const list = await prisma.reminderList.update({
      where: { id: data.id },
      data: { name: data.name, color: data.color || existing.color },
    });
    return NextResponse.json({ list });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Failed" }, { status: 500 });
  }
}
