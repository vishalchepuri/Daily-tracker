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
    
    const today = new Date();
    const startOfDay = new Date(today);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(today);
    endOfDay.setHours(23, 59, 59, 999);
    
    const [profile, todayFoodLogs, todayWorkout, recentProgress, workoutCount] = await Promise.all([
      prisma.userProfile.findUnique({ where: { userId } }),
      prisma.foodLog.findMany({ where: { userId, date: { gte: startOfDay, lte: endOfDay } } }),
      prisma.workoutLog.findFirst({
        where: { userId, date: { gte: startOfDay, lte: endOfDay } },
        include: { exerciseLogs: { include: { exercise: true } } },
      }),
      prisma.progressEntry.findMany({ where: { userId }, orderBy: { date: "desc" }, take: 7 }),
      prisma.workoutLog.count({ where: { userId } }),
    ]);
    
    // Calculate streak
    const allWorkouts = await prisma.workoutLog.findMany({
      where: { userId },
      orderBy: { date: "desc" },
      select: { date: true },
    });
    
    let streak = 0;
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const workoutDates = new Set(
      (allWorkouts ?? []).map((w: any) => {
        const d = new Date(w.date);
        d.setHours(0, 0, 0, 0);
        return d.toISOString();
      })
    );
    
    for (let i = 0; i < 365; i++) {
      const checkDate = new Date(now);
      checkDate.setDate(checkDate.getDate() - i);
      if (workoutDates.has(checkDate.toISOString())) {
        streak++;
      } else if (i > 0) {
        break;
      }
    }
    
    const todayMacros = (todayFoodLogs ?? []).reduce(
      (acc: any, log: any) => ({
        calories: acc.calories + (log?.calories ?? 0),
        protein: acc.protein + (log?.protein ?? 0),
        carbs: acc.carbs + (log?.carbs ?? 0),
        fat: acc.fat + (log?.fat ?? 0),
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0 }
    );

    return NextResponse.json({
      profile,
      todayMacros,
      todayWorkout,
      recentProgress,
      workoutCount,
      streak,
      todayFoodLogs,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Failed" }, { status: 500 });
  }
}
