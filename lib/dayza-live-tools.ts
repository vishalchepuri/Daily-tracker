import { prisma } from "@/lib/db";
import { previewAgentTaskDraft } from "@/lib/agent-scheduled-tasks";
import { createAgentUndoAction } from "@/lib/firestore-app-data";
import { dateTimeInputToIso, formatAppDateTime, formatLocalDateInput } from "@/lib/local-dates";

const WRITE_TOOLS = new Set(["create_reminder", "complete_reminder", "log_spend", "log_food", "log_water", "log_workout_note"]);

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function trim(value: unknown, max = 160) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function localRange(dateKey = formatLocalDateInput(new Date())) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  const start = new Date(dateTimeInputToIso(dateKey, "00:00"));
  const end = new Date(dateTimeInputToIso(next.toISOString().slice(0, 10), "00:00"));
  return { start, end };
}

function rangeFromName(range?: string) {
  const todayKey = formatLocalDateInput(new Date());
  const today = localRange(todayKey);
  if (range === "week") {
    const start = new Date(today.start);
    start.setUTCDate(start.getUTCDate() - 6);
    return { start, end: today.end, label: "last 7 days" };
  }
  if (range === "month") {
    const start = new Date(today.start);
    start.setUTCDate(start.getUTCDate() - 29);
    return { start, end: today.end, label: "last 30 days" };
  }
  return { ...today, label: "today" };
}

function parseLiveDate(value: unknown) {
  const raw = trim(value, 80);
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return new Date(dateTimeInputToIso(raw, "09:00"));
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(raw) && !/[zZ]|[+-]\d{2}:\d{2}$/.test(raw)) {
    const [date, time] = raw.split("T");
    return new Date(dateTimeInputToIso(date, time.slice(0, 5)));
  }
  const parsed = new Date(raw);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

async function ensureLiveList(userId: string) {
  const existing = await prisma.reminderList.findFirst({ where: { userId }, orderBy: { createdAt: "asc" } });
  if (existing) return existing;
  return prisma.reminderList.create({ data: { userId, name: "Dayza", color: "#22c55e" } });
}

function confirmationRequired(name: string, args: any, label: string) {
  return {
    ok: false,
    requiresConfirmation: true,
    tool: name,
    label,
    args: { ...args, confirmed: true },
    message: `Please ask the user to confirm before doing this: ${label}`,
  };
}

async function getTodayOverview(userId: string) {
  const { start, end } = localRange();
  const [profile, reminders, foodLogs, waterLogs, workout, spends, medications] = await Promise.all([
    prisma.userProfile.findUnique({ where: { userId } }),
    prisma.reminder.findMany({
      where: { userId, completed: false, OR: [{ dueDate: null }, { dueDate: { gte: start, lt: end } }, { dueDate: { lt: start } }] },
      orderBy: [{ dueDate: "asc" }, { priority: "desc" }],
      take: 8,
    }),
    prisma.foodLog.findMany({ where: { userId, date: { gte: start, lt: end } } }),
    prisma.waterLog.findMany({ where: { userId, date: { gte: start, lt: end } } }),
    prisma.workoutLog.findFirst({ where: { userId, date: { gte: start, lt: end } }, orderBy: { date: "desc" } }),
    prisma.spend.findMany({ where: { userId, date: { gte: start, lt: end } }, orderBy: { date: "desc" }, take: 8 }),
    prisma.medication.findMany({ where: { userId, active: true }, orderBy: { timeOfDay: "asc" }, take: 10 }),
  ]);

  return {
    date: formatLocalDateInput(new Date()),
    profile: profile ? { goal: profile.goal, targetCalories: profile.targetCalories, targetProtein: profile.targetProtein, targetWaterMl: profile.targetWaterMl } : null,
    reminders: reminders.map((item) => ({ id: item.id, title: item.title, dueDate: item.dueDate, priority: item.priority, overdue: Boolean(item.dueDate && item.dueDate < new Date()) })),
    nutrition: {
      calories: foodLogs.reduce((sum, item) => sum + item.calories, 0),
      protein: foodLogs.reduce((sum, item) => sum + item.protein, 0),
      meals: foodLogs.length,
    },
    waterMl: waterLogs.reduce((sum, item) => sum + item.amountMl, 0),
    workout: workout ? { templateName: workout.templateName, duration: workout.duration, notes: workout.notes } : null,
    spends: {
      total: spends.reduce((sum, item) => sum + item.amount, 0),
      recent: spends.map((item) => ({ merchant: item.merchant, amount: item.amount, currency: item.currency, category: item.category })),
    },
    medications: medications.map((item) => ({ name: item.name, dosage: item.dosage, timeOfDay: item.timeOfDay })),
  };
}

