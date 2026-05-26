export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

function profileErrorResponse(error: any, fallback: string) {
  const message = error?.message ?? fallback;
  const isDbConnectionIssue =
    message.includes("Can't reach database server") ||
    message.includes("Can't reach database") ||
    message.includes("connect ECONNREFUSED") ||
    message.includes("ENOTFOUND") ||
    message.includes("P1001");

  return NextResponse.json(
    {
      error: isDbConnectionIssue
        ? "Database is currently unreachable. Please check Neon status, internet/VPN/firewall, or try again in a minute."
        : message,
    },
    { status: isDbConnectionIssue ? 503 : 500 }
  );
}

export async function GET() {
  try {
    const user = await requireCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = user.id;
    const profile = await prisma.userProfile.findUnique({ where: { userId } });
    const nameParts = splitName(user.name);
    return NextResponse.json({ profile, user: { name: user.name, ...nameParts } });
  } catch (error: any) {
    return profileErrorResponse(error, "Failed to fetch profile");
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = user.id;
    const data = await req.json();
    const firstName = typeof data.firstName === "string" ? data.firstName.trim() : "";
    const lastName = typeof data.lastName === "string" ? data.lastName.trim() : "";
    const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();
    
    // Calculate TDEE and macros
    let tdee = 0;
    const { age, weight, height, gender, activityLevel, goal, healthLimitations, foodAllergies } = data;
    const workoutFocusData: Record<string, string | null> = {};
    if ("workoutFocusMuscles" in data) {
      workoutFocusData.workoutFocusMuscles = typeof data.workoutFocusMuscles === "string" && data.workoutFocusMuscles.trim()
        ? data.workoutFocusMuscles.trim()
        : null;
    }
    if ("workoutFocusGoal" in data) {
      workoutFocusData.workoutFocusGoal = typeof data.workoutFocusGoal === "string" && data.workoutFocusGoal.trim()
        ? data.workoutFocusGoal.trim()
        : null;
    }
    const timelineData: Record<string, string | number | null> = {};
    if ("goalOutcome" in data) {
      timelineData.goalOutcome = typeof data.goalOutcome === "string" && data.goalOutcome.trim() ? data.goalOutcome.trim() : null;
    }
    if ("goalTimelineDays" in data) {
      timelineData.goalTimelineDays = Number.isFinite(Number(data.goalTimelineDays)) && Number(data.goalTimelineDays) > 0
        ? Math.round(Number(data.goalTimelineDays))
        : null;
    }
    if ("goalTargetWeight" in data) {
      timelineData.goalTargetWeight = Number.isFinite(Number(data.goalTargetWeight)) && Number(data.goalTargetWeight) > 0
        ? Number(data.goalTargetWeight)
        : null;
    }
    const connectionData: Record<string, string | null> = {};
    if ("linkedinUrl" in data) {
      const rawLinkedIn = String(data.linkedinUrl ?? "").trim();
      connectionData.linkedinUrl = rawLinkedIn
        ? rawLinkedIn.startsWith("http") ? rawLinkedIn : `https://${rawLinkedIn}`
        : null;
    }
    if (weight && height && age && gender) {
      // Mifflin-St Jeor
      const genderOffset = gender === "male" ? 5 : gender === "female" ? -161 : -78;
      const bmr = 10 * weight + 6.25 * height - 5 * age + genderOffset;
      const multipliers: Record<string, number> = {
        sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, very_active: 1.9
      };
      tdee = Math.round(bmr * (multipliers[activityLevel] ?? 1.55));
    }
    
    let targetCalories = tdee;
    if (goal === 'muscle_gain') targetCalories = tdee + 300;
    else if (goal === 'fat_loss') targetCalories = tdee - 400;
    
    const targetProtein = Math.round(weight ? weight * 2.2 : 150);
    const targetFat = Math.round(targetCalories * 0.25 / 9);
    const targetCarbs = Math.round((targetCalories - targetProtein * 4 - targetFat * 9) / 4);
    const targetFiber = Math.round(goal === "fat_loss" ? 35 : 30);
    const targetWaterMl = Math.round(weight ? weight * 35 : 3000);

    const profile = await prisma.userProfile.upsert({
      where: { userId },
      update: { age, weight, height, gender, activityLevel, goal, healthLimitations, foodAllergies, ...workoutFocusData, ...timelineData, ...connectionData, tdee, targetCalories, targetProtein, targetCarbs, targetFat, targetFiber, targetWaterMl },
      create: { userId, age, weight, height, gender, activityLevel, goal, healthLimitations, foodAllergies, ...workoutFocusData, ...timelineData, ...connectionData, tdee, targetCalories, targetProtein, targetCarbs, targetFat, targetFiber, targetWaterMl },
    });
    const updatedUser = "firstName" in data || "lastName" in data
      ? await prisma.user.update({
          where: { id: userId },
          data: { name: fullName || null },
          select: { name: true },
        })
      : { name: user.name };
    return NextResponse.json({ profile, user: { name: updatedUser.name, ...splitName(updatedUser.name) } });
  } catch (error: any) {
    return profileErrorResponse(error, "Failed to save profile");
  }
}

function splitName(name?: string | null) {
  const parts = String(name ?? "").trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] ?? "",
    lastName: parts.slice(1).join(" "),
  };
}
