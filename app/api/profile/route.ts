export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = (session.user as any)?.id;
    const profile = await prisma.userProfile.findUnique({ where: { userId } });
    return NextResponse.json({ profile });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Failed to fetch profile" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = (session.user as any)?.id;
    const data = await req.json();
    
    // Calculate TDEE and macros
    let tdee = 0;
    const { age, weight, height, gender, activityLevel, goal, healthLimitations, foodAllergies } = data;
    if (weight && height && age && gender) {
      // Mifflin-St Jeor
      const bmr = gender === 'male'
        ? 10 * weight + 6.25 * height - 5 * age + 5
        : 10 * weight + 6.25 * height - 5 * age - 161;
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

    const profile = await prisma.userProfile.upsert({
      where: { userId },
      update: { age, weight, height, gender, activityLevel, goal, healthLimitations, foodAllergies, tdee, targetCalories, targetProtein, targetCarbs, targetFat },
      create: { userId, age, weight, height, gender, activityLevel, goal, healthLimitations, foodAllergies, tdee, targetCalories, targetProtein, targetCarbs, targetFat },
    });
    return NextResponse.json({ profile });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Failed to save profile" }, { status: 500 });
  }
}
