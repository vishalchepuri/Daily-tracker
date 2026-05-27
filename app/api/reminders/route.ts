export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

function parseDueDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function GET(req: Request) {
  try {
    const user = await requireCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = user.id;
    const { searchParams } = new URL(req.url);
    const offset = Math.max(0, Number(searchParams.get("offset") ?? 0) || 0);
    const limit = Math.min(100, Math.max(20, Number(searchParams.get("limit") ?? 30) || 30));
    const reminders = await prisma.reminder.findMany({
      where: { userId },
      select: {
        id: true,
        listId: true,
        title: true,
        notes: true,
        dueDate: true,
        recurrence: true,
        recurrenceCustom: true,
        priority: true,
        flagged: true,
        completed: true,
        completedAt: true,
        createdAt: true,
        updatedAt: true,
        list: { select: { id: true, name: true, color: true } },
      },
      orderBy: [{ completed: "asc" }, { dueDate: "asc" }, { createdAt: "desc" }],
      skip: offset,
      take: limit + 1,
    });
    return NextResponse.json({
      reminders: reminders.slice(0, limit),
      nextOffset: offset + Math.min(reminders.length, limit),
      hasMore: reminders.length > limit,
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
    if (!data?.title) return NextResponse.json({ error: "Title is required" }, { status: 400 });
    const reminder = await prisma.reminder.create({
      data: {
        userId,
        listId: data.listId || null,
        title: data.title,
        notes: data.notes || null,
        dueDate: parseDueDate(data.dueDate),
        recurrence: data.recurrence || "none",
        recurrenceCustom: data.recurrence === "custom" ? data.recurrenceCustom || null : null,
        priority: data.priority || "none",
        flagged: Boolean(data.flagged),
      },
      include: { list: true },
    });
    return NextResponse.json({ reminder });
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
    const existing = await prisma.reminder.findUnique({ where: { id: data.id } });
    if (!existing || existing.userId !== userId) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const completed = data.completed == null ? existing.completed : Boolean(data.completed);
    const reminder = await prisma.reminder.update({
      where: { id: data.id },
      data: {
        listId: data.listId === undefined ? existing.listId : data.listId || null,
        title: data.title ?? existing.title,
        notes: data.notes === undefined ? existing.notes : data.notes || null,
        dueDate: data.dueDate === undefined ? existing.dueDate : parseDueDate(data.dueDate),
        recurrence: data.recurrence ?? existing.recurrence,
        recurrenceCustom: data.recurrence === "custom" ? data.recurrenceCustom || null : data.recurrence === undefined ? existing.recurrenceCustom : null,
        priority: data.priority ?? existing.priority,
        flagged: data.flagged == null ? existing.flagged : Boolean(data.flagged),
        completed,
        completedAt: completed ? existing.completedAt ?? new Date() : null,
      },
      include: { list: true },
    });
    return NextResponse.json({ reminder });
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
    const existing = await prisma.reminder.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await prisma.reminder.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Failed" }, { status: 500 });
  }
}