async function listReminders(userId: string, args: any) {
  const filter = trim(args?.filter || "today", 20);
  const today = localRange();
  const where: any = { userId, completed: false };
  if (filter === "today") where.dueDate = { gte: today.start, lt: today.end };
  if (filter === "overdue") where.dueDate = { lt: today.start };
  if (filter === "upcoming") where.dueDate = { gte: today.end };
  const reminders = await prisma.reminder.findMany({ where, orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }], take: 20 });
  return reminders.map((item) => ({
    id: item.id,
    title: item.title,
    notes: item.notes,
    dueDate: item.dueDate,
    dueText: item.dueDate ? formatAppDateTime(item.dueDate) : "No due date",
    priority: item.priority,
    contextTag: item.contextTag,
  }));
}

async function createReminder(userId: string, args: any) {
  const title = trim(args?.title, 120);
  if (!title) throw new Error("Reminder title is required.");
  if (!args?.confirmed) return confirmationRequired("create_reminder", args, `Create reminder "${title}"`);
  const list = await ensureLiveList(userId);
  const reminder = await prisma.reminder.create({
    data: {
      userId,
      listId: list.id,
      title,
      notes: trim(args?.notes, 500) || null,
      dueDate: parseLiveDate(args?.dueDate),
      priority: ["none", "low", "medium", "high"].includes(String(args?.priority)) ? String(args.priority) : "none",
      contextTag: trim(args?.contextTag || "general", 40) || "general",
      sourceLabel: "Dayza Live",
    },
  });
  const undo = await createAgentUndoAction(userId, {
    actionType: "create_reminder",
    label: `Created reminder: ${reminder.title}`,
    targetType: "reminder",
    targetId: reminder.id,
  });
  return { ok: true, reminder, undoId: undo.id, message: `Created reminder: ${reminder.title}` };
}

async function completeReminder(userId: string, args: any) {
  if (!args?.confirmed) return confirmationRequired("complete_reminder", args, `Complete reminder "${trim(args?.title || args?.reminderId || "selected task")}"`);
  const id = trim(args?.reminderId, 80);
  const title = trim(args?.title, 120);
  const reminder = id
    ? await prisma.reminder.findFirst({ where: { id, userId, completed: false } })
    : await prisma.reminder.findFirst({ where: { userId, completed: false, title: { contains: title, mode: "insensitive" } }, orderBy: { dueDate: "asc" } });
  if (!reminder) return { ok: false, message: "No matching pending reminder found." };
  const updated = await prisma.reminder.update({ where: { id: reminder.id }, data: { completed: true, completedAt: new Date() } });
  const undo = await createAgentUndoAction(userId, {
    actionType: "complete_reminder",
    label: `Completed reminder: ${updated.title}`,
    targetType: "reminderCompletion",
    targetId: updated.id,
    payload: { previousCompleted: reminder.completed, previousCompletedAt: reminder.completedAt },
  });
  return { ok: true, reminder: updated, undoId: undo.id, message: `Completed reminder: ${updated.title}` };
}

async function logSpend(userId: string, args: any) {
  const merchant = trim(args?.merchant, 100);
  const amount = toNumber(args?.amount);
  if (!merchant || amount <= 0) throw new Error("Merchant and positive amount are required.");
  if (!args?.confirmed) return confirmationRequired("log_spend", args, `Log ${args?.currency || "INR"} ${amount} at ${merchant}`);
  const spend = await prisma.spend.create({
    data: {
      userId,
      merchant,
      amount,
      currency: trim(args?.currency || "INR", 8).toUpperCase() || "INR",
      category: trim(args?.category || "Other", 40) || "Other",
      source: "dayza_live",
      notes: trim(args?.notes, 400) || "Logged from Dayza Live Agent.",
      date: parseLiveDate(args?.date) ?? new Date(),
    },
  });
  const undo = await createAgentUndoAction(userId, {
    actionType: "create_spend_log",
    label: `Logged spend: ${spend.merchant}`,
    targetType: "spend",
    targetId: spend.id,
  });
  return { ok: true, spend, undoId: undo.id, message: `Logged ${spend.currency} ${spend.amount} at ${spend.merchant}` };
}

async function getSpendSummary(userId: string, args: any) {
  const range = rangeFromName(trim(args?.range || "month", 20));
  const spends = await prisma.spend.findMany({ where: { userId, date: { gte: range.start, lt: range.end } }, orderBy: { date: "desc" }, take: 50 });
  const categories = spends.reduce<Record<string, number>>((acc, spend) => {
    const key = spend.category || "Other";
    acc[key] = (acc[key] || 0) + spend.amount;
    return acc;
  }, {});
  return {
    range: range.label,
    total: spends.reduce((sum, spend) => sum + spend.amount, 0),
    count: spends.length,
    categories,
    recent: spends.slice(0, 8).map((spend) => ({ merchant: spend.merchant, amount: spend.amount, currency: spend.currency, category: spend.category, date: spend.date })),
  };
}

