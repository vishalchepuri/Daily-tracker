export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

function parseDate(value?: string | null) {
  if (!value) return new Date();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

export async function GET(req: Request) {
  try {
    const user = await requireCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = user.id;
    const { searchParams } = new URL(req.url);
    const limit = Math.min(100, Math.max(10, parseInt(searchParams.get("limit") ?? "30") || 30));
    const logs = await prisma.medicationLog.findMany({
      where: { userId },
      include: { medication: { select: { id: true, name: true, dosage: true, timeOfDay: true } } },
      orderBy: { scheduledFor: "desc" },
      take: limit,
    });
    return NextResponse.json({ logs });
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
    if (!data?.medicationId) return NextResponse.json({ error: "Medication is required" }, { status: 400 });
    const medication = await prisma.medication.findUnique({ where: { id: data.medicationId } });
    if (!medication || medication.userId !== userId) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const log = await prisma.medicationLog.create({
      data: {
        userId,
        medicationId: medication.id,
        scheduledFor: parseDate(data.scheduledFor),
        status: data.status === "skipped" ? "skipped" : "taken",
        notes: data.notes || null,
      },
      include: { medication: true },
    });
    if (log.status === "taken" && medication.stockCount != null) {
      await prisma.medication.update({
        where: { id: medication.id },
        data: { stockCount: Math.max(0, medication.stockCount - medication.doseUnits) },
      });
    }
    return NextResponse.json({ log });
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
    if (!id) return NextResponse.json({ error: "Log ID is required" }, { status: 400 });

    const existing = await prisma.medicationLog.findUnique({ where: { id }, include: { medication: true } });
    if (!existing || existing.userId !== userId) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await prisma.medicationLog.delete({ where: { id } });
    if (existing.status === "taken" && existing.medication.stockCount != null) {
      await prisma.medication.update({
        where: { id: existing.medicationId },
        data: { stockCount: existing.medication.stockCount + existing.medication.doseUnits },
      });
    }
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Failed" }, { status: 500 });
  }
}
