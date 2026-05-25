export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

function parseDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseDayOfMonth(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 1 && parsed <= 31 ? Math.round(parsed) : null;
}

function parsePositiveInt(value: unknown) {
  if (value === "" || value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : null;
}

function parseDoseUnits(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 1 ? Math.round(parsed) : 1;
}

export async function GET() {
  try {
    const user = await requireCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = user.id;
    const medications = await prisma.medication.findMany({
      where: { userId },
      include: { logs: { orderBy: { scheduledFor: "desc" }, take: 10 } },
      orderBy: [{ active: "desc" }, { timeOfDay: "asc" }, { createdAt: "desc" }],
    });
    return NextResponse.json({ medications });
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
    if (!data?.name || !data?.timeOfDay) {
      return NextResponse.json({ error: "Medication name and time are required" }, { status: 400 });
    }

    const medication = await prisma.medication.create({
      data: {
        userId,
        name: data.name,
        dosage: data.dosage || null,
        instructions: data.instructions || null,
        timeOfDay: data.timeOfDay,
        recurrence: data.recurrence || "daily",
        recurrenceCustom: data.recurrence === "custom" ? data.recurrenceCustom || null : null,
        daysOfWeek: data.recurrence === "weekly" ? data.daysOfWeek || null : null,
        dayOfMonth: data.recurrence === "monthly" ? parseDayOfMonth(data.dayOfMonth) : null,
        startDate: parseDate(data.startDate),
        endDate: parseDate(data.endDate),
        stockCount: parsePositiveInt(data.stockCount),
        doseUnits: parseDoseUnits(data.doseUnits),
        refillAt: parsePositiveInt(data.refillAt),
        refillNotes: data.refillNotes || null,
        active: data.active == null ? true : Boolean(data.active),
      },
    });
    return NextResponse.json({ medication });
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
    const existing = await prisma.medication.findUnique({ where: { id: data.id } });
    if (!existing || existing.userId !== userId) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const medication = await prisma.medication.update({
      where: { id: data.id },
      data: {
        name: data.name ?? existing.name,
        dosage: data.dosage === undefined ? existing.dosage : data.dosage || null,
        instructions: data.instructions === undefined ? existing.instructions : data.instructions || null,
        timeOfDay: data.timeOfDay ?? existing.timeOfDay,
        recurrence: data.recurrence ?? existing.recurrence,
        recurrenceCustom: data.recurrence === "custom" ? data.recurrenceCustom || null : data.recurrence === undefined ? existing.recurrenceCustom : null,
        daysOfWeek: data.recurrence === "weekly" ? data.daysOfWeek || null : data.recurrence === undefined ? existing.daysOfWeek : null,
        dayOfMonth: data.recurrence === "monthly" ? parseDayOfMonth(data.dayOfMonth) : data.recurrence === undefined ? existing.dayOfMonth : null,
        startDate: data.startDate === undefined ? existing.startDate : parseDate(data.startDate),
        endDate: data.endDate === undefined ? existing.endDate : parseDate(data.endDate),
        stockCount: data.stockCount === undefined ? existing.stockCount : parsePositiveInt(data.stockCount),
        doseUnits: data.doseUnits === undefined ? existing.doseUnits : parseDoseUnits(data.doseUnits),
        refillAt: data.refillAt === undefined ? existing.refillAt : parsePositiveInt(data.refillAt),
        refillNotes: data.refillNotes === undefined ? existing.refillNotes : data.refillNotes || null,
        active: data.active == null ? existing.active : Boolean(data.active),
      },
    });
    return NextResponse.json({ medication });
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
    const existing = await prisma.medication.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await prisma.medication.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Failed" }, { status: 500 });
  }
}
