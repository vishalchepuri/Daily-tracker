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

  const [profile, todayFoodLogs, todayWorkout, recentProgress, workoutCount, streak] = await Promise.all([
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

  return {
    profile: profile.data,
    todayMacros,
    todayWorkout: todayWorkout.data,
    recentProgress: recentProgress.data,
    workoutCount: workoutCount.data,
    streak: streak.data,
    todayFoodLogs: logs,
    serviceStatus: {
      profile: { ok: profile.ok, error: profile.error },
      nutrition: { ok: todayFoodLogs.ok, error: todayFoodLogs.error },
      workout: { ok: todayWorkout.ok && workoutCount.ok && streak.ok, error: todayWorkout.error ?? workoutCount.error ?? streak.error },
      progress: { ok: recentProgress.ok, error: recentProgress.error },
    },
  };
}
