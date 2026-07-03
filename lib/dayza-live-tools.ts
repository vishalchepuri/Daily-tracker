import { prisma } from "@/lib/db";
import { previewAgentTaskDraft } from "@/lib/agent-scheduled-tasks";
import { createAgentUndoAction } from "@/lib/firestore-app-data";
import { dateTimeInputToIso, formatAppDateTime, formatLocalDateInput } from "@/lib/local-dates";

const WRITE_TOOLS = new Set([
  "create_reminder",
  "complete_reminder",
  "log_spend",
  "log_food",
  "log_water",
  "create_workout_template",
  "add_exercise_to_workout_template",
  "update_workout_exercise",
  "log_workout_note",
  "log_workout",
]);
const MUSCLE_GROUPS = ["chest", "back", "shoulders", "legs", "arms", "core"];

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function trim(value: unknown, max = 160) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeMuscleGroup(value: unknown) {
  const raw = trim(value, 40).toLowerCase();
  const aliases: Record<string, string> = {
    triceps: "arms",
    biceps: "arms",
    forearms: "arms",
    abs: "core",
    belly: "core",
    stomach: "core",
    quads: "legs",
    quadriceps: "legs",
    hamstrings: "legs",
    glutes: "legs",
    calves: "legs",
  };
  const normalized = aliases[raw] ?? raw;
  return MUSCLE_GROUPS.includes(normalized) ? normalized : "chest";
}

function normalizeRoutineItems(items: any[] = []) {
  return items
    .map((item) => {
      if (typeof item === "string") return { name: trim(item, 80), duration: "", notes: "" };
      return {
        name: trim(item?.name, 80),
        duration: trim(item?.duration ?? item?.time, 40),
        notes: trim(item?.notes ?? item?.description, 160),
      };
    })
    .filter((item) => item.name);
}

function routineJson(items: any[] = []) {
  const normalized = normalizeRoutineItems(items);
  return normalized.length ? JSON.stringify(normalized) : null;
}

function defaultWarmups(name: string, muscleGroups: string) {
  const text = `${name} ${muscleGroups}`.toLowerCase();
  const warmups = [
    { name: "Easy treadmill, cycle, or cross trainer", duration: "5-8 min", notes: "Build warmth gradually before strength work." },
    { name: "Dynamic mobility for trained joints", duration: "3-5 min", notes: "Use pain-free range and match the drills to today's muscles." },
  ];
  if (/(chest|shoulder|push|triceps|upper)/i.test(text)) {
    warmups.push({ name: "Shoulder blade activation", duration: "2 sets", notes: "Band pull-aparts or wall slides before pressing." });
  }
  if (/(back|biceps|pull|row)/i.test(text)) {
    warmups.push({ name: "Lat and upper-back activation", duration: "2 sets", notes: "Light pulldowns or cable rows before working sets." });
  }
  if (/(leg|quad|hamstring|glute|calf|lower)/i.test(text)) {
    warmups.push({ name: "Hip, knee, and ankle prep", duration: "3-5 min", notes: "Bodyweight squats, glute bridges, and ankle rocks." });
  }
  return warmups;
}

function defaultStretches(name: string, muscleGroups: string) {
  const text = `${name} ${muscleGroups}`.toLowerCase();
  const stretches = [
    { name: "Easy cooldown walk or cycle", duration: "3-5 min", notes: "Bring breathing down before stretches." },
    { name: "Main muscle stretch", duration: "30-45 sec each", notes: "Stretch the muscles trained today without bouncing." },
  ];
  if (/(chest|shoulder|triceps|push|upper)/i.test(text)) {
    stretches.push({ name: "Doorway chest and triceps stretch", duration: "30 sec each", notes: "Keep shoulders relaxed." });
  }
  if (/(back|biceps|pull|row)/i.test(text)) {
    stretches.push({ name: "Lat stretch and forearm release", duration: "30 sec each", notes: "Stay gentle and controlled." });
  }
  if (/(leg|quad|hamstring|glute|calf|lower)/i.test(text)) {
    stretches.push({ name: "Hamstring, quad, and calf stretch", duration: "30 sec each", notes: "Stay pain-free and controlled." });
  }
  return stretches;
}

async function findOrCreateExercise(input: any, userId: string) {
  const exerciseName = trim(input?.exerciseName ?? input?.name, 120);
  if (!exerciseName) throw new Error("Exercise name is required.");
  const existing = await prisma.exercise.findFirst({
    where: {
      name: { equals: exerciseName, mode: "insensitive" },
      OR: [{ status: "approved" }, { status: "pending", submittedById: userId }],
    },
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
  });
  if (existing) return existing;

  const baseId = slugify(exerciseName) || "dayza-live-exercise";
  let id = baseId;
  let suffix = 2;
  while (await prisma.exercise.findUnique({ where: { id } })) {
    id = `${baseId}-${suffix}`;
    suffix += 1;
  }

  return prisma.exercise.create({
    data: {
      id,
      name: exerciseName,
      muscleGroup: normalizeMuscleGroup(input?.muscleGroup),
      equipment: trim(input?.equipment, 80) || null,
      category: trim(input?.category, 40) || null,
      description: trim(input?.description, 300) || null,
      formTips: trim(input?.formTips, 300) || null,
      status: "pending",
      submittedById: userId,
    },
  });
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
    exercises: template.exercises.map((row) => ({
      workoutExerciseId: row.id,
      exerciseId: row.exerciseId,
      name: row.exercise.name,
      muscleGroup: row.exercise.muscleGroup,
      sets: row.sets,
      reps: row.reps,
      restSeconds: row.restSeconds,
    })),
  }));
}

