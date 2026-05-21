export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

function parseDate(value?: string | null) {
  if (!value) return new Date();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = (session.user as any)?.id;
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get("limit") ?? "50");
    const logs = await prisma.medicationLog.findMany({
      where: { userId },
      include: { medication: true },
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
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = (session.user as any)?.id;
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
    return NextResponse.json({ log });
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
    if (!id) return NextResponse.json({ error: "Log ID is required" }, { status: 400 });

    const existing = await prisma.medicationLog.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await prisma.medicationLog.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Failed" }, { status: 500 });
  }
}