async function logFood(userId: string, args: any) {
  const foodName = trim(args?.foodName, 120);
  if (!foodName) throw new Error("Food name is required.");
  if (!args?.confirmed) return confirmationRequired("log_food", args, `Log food "${foodName}"`);
  const foodLog = await prisma.foodLog.create({
    data: {
      userId,
      foodName,
      mealType: trim(args?.mealType || "snack", 30) || "snack",
      servingSize: trim(args?.servingSize || "", 80) || null,
      calories: toNumber(args?.calories),
      protein: toNumber(args?.protein),
      carbs: toNumber(args?.carbs),
      fat: toNumber(args?.fat),
      fiber: toNumber(args?.fiber),
      date: new Date(),
    },
  });
  const undo = await createAgentUndoAction(userId, {
    actionType: "create_food_log",
    label: `Logged food: ${foodLog.foodName}`,
    targetType: "foodLog",
    targetId: foodLog.id,
  });
  return { ok: true, foodLog, undoId: undo.id, message: `Logged ${foodLog.foodName}` };
}

async function logWater(userId: string, args: any) {
  const amountMl = toNumber(args?.amountMl);
  if (amountMl <= 0) throw new Error("Water amount must be positive.");
  if (!args?.confirmed) return confirmationRequired("log_water", args, `Log ${amountMl} ml water`);
  const waterLog = await prisma.waterLog.create({ data: { userId, amountMl, date: new Date() } });
  return { ok: true, waterLog, message: `Logged ${Math.round(amountMl)} ml water` };
}

async function getWorkoutPlan(userId: string) {
  const templates = await prisma.workoutTemplate.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 12,
    include: { exercises: { include: { exercise: true }, orderBy: { orderIndex: "asc" } } },
  });
  return templates.map((template) => ({
    id: template.id,
    name: template.name,
    dayOfWeek: template.dayOfWeek,
    muscleGroups: template.muscleGroups,
    exercises: template.exercises.map((row) => ({ name: row.exercise.name, sets: row.sets, reps: row.reps })),
  }));
}

async function logWorkoutNote(userId: string, args: any) {
  if (!args?.confirmed) return confirmationRequired("log_workout_note", args, `Log workout note "${trim(args?.templateName || args?.notes || "workout")}"`);
  const log = await prisma.workoutLog.create({
    data: {
      userId,
      templateName: trim(args?.templateName || "Dayza Live workout", 120),
      duration: args?.duration ? Math.max(0, Math.round(toNumber(args.duration))) : null,
      notes: trim(args?.notes, 500) || "Logged from Dayza Live Agent.",
      date: new Date(),
    },
  });
  const undo = await createAgentUndoAction(userId, {
    actionType: "create_workout_log",
    label: `Logged workout: ${log.templateName}`,
    targetType: "workoutLog",
    targetId: log.id,
  });
  return { ok: true, workoutLog: log, undoId: undo.id, message: `Logged workout note: ${log.templateName}` };
}

async function getProfileContext(userId: string) {
  const [user, profile] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true } }),
    prisma.userProfile.findUnique({ where: { userId } }),
  ]);
  return {
    user,
    profile: profile
      ? {
          age: profile.age,
          gender: profile.gender,
          height: profile.height,
          weight: profile.weight,
          goal: profile.goal,
          activityLevel: profile.activityLevel,
          healthLimitations: profile.healthLimitations,
          workoutFocusMuscles: profile.workoutFocusMuscles,
          workoutFocusGoal: profile.workoutFocusGoal,
          workoutTrainingStyle: profile.workoutTrainingStyle,
          micronutrientTrackingEnabled: profile.micronutrientTrackingEnabled,
        }
      : null,
  };
}

async function previewAgentTask(userId: string, args: any) {
  const url = trim(args?.url, 1000);
  const prompt = trim(args?.prompt, 3000);
  if (!url || !prompt) throw new Error("Task URL and instruction are required.");
  const result = await previewAgentTaskDraft({
    userId,
    name: trim(args?.name || "Agent task preview", 120),
    url,
    prompt,
    trainingNotes: trim(args?.trainingNotes, 5000) || null,
    outputFormat: trim(args?.outputFormat, 3000) || null,
  });
  return {
    ok: result.ok,
    status: result.status,
    title: result.title,
    summary: result.summary,
  };
}

export async function executeDayzaLiveTool(userId: string, name: string, args: any = {}) {
  if (WRITE_TOOLS.has(name) && !args?.confirmed) {
    return confirmationRequired(name, args, name.replace(/_/g, " "));
  }

  switch (name) {
    case "get_today_overview":
      return getTodayOverview(userId);
    case "list_reminders":
      return listReminders(userId, args);
    case "create_reminder":
      return createReminder(userId, args);
    case "complete_reminder":
      return completeReminder(userId, args);
    case "log_spend":
      return logSpend(userId, args);
    case "get_spend_summary":
      return getSpendSummary(userId, args);
    case "log_food":
      return logFood(userId, args);
    case "log_water":
      return logWater(userId, args);
    case "get_workout_plan":
      return getWorkoutPlan(userId);
    case "log_workout_note":
      return logWorkoutNote(userId, args);
    case "get_profile_context":
      return getProfileContext(userId);
    case "preview_agent_task_draft":
      return previewAgentTask(userId, args);
    default:
      throw new Error(`Unknown Live Agent tool: ${name}`);
  }
}