async function resolveWorkoutTemplate(userId: string, args: any, includeExercises = false) {
  const templateId = trim(args?.templateId, 120);
  const templateName = trim(args?.templateName ?? args?.name, 120);
  if (!templateId && !templateName) throw new Error("Workout day name or ID is required.");
  const include = includeExercises ? { exercises: { include: { exercise: true }, orderBy: { orderIndex: "asc" as const } } } : undefined;
  const template = templateId
    ? await prisma.workoutTemplate.findFirst({ where: { id: templateId, userId }, include })
    : await prisma.workoutTemplate.findFirst({ where: { userId, name: { contains: templateName, mode: "insensitive" } }, include, orderBy: { createdAt: "desc" } });
  if (!template) throw new Error(`Could not find workout day "${templateName || templateId}".`);
  return template;
}

async function createWorkoutTemplate(userId: string, args: any) {
  const name = trim(args?.name, 120);
  if (!name) throw new Error("Workout day name is required.");
  const exerciseInputs = Array.isArray(args?.exercises) ? args.exercises.slice(0, 12) : [];
  if (exerciseInputs.length === 0) throw new Error("At least one exercise is required to create a workout day.");
  if (!args?.confirmed) return confirmationRequired("create_workout_template", args, `Create workout day "${name}" with ${exerciseInputs.length} exercises`);

  const exerciseRows = [];
  for (const [index, item] of exerciseInputs.entries()) {
    const exercise = await findOrCreateExercise(item, userId);
    exerciseRows.push({
      exerciseId: exercise.id,
      sets: Math.max(1, Math.round(toNumber(item?.sets, 3))),
      reps: trim(item?.reps || "8-12", 40) || "8-12",
      restSeconds: Math.max(15, Math.round(toNumber(item?.restSeconds, 90))),
      orderIndex: index,
    });
  }

  const muscleGroups = trim(args?.muscleGroups || exerciseInputs.map((item: any) => normalizeMuscleGroup(item?.muscleGroup)).join(","), 120);
  const warmups = normalizeRoutineItems(Array.isArray(args?.warmups) ? args.warmups : []);
  const stretches = normalizeRoutineItems(Array.isArray(args?.stretches) ? args.stretches : []);
  const baseId = slugify(name) || "dayza-live-workout";
  let id = baseId;
  let suffix = 2;
  while (await prisma.workoutTemplate.findUnique({ where: { id } })) {
    id = `${baseId}-${suffix}`;
    suffix += 1;
  }

  const template = await prisma.workoutTemplate.create({
    data: {
      id,
      userId,
      name,
      description: muscleGroups ? `Focus: ${muscleGroups}` : null,
      dayOfWeek: trim(args?.dayOfWeek, 40) || null,
      muscleGroups: muscleGroups || null,
      difficulty: ["beginner", "intermediate", "advanced"].includes(String(args?.difficulty)) ? String(args.difficulty) : "intermediate",
      warmupJson: routineJson(warmups.length ? warmups : defaultWarmups(name, muscleGroups)),
      stretchesJson: routineJson(stretches.length ? stretches : defaultStretches(name, muscleGroups)),
      exercises: { create: exerciseRows },
    },
    include: { exercises: { include: { exercise: true }, orderBy: { orderIndex: "asc" } } },
  });
  const undo = await createAgentUndoAction(userId, {
    actionType: "create_workout_template",
    label: `Created workout day: ${template.name}`,
    targetType: "workoutTemplate",
    targetId: template.id,
  });
  return { ok: true, workoutTemplate: template, undoId: undo.id, message: `Created workout day: ${template.name}` };
}

async function addExerciseToWorkoutTemplate(userId: string, args: any) {
  const exerciseName = trim(args?.exerciseName, 120);
  if (!exerciseName) throw new Error("Exercise name is required.");
  if (!args?.confirmed) return confirmationRequired("add_exercise_to_workout_template", args, `Add ${exerciseName} to ${trim(args?.templateName || args?.templateId || "the workout", 120)}`);
  const template = await resolveWorkoutTemplate(userId, args, true) as any;
  const exercise = await findOrCreateExercise(args, userId);
  const workoutExercise = await prisma.workoutExercise.create({
    data: {
      workoutTemplateId: template.id,
      exerciseId: exercise.id,
      sets: Math.max(1, Math.round(toNumber(args?.sets, 3))),
      reps: trim(args?.reps || "8-12", 40) || "8-12",
      restSeconds: Math.max(15, Math.round(toNumber(args?.restSeconds, 90))),
      orderIndex: template.exercises.length,
    },
  });
  const undo = await createAgentUndoAction(userId, {
    actionType: "add_exercise_to_workout_template",
    label: `Added ${exercise.name} to ${template.name}`,
    targetType: "workoutExercise",
    targetId: workoutExercise.id,
  });
  return { ok: true, workoutExercise, undoId: undo.id, message: `Added ${exercise.name} to ${template.name}` };
}

