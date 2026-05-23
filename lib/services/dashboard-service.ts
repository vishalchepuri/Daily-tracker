import { prisma } from "@/lib/db";
import { safeService } from "./service-utils";

function todayRange() {
  const today = new Date();
  const startOfDay = new Date(today);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(today);
  endOfDay.setHours(23, 59, 59, 999);
  return { startOfDay, endOfDay };
}

async function getWorkoutStreak(userId: string) {
  const recentWorkouts = await prisma.workoutLog.findMany({
    where: { userId },
    orderBy: { date: "desc" },
    take: 90,
    select: { date: true },
  });

  let streak = 0;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const workoutDates = new Set(
    (recentWorkouts ?? []).map((workout) => {
      const date = new Date(workout.date);
      date.setHours(0, 0, 0, 0);
      return date.toISOString();
    })
  );

  for (let i = 0; i < 365; i += 1) {
    const checkDate = new Date(now);
    checkDate.setDate(checkDate.getDate() - i);
    if (workoutDates.has(checkDate.toISOString())) streak += 1;
    else if (i > 0) break;
  }
  return streak;
}

export async function getDashboardData(userId: string) {
  const { startOfDay, endOfDay } = todayRange();

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
  sevenDaysAgo.setHours(0, 0, 0, 0);

  const [profile, todayFoodLogs, todayWorkout, recentProgress, workoutCount, streak, weekFoodLogs, weekWaterLogs] = await Promise.all([
    safeService(null, () => prisma.userProfile.findUnique({ where: { userId } })),
    safeService([], () => prisma.foodLog.findMany({ where: { userId, date: { gte: startOfDay, lte: endOfDay } } })),
    safeService(null, () =>
      prisma.workoutLog.findFirst({
        where: { userId, date: { gte: startOfDay, lte: endOfDay } },
        include: { exerciseLogs: { include: { exercise: true } } },
      })
    ),
    safeService([], () => prisma.progressEntry.findMany({ where: { userId }, orderBy: { date: "desc" }, take: 7 })),
    safeService(0, () => prisma.workoutLog.count({ where: { userId } })),
    safeService(0, () => getWorkoutStreak(userId)),
    safeService([], () => prisma.foodLog.findMany({ where: { userId, date: { gte: sevenDaysAgo } }, select: { date: true, calories: true, protein: true } })),
    safeService([], () => prisma.waterLog.findMany({ where: { userId, date: { gte: sevenDaysAgo } }, select: { date: true, amountMl: true } })),
  ]);

  const logs = todayFoodLogs.data ?? [];
  const todayMacros = logs.reduce(
    (acc: any, log: any) => ({
      calories: acc.calories + (log?.calories ?? 0),
      protein: acc.protein + (log?.protein ?? 0),
      carbs: acc.carbs + (log?.carbs ?? 0),
      fat: acc.fat + (log?.fat ?? 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );

  // Build weekly trends
  const dayMap: Record<string, { calories: number; protein: number; water: number }> = {};
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    dayMap[key] = { calories: 0, protein: 0, water: 0 };
  }
  for (const log of (weekFoodLogs.data ?? []) as any[]) {
    const key = new Date(log.date).toISOString().slice(0, 10);
    if (dayMap[key]) {
      dayMap[key].calories += log.calories ?? 0;
      dayMap[key].protein += log.protein ?? 0;
    }
  }
  for (const log of (weekWaterLogs.data ?? []) as any[]) {
    const key = new Date(log.date).toISOString().slice(0, 10);
    if (dayMap[key]) {
      dayMap[key].water += log.amountMl ?? 0;
    }
  }
  const weeklyTrends = Object.entries(dayMap).map(([date, v]) => {
    const d = new Date(date + "T00:00:00");
    return { date: d.toLocaleDateString(undefined, { weekday: "short" }), fullDate: date, calories: Math.round(v.calories), protein: Math.round(v.protein), water: Math.round(v.water) };
  });

  return {
    profile: profile.data,
    todayMacros,
    todayWorkout: todayWorkout.data,
    recentProgress: recentProgress.data,
    workoutCount: workoutCount.data,
    streak: streak.data,
    todayFoodLogs: logs,
    weeklyTrends,
    serviceStatus: {
      profile: { ok: profile.ok, error: profile.error },
      nutrition: { ok: todayFoodLogs.ok, error: todayFoodLogs.error },
      workout: { ok: todayWorkout.ok && workoutCount.ok && streak.ok, error: todayWorkout.error ?? workoutCount.error ?? streak.error },
      progress: { ok: recentProgress.ok, error: recentProgress.error },
    },
  };
}
