export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

function parseAmount(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = (session.user as any)?.id;
    const financeProfile = await prisma.financeProfile.upsert({
      where: { userId },
      update: {},
      create: { userId },
    });
    return NextResponse.json({ financeProfile });
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
    const financeProfile = await prisma.financeProfile.upsert({
      where: { userId },
      update: {
        currentBalance: parseAmount(data?.currentBalance),
        totalAmount: parseAmount(data?.totalAmount),
        currency: data?.currency || "INR",
      },
      create: {
        userId,
        currentBalance: parseAmount(data?.currentBalance),
        totalAmount: parseAmount(data?.totalAmount),
        currency: data?.currency || "INR",
      },
    });
    return NextResponse.json({ financeProfile });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Failed" }, { status: 500 });
  }
}