async function updateWorkoutExercise(userId: string, args: any) {
  if (!args?.confirmed) return confirmationRequired("update_workout_exercise", args, `Update ${trim(args?.exerciseName || "the exercise", 120)} in ${trim(args?.templateName || args?.templateId || "the workout", 120)}`);
  const template = await resolveWorkoutTemplate(userId, args, true) as any;
  const workoutExerciseId = trim(args?.workoutExerciseId, 120);
  const exerciseName = trim(args?.exerciseName, 120).toLowerCase();
  const row = workoutExerciseId
    ? template.exercises.find((item: any) => item.id === workoutExerciseId)
    : template.exercises.find((item: any) => item.exercise?.name?.toLowerCase().includes(exerciseName));
  if (!row) throw new Error(`Could not find that exercise in ${template.name}.`);

  const previous = {
    sets: row.sets,
    reps: row.reps,
    restSeconds: row.restSeconds,
  };
  const updated = await prisma.workoutExercise.update({
    where: { id: row.id },
    data: {
      sets: args?.sets == null ? row.sets : Math.max(1, Math.round(toNumber(args.sets, row.sets))),
      reps: args?.reps == null ? row.reps : trim(args.reps, 40) || row.reps,
      restSeconds: args?.restSeconds == null ? row.restSeconds : Math.max(15, Math.round(toNumber(args.restSeconds, row.restSeconds))),
    },
    include: { exercise: true },
  });
  const undo = await createAgentUndoAction(userId, {
    actionType: "update_workout_exercise",
    label: `Updated ${updated.exercise.name} in ${template.name}`,
    targetType: "workoutExerciseUpdate",
    targetId: updated.id,
    payload: previous,
  });
  return { ok: true, workoutExercise: updated, undoId: undo.id, message: `Updated ${updated.exercise.name} in ${template.name}` };
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

function repsFromValue(value: unknown) {
  const direct = toNumber(value, NaN);
  if (Number.isFinite(direct)) return Math.max(0, Math.round(direct));
  const match = String(value ?? "").match(/\d+/);
  return match ? Math.max(0, Math.round(Number(match[0]))) : 0;
}

async function logWorkout(userId: string, args: any) {
  if (!args?.confirmed) return confirmationRequired("log_workout", args, `Log workout "${trim(args?.templateName || "Dayza Live workout", 120)}"`);
  const exerciseInputs = Array.isArray(args?.exercises) ? args.exercises.slice(0, 30) : [];
  const exerciseRows = [];
  for (const item of exerciseInputs) {
    const exerciseName = trim(item?.exerciseName ?? item?.name, 120);
    if (!exerciseName) continue;
    const exercise = await findOrCreateExercise(item, userId);
    const sets = item?.setNumber ? 1 : Math.max(1, Math.min(10, Math.round(toNumber(item?.sets, 1))));
    for (let index = 0; index < sets; index += 1) {
      exerciseRows.push({
        exerciseId: exercise.id,
        setNumber: item?.setNumber ? Math.max(1, Math.round(toNumber(item.setNumber, 1))) : index + 1,
        reps: repsFromValue(item?.reps),
        weight: Math.max(0, toNumber(item?.weight, 0)),
      });
    }
  }

  const log = await prisma.workoutLog.create({
    data: {
      userId,
      templateName: trim(args?.templateName || "Dayza Live workout", 120),
      duration: args?.duration ? Math.max(0, Math.round(toNumber(args.duration))) : null,
      notes: trim(args?.notes, 500) || "Logged from Dayza Live Agent.",
      date: parseLiveDate(args?.date) ?? new Date(),
      exerciseLogs: { create: exerciseRows },
    },
    include: { exerciseLogs: { include: { exercise: true } } },
  });
  const undo = await createAgentUndoAction(userId, {
    actionType: "create_workout_log",
    label: `Logged workout: ${log.templateName}`,
    targetType: "workoutLog",
    targetId: log.id,
  });
  return { ok: true, workoutLog: log, undoId: undo.id, message: `Logged workout: ${log.templateName}` };
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
    case "create_workout_template":
      return createWorkoutTemplate(userId, args);
    case "add_exercise_to_workout_template":
      return addExerciseToWorkoutTemplate(userId, args);
    case "update_workout_exercise":
      return updateWorkoutExercise(userId, args);
    case "log_workout_note":
      return logWorkoutNote(userId, args);
    case "log_workout":
      return logWorkout(userId, args);
    case "get_profile_context":
      return getProfileContext(userId);
    case "preview_agent_task_draft":
      return previewAgentTask(userId, args);
    default:
      throw new Error(`Unknown Live Agent tool: ${name}`);
  }
}
