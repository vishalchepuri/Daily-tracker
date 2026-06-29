export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

function boundedInt(value: unknown, min: number, max: number) {
  const next = Math.round(Number(value));
  if (!Number.isFinite(next)) return null;
  return Math.max(min, Math.min(max, next));
}

export async function GET() {
  const user = await requireCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const items = await prisma.recoveryCheckIn.findMany({
    where: { userId: user.id },
    orderBy: { date: "desc" },
    take: 14,
  });
  return NextResponse.json({ items });
}

export async function POST(req: Request) {
  const user = await requireCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const data = await req.json().catch(() => ({}));
  const sleepHours = Number(data.sleepHours);
  const item = await prisma.recoveryCheckIn.create({
    data: {
      userId: user.id,
      sleepHours: Number.isFinite(sleepHours) ? Math.max(0, Math.min(18, sleepHours)) : null,
      energy: boundedInt(data.energy, 1, 5),
      soreness: boundedInt(data.soreness, 1, 5),
      mood: String(data.mood ?? "").trim() || null,
      notes: String(data.notes ?? "").trim() || null,
    },
  });
  return NextResponse.json({ item });
}
