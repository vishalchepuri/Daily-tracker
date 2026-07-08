export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { mergeWithDefaultMicronutrientTargets, parseMicronutrientMap } from "@/lib/micronutrients";

function numberOrNull(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function PATCH(req: Request) {
  try {
    const user = await requireCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = user.id;
    const data = await req.json();
    const existingProfile = await prisma.userProfile.findUnique({ where: { userId } });
    const micronutrientData: Record<string, any> = {};
    if ("micronutrientTrackingEnabled" in data) {
      micronutrientData.micronutrientTrackingEnabled = Boolean(data.micronutrientTrackingEnabled);
    }
    if ("micronutrientTargets" in data || "micronutrientTargetsJson" in data) {
      micronutrientData.micronutrientTargetsJson = JSON.stringify(
        parseMicronutrientMap(mergeWithDefaultMicronutrientTargets(data.micronutrientTargets ?? data.micronutrientTargetsJson, existingProfile))
      );
    }

    const profile = await prisma.userProfile.upsert({
      where: { userId },
      update: {
        targetCalories: numberOrNull(data.targetCalories),
        targetProtein: numberOrNull(data.targetProtein),
        targetCarbs: numberOrNull(data.targetCarbs),
        targetFat: numberOrNull(data.targetFat),
        targetFiber: numberOrNull(data.targetFiber),
        targetWaterMl: numberOrNull(data.targetWaterMl),
        ...micronutrientData,
      },
      create: {
        userId,
        targetCalories: numberOrNull(data.targetCalories),
        targetProtein: numberOrNull(data.targetProtein),
        targetCarbs: numberOrNull(data.targetCarbs),
        targetFat: numberOrNull(data.targetFat),
        targetFiber: numberOrNull(data.targetFiber),
        targetWaterMl: numberOrNull(data.targetWaterMl),
        ...micronutrientData,
      },
    });

    return NextResponse.json({ profile });
  } catch (error: any) {
    return NextResponse.json({ error: process.env.NODE_ENV === "production" ? "Failed" : error?.message ?? "Failed" }, { status: 500 });
  }
}
