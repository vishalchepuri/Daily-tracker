export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

function numberOrNull(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function PATCH(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = (session.user as any)?.id;
    const data = await req.json();

    const profile = await prisma.userProfile.upsert({
      where: { userId },
      update: {
        targetCalories: numberOrNull(data.targetCalories),
        targetProtein: numberOrNull(data.targetProtein),
        targetCarbs: numberOrNull(data.targetCarbs),
        targetFat: numberOrNull(data.targetFat),
        targetFiber: numberOrNull(data.targetFiber),
        targetWaterMl: numberOrNull(data.targetWaterMl),
      },
      create: {
        userId,
        targetCalories: numberOrNull(data.targetCalories),
        targetProtein: numberOrNull(data.targetProtein),
        targetCarbs: numberOrNull(data.targetCarbs),
        targetFat: numberOrNull(data.targetFat),
        targetFiber: numberOrNull(data.targetFiber),
        targetWaterMl: numberOrNull(data.targetWaterMl),
      },
    });

    return NextResponse.json({ profile });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Failed" }, { status: 500 });
  }
}
