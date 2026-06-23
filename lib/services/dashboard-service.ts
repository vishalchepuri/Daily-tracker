import { prisma } from "@/lib/db";
import { safeService } from "./service-utils";
import { listFoodMicronutrientLogsForFoodLogs } from "@/lib/firestore-app-data";
import { MICRONUTRIENTS, mergeWithDefaultMicronutrientTargets, sumMicronutrients } from "@/lib/micronutrients";
import { dateTimeInputToIso, formatAppDate, formatLocalDateInput } from "@/lib/local-dates";

function todayRange() {
  const todayKey = formatLocalDateInput(new Date());
  const startOfDay = new Date(dateTimeInputToIso(todayKey, "00:00"));
  const endOfDay = new Date(dateTimeInputToIso(todayKey, "23:59"));
  return { startOfDay, endOfDay };
}

function addDaysToDateKey(key: string, days: number) {
  const date = new Date(`${key}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function getWorkoutStreak(userId: string) {
  const recentWorkouts = await prisma.workoutLog.findMany({
    where: { userId },
    orderBy: { date: "desc" },
    take: 90,
    select: { date: true },
  });

  let streak = 0;
  const todayKey = formatLocalDateInput(new Date());
  const workoutDates = new Set(
    (recentWorkouts ?? []).map((workout) => formatLocalDateInput(new Date(workout.date)))
  );

  for (let i = 0; i < 365; i += 1) {
    const checkDateKey = addDaysToDateKey(todayKey, -i);
    if (workoutDates.has(checkDateKey)) streak += 1;
    else if (i > 0) break;
  }
  return streak;
}

export async function getDashboardData(userId: string) {
  const { startOfDay, endOfDay } = todayRange();

  const todayKey = formatLocalDateInput(new Date());
  const sevenDaysAgoKey = addDaysToDateKey(todayKey, -6);
  const sevenDaysAgo = new Date(dateTimeInputToIso(sevenDaysAgoKey, "00:00"));

  const [profile, todayFoodLogs, todayWorkout, recentProgress, workoutCount, streak, weekFoodLogs, weekWaterLogs, todayReminders, todayMedicationLogs] = await Promise.all([
    safeService(null, () => prisma.userProfile.findUnique({ where: { userId } })),
    safeService([], () => prisma.foodLog.findMany({ where: { userId, date: { gte: startOfDay, lte: endOfDay } } })),
    safeService(null, () =>
      prisma.workoutLog.findFirst({
        where: { userId, date: { gte: startOfDay, lte: endOfDay } },
        select: {
          id: true,
          templateName: true,
          duration: true,
          date: true,
          notes: true,
          exerciseLogs: {
            select: {
              id: true,
              exerciseId: true,
              setNumber: true,
              reps: true,
              weight: true,
              exercise: { select: { id: true, name: true, muscleGroup: true } },
            },
            take: 12,
          },
        },
      })
    ),
    safeService([], () => prisma.progressEntry.findMany({ where: { userId }, orderBy: { date: "desc" }, take: 7 })),
    safeService(0, () => prisma.workoutLog.count({ where: { userId } })),
    safeService(0, () => getWorkoutStreak(userId)),
    safeService([], () => prisma.foodLog.findMany({ where: { userId, date: { gte: sevenDaysAgo } }, select: { id: true, date: true, calories: true, protein: true } })),
    safeService([], () => prisma.waterLog.findMany({ where: { userId, date: { gte: sevenDaysAgo } }, select: { date: true, amountMl: true } })),
    safeService([], () => prisma.reminder.findMany({
      where: { userId, dueDate: { gte: startOfDay, lte: endOfDay } },
      orderBy: [{ completed: "asc" }, { dueDate: "asc" }],
      take: 6,
      select: { id: true, title: true, completed: true, dueDate: true, priority: true },
    })),
    safeService([], () => prisma.medicationLog.findMany({
      where: { userId, scheduledFor: { gte: startOfDay, lte: endOfDay } },
      take: 8,
      select: { id: true, status: true, scheduledFor: true, medication: { select: { name: true, dosage: true } } },
    })),
  ]);

  const logs = todayFoodLogs.data ?? [];
  const weeklyLogs = weekFoodLogs.data ?? [];
  const micronutrientTrackingEnabled = Boolean(profile.data?.micronutrientTrackingEnabled);
  const weeklyFoodLogIds = [...new Set(weeklyLogs.map((log: any) => log.id).filter(Boolean))];
  const micronutrientLogs = micronutrientTrackingEnabled
    ? await safeService({}, () => listFoodMicronutrientLogsForFoodLogs(userId, weeklyFoodLogIds))
    : { data: {}, ok: true, error: null };
  const micronutrientTotals = micronutrientTrackingEnabled
    ? sumMicronutrients(logs.map((log: any) => (micronutrientLogs.data as any)?.[log.id]?.micronutrients))
    : {};
  const weeklyMicronutrientTotals = micronutrientTrackingEnabled
    ? sumMicronutrients(Object.values(micronutrientLogs.data ?? {}).map((item: any) => item?.micronutrients))
    : {};
  const micronutrientTargets = mergeWithDefaultMicronutrientTargets(profile.data?.micronutrientTargetsJson, profile.data);
  const lowMicronutrients = micronutrientTrackingEnabled
    ? MICRONUTRIENTS
        .map((item) => {
          const isDailyFocus = item.cadence === "daily_focus";
          const value = isDailyFocus
            ? micronutrientTotals[item.key] ?? 0
            : (weeklyMicronutrientTotals[item.key] ?? 0) / 7;
          const target = micronutrientTargets[item.key] ?? item.target;
          const percent = target > 0 ? Math.round((value / target) * 100) : 0;
          return {
            ...item,
            value,
            target,
            remaining: Math.max(0, target - value),
            percent,
            scope: isDailyFocus ? "Today" : "7-day avg",
          };
        })
        .filter((item) => item.percent < 70)
        .sort((a, b) => a.percent - b.percent)
        .slice(0, 4)
    : [];
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
    const key = addDaysToDateKey(todayKey, -i);
    dayMap[key] = { calories: 0, protein: 0, water: 0 };
  }
  for (const log of (weekFoodLogs.data ?? []) as any[]) {
    const key = formatLocalDateInput(new Date(log.date));
    if (dayMap[key]) {
      dayMap[key].calories += log.calories ?? 0;
      dayMap[key].protein += log.protein ?? 0;
    }
  }
  for (const log of (weekWaterLogs.data ?? []) as any[]) {
    const key = formatLocalDateInput(new Date(log.date));
    if (dayMap[key]) {
      dayMap[key].water += log.amountMl ?? 0;
    }
  }
  const weeklyTrends = Object.entries(dayMap).map(([date, v]) => {
    const d = new Date(dateTimeInputToIso(date, "00:00"));
    return { date: formatAppDate(d, { weekday: "short" }), fullDate: date, calories: Math.round(v.calories), protein: Math.round(v.protein), water: Math.round(v.water) };
  });

  return {
    profile: profile.data,
    todayMacros,
    todayWorkout: todayWorkout.data,
    recentProgress: recentProgress.data,
    workoutCount: workoutCount.data,
    streak: streak.data,
    todayFoodLogs: logs,
    todayReminders: todayReminders.data,
    todayMedicationLogs: todayMedicationLogs.data,
    micronutrients: {
      enabled: micronutrientTrackingEnabled,
      low: lowMicronutrients,
      totals: micronutrientTotals,
      targets: micronutrientTargets,
    },
    weeklyTrends,
    serviceStatus: {
      profile: { ok: profile.ok, error: profile.error },
      nutrition: { ok: todayFoodLogs.ok, error: todayFoodLogs.error },
      workout: { ok: todayWorkout.ok && workoutCount.ok && streak.ok, error: todayWorkout.error ?? workoutCount.error ?? streak.error },
      progress: { ok: recentProgress.ok, error: recentProgress.error },
    },
  };
}
