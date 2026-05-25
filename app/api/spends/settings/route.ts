export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

function parseAmount(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export async function GET() {
  try {
    const user = await requireCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = user.id;
    const profile = await prisma.userProfile.findUnique({
      where: { userId },
      select: { targetMonthlySpend: true },
    });
    return NextResponse.json({ targetMonthlySpend: profile?.targetMonthlySpend ?? null });
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
    const targetMonthlySpend = parseAmount(data?.targetMonthlySpend);

    if (targetMonthlySpend == null) {
      return NextResponse.json({ error: "Enter a valid monthly target" }, { status: 400 });
    }

    const profile = await prisma.userProfile.upsert({
      where: { userId },
      update: { targetMonthlySpend },
      create: { userId, targetMonthlySpend },
      select: { targetMonthlySpend: true },
    });
    return NextResponse.json({ targetMonthlySpend: profile.targetMonthlySpend });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Failed" }, { status: 500 });
  }
}
