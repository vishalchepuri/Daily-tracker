export const dynamic = "force-dynamic";
import { requireCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import {
  addFirestoreChatAttachment,
  addFirestoreChatMessage,
  getOrCreateFirestoreChatSession,
  listFirestoreChatMessages,
  pruneFirestoreChatRetention,
} from "@/lib/firestore-chat";
import { uploadBuffer } from "@/lib/s3";
import {
  createAgentUndoAction,
  createPendingAgentActionPlan,
  createReviewItemOnce,
  getLatestPendingAgentActionPlan,
  listFoodMicronutrientLogsForFoodLogs,
  markPendingAgentActionPlan,
  upsertFoodMicronutrientLog,
} from "@/lib/firestore-app-data";
import { BODY_PART_REFERENCE, GYM_TRAINING_SPLITS } from "@/lib/workout-split-library";
import { MICRONUTRIENTS, mergeWithDefaultMicronutrientTargets, parseMicronutrientMap, sumMicronutrients } from "@/lib/micronutrients";
import { estimateMicronutrientsForFood } from "@/lib/micronutrient-estimator";

const CHAT_IMAGE_RETENTION_DAYS = 5;
const CHAT_SESSION_RETENTION_LIMIT = 7;
const CHAT_MESSAGES_PER_SESSION_LIMIT = 10;
const MAX_CHAT_IMAGE_BYTES = 2 * 1024 * 1024;

function chatErrorMessage(error: any, fallback: string) {
  if (error?.code === 5 || error?.code === "5") {
    return "Firestore is not enabled for this Firebase project. Create the default Firestore database in Firebase Console.";
  }
  return error?.message ?? fallback;
}

type WorkoutExerciseWithExercise = {
  id: string;
  workoutTemplateId?: string;
  exerciseId?: string;
  sets?: number;
  reps?: string;
  restSeconds?: number;
  orderIndex?: number;
  exercise: {
    name: string;
  };
};

type AgentUndoButton = {
  id: string;
  label: string;
};

type AgentActionResult = {
  type: string;
  label: string;
  id: string;
  undo?: AgentUndoButton;
};

const WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function compactUndoButtonLabel(label: string) {
  const createdMatch = label.match(/^Created\s+(.+)$/i);
  if (createdMatch) {
    const createdName = createdMatch[1].trim();
    const dayName = WEEKDAY_NAMES.find((day) => createdName.toLowerCase().startsWith(day.toLowerCase()));
    return dayName ? `Undo ${dayName}` : `Undo ${createdName.slice(0, 24)}`;
  }

  const loggedMatch = label.match(/^Logged\s+(.+)$/i);
  if (loggedMatch) return `Undo ${loggedMatch[1].trim().slice(0, 24)}`;

  return "Undo";
}

function isSkippedActionResult(result: AgentActionResult) {
  return /^Skipped\s+/i.test(result.label);
}

function cleanSkippedLabel(label: string) {
  return label.replace(/^Skipped\s+/i, "");
}

function formatActionResultsSummary(actionResults: AgentActionResult[]) {
  if (actionResults.length === 0) return "";

  const completed = actionResults.filter((result) => !isSkippedActionResult(result));
  const skipped = actionResults.filter(isSkippedActionResult);
  const sections: string[] = [];

  if (completed.length > 0) {
    sections.push(`Actions completed:\n${completed.map((result) => `- ${result.label}`).join("\n")}`);
  }

  if (skipped.length > 0) {
    sections.push(`Actions skipped:\n${skipped.map((result) => `- ${cleanSkippedLabel(result.label)}`).join("\n")}`);
  }

  return `\n\n${sections.join("\n\n")}`;
}

function correctWorkoutPlanSaveMessage(content: string, actionResults: AgentActionResult[]) {
  const createdWorkoutCount = actionResults.filter(
    (result) => result.type === "create_workout_template" && /^Created\s+/i.test(result.label)
  ).length;
  const skippedWorkoutCount = actionResults.filter(
    (result) => result.type === "create_workout_template" && isSkippedActionResult(result)
  ).length;

  if (skippedWorkoutCount === 0) return content;

  const savedText = createdWorkoutCount === 1 ? "1 workout day was saved" : `${createdWorkoutCount} workout days were saved`;
  const skippedText =
    skippedWorkoutCount === 1
      ? "1 planned day was skipped by validation"
      : `${skippedWorkoutCount} planned days were skipped by validation`;
  const correction = `Done - ${savedText}; ${skippedText}.`;

  if (/^Done\b[^\n]*/i.test(content)) {
    return content.replace(/^Done\b[^\n]*/i, correction);
  }

  return `${correction}\n\n${content}`;
}

function actionProgressLabel(action: AgentAction, index: number, total: number) {
  if (action.type === "create_workout_template") return `Saving workout day ${index} of ${total}: ${action.name}`;
  if (action.type === "create_food_log") return `Saving food log ${index} of ${total}: ${action.foodName}`;
  if (action.type === "create_reminder") return `Saving reminder ${index} of ${total}: ${action.title}`;
  if (action.type === "complete_reminder") return `Completing reminder ${index} of ${total}...`;
  if (action.type === "create_spend_log") return `Saving spend ${index} of ${total}: ${action.merchant}`;
  if (action.type === "create_money_link") return `Saving lend/borrow entry ${index} of ${total}`;
  if (action.type === "create_workout_log") return `Saving workout history ${index} of ${total}`;
  if (action.type === "update_workout_focus") return "Saving workout focus...";
  if (action.type === "update_workout_training_style") return "Saving workout style...";
  if (action.type.startsWith("update_")) return "Updating your profile memory...";
  return `Saving action ${index} of ${total}...`;
}

function parseClaimedWorkoutDays(content: string) {
  const matches = [...content.matchAll(/\b(\d{1,2})\s*[- ]?\s*day\b/gi)];
  const values = matches.map((match) => Number(match[1])).filter((value) => Number.isFinite(value) && value > 0);
  return values.length ? Math.max(...values) : null;
}

async function validateWorkoutTemplateActionResults(userId: string, initialContent: string, actions: AgentAction[], actionResults: AgentActionResult[]) {
  const plannedWorkoutActions = actions.filter((action) => action.type === "create_workout_template");
  const createdWorkoutResults = actionResults.filter(
    (result) => result.type === "create_workout_template" && /^Created\s+/i.test(result.label)
  );
  const skippedWorkoutResults = actionResults.filter(
    (result) => result.type === "create_workout_template" && isSkippedActionResult(result)
  );

  if (plannedWorkoutActions.length === 0 && createdWorkoutResults.length === 0 && skippedWorkoutResults.length === 0) {
    return initialContent;
  }

  const createdIds = createdWorkoutResults.map((result) => result.id).filter(Boolean);
  const savedTemplates = createdIds.length
    ? await prisma.workoutTemplate.findMany({
        where: { userId, id: { in: createdIds } },
        select: { id: true, name: true },
      })
    : [];

  const savedCount = savedTemplates.length;
  const claimedDays = parseClaimedWorkoutDays(initialContent);
  const expectedDays = Math.max(plannedWorkoutActions.length, claimedDays ?? 0);
  const blockedCount = Math.max(skippedWorkoutResults.length, plannedWorkoutActions.length - savedCount);

  if (expectedDays > 0 && savedCount === expectedDays && skippedWorkoutResults.length === 0) return initialContent;
  if (savedCount === createdWorkoutResults.length && skippedWorkoutResults.length === 0 && (!claimedDays || claimedDays === savedCount)) return initialContent;

  const savedText = savedCount === 1 ? "1 workout day is saved" : `${savedCount} workout days are saved`;
  const expectedText = expectedDays > savedCount ? ` out of ${expectedDays} planned days` : "";
  const blockedText = blockedCount > 0
    ? blockedCount === 1
      ? " 1 day still needs attention."
      : ` ${blockedCount} days still need attention.`
    : "";
  const correction = `Done - I verified the database: ${savedText}${expectedText}.${blockedText}`;

  if (/^Done\b[^\n]*/i.test(initialContent)) {
    return initialContent.replace(/^Done\b[^\n]*/i, correction);
  }

  return `${correction}\n\n${initialContent}`;
}

type AgentAction =
  | {
      type: "create_exercise";
      name: string;
      muscleGroup: string;
      equipment?: string;
      category?: string;
      description?: string;
      formTips?: string;
    }
  | {
      type: "create_food_log";
      foodName: string;
      mealType: string;
      servingSize?: string;
      calories?: number;
      protein?: number;
      carbs?: number;
      fat?: number;
      fiber?: number;
      micronutrients?: Record<string, number>;
      date?: string;
    }
  | {
      type: "update_nutrition_targets";
      targetCalories?: number;
      targetProtein?: number;
      targetCarbs?: number;
      targetFat?: number;
      targetFiber?: number;
      targetWaterMl?: number;
      micronutrientTargets?: Record<string, number>;
      reason?: string;
    }
  | {
      type: "create_progress_entry";
      weight?: number;
      chest?: number;
      arms?: number;
      waist?: number;
      hips?: number;
      thighs?: number;
      notes?: string;
      date?: string;
    }
  | {
      type: "create_spend_log";
      merchant: string;
      amount: number;
      currency?: string;
      category?: string;
      date?: string;
      notes?: string;
      bankName?: string;
      accountName?: string;
      accountLast4?: string;
      creditCardName?: string;
      cardLast4?: string;
      paymentSource?: "bank_account" | "credit_card" | "debit_card" | "wallet" | "cash" | "unknown";
    }
  | {
      type: "update_spend_target";
      targetMonthlySpend: number;
      reason?: string;
    }
  | {
      type: "update_finance_profile";
      currentBalance?: number;
      totalAmount?: number;
    }
  | {
      type: "create_credit_card";
      name: string;
      bankName?: string;
      last4?: string;
      currentDue?: number;
      dueDay?: number;
    }
  | {
      type: "create_bank_account";
      name: string;
      bankName?: string;
      accountType?: string;
      last4?: string;
      balance?: number;
      currency?: string;
    }
  | {
      type: "create_money_link";
      person: string;
      linkType: "lend" | "borrow";
      amount: number;
      currency?: string;
      date?: string;
      notes?: string;
    }
  | {
      type: "create_reminder";
      title: string;
      notes?: string;
      dueDate?: string;
      recurrence?: string;
      recurrenceCustom?: string;
      priority?: "none" | "low" | "medium" | "high";
      flagged?: boolean;
      listId?: string;
      listName?: string;
      contextTag?: string;
      sourceLabel?: string;
    }
  | {
      type: "complete_reminder";
      reminderId?: string;
      title?: string;
    }
  | {
      type: "create_workout_log";
      templateName?: string;
      duration?: number;
      notes?: string;
      exercises?: Array<{
        exerciseId?: string;
        exerciseName?: string;
        muscleGroup?: string;
        setNumber: number;
        reps: number;
        weight: number;
      }>;
    }
  | {
      type: "update_wellness_targets";
      targetSteps?: number;
      targetActiveEnergy?: number;
      targetExerciseMinutes?: number;
      targetWorkoutSessions?: number;
      targetTrainingMinutes?: number;
      targetLiftVolume?: number;
      targetWeeklyActiveEnergy?: number;
      reason?: string;
    }
  | {
      type: "update_profile_safety";
      healthLimitations?: string;
      foodAllergies?: string;
    }
  | {
      type: "update_workout_focus";
      workoutFocusMuscles: string;
      workoutFocusGoal?: "fat_loss" | "muscle_gain" | "core" | "cardio" | "strength" | "general";
    }
  | {
      type: "update_workout_training_style";
      workoutTrainingStyle: "indian_gym" | "machines" | "mat_bodyweight" | "mixed";
    }
  | {
      type: "update_goal_timeline";
      goalOutcome: string;
      goalTimelineDays: number;
      goalTargetWeight?: number;
      reason?: string;
    }
  | {
      type: "create_workout_template";
      name: string;
      dayOfWeek?: string;
      muscleGroups?: string;
      difficulty?: string;
      warmups?: Array<{
        name: string;
        duration?: string;
        notes?: string;
      }>;
      stretches?: Array<{
        name: string;
        duration?: string;
        notes?: string;
      }>;
      exercises?: Array<{
        exerciseId?: string;
        exerciseName?: string;
        muscleGroup?: string;
        equipment?: string;
        category?: string;
        description?: string;
        formTips?: string;
        sets?: number;
        reps?: string;
        restSeconds?: number;
      }>;
    }
  | {
      type: "remove_exercise_from_template";
      templateName: string;
      exerciseName: string;
    }
  | {
      type: "add_exercise_to_template";
      templateName: string;
      exerciseName: string;
      muscleGroup?: string;
      sets?: number;
      reps?: string;
      restSeconds?: number;
    }
  | {
      type: "delete_workout_template";
      templateName: string;
    }
  | {
      type: "create_diet_plan";
      name: string;
      goal?: string;
      notes?: string;
      meals: Array<{
        mealType: string;
        title?: string;
        foods?: string[];
        calories?: number;
        protein?: number;
        carbs?: number;
        fat?: number;
      }>;
    }
  | {
      type: "update_diet_plan";
      planName: string;
      name?: string;
      goal?: string;
      notes?: string;
      meals?: Array<{
        mealType: string;
        title?: string;
        foods?: string[];
        calories?: number;
        protein?: number;
        carbs?: number;
        fat?: number;
      }>;
    }
  | {
      type: "delete_diet_plan";
      planName: string;
    };

function extractJson(text: string) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const jsonText = fenced?.[1] ?? trimmed;
  return JSON.parse(jsonText);
}

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeRoutineItems(items: any[] = []) {
  return items
    .map((item) => {
      if (typeof item === "string") return { name: item.trim(), duration: "", notes: "" };
      return {
        name: String(item?.name ?? "").trim(),
        duration: String(item?.duration ?? item?.time ?? "").trim(),
        notes: String(item?.notes ?? item?.description ?? "").trim(),
      };
    })
    .filter((item) => item.name);
}

function routineJson(items: any[] = []) {
  const normalized = normalizeRoutineItems(items);
  return normalized.length ? JSON.stringify(normalized) : null;
}

function ensureWorkoutQualityRoutines(action: Extract<AgentAction, { type: "create_workout_template" }>, healthLimitations?: string | null) {
  const text = `${action.name} ${action.muscleGroups ?? ""}`.toLowerCase();
  const hasPainContext = hasKnownAnswer(healthLimitations) && !/^none$/i.test(String(healthLimitations).trim());
  const warmups = normalizeRoutineItems(action.warmups);
  const stretches = normalizeRoutineItems(action.stretches);

  const dayWarmups = [
    { name: "Easy treadmill, cycle, or cross trainer", duration: "5-8 min", notes: "Build warmth gradually before strength work." },
    hasPainContext
      ? { name: "Pain-free joint mobility", duration: "3-5 min", notes: "Use slow controlled range and stop before pain." }
      : { name: "Dynamic mobility for trained joints", duration: "3-5 min", notes: "Match the drill to today's main muscles." },
  ];
  if (includesAny(text, ["chest", "shoulder", "push", "triceps", "upper"])) {
    dayWarmups.push({ name: "Shoulder blade activation", duration: "2 sets", notes: "Band pull-aparts or wall slides before pressing." });
  }
  if (includesAny(text, ["back", "biceps", "pull", "row"])) {
    dayWarmups.push({ name: "Lat and upper-back activation", duration: "2 sets", notes: "Light pulldowns or cable rows before working sets." });
  }
  if (includesAny(text, ["leg", "quad", "hamstring", "glute", "calf", "lower"])) {
    dayWarmups.push({ name: "Hip, knee, and ankle prep", duration: "3-5 min", notes: "Bodyweight squats, glute bridges, and ankle rocks." });
  }

  const dayStretches = [
    { name: "Easy cooldown walk or cycle", duration: "3-5 min", notes: "Bring breathing down before stretches." },
    hasPainContext
      ? { name: "Pain-free mobility hold", duration: "30 sec each", notes: "Gentle range only; avoid forcing painful joints." }
      : { name: "Main muscle stretch", duration: "30-45 sec each", notes: "Stretch the muscles trained today without bouncing." },
  ];
  if (includesAny(text, ["chest", "shoulder", "triceps", "push", "upper"])) {
    dayStretches.push({ name: "Doorway chest and triceps stretch", duration: "30 sec each", notes: "Keep shoulders relaxed." });
  }
  if (includesAny(text, ["back", "biceps", "pull", "row"])) {
    dayStretches.push({ name: "Lat stretch and forearm release", duration: "30 sec each", notes: "Use a bench, wall, or cable post for support." });
  }
  if (includesAny(text, ["leg", "quad", "hamstring", "glute", "calf", "lower"])) {
    dayStretches.push({ name: "Hamstring, quad, and calf stretch", duration: "30 sec each", notes: "Stay pain-free and controlled." });
  }

  return {
    warmups: [...warmups, ...dayWarmups.filter((item) => !warmups.some((existing) => existing.name.toLowerCase() === item.name.toLowerCase()))].slice(0, 5),
    stretches: [...stretches, ...dayStretches.filter((item) => !stretches.some((existing) => existing.name.toLowerCase() === item.name.toLowerCase()))].slice(0, 5),
  };
}

function isDataImageUrl(value: unknown): value is string {
  return typeof value === "string" && /^data:image\/(png|jpe?g|webp);base64,/i.test(value);
}

function parseDataImageUrl(value: string) {
  const match = value.match(/^data:(image\/(?:png|jpe?g|webp));base64,(.+)$/i);
  if (!match) return null;
  const mimeType = match[1].toLowerCase();
  const extension = mimeType.includes("png") ? "png" : mimeType.includes("webp") ? "webp" : "jpg";
  return { mimeType, extension, buffer: Buffer.from(match[2], "base64") };
}

function chatImageExpiry() {
  return new Date(Date.now() + CHAT_IMAGE_RETENTION_DAYS * 24 * 60 * 60 * 1000);
}

function attachmentUrl(attachment: any, now: Date) {
  if (attachment.deletedAt || (attachment.expiresAt && new Date(attachment.expiresAt) <= now)) {
    return { url: null, deleted: true, deletedReason: "Image deleted from database" };
  }
  if (attachment.imageData && attachment.mimeType) {
    const bytes = Buffer.isBuffer(attachment.imageData) ? attachment.imageData : Buffer.from(attachment.imageData);
    return { url: `data:${attachment.mimeType};base64,${bytes.toString("base64")}`, deleted: false, deletedReason: null };
  }
  return { url: null, deleted: false, deletedReason: null };
}

async function getOrCreateChatSession(userId: string, sessionId?: string | null, titleSeed?: string) {
  return getOrCreateFirestoreChatSession(userId, sessionId, titleSeed);
}

async function pruneChatRetention(userId: string) {
  await pruneFirestoreChatRetention(userId, CHAT_SESSION_RETENTION_LIMIT, CHAT_MESSAGES_PER_SESSION_LIMIT).catch((error) => {
    console.error("Firestore chat retention cleanup failed", error);
  });
}

async function saveAssistantMessageBestEffort(userId: string, sessionId: string, content: string, undoActions?: any[]) {
  await addFirestoreChatMessage({ userId, sessionId, role: "assistant", content, undoActions }).catch((error) => {
    console.error("Could not save assistant chat message", error);
  });
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const muscleAliases: Record<string, string> = {
  chest: "chest",
  triceps: "arms",
  biceps: "arms",
  forearms: "arms",
  arms: "arms",
  back: "back",
  shoulders: "shoulders",
  abs: "core",
  core: "core",
  quads: "legs",
  hamstrings: "legs",
  calves: "legs",
  legs: "legs",
  cardio: "core",
};

function normalizeMuscleGroup(value?: string) {
  const key = (value ?? "").trim().toLowerCase();
  return muscleAliases[key] ?? (["chest", "back", "shoulders", "legs", "arms", "core"].includes(key) ? key : "chest");
}

function hasKnownAnswer(value?: string | null) {
  return Boolean(value && value.trim().length > 0);
}

function includesAny(text: string, words: string[]) {
  const normalized = text.toLowerCase();
  return words.some((word) => normalized.includes(word));
}

function normalizePersonName(value: string) {
  return value
    .replace(/\b(cash\s+lend|lend|lent|borrowed?|from|to)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeReminderContextTag(value?: string | null) {
  const normalized = String(value ?? "general")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized || "general";
}

function parseOptionalDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function resolveReminderListId(userId: string, listId?: string, listName?: string) {
  if (listId) {
    const existingById = await prisma.reminderList.findFirst({
      where: { id: listId, userId },
      select: { id: true },
    });
    if (existingById) return existingById.id;
  }

  const trimmedName = String(listName ?? "").trim();
  if (trimmedName) {
    const existingByName = await prisma.reminderList.findFirst({
      where: { userId, name: { equals: trimmedName, mode: "insensitive" } },
      select: { id: true },
    });
    if (existingByName) return existingByName.id;
    const created = await prisma.reminderList.create({
      data: { userId, name: trimmedName, color: "#22c55e" },
      select: { id: true },
    });
    return created.id;
  }

  const firstList = await prisma.reminderList.findFirst({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (firstList) return firstList.id;

  const created = await prisma.reminderList.create({
    data: { userId, name: "Reminders", color: "#22c55e" },
    select: { id: true },
  });
  return created.id;
}

async function findReminderForCompletion(userId: string, action: Extract<AgentAction, { type: "complete_reminder" }>) {
  if (action.reminderId) {
    return prisma.reminder.findFirst({
      where: { id: action.reminderId, userId },
      select: { id: true, title: true, completed: true, completedAt: true },
    });
  }

  const title = String(action.title ?? "").trim();
  if (!title) return null;

  const exact = await prisma.reminder.findFirst({
    where: {
      userId,
      completed: false,
      title: { equals: title, mode: "insensitive" },
    },
    orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
    select: { id: true, title: true, completed: true, completedAt: true },
  });
  if (exact) return exact;

  return prisma.reminder.findFirst({
    where: {
      userId,
      completed: false,
      title: { contains: title, mode: "insensitive" },
    },
    orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
    select: { id: true, title: true, completed: true, completedAt: true },
  });
}

function parseFriendMoneyMentions(text: string) {
  const results: Array<{ person: string; amount: number; notes: string; index: number; rawName: string }> = [];
  const normalized = text.replace(/[₹,]/g, "").replace(/\s+/g, " ");
  const matches = normalized.matchAll(/([A-Za-z][A-Za-z\s]{1,44}?)\s*-\s*(\d{2,9})(?:\/-)?/g);
  const ignoredNameWords = [
    "card",
    "credit",
    "debit",
    "spends",
    "cards",
    "account",
    "balance",
    "current",
    "total",
    "hdfc",
    "sbi",
    "rbl",
    "tata",
    "swiggy",
    "bpcl",
  ];

  for (const match of matches) {
    const rawName = match[1] ?? "";
    const person = normalizePersonName(rawName);
    const amount = toNumber(match[2]);
    const lower = person.toLowerCase();
    if (!person || amount <= 0) continue;
    if (ignoredNameWords.some((word) => lower.includes(word))) continue;
    if (person.split(" ").length > 3) continue;
    results.push({
      person,
      amount,
      rawName: rawName.trim(),
      index: match.index ?? 0,
      notes: `Parsed from Dayza Agent message: ${rawName.trim()} - ${amount}`,
    });
  }

  const unique = new Map<string, { person: string; amount: number; notes: string; index: number; rawName: string }>();
  results.forEach((item) => unique.set(`${item.person.toLowerCase()}:${item.amount}`, item));
  return Array.from(unique.values());
}

function meaningfulCardTokens(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token && !["credit", "card", "bank"].includes(token));
}

function findMentionedCardForFriend(rawMessage: string, friendIndex: number, actions: AgentAction[]) {
  const before = rawMessage.slice(0, friendIndex).toLowerCase();
  const cardActions = actions.filter((action): action is Extract<AgentAction, { type: "create_credit_card" }> => action.type === "create_credit_card");
  let best: Extract<AgentAction, { type: "create_credit_card" }> | null = null;
  let bestIndex = -1;

  for (const action of cardActions) {
    const tokens = meaningfulCardTokens(action.name);
    const tokenIndexes = tokens.map((token) => before.lastIndexOf(token)).filter((index) => index >= 0);
    if (tokens.length > 0 && tokenIndexes.length < Math.min(2, tokens.length)) continue;
    const mentionIndex = tokenIndexes.length ? Math.max(...tokenIndexes) : -1;
    if (mentionIndex > bestIndex) {
      best = action;
      bestIndex = mentionIndex;
    }
  }

  return best;
}

async function createMissingFriendMoneyLinks(userId: string, rawMessage: string, actions: AgentAction[]) {
  if (!rawMessage || !/(lend|lent|credit card|card|my spends|\/-)/i.test(rawMessage)) return [];
  const parsed = parseFriendMoneyMentions(rawMessage);
  if (parsed.length === 0) return [];

  const actionLinks = new Set(
    actions
      .filter((action): action is Extract<AgentAction, { type: "create_money_link" }> => action.type === "create_money_link")
      .map((action) => `${action.person.trim().toLowerCase()}:${toNumber(action.amount)}`)
  );

  const created = [];
  for (const item of parsed) {
    const key = `${item.person.toLowerCase()}:${item.amount}`;
    if (actionLinks.has(key)) continue;
    const relatedCardAction = /cash\s+lend/i.test(item.rawName) ? null : findMentionedCardForFriend(rawMessage, item.index, actions);
    const relatedCard = relatedCardAction
      ? await prisma.creditCard.findFirst({
          where: {
            userId,
            active: true,
            name: { equals: relatedCardAction.name, mode: "insensitive" },
          },
          orderBy: { createdAt: "desc" },
        })
      : null;

    const existing = await prisma.moneyLink.findFirst({
      where: {
        userId,
        type: "lend",
        settled: false,
        person: { equals: item.person, mode: "insensitive" },
        amount: item.amount,
      },
    });
    if (existing) continue;

    const moneyLink = await prisma.moneyLink.create({
      data: {
        userId,
        person: item.person,
        type: "lend",
        amount: item.amount,
        currency: "INR",
        notes: relatedCard ? `Card: ${relatedCard.name}. Card ID: ${relatedCard.id}. ${item.notes}` : item.notes,
      },
    });
    created.push({ type: "create_money_link", label: `Lent INR ${moneyLink.amount} to ${moneyLink.person}`, id: moneyLink.id });
  }
  return created;
}

function isWorkoutPlanIntent(text: unknown) {
  if (typeof text !== "string") return false;
  return includesAny(text, [
    "workout plan",
    "training plan",
    "gym plan",
    "exercise plan",
    "weekly split",
    "split plan",
    "fat loss",
    "lose fat",
    "muscle gain",
    "build muscle",
    "core workout",
    "cardio plan",
  ]);
}

function isWorkoutContextIntent(text: unknown) {
  if (typeof text !== "string") return false;
  return isWorkoutPlanIntent(text) || includesAny(text, [
    "workout",
    "exercise",
    "gym",
    "training",
    "program",
    "template",
    "replace exercise",
    "remove exercise",
    "add exercise",
    "sets",
    "reps",
  ]);
}

function isNutritionContextIntent(text: unknown) {
  if (typeof text !== "string") return false;
  return isFoodPlanIntent(text) || includesAny(text, [
    "food",
    "meal",
    "diet",
    "nutrition",
    "calorie",
    "calories",
    "protein",
    "carbs",
    "fat",
    "fiber",
    "water",
    "ate",
    "breakfast",
    "lunch",
    "dinner",
    "snack",
    "vitamin",
    "mineral",
  ]);
}

function isSpendContextIntent(text: unknown) {
  if (typeof text !== "string") return false;
  return includesAny(text, [
    "spend",
    "spent",
    "expense",
    "payment",
    "receipt",
    "upi",
    "bank",
    "balance",
    "credit card",
    "card",
    "borrow",
    "lent",
    "lend",
    "money",
    "budget",
    "bill",
  ]);
}

function isReminderContextIntent(text: unknown) {
  if (typeof text !== "string") return false;
  return includesAny(text, [
    "remind",
    "reminder",
    "task",
    "todo",
    "to-do",
    "done",
    "complete",
    "completed",
    "office",
    "leaving home",
    "tomorrow",
    "tonight",
    "bring",
    "bill",
  ]);
}

function isProgressContextIntent(text: unknown) {
  if (typeof text !== "string") return false;
  return includesAny(text, [
    "progress",
    "weight",
    "measurement",
    "body fat",
    "steps",
    "active energy",
    "fitness",
    "health",
    "photo",
  ]);
}

function isSimpleGreeting(text: unknown) {
  if (typeof text !== "string") return false;
  const normalized = text
    .trim()
    .toLowerCase()
    .replace(/[!.,?]+/g, "")
    .replace(/\s+/g, " ");
  if (!normalized) return false;
  return [
    "hi",
    "hii",
    "hiii",
    "hello",
    "hey",
    "hey there",
    "hello there",
    "hi there",
    "good morning",
    "good afternoon",
    "good evening",
    "namaste",
  ].includes(normalized);
}

function inferWorkoutFocusGoal(text: string, profileGoal?: string | null) {
  const normalized = text.toLowerCase();
  if (includesAny(normalized, ["fat loss", "lose fat", "weight loss", "cutting", "burn fat"])) return "fat_loss";
  if (includesAny(normalized, ["muscle gain", "build muscle", "grow muscle", "bulk", "hypertrophy"])) return "muscle_gain";
  if (includesAny(normalized, ["cardio", "endurance", "stamina", "conditioning"])) return "cardio";
  if (includesAny(normalized, ["core", "abs", "belly", "stomach", "waist"])) return "core";
  if (includesAny(normalized, ["strength", "stronger", "power"])) return "strength";
  return profileGoal === "fat_loss" || profileGoal === "muscle_gain" ? profileGoal : "general";
}

function normalizeWorkoutFocusMuscles(text: string) {
  const normalized = text.toLowerCase();
  const focusMap: Array<[string, string[]]> = [
    ["abs", ["abs", "abdominal", "belly", "stomach", "waist", "love handle", "midsection"]],
    ["obliques", ["oblique", "obliques", "side abs"]],
    ["core", ["core", "core stability"]],
    ["quadriceps", ["quadriceps", "quad", "quads", "front thigh", "front thighs"]],
    ["hamstrings", ["hamstring", "hamstrings", "back thigh", "back thighs"]],
    ["glutes", ["glute", "glutes", "butt", "hips"]],
    ["calves", ["calf", "calves"]],
    ["lower back", ["lower back", "erectors", "spinal erectors"]],
    ["chest", ["chest", "pec", "pecs"]],
    ["back", ["back", "lats", "lat", "upper back"]],
    ["front shoulders", ["front shoulder", "front shoulders", "front delt", "front delts", "anterior delt", "anterior delts"]],
    ["mid shoulders", ["mid shoulder", "mid shoulders", "side delt", "side delts", "lateral delt", "lateral delts"]],
    ["rear deltoids", ["rear delt", "rear delts", "rear deltoid", "rear deltoids"]],
    ["shoulders", ["shoulder", "shoulders", "delts", "delt"]],
    ["biceps", ["bicep", "biceps"]],
    ["triceps", ["tricep", "triceps"]],
    ["forearms", ["forearm", "forearms", "grip"]],
    ["arms", ["arm", "arms"]],
    ["legs", ["leg", "legs", "thigh", "thighs", "lower body"]],
    ["full body", ["full body", "whole body", "overall", "all body"]],
  ];
  const found = focusMap
    .map(([focus, aliases]) => {
      const indexes = aliases
        .map((alias) => normalized.indexOf(alias))
        .filter((index) => index >= 0);
      return indexes.length ? { focus, index: Math.min(...indexes) } : null;
    })
    .filter((item): item is { focus: string; index: number } => Boolean(item))
    .sort((a, b) => a.index - b.index)
    .map((item) => item.focus);
  const unique = Array.from(new Set(found));
  if (unique.includes("full body")) return "full body";
  if (unique.some((focus) => ["biceps", "triceps", "forearms"].includes(focus))) {
    const broadArmsIndex = unique.indexOf("arms");
    if (broadArmsIndex >= 0) unique.splice(broadArmsIndex, 1);
  }
  if (unique.some((focus) => ["quadriceps", "hamstrings", "glutes", "calves"].includes(focus))) {
    const broadLegsIndex = unique.indexOf("legs");
    if (broadLegsIndex >= 0) unique.splice(broadLegsIndex, 1);
  }
  return unique.join(",");
}

function isWorkoutFocusAnswer(text: string) {
  return Boolean(normalizeWorkoutFocusMuscles(text)) || includesAny(text, ["full body", "overall", "all body"]);
}

function lastAssistantAskedWorkoutFocus(messages: any[]) {
  const lastAssistant = [...messages].reverse().find((message) => message.role === "assistant");
  return Boolean(lastAssistant?.content && /which (body areas|muscles)|target (muscles|body)|focus (muscles|areas)/i.test(lastAssistant.content));
}

function findRecentWorkoutFocusMuscles(messages: any[]) {
  for (let index = messages.length - 2; index >= 0; index -= 1) {
    const assistant = messages[index];
    const user = messages[index + 1];
    if (assistant?.role !== "assistant" || user?.role !== "user") continue;
    if (!/which (body areas|muscles)|target (muscles|body)|focus (muscles|areas)/i.test(assistant.content ?? "")) continue;
    const focus = normalizeWorkoutFocusMuscles(user.content ?? "");
    if (focus) return focus;
  }
  return "";
}

function lastAssistantAskedWorkoutSafety(messages: any[]) {
  const lastAssistant = [...messages].reverse().find((message) => message.role === "assistant");
  return Boolean(lastAssistant?.content && /joint pain|previous fractures|surgeries|injuries|medical restrictions/i.test(lastAssistant.content));
}

function lastAssistantAskedJointStrengthening(messages: any[]) {
  const lastAssistant = [...messages].reverse().find((message) => message.role === "assistant");
  return Boolean(lastAssistant?.content && /joint strengthening exercises/i.test(lastAssistant.content));
}

function lastAssistantAskedWorkoutTrainingStyle(messages: any[]) {
  const lastAssistant = [...messages].reverse().find((message) => message.role === "assistant");
  return Boolean(lastAssistant?.content && /machine-based training, mat\/bodyweight training, or a mix/i.test(lastAssistant.content));
}

function conversationHasJointStrengtheningChoice(messages: any[]) {
  return messages.some((message) => /joint strengthening exercises/i.test(message.content ?? ""));
}

function conversationWantsJointStrengthening(messages: any[]) {
  for (let index = messages.length - 2; index >= 0; index -= 1) {
    const assistant = messages[index];
    const user = messages[index + 1];
    if (assistant?.role !== "assistant" || user?.role !== "user") continue;
    if (!/joint strengthening exercises/i.test(assistant.content ?? "")) continue;
    return isAffirmativeAnswer(user.content);
  }
  return false;
}

function isAffirmativeAnswer(text: unknown) {
  if (typeof text !== "string") return false;
  return /(^|\b)(yes|yeah|yep|sure|ok|okay|add|include|please|do it|proceed)(\b|$)/i.test(text);
}

async function saveHealthLimitations(userId: string, healthLimitations: string) {
  const value = healthLimitations.trim();
  if (!value) return null;
  return prisma.userProfile.upsert({
    where: { userId },
    update: { healthLimitations: value },
    create: { userId, healthLimitations: value },
  });
}

async function saveWorkoutFocus(userId: string, workoutFocusMuscles: string, workoutFocusGoal?: string) {
  const value = workoutFocusMuscles.trim();
  const goal = workoutFocusGoal?.trim() || null;
  if (!value) return null;
  try {
    return await prisma.userProfile.upsert({
      where: { userId },
      update: { workoutFocusMuscles: value, workoutFocusGoal: goal },
      create: { userId, workoutFocusMuscles: value, workoutFocusGoal: goal },
    });
  } catch (error) {
    console.error("Prisma workout focus upsert failed, falling back to raw SQL", error);
  }
  await prisma.userProfile.upsert({
    where: { userId },
    update: {},
    create: { userId },
  });
  await prisma.$executeRaw`
    UPDATE "UserProfile"
    SET "workoutFocusMuscles" = ${value},
        "workoutFocusGoal" = ${goal},
        "updatedAt" = NOW()
    WHERE "userId" = ${userId}
  `;
  return prisma.userProfile.findUnique({ where: { userId } });
}

function normalizeWorkoutTrainingStyle(text: unknown) {
  if (typeof text !== "string") return null;
  const lower = text.toLowerCase();
  if (/\b(mat|bodyweight|body weight|floor|home workout|without equipment|no equipment)\b/.test(lower)) return "mat_bodyweight";
  if (/\b(mix|mixed|both|combination|hybrid)\b/.test(lower)) return "mixed";
  if (/\b(machine|machines)\b/.test(lower)) return "machines";
  if (/\b(cult|cultfit|cult fit|indian gym|gym)\b/.test(lower)) return "indian_gym";
  return null;
}

async function saveWorkoutTrainingStyle(userId: string, workoutTrainingStyle: string) {
  const style = ["indian_gym", "machines", "mat_bodyweight", "mixed"].includes(workoutTrainingStyle)
    ? workoutTrainingStyle
    : "indian_gym";
  try {
    return await prisma.userProfile.upsert({
      where: { userId },
      update: { workoutTrainingStyle: style },
      create: { userId, workoutTrainingStyle: style },
    });
  } catch (error) {
    console.error("Prisma workout training style upsert failed, falling back to raw SQL", error);
  }
  await prisma.userProfile.upsert({
    where: { userId },
    update: {},
    create: { userId },
  });
  await prisma.$executeRaw`
    UPDATE "UserProfile"
    SET "workoutTrainingStyle" = ${style},
        "updatedAt" = NOW()
    WHERE "userId" = ${userId}
  `;
  return prisma.userProfile.findUnique({ where: { userId } });
}

async function saveGoalTimeline(userId: string, goalOutcome: string, goalTimelineDays: number, goalTargetWeight?: number) {
  const outcome = goalOutcome.trim();
  const days = Math.round(goalTimelineDays);
  const target = goalTargetWeight == null || !Number.isFinite(goalTargetWeight) || goalTargetWeight <= 0 ? null : goalTargetWeight;
  if (!outcome || days <= 0) return null;
  try {
    return await prisma.userProfile.upsert({
      where: { userId },
      update: { goalOutcome: outcome, goalTimelineDays: days, goalTargetWeight: target },
      create: { userId, goalOutcome: outcome, goalTimelineDays: days, goalTargetWeight: target },
    });
  } catch (error) {
    console.error("Prisma goal timeline upsert failed, falling back to raw SQL", error);
  }
  await prisma.userProfile.upsert({
    where: { userId },
    update: {},
    create: { userId },
  });
  await prisma.$executeRaw`
    UPDATE "UserProfile"
    SET "goalOutcome" = ${outcome},
        "goalTimelineDays" = ${days},
        "goalTargetWeight" = ${target},
        "updatedAt" = NOW()
    WHERE "userId" = ${userId}
  `;
  return prisma.userProfile.findUnique({ where: { userId } });
}

function isFoodPlanIntent(text: unknown) {
  if (typeof text !== "string") return false;
  return includesAny(text, ["meal plan", "diet plan", "food plan", "nutrition plan", "what should i eat"]);
}

function hasTimelineAnswer(value?: number | null) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function messageIncludesTimeline(text: unknown) {
  if (typeof text !== "string") return false;
  return /\b\d+\s*(day|days|week|weeks|month|months)\b/i.test(text) || includesAny(text, ["fast progress", "quick progress", "as soon as possible", "asap"]);
}

function isJointSensitive(value?: string | null) {
  if (!value) return false;
  return includesAny(value, ["pain", "joint", "knee", "elbow", "shoulder", "hip", "ankle", "wrist", "fracture", "surgery", "injury"]);
}

function conversationMentionsJointSensitive(messages: any[]) {
  return messages.some((message) => message.role === "user" && isJointSensitive(message.content));
}

async function streamSingleMessage(content: string) {
  const stream = new ReadableStream({
    async start(controller) {
      await writeSse(controller, { content });
      const encoder = new TextEncoder();
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

function inferExerciseEquipment(name: string, provided?: string | null) {
  const lower = name.toLowerCase();
  if (provided?.trim()) return provided.trim().toLowerCase();
  if (/\b(cable|rope|pulldown|pushdown|seated row)\b/.test(lower)) return "cable";
  if (/\b(dumbbell|db)\b/.test(lower)) return "dumbbell";
  if (/\b(barbell|bench press|deadlift)\b/.test(lower)) return "barbell";
  if (/\b(machine|leg press|leg extension|leg curl|treadmill|cycle|cross trainer)\b/.test(lower)) return "machine";
  if (/\b(plank|push-up|pushup|squat|lunge|bridge|dead bug|mountain climber|mat)\b/.test(lower)) return "bodyweight";
  return "bodyweight or common gym equipment";
}

function inferExerciseCategory(name: string, provided?: string | null) {
  const lower = name.toLowerCase();
  if (provided?.trim()) return provided.trim().toLowerCase();
  if (/\b(curl|extension|raise|fly|pushdown|crunch|calf)\b/.test(lower)) return "isolation";
  if (/\b(warm|stretch|mobility|activation|cooldown|isometric)\b/.test(lower)) return "mobility";
  if (/\b(treadmill|cycle|cross trainer|cardio|walk|run)\b/.test(lower)) return "cardio";
  return "compound";
}

function buildExerciseDescription(input: { exerciseName?: string; muscleGroup?: string; equipment?: string | null; description?: string | null }) {
  if (input.description?.trim()) return input.description.trim();
  const name = input.exerciseName?.trim() || "Exercise";
  const muscleGroup = normalizeMuscleGroup(input.muscleGroup);
  const equipment = inferExerciseEquipment(name, input.equipment);
  return `${name} for ${muscleGroup}. Equipment: ${equipment}. Submitted by Dayza Agent for admin review before it appears for everyone.`;
}

function buildExerciseFormTips(input: { exerciseName?: string; formTips?: string | null }) {
  if (input.formTips?.trim()) return input.formTips.trim();
  const name = input.exerciseName?.toLowerCase() ?? "";
  if (/\b(stretch|mobility|isometric)\b/.test(name)) {
    return "Move slowly, keep the range pain-free, and avoid forcing the joint.";
  }
  if (/\b(treadmill|cycle|cross trainer|cardio)\b/.test(name)) {
    return "Start easy, keep breathing controlled, and increase intensity gradually.";
  }
  return "Use controlled tempo, stable posture, and a pain-free range. Stop if form breaks.";
}

async function findOrCreateExercise(input: {
  exerciseId?: string;
  exerciseName?: string;
  muscleGroup?: string;
  equipment?: string;
  category?: string;
  description?: string;
  formTips?: string;
}, userId: string) {
  if (input.exerciseId) {
    const byId = await prisma.exercise.findUnique({ where: { id: input.exerciseId } });
    if (byId) return byId;
  }

  const name = (input.exerciseName ?? input.exerciseId ?? "").trim();
  if (!name) throw new Error("Exercise name is required");

  const existing = await prisma.exercise.findFirst({
    where: {
      name: { equals: name, mode: "insensitive" },
      OR: [{ status: "approved" }, { submittedById: userId }],
    },
  });
  if (existing) return existing;

  const baseId = slugify(name);
  let id = baseId;
  let suffix = 2;
  while (await prisma.exercise.findUnique({ where: { id } })) {
    id = `${baseId}-${suffix}`;
    suffix += 1;
  }

  return prisma.exercise.create({
    data: {
      id,
      name,
      muscleGroup: normalizeMuscleGroup(input.muscleGroup),
      equipment: inferExerciseEquipment(name, input.equipment),
      category: inferExerciseCategory(name, input.category),
      description: buildExerciseDescription({ ...input, exerciseName: name }),
      formTips: buildExerciseFormTips({ ...input, exerciseName: name }),
      status: "pending",
      submittedById: userId,
    },
  });
}

function getJointStrengtheningExercises(healthLimitations?: string | null, templateFocus = "") {
  const limitations = (healthLimitations ?? "").toLowerCase();
  const focus = templateFocus.toLowerCase();
  const isLowerDay = includesAny(focus, ["lower", "leg", "quad", "hamstring", "glute", "calf"]);
  const isUpperDay = includesAny(focus, ["upper", "chest", "shoulder", "back", "bicep", "tricep", "arm", "forearm"]);
  const exercises: Array<{ exerciseName: string; muscleGroup: string; sets: number; reps: string; restSeconds: number }> = [];
  if (isLowerDay && includesAny(limitations, ["knee", "leg", "ankle", "hip"])) {
    exercises.push(
      { exerciseName: "Joint Strength - Terminal Knee Extension", muscleGroup: "legs", sets: 2, reps: "12-15 each side", restSeconds: 45 },
      { exerciseName: "Joint Strength - Wall Sit Hold", muscleGroup: "legs", sets: 2, reps: "20-30 sec", restSeconds: 45 }
    );
  }
  if (isUpperDay && includesAny(limitations, ["elbow", "wrist", "forearm", "arm"])) {
    exercises.push(
      { exerciseName: "Joint Strength - Wrist Curl And Extension", muscleGroup: "arms", sets: 2, reps: "12-15 each side", restSeconds: 45 },
      { exerciseName: "Joint Strength - Forearm Pronation Supination", muscleGroup: "arms", sets: 2, reps: "12-15 each side", restSeconds: 45 }
    );
  }
  if (isUpperDay && includesAny(limitations, ["shoulder"])) {
    exercises.push(
      { exerciseName: "Joint Strength - Band External Rotation", muscleGroup: "shoulders", sets: 2, reps: "12-15 each side", restSeconds: 45 },
      { exerciseName: "Joint Strength - Scapular Wall Slide", muscleGroup: "shoulders", sets: 2, reps: "10-12", restSeconds: 45 }
    );
  }
  if (exercises.length) return exercises.slice(0, 2);
  if (isUpperDay) {
    return [
      { exerciseName: "Joint Strength - Forearm Pronation Supination", muscleGroup: "arms", sets: 2, reps: "12-15 each side", restSeconds: 45 },
    ];
  }
  if (isLowerDay) {
    return [
      { exerciseName: "Joint Strength - Terminal Knee Extension", muscleGroup: "legs", sets: 2, reps: "12-15 each side", restSeconds: 45 },
    ];
  }
  return [
    { exerciseName: "Joint Strength - Controlled Isometric Hold", muscleGroup: "core", sets: 2, reps: "20-30 sec", restSeconds: 45 },
  ];
}

function capWorkoutTemplateExercises(
  action: Extract<AgentAction, { type: "create_workout_template" }>,
  exercises: NonNullable<Extract<AgentAction, { type: "create_workout_template" }>["exercises"]>
) {
  const text = `${action.name} ${action.muscleGroups ?? ""}`.toLowerCase();
  const lowerDay = includesAny(text, ["lower", "legs", "quad", "hamstring", "glute", "calf"]);
  const highVolumeDay = includesAny(text, ["high volume", "hypertrophy", "accessory"]) && includesAny(text, ["forced", "aggressive", "advanced"]);
  const maxMainExercises = highVolumeDay ? 8 : lowerDay ? 6 : 7;
  return exercises.slice(0, maxMainExercises);
}

function isUpperBodyPriorityFocus(value?: string | null) {
  const parts = String(value ?? "")
    .toLowerCase()
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (!parts.length) return false;
  const firstLowerIndex = parts.findIndex((part) => ["legs", "glutes", "quadriceps", "hamstrings", "calves"].includes(part));
  const firstUpperIndex = parts.findIndex((part) => ["chest", "shoulders", "back", "biceps", "triceps", "forearms", "arms"].includes(part));
  return firstUpperIndex >= 0 && (firstLowerIndex === -1 || firstUpperIndex < firstLowerIndex);
}

function isLowerBodyTemplate(action: Extract<AgentAction, { type: "create_workout_template" }>) {
  const text = `${action.name} ${action.muscleGroups ?? ""}`.toLowerCase();
  return includesAny(text, ["lower", "legs", "leg", "quad", "hamstring", "glute", "calf", "calves"]);
}

function isRecoveryOrMobilityTemplate(action: Extract<AgentAction, { type: "create_workout_template" }>) {
  const text = [
    action.name,
    action.muscleGroups,
    action.difficulty,
    ...(action.warmups ?? []).map((item) => `${item.name} ${item.notes ?? ""}`),
    ...(action.stretches ?? []).map((item) => `${item.name} ${item.notes ?? ""}`),
    ...(action.exercises ?? []).map((item) => `${item.exerciseName} ${item.muscleGroup}`),
  ].join(" ").toLowerCase();

  return includesAny(text, [
    "joint strength",
    "joint-strength",
    "joint strengthening",
    "mobility",
    "recovery",
    "rehab",
    "prehab",
    "pain-free",
    "isometric",
  ]);
}

function inferSpendPaymentSource(text: string, action: Extract<AgentAction, { type: "create_spend_log" }>) {
  const sourceText = `${text}\n${action.notes ?? ""}`.replace(/\s+/g, " ");
  const bankMatch = sourceText.match(/\b(HDFC|ICICI|SBI|Axis|Kotak|Yes Bank|IDFC|IndusInd|Federal|Canara|Punjab National|Bank of Baroda)\b(?:\s+Bank)?/i);
  const debitMatch = sourceText.match(/debit\s+card(?:\s+(?:ending|xx|x+|no\.?))?\s*(\d{4})/i);
  const creditMatch = sourceText.match(/credit\s+card(?:\s+(?:ending|xx|x+|no\.?))?\s*(\d{4})/i);
  const cardEndingMatch = sourceText.match(/\bcard\s+(?:ending|xx|x+|no\.?)\s*(\d{4})/i);
  const accountMatch = sourceText.match(/account\s+(?:ending|xx|x+|no\.?)\s*(\d{4})/i);
  const bankName = action.bankName || (bankMatch ? `${bankMatch[1].toUpperCase()} Bank` : undefined);

  return {
    bankName,
    accountLast4: action.accountLast4 || accountMatch?.[1] || (debitMatch ? debitMatch[1] : undefined),
    cardLast4: action.cardLast4 || creditMatch?.[1] || (!debitMatch ? cardEndingMatch?.[1] : undefined),
    paymentSource:
      action.paymentSource ||
      (creditMatch ? "credit_card" : debitMatch ? "debit_card" : accountMatch ? "bank_account" : undefined),
  };
}

async function getCreditCardSpendBlocker(userId: string, action: Extract<AgentAction, { type: "create_spend_log" }>, rawMessage = "") {
  const inferred = inferSpendPaymentSource(rawMessage, action);
  const isCreditCardSpend = inferred.paymentSource === "credit_card" || Boolean(action.creditCardName || inferred.cardLast4);
  if (!isCreditCardSpend) return null;

  if (inferred.cardLast4) {
    const exactCard = await prisma.creditCard.findFirst({
      where: { userId, active: true, last4: inferred.cardLast4 },
      select: { id: true },
    });
    if (!exactCard) {
      return `I see a credit card ending ${inferred.cardLast4}, but I do not have that card saved yet. Please tell me which card name to save with last 4 digits ${inferred.cardLast4}, then I will log this transaction.`;
    }
    return null;
  }

  if (action.creditCardName) {
    const matches = await prisma.creditCard.findMany({
      where: {
        userId,
        active: true,
        name: { contains: action.creditCardName, mode: "insensitive" },
      },
      select: { id: true, name: true, last4: true },
      take: 3,
    });
    if (matches.length === 1 && matches[0].last4) return null;
  }

  return "Before I log this credit card spend, please tell me the last 4 digits of the card. I will not save this transaction until you confirm the card ending digits.";
}

function isDestructiveAgentAction(action: AgentAction) {
  return ["delete_workout_template", "delete_diet_plan", "remove_exercise_from_template"].includes(action.type);
}

function hasExplicitDestructiveConfirmation(message: string) {
  return /\b(confirm|confirmed|yes|go ahead|proceed|do it|delete it|remove it)\b/i.test(message);
}

function destructiveActionLabel(action: AgentAction) {
  if (action.type === "delete_workout_template") return `delete workout plan "${action.templateName}"`;
  if (action.type === "delete_diet_plan") return `delete diet plan "${action.planName}"`;
  if (action.type === "remove_exercise_from_template") return `remove "${action.exerciseName}" from "${action.templateName}"`;
  return "make this change";
}

function getDestructiveConfirmationMessage(actions: AgentAction[], message: string) {
  if (hasExplicitDestructiveConfirmation(message)) return null;
  const destructiveActions = actions.filter(isDestructiveAgentAction);
  if (destructiveActions.length === 0) return null;
  const labels = destructiveActions.map(destructiveActionLabel);
  return [
    "Please confirm before I make this change:",
    ...labels.map((label) => `- ${label}`),
    "",
    "Reply with \"confirm\" and I will do it.",
  ].join("\n");
}

function hasExplicitActionConfirmation(message: string) {
  return /\b(confirm|confirmed|yes|yep|ok|okay|go ahead|proceed|save it|do it|looks good|create it|add it|log it)\b/i.test(message);
}

function isActionPreviewCancel(message: string) {
  return /\b(cancel|stop|discard|do not save|don't save|ignore it|never mind|nevermind)\b/i.test(message);
}

const ACTIONS_REQUIRING_PREVIEW = new Set<string>([
  "create_exercise",
  "create_food_log",
  "create_progress_entry",
  "create_spend_log",
  "create_credit_card",
  "create_bank_account",
  "create_money_link",
  "create_reminder",
  "complete_reminder",
  "create_workout_log",
  "create_workout_template",
  "remove_exercise_from_template",
  "add_exercise_to_template",
  "delete_workout_template",
  "create_diet_plan",
  "update_diet_plan",
  "delete_diet_plan",
  "update_nutrition_targets",
  "update_spend_target",
  "update_finance_profile",
  "update_wellness_targets",
]);

function actionsNeedPreview(actions: AgentAction[], message: string) {
  if (!actions.some((action) => ACTIONS_REQUIRING_PREVIEW.has(action.type))) return false;
  return !hasExplicitActionConfirmation(message);
}

function previewLabelForAction(action: AgentAction) {
  if (action.type === "create_food_log") return `Log food: ${action.foodName} (${action.mealType}, ${Math.round(toNumber(action.calories))} kcal)`;
  if (action.type === "create_spend_log") return `Log spend: ${action.merchant} - ${action.currency || "INR"} ${toNumber(action.amount)}`;
  if (action.type === "create_reminder") return `Create reminder: ${action.title}${action.dueDate ? ` (${new Date(action.dueDate).toLocaleString("en-IN")})` : ""}`;
  if (action.type === "complete_reminder") return `Complete reminder: ${action.title || action.reminderId}`;
  if (action.type === "create_workout_template") return `Create workout day: ${action.name}${action.exercises?.length ? ` (${action.exercises.length} exercises)` : ""}`;
  if (action.type === "create_workout_log") return `Log workout: ${action.templateName || "workout"}${action.duration ? ` (${action.duration} min)` : ""}`;
  if (action.type === "create_exercise") return `Submit exercise for approval: ${action.name} (${action.muscleGroup})`;
  if (action.type === "add_exercise_to_template") return `Add exercise: ${action.exerciseName} to ${action.templateName}`;
  if (action.type === "remove_exercise_from_template") return `Remove exercise: ${action.exerciseName} from ${action.templateName}`;
  if (action.type === "delete_workout_template") return `Delete workout day: ${action.templateName}`;
  if (action.type === "create_diet_plan") return `Create diet plan: ${action.name}`;
  if (action.type === "update_diet_plan") return `Update diet plan: ${action.planName}`;
  if (action.type === "delete_diet_plan") return `Delete diet plan: ${action.planName}`;
  if (action.type === "create_credit_card") return `Add credit card: ${action.name}`;
  if (action.type === "create_bank_account") return `Add bank account: ${action.name}`;
  if (action.type === "create_money_link") return `${action.linkType === "lend" ? "Track lent money" : "Track borrowed money"}: ${action.person} - ${action.currency || "INR"} ${toNumber(action.amount)}`;
  if (action.type === "update_nutrition_targets") return "Update nutrition targets";
  if (action.type === "update_spend_target") return `Update monthly spend target: INR ${toNumber(action.targetMonthlySpend)}`;
  if (action.type === "update_finance_profile") return "Update finance profile";
  if (action.type === "update_wellness_targets") return "Update wellness targets";
  if (action.type === "create_progress_entry") return "Save progress entry";
  if (action.type === "update_profile_safety") return "Update safety/allergy memory";
  if (action.type === "update_workout_focus") return `Save workout focus: ${action.workoutFocusMuscles}${action.workoutFocusGoal ? ` (${action.workoutFocusGoal})` : ""}`;
  if (action.type === "update_workout_training_style") return `Save workout style: ${action.workoutTrainingStyle.replace(/_/g, " ")}`;
  if (action.type === "update_goal_timeline") return `Save goal timeline: ${action.goalOutcome} in ${action.goalTimelineDays} days`;
  return `Save action: ${String((action as any).type ?? "change").replace(/_/g, " ")}`;
}

function formatAgentActionPreview(response: string, actions: AgentAction[]) {
  return [
    response,
    "",
    "Review before I save:",
    ...actions.map((action, index) => `${index + 1}. ${previewLabelForAction(action)}`),
    "",
    "Reply with \"confirm\" to save these changes, or tell me what to change.",
  ].filter(Boolean).join("\n");
}

async function withUndo(
  userId: string,
  result: AgentActionResult,
  undo: { targetType: string; targetId?: string | null; payload?: any; label?: string }
): Promise<AgentActionResult> {
  if (!undo.targetId) return result;
  const record = await createAgentUndoAction(userId, {
    actionType: result.type,
    label: undo.label ?? `Undo ${result.label}`,
    targetType: undo.targetType,
    targetId: undo.targetId,
    payload: undo.payload,
  });
  return {
    ...result,
    undo: {
      id: record.id,
      label: compactUndoButtonLabel(result.label),
    },
  };
}

async function executeAgentAction(
  userId: string,
  action: AgentAction,
  rawMessage = "",
  options: { healthLimitations?: string | null; userWantsJointStrengthening?: boolean; workoutFocusMuscles?: string | null; micronutrientTrackingEnabled?: boolean; profile?: any } = {}
): Promise<AgentActionResult | null> {
  if (action.type === "create_exercise") {
    const exercise = await findOrCreateExercise({
      exerciseName: action.name,
      muscleGroup: action.muscleGroup,
      equipment: action.equipment,
      category: action.category,
      description: action.description,
      formTips: action.formTips,
    }, userId);
    const result = {
      type: action.type,
      label: exercise.status === "pending" ? `Sent ${exercise.name} to admin for approval` : `Added ${exercise.name} to Exercise Library`,
      id: exercise.id,
    };
    if (exercise.status === "pending") {
      return withUndo(userId, result, { targetType: "exercise", targetId: exercise.id });
    }
    return result;
  }

  if (action.type === "create_food_log") {
    const log = await prisma.foodLog.create({
      data: {
        userId,
        foodName: action.foodName,
        mealType: action.mealType,
        servingSize: action.servingSize,
        calories: toNumber(action.calories),
        protein: toNumber(action.protein),
        carbs: toNumber(action.carbs),
        fat: toNumber(action.fat),
        fiber: toNumber(action.fiber),
        date: action.date ? new Date(action.date) : new Date(),
      },
    });
    let micronutrients = parseMicronutrientMap(action.micronutrients);
    if (options.micronutrientTrackingEnabled && Object.keys(micronutrients).length === 0) {
      micronutrients = estimateMicronutrientsForFood(action.foodName, action.servingSize);
    }
    if (options.micronutrientTrackingEnabled && Object.keys(micronutrients).length > 0) {
      await upsertFoodMicronutrientLog(userId, log.id, {
        foodName: log.foodName,
        mealType: log.mealType,
        servingSize: log.servingSize,
        date: log.date,
        micronutrients,
        source: action.micronutrients ? "agent_estimate" : "local_estimate",
      });
    }
    return withUndo(userId, { type: action.type, label: `Logged ${log.foodName}`, id: log.id }, { targetType: "foodLog", targetId: log.id });
  }

  if (action.type === "update_nutrition_targets") {
    const currentProfile = await prisma.userProfile.findUnique({ where: { userId } });
    const mergedMicros = "micronutrientTargets" in action
      ? JSON.stringify(parseMicronutrientMap(mergeWithDefaultMicronutrientTargets(action.micronutrientTargets, currentProfile ?? options.profile)))
      : currentProfile?.micronutrientTargetsJson ?? undefined;
    const profile = await prisma.userProfile.upsert({
      where: { userId },
      update: {
        targetCalories: action.targetCalories == null ? currentProfile?.targetCalories : toNumber(action.targetCalories),
        targetProtein: action.targetProtein == null ? currentProfile?.targetProtein : toNumber(action.targetProtein),
        targetCarbs: action.targetCarbs == null ? currentProfile?.targetCarbs : toNumber(action.targetCarbs),
        targetFat: action.targetFat == null ? currentProfile?.targetFat : toNumber(action.targetFat),
        targetFiber: action.targetFiber == null ? currentProfile?.targetFiber : toNumber(action.targetFiber),
        targetWaterMl: action.targetWaterMl == null ? currentProfile?.targetWaterMl : toNumber(action.targetWaterMl),
        micronutrientTargetsJson: mergedMicros,
      },
      create: {
        userId,
        targetCalories: action.targetCalories == null ? null : toNumber(action.targetCalories),
        targetProtein: action.targetProtein == null ? null : toNumber(action.targetProtein),
        targetCarbs: action.targetCarbs == null ? null : toNumber(action.targetCarbs),
        targetFat: action.targetFat == null ? null : toNumber(action.targetFat),
        targetFiber: action.targetFiber == null ? null : toNumber(action.targetFiber),
        targetWaterMl: action.targetWaterMl == null ? null : toNumber(action.targetWaterMl),
        micronutrientTargetsJson: mergedMicros,
      },
    });
    return { type: action.type, label: "Updated nutrition targets", id: profile.id };
  }

  if (action.type === "create_progress_entry") {
    const entry = await prisma.progressEntry.create({
      data: {
        userId,
        weight: action.weight ?? null,
        chest: action.chest ?? null,
        arms: action.arms ?? null,
        waist: action.waist ?? null,
        hips: action.hips ?? null,
        thighs: action.thighs ?? null,
        notes: action.notes,
        date: action.date ? new Date(action.date) : new Date(),
      },
    });
    return withUndo(userId, { type: action.type, label: "Saved progress entry", id: entry.id }, { targetType: "progressEntry", targetId: entry.id });
  }

  if (action.type === "create_spend_log") {
    const inferred = inferSpendPaymentSource(rawMessage, action);
    const paymentSource = inferred.paymentSource;
    const bankName = inferred.bankName;
    const accountLast4 = inferred.accountLast4;
    const cardLast4 = inferred.cardLast4;
    let card = cardLast4
      ? await prisma.creditCard.findFirst({
          where: {
            userId,
            active: true,
            last4: cardLast4,
          },
        })
      : null;
    if (!card && action.creditCardName && !cardLast4) {
      const matches = await prisma.creditCard.findMany({
          where: {
            userId,
            active: true,
            name: { contains: action.creditCardName, mode: "insensitive" },
          },
          take: 2,
        });
      card = matches.length === 1 && matches[0].last4 ? matches[0] : null;
    }
    let bankAccount = !card && (paymentSource === "bank_account" || paymentSource === "debit_card" || accountLast4 || bankName || action.accountName)
      ? await prisma.bankAccount.findFirst({
          where: {
            userId,
            active: true,
            OR: [
              action.accountName ? { name: { contains: action.accountName, mode: "insensitive" } } : undefined,
              bankName ? { bankName: { contains: bankName, mode: "insensitive" } } : undefined,
              accountLast4 ? { last4: accountLast4 } : undefined,
            ].filter(Boolean) as any,
          },
        })
      : null;
    if (!card && !bankAccount && (paymentSource === "bank_account" || paymentSource === "debit_card" || accountLast4) && (bankName || action.accountName || accountLast4)) {
      const sourceKind = paymentSource === "debit_card" ? "Debit Card" : "Account";
      const label = action.accountName || `${bankName || "Bank"} ${sourceKind}${accountLast4 ? ` ending ${accountLast4}` : ""}`;
      bankAccount = await prisma.bankAccount.create({
        data: {
          userId,
          name: label,
          bankName: bankName || null,
          accountType: paymentSource === "debit_card" ? "debit_card" : "savings",
          last4: accountLast4 || null,
          balance: 0,
          currency: action.currency || "INR",
        },
      });
    }
    const amount = toNumber(action.amount);
    const spend = await prisma.$transaction(async (tx) => {
      const created = await tx.spend.create({
        data: {
          userId,
          merchant: action.merchant,
          amount,
          currency: action.currency || "INR",
          category: action.category || null,
          date: action.date ? new Date(action.date) : new Date(),
          notes: action.notes || "Logged by Dayza Agent.",
          source: "manual",
          bankAccountId: bankAccount?.id ?? null,
          creditCardId: card?.id ?? null,
          balanceApplied: Boolean(bankAccount?.id || card?.id),
        },
      });
      if (bankAccount?.id) {
        await tx.bankAccount.update({
          where: { id: bankAccount.id },
          data: { balance: { decrement: amount } },
        });
      }
      if (card?.id) {
        await tx.creditCard.update({
          where: { id: card.id },
          data: { currentDue: { increment: amount } },
        });
      }
      return created;
    });
    const sourceLabel = card ? ` on ${card.name}` : bankAccount ? ` from ${bankAccount.name}` : "";
    return withUndo(
      userId,
      { type: action.type, label: `Logged spend at ${spend.merchant}${sourceLabel}`, id: spend.id },
      { targetType: "spend", targetId: spend.id }
    );
  }

  if (action.type === "update_spend_target") {
    const targetMonthlySpend = toNumber(action.targetMonthlySpend);
    if (targetMonthlySpend <= 0) return null;
    await prisma.userProfile.upsert({
      where: { userId },
      update: { targetMonthlySpend },
      create: { userId, targetMonthlySpend },
    });
    return { type: action.type, label: `Updated monthly spend target to INR ${targetMonthlySpend}`, id: userId };
  }

  if (action.type === "update_finance_profile") {
    const existing = await prisma.financeProfile.findUnique({ where: { userId } });
    const financeProfile = await prisma.financeProfile.upsert({
      where: { userId },
      update: {
        currentBalance: action.currentBalance == null ? existing?.currentBalance ?? 0 : toNumber(action.currentBalance),
        totalAmount: action.totalAmount == null ? existing?.totalAmount ?? 0 : toNumber(action.totalAmount),
        currency: "INR",
      },
      create: {
        userId,
        currentBalance: toNumber(action.currentBalance),
        totalAmount: toNumber(action.totalAmount),
        currency: "INR",
      },
    });
    return { type: action.type, label: `Updated money balances to INR ${financeProfile.currentBalance}`, id: financeProfile.id };
  }

  if (action.type === "create_credit_card") {
    const card = await prisma.creditCard.create({
      data: {
        userId,
        name: action.name,
        bankName: action.bankName || null,
        last4: action.last4 || null,
        creditLimit: null,
        currentDue: toNumber(action.currentDue),
        dueDay: action.dueDay == null ? null : Math.min(31, Math.max(1, Math.round(toNumber(action.dueDay)))),
      },
    });
    return withUndo(userId, { type: action.type, label: `Added credit card ${card.name}`, id: card.id }, { targetType: "creditCard", targetId: card.id });
  }

  if (action.type === "create_bank_account") {
    const account = await prisma.bankAccount.create({
      data: {
        userId,
        name: action.name,
        bankName: action.bankName || null,
        accountType: action.accountType || "savings",
        last4: action.last4 || null,
        balance: toNumber(action.balance),
        currency: action.currency || "INR",
      },
    });
    return withUndo(userId, { type: action.type, label: `Added bank account ${account.name}`, id: account.id }, { targetType: "bankAccount", targetId: account.id });
  }

  if (action.type === "create_money_link") {
    const moneyLink = await prisma.moneyLink.create({
      data: {
        userId,
        person: action.person,
        type: action.linkType === "borrow" ? "borrow" : "lend",
        amount: toNumber(action.amount),
        currency: action.currency || "INR",
        date: action.date ? new Date(action.date) : new Date(),
        notes: action.notes || "Logged by Dayza Agent.",
      },
    });
    return withUndo(
      userId,
      { type: action.type, label: `${moneyLink.type === "lend" ? "Lent" : "Borrowed"} INR ${moneyLink.amount} ${moneyLink.type === "lend" ? "to" : "from"} ${moneyLink.person}`, id: moneyLink.id },
      { targetType: "moneyLink", targetId: moneyLink.id }
    );
  }

  if (action.type === "create_reminder") {
    const listId = await resolveReminderListId(userId, action.listId, action.listName);
    const reminder = await prisma.reminder.create({
      data: {
        userId,
        listId,
        title: action.title.trim(),
        notes: action.notes?.trim() || null,
        dueDate: parseOptionalDate(action.dueDate),
        recurrence: action.recurrence || "none",
        recurrenceCustom: action.recurrence === "custom" ? action.recurrenceCustom?.trim() || null : null,
        priority: action.priority || "none",
        flagged: Boolean(action.flagged),
        contextTag: normalizeReminderContextTag(action.contextTag),
        sourceLabel: action.sourceLabel?.trim() || null,
      },
    });
    return withUndo(
      userId,
      { type: action.type, label: `Added reminder: ${reminder.title}`, id: reminder.id },
      { targetType: "reminder", targetId: reminder.id }
    );
  }

  if (action.type === "complete_reminder") {
    const reminder = await findReminderForCompletion(userId, action);
    if (!reminder) {
      return {
        type: action.type,
        label: `Could not find a matching reminder${action.title ? ` for "${action.title}"` : ""}`,
        id: "missing-reminder",
      };
    }
    if (reminder.completed) {
      return { type: action.type, label: `${reminder.title} was already completed`, id: reminder.id };
    }
    const completedReminder = await prisma.reminder.update({
      where: { id: reminder.id },
      data: { completed: true, completedAt: new Date() },
      select: { id: true, title: true, completed: true, completedAt: true },
    });
    return withUndo(
      userId,
      { type: action.type, label: `Marked reminder complete: ${completedReminder.title}`, id: completedReminder.id },
      {
        targetType: "reminderCompletion",
        targetId: completedReminder.id,
        payload: {
          previousCompleted: reminder.completed,
          previousCompletedAt: reminder.completedAt ? reminder.completedAt.toISOString() : null,
        },
      }
    );
  }

  if (action.type === "create_workout_log") {
    const exerciseRows = [];
    for (const exercise of action.exercises ?? []) {
      const resolved = await findOrCreateExercise(exercise, userId);
      exerciseRows.push({
        exerciseId: resolved.id,
        setNumber: exercise.setNumber,
        reps: exercise.reps,
        weight: exercise.weight,
      });
    }
    const log = await prisma.workoutLog.create({
      data: {
        userId,
        templateName: action.templateName,
        duration: action.duration ? Math.round(action.duration) : null,
        notes: action.notes,
        exerciseLogs: {
          create: exerciseRows,
        },
      },
    });
    return withUndo(userId, { type: action.type, label: "Logged workout", id: log.id }, { targetType: "workoutLog", targetId: log.id });
  }

  if (action.type === "update_wellness_targets") {
    const data = {
      targetSteps: action.targetSteps == null ? undefined : Math.round(toNumber(action.targetSteps)),
      targetActiveEnergy: action.targetActiveEnergy == null ? undefined : Math.round(toNumber(action.targetActiveEnergy)),
      targetExerciseMinutes: action.targetExerciseMinutes == null ? undefined : Math.round(toNumber(action.targetExerciseMinutes)),
      targetWorkoutSessions: action.targetWorkoutSessions == null ? undefined : Math.round(toNumber(action.targetWorkoutSessions)),
      targetTrainingMinutes: action.targetTrainingMinutes == null ? undefined : Math.round(toNumber(action.targetTrainingMinutes)),
      targetLiftVolume: action.targetLiftVolume == null ? undefined : Math.round(toNumber(action.targetLiftVolume)),
      targetWeeklyActiveEnergy: action.targetWeeklyActiveEnergy == null ? undefined : Math.round(toNumber(action.targetWeeklyActiveEnergy)),
    };
    const cleanData = Object.fromEntries(
      Object.entries(data).filter(([, value]) => typeof value === "number" && Number.isFinite(value) && value > 0)
    );
    if (Object.keys(cleanData).length === 0) return null;

    await prisma.userProfile.upsert({
      where: { userId },
      update: cleanData,
      create: { userId, ...cleanData },
    });
    return { type: action.type, label: "Updated personalized health and fitness targets", id: userId };
  }

  if (action.type === "update_profile_safety") {
    const data = {
      healthLimitations: action.healthLimitations?.trim() || undefined,
      foodAllergies: action.foodAllergies?.trim() || undefined,
    };
    const cleanData = Object.fromEntries(Object.entries(data).filter(([, value]) => value));
    if (Object.keys(cleanData).length === 0) return null;
    await prisma.userProfile.upsert({
      where: { userId },
      update: cleanData,
      create: { userId, ...cleanData },
    });
    return { type: action.type, label: "Saved safety and food preferences", id: userId };
  }

  if (action.type === "update_workout_focus") {
    const workoutFocusMuscles = action.workoutFocusMuscles?.trim();
    if (!workoutFocusMuscles) return null;
    const workoutFocusGoal = action.workoutFocusGoal?.trim() || undefined;
    await saveWorkoutFocus(userId, workoutFocusMuscles, workoutFocusGoal);
    return { type: action.type, label: `Saved workout focus: ${workoutFocusMuscles}`, id: userId };
  }

  if (action.type === "update_workout_training_style") {
    await saveWorkoutTrainingStyle(userId, action.workoutTrainingStyle);
    const labels: Record<string, string> = {
      indian_gym: "Indian/Cult-style gym",
      machines: "machine-based training",
      mat_bodyweight: "mat/bodyweight training",
      mixed: "mixed training",
    };
    return { type: action.type, label: `Saved workout style: ${labels[action.workoutTrainingStyle] ?? "Indian/Cult-style gym"}`, id: userId };
  }

  if (action.type === "update_goal_timeline") {
    const goalTimelineDays = Math.round(toNumber(action.goalTimelineDays));
    const goalOutcome = action.goalOutcome?.trim();
    if (!goalOutcome || goalTimelineDays <= 0) return null;
    const data = {
      goalOutcome,
      goalTimelineDays,
      goalTargetWeight: action.goalTargetWeight == null ? undefined : toNumber(action.goalTargetWeight),
    };
    await saveGoalTimeline(userId, data.goalOutcome, data.goalTimelineDays, data.goalTargetWeight);
    return { type: action.type, label: `Saved ${goalOutcome} timeline for ${goalTimelineDays} days`, id: userId };
  }

  if (action.type === "create_workout_template") {
    if (isUpperBodyPriorityFocus(options.workoutFocusMuscles) && isLowerBodyTemplate(action) && !isRecoveryOrMobilityTemplate(action)) {
      const existingLowerTemplates = await prisma.workoutTemplate.count({
        where: {
          userId,
          OR: [
            { name: { contains: "lower", mode: "insensitive" } },
            { name: { contains: "leg", mode: "insensitive" } },
            { muscleGroups: { contains: "legs", mode: "insensitive" } },
          ],
        },
      });
      if (existingLowerTemplates >= 1) {
        return {
          type: action.type,
          label: `Skipped ${action.name}: upper-body priority plans should only have one lower-body day unless legs are the priority`,
          id: action.name,
        };
      }
    }

    const qualityRoutines = ensureWorkoutQualityRoutines(action, options.healthLimitations);
    const plannedExercises = capWorkoutTemplateExercises(action, action.exercises ?? []);
    if (plannedExercises.length === 0 && isRecoveryOrMobilityTemplate(action)) {
      plannedExercises.push(...getJointStrengtheningExercises(options.healthLimitations, `${action.name} ${action.muscleGroups ?? ""}`));
    }
    if (options.userWantsJointStrengthening) {
      const existingNames = new Set(plannedExercises.map((item) => String(item.exerciseName ?? "").toLowerCase()));
      const templateFocus = `${action.name} ${action.muscleGroups ?? ""}`;
      for (const jointExercise of getJointStrengtheningExercises(options.healthLimitations, templateFocus)) {
        if (!existingNames.has(jointExercise.exerciseName.toLowerCase())) {
          plannedExercises.push(jointExercise);
        }
      }
    }

    const exerciseRows = [];
    for (const [index, item] of plannedExercises.entries()) {
      const exercise = await findOrCreateExercise(item, userId);
      exerciseRows.push({
        exerciseId: exercise.id,
        sets: Math.round(toNumber(item.sets, 3)),
        reps: item.reps || "8-12",
        restSeconds: Math.round(toNumber(item.restSeconds, 90)),
        orderIndex: index,
      });
    }

    const baseId = slugify(action.name);
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
        name: action.name,
        description: action.muscleGroups ? `Focus: ${action.muscleGroups}` : null,
        dayOfWeek: action.dayOfWeek || null,
        muscleGroups: action.muscleGroups || null,
        difficulty: action.difficulty || "intermediate",
        warmupJson: routineJson(qualityRoutines.warmups),
        stretchesJson: routineJson(qualityRoutines.stretches),
        exercises: { create: exerciseRows },
      },
    });
    return withUndo(userId, { type: action.type, label: `Created ${template.name}`, id: template.id }, { targetType: "workoutTemplate", targetId: template.id });
  }

  if (action.type === "remove_exercise_from_template") {
    const template = await prisma.workoutTemplate.findFirst({
      where: { userId, name: { contains: action.templateName } },
      include: { exercises: { include: { exercise: true } } },
    });
    if (!template) return { type: action.type, label: `Could not find ${action.templateName}`, id: action.templateName };
    const matches = template.exercises.filter((item: WorkoutExerciseWithExercise) =>
      item.exercise.name.toLowerCase().includes(action.exerciseName.toLowerCase())
    );
    const removedExercises = matches.map((match: WorkoutExerciseWithExercise & { exerciseId?: string; sets?: number; reps?: string; restSeconds?: number; orderIndex?: number }) => ({
      workoutTemplateId: template.id,
      exerciseId: match.exerciseId,
      sets: match.sets,
      reps: match.reps,
      restSeconds: match.restSeconds,
      orderIndex: match.orderIndex,
    }));
    for (const match of matches) {
      await prisma.workoutExercise.delete({ where: { id: match.id } });
    }
    const result = { type: action.type, label: `Removed ${action.exerciseName} from ${template.name}`, id: template.id };
    return removedExercises.length > 0
      ? withUndo(userId, result, { targetType: "workoutExerciseRemoval", targetId: template.id, payload: { exercises: removedExercises } })
      : result;
  }

  if (action.type === "add_exercise_to_template") {
    const template = await prisma.workoutTemplate.findFirst({
      where: { userId, name: { contains: action.templateName } },
      include: { exercises: true },
    });
    if (!template) return { type: action.type, label: `Could not find ${action.templateName}`, id: action.templateName };
    const exercise = await findOrCreateExercise({ exerciseName: action.exerciseName, muscleGroup: action.muscleGroup }, userId);
    const workoutExercise = await prisma.workoutExercise.create({
      data: {
        workoutTemplateId: template.id,
        exerciseId: exercise.id,
        sets: Math.round(toNumber(action.sets, 3)),
        reps: action.reps || "8-12",
        restSeconds: Math.round(toNumber(action.restSeconds, 90)),
        orderIndex: template.exercises.length,
      },
    });
    return withUndo(
      userId,
      { type: action.type, label: `Added ${exercise.name} to ${template.name}`, id: template.id },
      { targetType: "workoutExercise", targetId: workoutExercise.id }
    );
  }

  if (action.type === "delete_workout_template") {
    const template = await prisma.workoutTemplate.findFirst({
      where: { userId, name: { contains: action.templateName } },
    });
    if (!template) return { type: action.type, label: `Could not find ${action.templateName}`, id: action.templateName };
    const templateWithExercises = await prisma.workoutTemplate.findUnique({
      where: { id: template.id },
      include: { exercises: true },
    });
    await prisma.workoutTemplate.delete({ where: { id: template.id } });
    return withUndo(
      userId,
      { type: action.type, label: `Deleted ${template.name}`, id: template.id },
      { targetType: "deletedWorkoutTemplate", targetId: template.id, payload: templateWithExercises }
    );
  }

  if (action.type === "create_diet_plan") {
    const plan = await prisma.dietPlan.create({
      data: {
        userId,
        name: action.name,
        goal: action.goal || null,
        notes: action.notes || null,
        mealsJson: JSON.stringify(action.meals ?? []),
      },
    });
    return withUndo(userId, { type: action.type, label: `Created diet plan ${plan.name}`, id: plan.id }, { targetType: "dietPlan", targetId: plan.id });
  }

  if (action.type === "update_diet_plan") {
    const plan = await prisma.dietPlan.findFirst({
      where: { userId, name: { contains: action.planName } },
    });
    if (!plan) return { type: action.type, label: `Could not find diet plan ${action.planName}`, id: action.planName };
    const updated = await prisma.dietPlan.update({
      where: { id: plan.id },
      data: {
        name: action.name ?? plan.name,
        goal: action.goal ?? plan.goal,
        notes: action.notes ?? plan.notes,
        mealsJson: action.meals ? JSON.stringify(action.meals) : plan.mealsJson,
      },
    });
    return { type: action.type, label: `Updated diet plan ${updated.name}`, id: updated.id };
  }

  if (action.type === "delete_diet_plan") {
    const plan = await prisma.dietPlan.findFirst({
      where: { userId, name: { contains: action.planName } },
    });
    if (!plan) return { type: action.type, label: `Could not find diet plan ${action.planName}`, id: action.planName };
    await prisma.dietPlan.delete({ where: { id: plan.id } });
    return { type: action.type, label: `Deleted diet plan ${plan.name}`, id: plan.id };
  }

  return null;
}

async function writeSse(controller: ReadableStreamDefaultController, data: unknown) {
  const encoder = new TextEncoder();
  controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
}

function streamAgentActionExecution({
  userId,
  sessionId,
  initialContent,
  actions,
  rawMessage,
  options,
  onSuccess,
}: {
  userId: string;
  sessionId: string;
  initialContent: string;
  actions: AgentAction[];
  rawMessage: string;
  options: Parameters<typeof executeAgentAction>[3];
  onSuccess?: () => Promise<void>;
}) {
  const stream = new ReadableStream({
    async start(controller) {
      await writeSse(controller, { content: initialContent });
      let fullContent = initialContent;
      let undoActions: Array<{ id: string; label: string; actionLabel: string }> = [];
      try {
        const actionResults: AgentActionResult[] = [];
        const totalActions = actions.length;
        for (const [actionIndex, action] of actions.entries()) {
          await writeSse(controller, { status: actionProgressLabel(action, actionIndex + 1, totalActions) });
          const result = await executeAgentAction(userId, action, rawMessage, options);
          if (result) actionResults.push(result);
        }
        if (actions.length > 0) {
          await writeSse(controller, { status: "Verifying saved changes..." });
        }
        const inferredFriendLinks = await createMissingFriendMoneyLinks(userId, rawMessage, actions);
        actionResults.push(...inferredFriendLinks);

        const checkedInitialContent = await validateWorkoutTemplateActionResults(userId, initialContent, actions, actionResults);
        const correctedInitialContent = correctWorkoutPlanSaveMessage(checkedInitialContent, actionResults);
        const actionSummary = formatActionResultsSummary(actionResults);
        fullContent = `${correctedInitialContent}${actionSummary}`;
        undoActions = actionResults
          .filter((result): result is AgentActionResult & { undo: AgentUndoButton } => Boolean(result.undo?.id))
          .map((result) => ({
            id: result.undo.id,
            label: result.undo.label,
            actionLabel: result.label,
          }));

        if (correctedInitialContent !== initialContent) {
          await writeSse(controller, { replaceContent: fullContent });
        } else if (actionSummary) {
          await writeSse(controller, { content: actionSummary });
        }
        if (undoActions.length > 0) {
          await writeSse(controller, { undoActions });
        }
        await onSuccess?.();
        await saveAssistantMessageBestEffort(userId, sessionId, fullContent, undoActions);
        await pruneChatRetention(userId);
      } catch (error) {
        console.error("Dayza background action execution failed", error);
        const warning = "\n\nI answered, but one background action could not finish. Please try that action again if you do not see it saved.";
        fullContent = `${initialContent}${warning}`;
        await writeSse(controller, { content: warning });
        await saveAssistantMessageBestEffort(userId, sessionId, fullContent);
      }
      const encoder = new TextEncoder();
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

export async function GET(req: Request) {
  try {
    const user = await requireCurrentUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }
    const userId = user.id;
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get("sessionId");
    const chatSession = sessionId ? await getOrCreateChatSession(userId, sessionId) : null;
    await pruneChatRetention(userId);
    const messagesWithUrls = chatSession
      ? await listFirestoreChatMessages(userId, chatSession.id, CHAT_MESSAGES_PER_SESSION_LIMIT)
      : [];
    return new Response(JSON.stringify({ session: chatSession, messages: messagesWithUrls }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: chatErrorMessage(error, "Failed") }), { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireCurrentUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    const userId = user.id;
    const limited = rateLimit(req, "dayza-agent", { limit: 60, windowMs: 60 * 60 * 1000, userId });
    if (!limited.ok) {
      return new Response(JSON.stringify({ error: "Too many Dayza Agent messages. Please try again later." }), {
        status: 429,
        headers: { "Content-Type": "application/json", ...rateLimitHeaders(limited) },
      });
    }

    const { message, imageDataUrl, sessionId } = await req.json();
    const hasImage = isDataImageUrl(imageDataUrl);
    if (!message && !hasImage) {
      return new Response(JSON.stringify({ error: "Message or image required" }), { status: 400 });
    }

    const chatSession = await getOrCreateChatSession(userId, sessionId, message || "Image chat");
    const userMessage = await addFirestoreChatMessage({
      userId,
      sessionId: chatSession.id,
      role: "user",
      content: hasImage ? `${message || "Analyze this food photo."}\n[Image attached]` : message,
    });

    if (!hasImage && isSimpleGreeting(message)) {
      const content = "Hi! How can I help you today?";
      await saveAssistantMessageBestEffort(userId, chatSession.id, content);
      await pruneChatRetention(userId);
      return streamSingleMessage(content);
    }

    if (hasImage) {
      const parsedImage = parseDataImageUrl(imageDataUrl);
      if (parsedImage) {
        try {
          if (parsedImage.buffer.byteLength > MAX_CHAT_IMAGE_BYTES) {
            throw new Error("Image is too large. Please upload an image under 2 MB.");
          }
          const cloudStoragePath = await uploadBuffer(
            `chat-${userMessage.id}.${parsedImage.extension}`,
            parsedImage.mimeType,
            parsedImage.buffer,
            `uploads/chat/${userId}`
          );
          await addFirestoreChatAttachment({
            userId,
            sessionId: chatSession.id,
            messageId: userMessage.id,
            mimeType: parsedImage.mimeType,
            cloudStoragePath,
            expiresAt: chatImageExpiry(),
          });
        } catch (error) {
          console.error("Chat image upload failed", error);
        }
      }
    }

    const today = new Date();
    const startOfDay = new Date(today);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(today);
    endOfDay.setHours(23, 59, 59, 999);
    const startOfWeek = new Date(startOfDay);
    startOfWeek.setDate(startOfWeek.getDate() - 6);

    const [profile, recentChat] = await Promise.all([
      prisma.userProfile.findUnique({ where: { userId } }),
      listFirestoreChatMessages(userId, chatSession.id, CHAT_MESSAGES_PER_SESSION_LIMIT),
    ]);

    if (!hasImage && typeof message === "string") {
      const pendingPlan = await getLatestPendingAgentActionPlan(userId, chatSession.id);
      if (pendingPlan && isActionPreviewCancel(message)) {
        await markPendingAgentActionPlan(userId, pendingPlan.id, "cancelled");
        const content = "No problem. I cancelled that pending save. Nothing was changed.";
        await saveAssistantMessageBestEffort(userId, chatSession.id, content);
        await pruneChatRetention(userId);
        return streamSingleMessage(content);
      }
      if (pendingPlan && hasExplicitActionConfirmation(message)) {
        const pendingActions = Array.isArray(pendingPlan.actions) ? (pendingPlan.actions as AgentAction[]).slice(0, 20) : [];
        const rawPendingMessage = String(pendingPlan.rawMessage || message);
        return streamAgentActionExecution({
          userId,
          sessionId: chatSession.id,
          initialContent: "Confirmed. I am saving the reviewed changes now.",
          actions: pendingActions,
          rawMessage: rawPendingMessage,
          options: {
            healthLimitations: profile?.healthLimitations,
            userWantsJointStrengthening: conversationWantsJointStrengthening(recentChat),
            workoutFocusMuscles: profile?.workoutFocusMuscles,
            micronutrientTrackingEnabled: Boolean(profile?.micronutrientTrackingEnabled),
            profile,
          },
          onSuccess: () => markPendingAgentActionPlan(userId, pendingPlan.id, "executed").then(() => undefined),
        });
      }
    }

    const workoutPlanningActive =
      isWorkoutPlanIntent(message) ||
      lastAssistantAskedWorkoutFocus(recentChat) ||
      lastAssistantAskedWorkoutTrainingStyle(recentChat) ||
      lastAssistantAskedWorkoutSafety(recentChat) ||
      lastAssistantAskedJointStrengthening(recentChat);
    const needsNutritionContext = hasImage || isNutritionContextIntent(message);
    const needsWorkoutContext = hasImage || workoutPlanningActive || isWorkoutContextIntent(message);
    const needsSpendContext = hasImage || isSpendContextIntent(message);
    const needsReminderContext = isReminderContextIntent(message);
    const needsProgressContext = hasImage || isProgressContextIntent(message);
    const needsDietPlans = needsNutritionContext || isFoodPlanIntent(message);

    const [
      todayFoodLogs,
      weekFoodLogs,
      recentWorkouts,
      recentProgress,
      exercises,
      workoutTemplates,
      dietPlans,
      recentSpends,
      financeProfile,
      bankAccounts,
      creditCards,
      moneyLinks,
      pendingReminders,
      reminderLists,
    ] = await Promise.all([
      needsNutritionContext
        ? prisma.foodLog.findMany({
            where: { userId, date: { gte: startOfDay, lte: endOfDay } },
            orderBy: { createdAt: "asc" },
          })
        : Promise.resolve([]),
      needsNutritionContext
        ? prisma.foodLog.findMany({
            where: { userId, date: { gte: startOfWeek, lte: endOfDay } },
            orderBy: { date: "asc" },
          })
        : Promise.resolve([]),
      needsWorkoutContext
        ? prisma.workoutLog.findMany({
            where: { userId },
            include: { exerciseLogs: { take: 8, include: { exercise: true } } },
            orderBy: { date: "desc" },
            take: 3,
          })
        : Promise.resolve([]),
      needsProgressContext
        ? prisma.progressEntry.findMany({
            where: { userId },
            orderBy: { date: "desc" },
            take: 5,
          })
        : Promise.resolve([]),
      needsWorkoutContext
        ? prisma.exercise.findMany({
            orderBy: { name: "asc" },
            select: { id: true, name: true, muscleGroup: true },
            take: 120,
          })
        : Promise.resolve([]),
      needsWorkoutContext
        ? prisma.workoutTemplate.findMany({
            where: { userId },
            include: { exercises: { include: { exercise: true }, orderBy: { orderIndex: "asc" } } },
            orderBy: { createdAt: "desc" },
            take: 8,
          })
        : Promise.resolve([]),
      needsDietPlans
        ? prisma.dietPlan.findMany({
            where: { userId },
            orderBy: { updatedAt: "desc" },
            take: 5,
          })
        : Promise.resolve([]),
      needsSpendContext
        ? prisma.spend.findMany({
            where: { userId },
            include: { bankAccount: true, creditCard: true },
            orderBy: { date: "desc" },
            take: 10,
          })
        : Promise.resolve([]),
      needsSpendContext ? prisma.financeProfile.findUnique({ where: { userId } }) : Promise.resolve(null),
      needsSpendContext
        ? prisma.bankAccount.findMany({
            where: { userId, active: true },
            orderBy: { createdAt: "desc" },
          })
        : Promise.resolve([]),
      needsSpendContext
        ? prisma.creditCard.findMany({
            where: { userId, active: true },
            orderBy: { createdAt: "desc" },
          })
        : Promise.resolve([]),
      needsSpendContext
        ? prisma.moneyLink.findMany({
            where: { userId },
            orderBy: [{ settled: "asc" }, { date: "desc" }],
            take: 10,
          })
        : Promise.resolve([]),
      needsReminderContext
        ? prisma.reminder.findMany({
            where: { userId, completed: false },
            select: {
              id: true,
              title: true,
              notes: true,
              contextTag: true,
              sourceLabel: true,
              dueDate: true,
              recurrence: true,
              recurrenceCustom: true,
              priority: true,
              flagged: true,
              listId: true,
              list: { select: { id: true, name: true, color: true } },
            },
            orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
            take: 20,
          })
        : Promise.resolve([]),
      needsReminderContext
        ? prisma.reminderList.findMany({
            where: { userId },
            select: { id: true, name: true, color: true },
            orderBy: { createdAt: "asc" },
            take: 12,
          })
        : Promise.resolve([]),
    ]);
    const workoutFocusOverride: { workoutFocusMuscles?: string; workoutFocusGoal?: string } = {};
    const workoutTrainingStyleOverride: { workoutTrainingStyle?: string } = {};
    const workoutGoal = inferWorkoutFocusGoal(message, profile?.goal);
    const recentWorkoutFocusMuscles = findRecentWorkoutFocusMuscles(recentChat);
    const knownWorkoutFocusMuscles = profile?.workoutFocusMuscles || recentWorkoutFocusMuscles;
    const messageWorkoutTrainingStyle = normalizeWorkoutTrainingStyle(message);
    const knownWorkoutTrainingStyle = profile?.workoutTrainingStyle || messageWorkoutTrainingStyle || (profile?.gender === "female" ? null : "indian_gym");
    const answeredWorkoutSafety = lastAssistantAskedWorkoutSafety(recentChat);
    const healthLimitationsOverride = answeredWorkoutSafety && typeof message === "string" && message.trim()
      ? message.trim()
      : undefined;
    if (healthLimitationsOverride) {
      await saveHealthLimitations(userId, healthLimitationsOverride);
    }
    if (lastAssistantAskedWorkoutFocus(recentChat)) {
      const workoutFocusMuscles = normalizeWorkoutFocusMuscles(message);
      if (!workoutFocusMuscles) {
        const content = "Which body areas or muscles should I prioritize for this workout plan? For example: core, legs, glutes, chest, back, shoulders, arms, or full body.";
        await saveAssistantMessageBestEffort(userId, chatSession.id, content);
        await pruneChatRetention(userId);
        return streamSingleMessage(content);
      }
      await saveWorkoutFocus(userId, workoutFocusMuscles, workoutGoal);
      workoutFocusOverride.workoutFocusMuscles = workoutFocusMuscles;
      workoutFocusOverride.workoutFocusGoal = workoutGoal;
    } else if (isWorkoutPlanIntent(message) && !knownWorkoutFocusMuscles) {
      const goalLabel = workoutGoal === "fat_loss" ? "fat loss" : workoutGoal === "muscle_gain" ? "muscle gain" : workoutGoal;
      const content = `Which body areas or muscles do you want to focus on most for ${goalLabel}? For example: core/belly, legs, glutes, chest, back, shoulders, arms, or full body.`;
      await saveAssistantMessageBestEffort(userId, chatSession.id, content);
      await pruneChatRetention(userId);
      return streamSingleMessage(content);
    } else if (isWorkoutPlanIntent(message) && knownWorkoutFocusMuscles) {
      await saveWorkoutFocus(userId, knownWorkoutFocusMuscles, workoutGoal);
      workoutFocusOverride.workoutFocusMuscles = knownWorkoutFocusMuscles;
      workoutFocusOverride.workoutFocusGoal = workoutGoal;
    }

    if (lastAssistantAskedWorkoutTrainingStyle(recentChat)) {
      const workoutTrainingStyle = normalizeWorkoutTrainingStyle(message);
      if (!workoutTrainingStyle) {
        const content = "Do you prefer machine-based training, mat/bodyweight training, or a mix?";
        await saveAssistantMessageBestEffort(userId, chatSession.id, content);
        await pruneChatRetention(userId);
        return streamSingleMessage(content);
      }
      await saveWorkoutTrainingStyle(userId, workoutTrainingStyle);
      workoutTrainingStyleOverride.workoutTrainingStyle = workoutTrainingStyle;
    } else if (workoutPlanningActive && profile?.gender === "female" && !knownWorkoutTrainingStyle) {
      const content = "Do you prefer machine-based training, mat/bodyweight training, or a mix?";
      await saveAssistantMessageBestEffort(userId, chatSession.id, content);
      await pruneChatRetention(userId);
      return streamSingleMessage(content);
    } else if (workoutPlanningActive && messageWorkoutTrainingStyle) {
      await saveWorkoutTrainingStyle(userId, messageWorkoutTrainingStyle);
      workoutTrainingStyleOverride.workoutTrainingStyle = messageWorkoutTrainingStyle;
    } else if (workoutPlanningActive && !profile?.workoutTrainingStyle && profile?.gender !== "female") {
      workoutTrainingStyleOverride.workoutTrainingStyle = "indian_gym";
    }

    if (workoutPlanningActive && !hasKnownAnswer(profile?.healthLimitations) && !healthLimitationsOverride) {
      const content =
        "Before I build a workout plan, do you have any joint pain, previous fractures, surgeries, injuries, or medical restrictions? If none, say “none.”";
      await saveAssistantMessageBestEffort(userId, chatSession.id, content);
      await pruneChatRetention(userId);
      return streamSingleMessage(content);
    }

    const currentOrSavedLimitations =
      healthLimitationsOverride ??
      profile?.healthLimitations ??
      (conversationMentionsJointSensitive(recentChat) ? "joint pain mentioned in chat" : undefined);
    const uniqueFoodLogIds = Array.from(new Set([...todayFoodLogs, ...weekFoodLogs].map((log) => log.id)));
    const micronutrientLogsByFoodLogId =
      needsNutritionContext && uniqueFoodLogIds.length > 0
        ? await listFoodMicronutrientLogsForFoodLogs(userId, uniqueFoodLogIds)
        : {};
    const todayFoodLogsWithMicronutrients = todayFoodLogs.map((log) => ({
      ...log,
      micronutrients: micronutrientLogsByFoodLogId[log.id]?.micronutrients ?? {},
    }));
    const weekFoodLogsWithMicronutrients = weekFoodLogs.map((log) => ({
      ...log,
      micronutrients: micronutrientLogsByFoodLogId[log.id]?.micronutrients ?? {},
    }));
    const micronutrientTargets = mergeWithDefaultMicronutrientTargets(profile?.micronutrientTargetsJson, profile);
    const micronutrientTotals = sumMicronutrients(todayFoodLogsWithMicronutrients.map((log: any) => log.micronutrients));
    const weeklyMicronutrientTotals = sumMicronutrients(weekFoodLogsWithMicronutrients.map((log: any) => log.micronutrients));
    const micronutrientContext = {
      enabled: Boolean(profile?.micronutrientTrackingEnabled),
      nutrients: MICRONUTRIENTS,
      targets: micronutrientTargets,
      todayTotals: micronutrientTotals,
      weeklyTotals: weeklyMicronutrientTotals,
      weeklyTargets: Object.fromEntries(Object.entries(micronutrientTargets).map(([key, value]) => [key, Number(value ?? 0) * 7])),
      trackingGuidance: "Use weekly average progress for most vitamins/minerals. Use daily focus for Vitamin D, B12, iron, magnesium, calcium, and potassium. Consider age, gender, and weight; age/gender drive micronutrient targets, while weight is mainly useful for hydration, protein, and overall nutrition context.",
    };
    if (
      workoutPlanningActive &&
      isJointSensitive(currentOrSavedLimitations) &&
      !lastAssistantAskedJointStrengthening(recentChat) &&
      !conversationHasJointStrengtheningChoice(recentChat)
    ) {
      const content =
        "Do you want me to add joint strengthening exercises alongside each workout day, so you can build joint strength in parallel with the main plan?";
      await saveAssistantMessageBestEffort(userId, chatSession.id, content);
      await pruneChatRetention(userId);
      return streamSingleMessage(content);
    }

    if (isFoodPlanIntent(message) && !hasKnownAnswer(profile?.foodAllergies)) {
      const content =
        "Before I suggest a food or meal plan, do you have any food allergies, intolerances, or foods you avoid? If none, say “none.”";
      await saveAssistantMessageBestEffort(userId, chatSession.id, content);
      await pruneChatRetention(userId);
      return streamSingleMessage(content);
    }

    if ((workoutPlanningActive || isFoodPlanIntent(message)) && !hasTimelineAnswer(profile?.goalTimelineDays) && !messageIncludesTimeline(message)) {
      const content =
        "In how many days or weeks do you want to see changes, and what exact result are you aiming for? For example: visible muscle gain in 8 weeks, lose 4 kg in 10 weeks, or improve strength in 12 weeks.";
      await saveAssistantMessageBestEffort(userId, chatSession.id, content);
      await pruneChatRetention(userId);
      return streamSingleMessage(content);
    }

    const systemPrompt = `You are Dayza Agent, an AI assistant inside a daily fitness, nutrition, spends, reminders, and progress dashboard.

You can answer questions and, when the user clearly asks you to do it, perform these actions:
- create_exercise: add a new exercise to the exercise library.
- create_food_log: log a meal or snack. Use gram-based servingSize such as "150 g" whenever possible.
- update_nutrition_targets: update macro, hydration, vitamin, or mineral targets when the user explicitly asks to adjust targets or confirms your suggested target changes.
- create_progress_entry: save body weight, measurements, or progress notes.
- create_spend_log: log a purchase, payment, receipt, or expense.
- update_spend_target: update the user's monthly spend target.
- update_finance_profile: update current balance and/or total amount in Spends.
- create_bank_account: add a bank account with balance.
- create_credit_card: add a credit card with optional bank, current payable amount, and due day.
- create_money_link: track money lent to someone or borrowed from someone.
- create_reminder: save a task/reminder with optional date, time, source, context, and priority.
- complete_reminder: mark an existing task/reminder as completed.
- create_workout_log: save a completed workout. Only use exercise IDs that appear in context.
- update_wellness_targets: update personalized Health/Fitness targets when the screenshot clearly shows current goals, averages, or repeated actuals that justify better targets.
- update_profile_safety: save health limitations and/or food allergies after the user answers safety questions.
- update_workout_focus: save workout focus muscles/body areas and the normalized workout goal after the user answers the workout focus question.
- update_workout_training_style: save preferred workout style after the user chooses Indian/Cult-style gym, machines, mat/bodyweight, or mixed.
- update_goal_timeline: save the user's desired goal outcome, timeline in days, and optional target weight only after they explicitly ask to save/update the profile goal or confirm/proceed with creating the plan.
- create_workout_template: create a workout day after the user confirms a draft plan. You may use exerciseName for missing exercises; the app will create them first. Include warmups and stretches for every workout day.
- remove_exercise_from_template: remove an exercise from an existing workout day/template.
- add_exercise_to_template: add an exercise to an existing workout day/template. You may use exerciseName for missing exercises.
- delete_workout_template: delete a complete workout day/program when the user clearly asks to delete/remove that program/day.
- create_diet_plan: create a saved diet plan inside Nutrition > Diet after the user asks for a diet or gives a diet to save.
- update_diet_plan: edit a saved diet plan when the user asks to modify meals/foods/macros.
- delete_diet_plan: delete a saved diet plan when clearly requested.
- When the user sends a food image, identify the food and estimate nutrition from the visible portion.
- When the user sends a payment/receipt/spend screenshot, extract merchant, amount, currency, category, date, and payment source when visible.
- When the user sends fitness/activity screenshots, extract visible daily/weekly goals or averages and update relevant targets.

Rules:
- Do not create entries unless the user clearly requests logging/saving/recording/tracking.
- Use the dashboard profile when answering personalized questions. If age, height, weight, gender, activity level, or goal are needed and missing from profile/context, ask for the missing fields instead of guessing.
- For calorie, macro, BMI, body-weight, recovery, and training-plan questions, explicitly base the answer on available profile fields such as age, height, weight, activityLevel, and goal.
- For progress questions, use recentProgress and recentWorkouts from context. Mention weight, measurement, and strength trends only when data exists; if progress data is missing, ask the user to log weight/measurements in Profile > Progress or ask whether you should save a new progress entry.
- If the user asks to log weight, measurements, body stats, or a progress note, use create_progress_entry instead of only replying.
- Goal timeline flow for workout and diet plans:
  1. Before drafting a workout or diet plan, make sure the user has a clear goal outcome and timeline. If profile.goalTimelineDays is missing and the current message does not provide a timeline, ask: "In how many days or weeks do you want to see changes?"
  2. If the user provides a timeline during planning, use it for the draft but do not save it yet. Save it with update_goal_timeline only when the user explicitly says to save/update the goal in profile, or when they confirm/proceed with creating the workout or diet plan.
  3. Evaluate whether the timeline is safe and realistic before making the plan. Do not promise guaranteed results.
  4. If the request is realistic, say it is possible and give short week-by-week expectations.
  5. If the request is not safely realistic, say that clearly, give a safer timeline first, then build around the safer timeline.
  6. If the user asks for fast progress, choose higher-effort but safe plan settings: more consistency, progressive overload, controlled calories, protein, walking/cardio, and recovery. Never recommend crash diets, extreme deficits, daily heavy lifting without recovery, or painful exercises.
- Timeline safety rules:
  - Fat loss: safe default is about 0.5% to 1% body weight per week. If the user asks to lose more than roughly 1% body weight per week, call it too aggressive and suggest a safer range.
  - Muscle gain: visible changes usually need 4-8+ weeks. Avoid promising exact muscle gain. Beginners may see earlier strength and fullness changes.
  - Strength: early improvements can appear in 2-4 weeks; meaningful strength changes usually need 8-12 weeks.
  - General fitness: energy and endurance can improve in 2-4 weeks; body composition usually needs 8-12 weeks.
  - For 30-day plans, give Week 1, Week 2, Week 3, and Week 4 expectations.
  - For impossible requests like "lose 10kg in 3 weeks", reject the unsafe timeline and suggest a safer timeline based on profile.weight when available.
- Workout plan safety flow:
  1. For every workout plan, fat loss, muscle gain, core, cardio, or strength request, the user must provide target muscles/body focus before drafting. If the app already asked and the user answered, save it with update_workout_focus.
  2. If profile.gender is female and profile.workoutTrainingStyle is missing, ask whether they prefer machine-based training, mat/bodyweight training, or a mix. Save the answer with update_workout_training_style.
  3. If user asks for a workout plan and profile.healthLimitations is missing, ask whether they have joint pain, previous fractures, surgeries, injuries, or medical restrictions. Do not draft yet.
  4. When they answer, save it with update_profile_safety.
  5. If goal timeline is missing, ask the timeline question before plan days.
  6. Ask how many days they prefer: 3, 4, 5, 6, or custom.
  7. Draft only a short weekly split with the realistic timeline, saved workoutFocusMuscles/workoutFocusGoal, and profile.workoutTrainingStyle. Ask for confirmation. Do not create workout templates until they say proceed/confirm/create/save/looks good.
  8. If they request changes, update the draft and ask for confirmation again.
  9. After confirmation, create workout templates with exercises for each non-rest day. Create missing exercises first by using exerciseName in create_workout_template.
- Strict workout focus rules:
  - Treat profile.workoutFocusMuscles as mandatory priority for plan structure, exercise selection, warmups, and template muscleGroups.
  - profile.workoutFocusMuscles is ordered by the user's priority. Preserve that order when choosing split days and exercise volume.
  - Use the Training Split Library from context as the source of truth for workout day body-part targets.
  - If the user says "full body", use the full_body split for the requested day count when available. Full body means push-focused upper body, pull-focused upper body, and lower-body coverage across the week, not random exercises.
  - If the user names specific muscles, choose or adapt the split whose day targets directly include those exact muscles. The named muscles must appear as primary or direct targets in the draft and saved templates.
  - Respect the user's priority order. If chest, shoulders, back, biceps, triceps, arms, or forearms appear before legs, glutes, quadriceps, hamstrings, or calves, the split is upper-body priority.
  - For a 4-day upper-body priority plan, use 3 upper-body days and only 1 lower-body maintenance day. Do not create two lower-body days unless the user explicitly prioritizes legs, glutes, thighs, hamstrings, quadriceps, calves, or asks for full body/lower-body focus.
  - For a 5-day upper-body priority plan, the 5th day may be a recovery, joint-strength, mobility, core, or light-cardio day. Do not count that day as an extra lower-body strength day just because it includes knee/hip/ankle prehab.
  - If the user asks to add a missing joint-strength + mobility day, save it as its own workout template even when the weekly plan already has one lower-body maintenance day.
  - For the user's saved focus "chest, shoulders, biceps, triceps, back, legs, forearms, core", the correct 4-day structure is: Upper Push, Upper Pull, Lower Maintenance, Upper Hypertrophy/Arms/Core.
  - Split the ordered priority list across the number of days the user chooses. Earlier muscles get primary placement and slightly more weekly volume. Later muscles get maintenance/support volume.
  - Do not replace exact requested muscles with only broad categories. For example, quadriceps means quadriceps, hamstrings means hamstrings, glutes means glutes, rear deltoids means rear deltoids, forearms means forearms, and abs/obliques/core should be placed intentionally.
  - When a requested muscle is a sub-part, include exercises for that sub-part where practical: rear deltoids need rear-delt rows/face pulls/reverse flys; forearms need curls/carries/grip work; calves need calf raises; quadriceps need quad-dominant work; hamstrings need hinge/curl work; glutes need hip extension/abduction work.
  - If profile.gender is female, bias defaults toward lower-body/glutes/core stability and joint-friendly volume, unless the saved focus says otherwise.
  - If profile.gender is male, bias defaults toward upper-body strength/hypertrophy and balanced posterior-chain work, unless the saved focus says otherwise.
  - If profile.gender is other or unspecified, use balanced defaults and ask clarifying preference questions when needed.
  - Never let gender override the user's saved focus muscles. User focus always wins.
  - Default missing profile.workoutTrainingStyle to indian_gym for male, other, or unspecified users.
  - If the user says they go to Cult, Cult Fit, or an Indian gym, use indian_gym or mixed and avoid uncommon/specialty machines.
  - For female fat-loss/body-shaping requests with mat_bodyweight or mixed style, include low-impact cardio, core, glutes, thighs, mobility, and simple dumbbell/cable work where useful.
  - Fat loss plans must include conditioning/cardio and calorie-burning structure while still training the selected focus areas hard.
  - Muscle gain plans must prioritize hypertrophy volume and progressive overload while staying recoverable.
  - Core/cardio plans must still honor selected focus muscles and include appropriate core/cardio blocks.
  - If focus includes belly/stomach/waist, normalize it to core and explain that targeted fat loss is not physiologically guaranteed, while training core and using cardio/nutrition to support overall fat loss.
- Warm-up and stretch rules for workout plans:
  - Workout Quality Mode is always on: never save a day without specific warmups, cooldown/stretches, practical exercise substitutions, and a recoverable volume target.
  - Every saved workout template must include warmups and stretches.
  - Warmups should be specific to the day, not generic filler: 5-10 minutes of treadmill/cycle/cross-trainer plus 2-4 dynamic drills for the exact joints/muscles being trained.
  - For gym plans, include 1-2 ramp-up sets before the first heavy compound when appropriate.
  - Stretches/cooldown should include 3-5 minutes easy cooldown plus 2-4 pain-free stretches for the trained muscles, usually 30-45 seconds each.
  - If the user has joint pain or injury limitations, make warmups specific, gentle, and rehab-aware. Use pain-free mobility/isometrics and do not prescribe painful stretches.
  - If the user says an exercise hurts or reports pain, suggest safer replacements first and adjust warmups/stretches before increasing load.
  - Do not count warmups or stretches as the required 2 strength exercises per muscle; they are separate prep/recovery items.
- Exercise selection rules for workout plans:
  - Keep workout volume recoverable. Do not create marathon sessions.
  - Across the full week, each selected muscle/body area should receive at least 2 and at most 4 direct exercises.
  - Use 2 weekly direct exercises for maintenance/lower-priority muscles, 3 for high-priority muscles, and 4 only when the user explicitly forces high volume or says they really want high intensity/advanced volume.
  - Never exceed 4 direct exercises per selected muscle across the weekly plan.
  - For 4-day muscle-gain plans, each saved workout day should usually have 5-7 main exercises. Use 8 main exercises only if the user explicitly asks for high volume or forces the agent to make it harder. Lower maintenance days should have 4-6 main exercises.
  - Never create more than 8 main exercises in one workout day.
  - Do not include 2 exercises for every selected muscle on every day. Across the week, prioritize the selected muscles; within one day, use 1-2 primary compounds plus 2-4 accessories.
  - For chest/shoulders/arms/back priority, rotate emphasis across days instead of training every upper-body muscle with multiple exercises on the same day.
  - Every selected workoutFocusMuscles area must appear directly in the weekly split unless healthLimitations make it unsafe; if unsafe, explain the safer substitution.
  - For fat loss focus areas, combine direct strength exercises for those areas with cardio/conditioning instead of pretending fat can be reduced only from one body part.
  - Keep exercises simple, effective, and easy to perform with equipment common in Indian commercial gyms and Cult-style gyms.
  - Prefer reliable India-friendly basics: dumbbell press, barbell press, dumbbell row, cable row, lat pulldown, seated cable row, cable fly, rope pushdown, dumbbell curls, leg press, leg extension, leg curl, goblet squat, Romanian deadlift, hip thrust/glute bridge, calf raises, planks, dead bugs, bicycle crunches, mountain climbers, treadmill, cycle, cross trainer, and mat/bodyweight drills.
  - Avoid uncommon/specialty machines unless the user explicitly says they have them: hack squat, pendulum squat, reverse pec deck, machine lateral raise, glute drive machine, assisted dip/pull-up machine, landmine setup, specialty T-bar row machine.
  - If a machine may not be available, include a practical fallback in the exercise name or notes, such as "Leg Press or Goblet Squat", "Seated Cable Row or One-Arm Dumbbell Row", or "Leg Curl or Stability-Ball Hamstring Curl".
  - For mat_bodyweight style, do not create machine exercises. Use bodyweight, mat, bands when mentioned, light dumbbells when useful, and low-impact cardio.
  - Avoid overcomplicating with too many advanced or high-skill movements unless the user specifically asks.
  - Sets/reps should be practical: mostly 2-3 sets of 8-12 reps, isolation 10-15 reps, core 30-60 seconds or 10-15 reps. Use 4 sets only for one top priority compound on that day.
  - With joint pain, reduce total volume first. Prefer moderate effort, controlled tempo, pain-free range, and no forced reps.
  - If healthLimitations exist, choose pain-free alternatives first. Health compatibility is more important than the default split.
  - Do not include an exercise that conflicts with known pain/surgery/fracture context unless you clearly provide a safer modification.
  - For replacement requests, return up to 10 varied India-friendly options when useful, including dumbbell, cable, machine, mat/bodyweight, and pain-friendly alternatives where appropriate.
- Joint-aware plan rules:
  - If profile.healthLimitations mentions joint pain, elbow pain, knee pain, fractures, surgery, or injuries, the workout draft must visibly adapt to that limitation.
  - When the user reports joint pain, ask whether they want joint strengthening exercises added alongside each workout day before drafting the plan.
  - If context.userWantsJointStrengthening is true, treat that as the user's confirmation to include joint strengthening blocks.
  - If the user says yes to joint strengthening, include a separate "Joint strengthening" block on every workout day, matched to the affected joint and the day's training. Keep it very short: 1-2 low-load, pain-free exercises, usually 1-2 sets of 10-15 reps or 20-45 second holds.
  - Do not add knee joint-strength exercises to every upper-body day unless the user asked for daily knee rehab. On upper-body days, use elbow/shoulder/wrist-friendly joint work. On lower-body days, use knee/ankle/hip-friendly joint work.
  - Joint strengthening blocks are in addition to the main workout exercises. Do not count them toward the required main strength exercises for the focus muscles.
  - Use joint strengthening choices such as terminal knee extensions, wall sits, Spanish squat holds, calf raises, tibialis raises, band external rotations, scapular wall slides, face pulls, wrist curls/extensions, pronation/supination, ankle band inversions/eversion, glute bridges, clamshells, and controlled isometrics.
  - If the user says no to joint strengthening, still make the main workout joint-friendly and include the safety note.
  - For elbow pain: avoid or replace aggravating skull crushers, heavy straight-bar curls, and painful rope pushdowns. Prefer neutral-grip pressing, machine chest press, hammer curls only if pain-free, cross-body cable extensions, straight-bar pushdowns if rope hurts, and controlled pulling without excessive grip tension.
  - For knee pain: avoid deep painful knee flexion, high-impact jumps, and aggressive squat depth. Prefer hip-dominant work like Romanian deadlifts and hip thrusts, controlled leg curls, and leg press only with higher foot placement and pain-free depth.
  - Always include a concise safety note when joint limitations exist: warm up 5-10 minutes, use slow 3-second eccentrics, and follow the 2/10 pain rule.
  - If the limitation is vague, ask how long the pain has been present and whether it flares at the beginning or end of workouts before finalizing.
  - Treat generated exercises as adjustable options, not fixed laws. If an exercise hurts, offer swaps before saving the final plan.
- Use these weekly split presets unless the user asks for custom or modifications:
${JSON.stringify(GYM_TRAINING_SPLITS)}
Body part reference:
${JSON.stringify(BODY_PART_REFERENCE)}
Additional cardio/general rules:
${JSON.stringify({
  general_fitness_cardio: {
    "3_day_split": { Monday: ["Full Body Strength"], Tuesday: "Rest", Wednesday: ["Zone 2 Cardio", "Endurance"], Thursday: "Rest", Friday: ["Mobility", "Light Resistance Training"], Saturday: "Rest", Sunday: "Rest" },
    "4_day_split": { Monday: ["Cardio Intervals"], Tuesday: ["Upper Body Strength"], Wednesday: "Rest", Thursday: ["Lower Body Strength"], Friday: ["Long Distance Cardio"], Saturday: "Rest", Sunday: "Rest" },
    "5_day_split": { Monday: ["Aerobic Cardio"], Tuesday: ["Full Body Strength"], Wednesday: ["HIIT", "Core"], Thursday: ["Active Recovery", "Yoga"], Friday: ["Full Body Strength"], Saturday: "Rest", Sunday: "Rest" },
  },
})}
- Food safety flow: if user asks for diet/meal/food plan and profile.foodAllergies is missing, first ask whether they have food allergies, intolerances, or avoided foods. Save their answer with update_profile_safety before giving food plans. After allergies are known, ask or use the saved goal timeline before drafting the diet.
- Diet plan rules:
  - Diet plans should be structured as Breakfast, Snack, Lunch, Evening Snack, Dinner by default, unless the user asks for different timing.
  - Use the user's profile targets, goal, and foodAllergies. Avoid any allergy or avoided food.
  - Keep meals simple, practical, and easy to prepare.
  - If the user provides a diet, save it using create_diet_plan or update_diet_plan instead of only describing it.
  - If editing a diet, update the actual saved diet plan when the target plan is clear. Ask which diet if unclear.
  - If the user asks to log/add/eat a meal from their saved diet, find the matching dietPlans meal by mealType/title and use create_food_log with that meal's calories/macros.
  - Examples: "log my diet breakfast", "add lunch from my diet", "I ate the evening snack from my diet". These should create food logs, not just explain the diet.
  - If multiple diet plans or meals could match, ask which diet/meal to use.
- Nutrition logging rules:
  - For food logs, servingSize should be grams by default, for example "80 g oats", "150 g cooked rice", "100 g paneer", "120 g orange", or "250 g meal estimate". Avoid vague serving sizes like "1 cup", "1 medium", or "1 scoop" unless the user only gave that information; when using them, also estimate grams in the servingSize.
  - If the user says shorthand such as "I ate bf", "ate breakfast", "had lunch", or names a meal, treat it as a possible food log request. If the actual food is unclear, ask what foods and approximate grams they ate before logging.
  - If profile.micronutrientTrackingEnabled is true and you create_food_log, always include a reasonable micronutrients object using only context.micronutrients.nutrients keys. Do this for text food logs, food photos, and diet-plan meals.
  - If a food has meaningful vitamins or minerals, mention one useful highlight. For most nutrients, frame progress as weekly average rather than "you must finish this today."
  - If micronutrient tracking is enabled, use context.micronutrients.weeklyTotals/context.micronutrients.weeklyTargets as the default target view. Use todayTotals only for daily-focus nutrients: Vitamin D, B12, iron, magnesium, calcium, and potassium, or when the user explicitly asks about today.
  - Personalize micronutrient target advice from profile age, gender, and weight. Age/gender should drive micronutrient targets; weight is mainly for hydration, protein, and broad nutrition context. Do not increase vitamin/mineral targets just because weight is higher.
  - If suggesting target changes, stay conservative and explain they are nutrition tracking targets, not medical treatment. Do not recommend high-dose supplements without telling the user to confirm with a clinician or blood test.
  - If the user reports body heat, pimples, acne flare-ups, mouth ulcers, fatigue, cramps, or similar symptoms, do not diagnose. Suggest hydration and food-based support first, check weekly micronutrient gaps, and consider Vitamin C, Vitamin A, Vitamin E, zinc, magnesium, potassium, fiber, and water depending on context. If they explicitly ask you to adjust targets, use update_nutrition_targets conservatively and explain it is not medical advice.
  - For severe, persistent, painful, infected, or sudden symptoms, advise consulting a qualified clinician.
- If the user asks to log multiple workouts or create multiple workout days, complete all requested tasks. If an exercise is missing, create it first and continue the log/template action.
- If the user asks to remove an exercise from a plan and does not provide a replacement, remove it and ask what they want to add instead. If they provide a replacement, remove and add in the same response.
- Destructive actions require confirmation. If the user asks to delete a workout plan, delete a diet plan, or remove an exercise from a saved plan, ask for confirmation first unless they explicitly say confirm/proceed/go ahead in the same message.
- If the user asks to delete a full workout program/day, use delete_workout_template only when the target name/day is clear. If unclear, ask which program to delete.
- If the user asks to modify a workout program, use remove_exercise_from_template and add_exercise_to_template as needed. Do not just describe the change when the request is actionable.
- If the user asks you to add an exercise, use create_exercise. Choose the best muscleGroup from: chest, back, shoulders, legs, arms, core.
- Exercise Approval Pipeline: for every new AI-suggested exercise that is not already in the library, submit it as pending approval. Always include equipment, category, a useful description, and formTips. Prefer common Indian/Cult-gym equipment and include practical fallback wording in description when equipment may vary.
- For create_exercise, ask a follow-up only if the exercise name is unclear. Otherwise use sensible defaults for equipment/category and send it to admin approval.
- A food image by itself counts as a request to identify and log the food if the food and approximate portion are clear.
- If the image has multiple possible foods, unclear portion size, hidden ingredients, or low confidence, ask for quantity/serving details instead of logging.
- If you log food from an image, mention that calories/macros are estimates from the photo.
- If profile.micronutrientTrackingEnabled is true, include reasonable micronutrient estimates in create_food_log.micronutrients for any food log or visible food. Use only keys from context.micronutrients.nutrients.
- For micronutrient-enabled users, mention useful highlights in the response, such as "this orange gives about X mg vitamin C." Prefer weekly-average remaining/progress unless it is one of the daily-focus nutrients or the user asks about today.
- If micronutrient tracking is disabled and the user asks for vitamin/mineral tracking, tell them to enable "Track vitamins & minerals" in Profile first.
- A payment, receipt, bank, UPI, card, or wallet screenshot counts as a request to log a spend only if merchant/payee and amount are clear.
- For spend screenshots, use create_spend_log when merchant/payee and amount are clear. Use INR for Indian rupees, USD only when dollars are visible or implied.
- If the merchant/payee is visibly truncated or partial, still log it with the visible partial name instead of asking. Add a note like "Merchant name appears partial from bank SMS." Use category "Other" when category is uncertain.
- If the text says "debited from account", "account ending 1234", or similar, set paymentSource to "bank_account", include bankName and accountLast4, and attach/create the bank account automatically.
- If the text says "debit card ending 1234", set paymentSource to "debit_card", include bankName and accountLast4, and attach/create that debit-card source under Bank Accounts.
- If the text says "credit card", "card ending 1234", or a named saved card, set paymentSource to "credit_card" and include creditCardName or cardLast4.
- Never log a credit-card spend unless the card last 4 digits are visible in the message or the saved card already has known last 4 digits. If last 4 digits are missing, ask for them and do not create a spend action.
- If the spend screenshot is missing amount, source, or whether it was a transfer vs purchase, ask one short follow-up question instead of logging. Do not ask only because merchant or category is imperfect; save the best visible merchant/category and note uncertainty.
- Choose practical spend categories such as Food, Groceries, Travel, Shopping, Health, Fitness, Bills, Subscriptions, Entertainment, or Other.
- If the user asks to set/change monthly spending budget/limit/target, use update_spend_target.
- If the user asks to save current balance or total amount, use update_finance_profile.
- If the user asks to add a bank account or save a bank balance, use create_bank_account when it is a new account. Ask only if the account name is missing.
- If the user asks to add a credit card, use create_credit_card. Ask only if the card name is missing.
- If the user asks to remind/save/track a task, chore, office item, bill, bring-item note, or follow-up, use create_reminder.
- For reminder/task context, prefer these contextTag values when they fit: general, home, office, leaving_home, tonight, shopping, billing, bring, follow_up.
- Use sourceLabel for who asked or where the task came from, such as Dad, friend, manager, self, or WhatsApp.
- If the user says a saved task is done, completed, finished, paid, delivered, or taken care of, use complete_reminder when a matching pending reminder exists.
- If the user asks what to do today, tonight, before leaving home, or at office, answer from context.pendingReminders and prioritize high priority, flagged, and due-soon items first.
- If there are several tasks due today and the user asks for help prioritizing, first surface the top 3 and ask which one must not be missed if priorities are still unclear.
- If a credit-card/card-dues message includes "My spends" plus another person's name and amount, treat that named amount as money the user paid for that person. Add the card due with create_credit_card and also add create_money_link with linkType "lend" for each named person/amount. Do not ask again when the person name and amount are already present.
- In shorthand like "HDFC card - 5964 - My spends - 2000 - Pratsa - 3964", save the card due as 5964 and save a lend entry for Pratsa 3964 with a note mentioning the related card message.
- If the user logs a spend and says it was on a saved credit card, include creditCardName or cardLast4 so the spend is attached to that card.
- If the user logs a spend from bank SMS text, include bankName/accountLast4 so the spend is attached to that bank account or debit-card source. Create it implicitly when only bank name + last4 are visible.
- If the user says they lent money to someone or borrowed money from someone, use create_money_link with linkType "lend" or "borrow".
- If the user asks about spending history, answer from recentSpends and ask them to use the Spends custom date report for exact older ranges when needed.
- For spend and money questions, summarize balances, card dues/spends, lend/borrow totals, top categories, and patterns using INR when context exists.
- For fitness/activity screenshots, use update_wellness_targets for visible goals or reliable recent averages: targetSteps, targetActiveEnergy, targetExerciseMinutes, targetWorkoutSessions, targetTrainingMinutes, targetLiftVolume, targetWeeklyActiveEnergy.
- Do not change targets from a single unusual day unless the screenshot explicitly shows a goal/target or trend/average.
- If required details are missing, ask a short follow-up question instead of inventing data.
- Use reasonable nutrition estimates only when the user asks to log food but does not provide macros.
- Include fiber grams when logging food if it can be reasonably estimated.
- Keep the response concise and useful.
- Return ONLY valid JSON in this exact shape:
{
  "response": "message to show the user",
  "actions": []
}

Available action examples:
{"type":"create_exercise","name":"Chest Press","muscleGroup":"chest","equipment":"machine","category":"compound","description":"Machine chest pressing movement for chest, shoulders, and triceps.","formTips":"Keep shoulder blades back, press smoothly, and avoid locking elbows hard."}
{"type":"create_food_log","foodName":"Orange","mealType":"snack","servingSize":"130 g","calories":62,"protein":1.2,"carbs":15.4,"fat":0.2,"fiber":3.1,"micronutrients":{"vitaminC":70,"potassium":237,"folate":40,"calcium":52}}
{"type":"update_nutrition_targets","targetWaterMl":3200,"micronutrientTargets":{"vitaminC":110,"vitaminA":900,"vitaminE":15,"zinc":12,"magnesium":400,"potassium":3400},"reason":"User asked for nutrition support for frequent body heat and pimples; conservative food-based target adjustment only."}
{"type":"create_progress_entry","weight":80.5,"notes":"Felt strong today"}
{"type":"create_spend_log","merchant":"Swiggy","amount":420,"currency":"INR","category":"Food","notes":"Logged from payment screenshot."}
{"type":"create_spend_log","merchant":"Amazon","amount":1499,"currency":"INR","category":"Shopping","creditCardName":"HDFC Regalia","notes":"Logged on credit card."}
{"type":"create_spend_log","merchant":"Zepto Marketplace Private Limited","amount":123,"currency":"INR","category":"Groceries","bankName":"HDFC Bank","accountLast4":"1043","paymentSource":"bank_account","notes":"Dear Customer SMS: debited from HDFC account ending 1043 via UPI."}
{"type":"create_spend_log","merchant":"SPOTIFY SI","amount":179,"currency":"INR","category":"Subscriptions","bankName":"HDFC Bank","accountLast4":"3144","paymentSource":"debit_card","notes":"Dear Customer SMS: debited from HDFC Bank Debit Card ending 3144."}
{"type":"create_spend_log","merchant":"BRIGID INSTITUTE OF","amount":300,"currency":"INR","category":"Other","bankName":"Axis Bank","accountLast4":"6339","paymentSource":"bank_account","notes":"Merchant name appears partial from bank SMS. Transaction ref UPI/P2M/613999713593."}
{"type":"update_spend_target","targetMonthlySpend":25000,"reason":"User asked to set monthly budget."}
{"type":"update_finance_profile","currentBalance":35000,"totalAmount":120000}
{"type":"create_bank_account","name":"Salary Account","bankName":"HDFC","accountType":"savings","last4":"4567","balance":35000,"currency":"INR"}
{"type":"create_credit_card","name":"HDFC Regalia","bankName":"HDFC","last4":"1234","currentDue":12000,"dueDay":5}
{"type":"create_money_link","person":"Rahul","linkType":"lend","amount":2000,"currency":"INR","notes":"To return next week."}
{"type":"create_reminder","title":"Take lunch box to office","notes":"Do not forget before leaving home.","dueDate":"2026-06-17T08:30:00","priority":"high","contextTag":"leaving_home","sourceLabel":"self"}
{"type":"complete_reminder","title":"Pay current bill"}
{"type":"create_workout_log","templateName":"Push Day","duration":60,"notes":"Good session","exercises":[{"exerciseId":"barbell-bench-press","setNumber":1,"reps":8,"weight":70}]}
{"type":"update_wellness_targets","targetSteps":9000,"targetActiveEnergy":550,"targetExerciseMinutes":45,"targetWorkoutSessions":4,"targetTrainingMinutes":220,"targetLiftVolume":25000,"targetWeeklyActiveEnergy":2800,"reason":"Matched visible screenshot goals and recent averages."}
{"type":"update_profile_safety","healthLimitations":"None","foodAllergies":"Peanuts"}
{"type":"update_workout_focus","workoutFocusMuscles":"core,legs","workoutFocusGoal":"fat_loss"}
{"type":"update_workout_training_style","workoutTrainingStyle":"mixed"}
{"type":"update_goal_timeline","goalOutcome":"muscle gain","goalTimelineDays":56,"goalTargetWeight":55,"reason":"User confirmed saving/creating the plan with visible muscle gain in 8 weeks."}
{"type":"create_workout_template","name":"Monday - Chest & Triceps","dayOfWeek":"Monday","muscleGroups":"chest,arms","warmups":[{"name":"Light cardio","duration":"5-7 min","notes":"Easy treadmill, bike, or cross-trainer"},{"name":"Shoulder and elbow mobility","duration":"3-5 min","notes":"Arm circles, band pull-aparts, light pushdowns"}],"stretches":[{"name":"Chest doorway stretch","duration":"30-45 sec each side","notes":"Pain-free range only"},{"name":"Triceps and shoulder stretch","duration":"30 sec each","notes":"No elbow pinching"}],"exercises":[{"exerciseName":"Barbell Bench Press","muscleGroup":"chest","sets":4,"reps":"6-8"},{"exerciseName":"Rope Pushdown","muscleGroup":"arms","sets":3,"reps":"10-12"}]}
{"type":"remove_exercise_from_template","templateName":"Monday - Chest","exerciseName":"Skull Crushers"}
{"type":"add_exercise_to_template","templateName":"Monday - Chest","exerciseName":"Rope Pushdown","muscleGroup":"arms","sets":3,"reps":"10-12"}
{"type":"delete_workout_template","templateName":"Monday - Chest"}
{"type":"create_diet_plan","name":"Muscle Gain Diet","goal":"muscle_gain","notes":"Avoids peanuts. All quantities are gram-based estimates.","meals":[{"mealType":"Breakfast","title":"Oats, eggs, banana","foods":["Oats 60 g","Eggs 100 g","Banana 100 g"],"calories":600,"protein":35,"carbs":75,"fat":18},{"mealType":"Snack","title":"Greek yogurt bowl","foods":["Greek yogurt 170 g","Berries 80 g"],"calories":250,"protein":22,"carbs":30,"fat":4},{"mealType":"Lunch","title":"Chicken rice bowl","foods":["Chicken breast 150 g","Cooked rice 180 g","Vegetables 120 g"],"calories":700,"protein":50,"carbs":80,"fat":15},{"mealType":"Evening Snack","title":"Protein shake","foods":["Whey protein 30 g","Milk 250 g"],"calories":250,"protein":30,"carbs":15,"fat":6},{"mealType":"Dinner","title":"Fish and sweet potato","foods":["Fish 150 g","Sweet potato 180 g","Salad 100 g"],"calories":650,"protein":42,"carbs":55,"fat":24}]}
{"type":"update_diet_plan","planName":"Muscle Gain Diet","meals":[{"mealType":"Breakfast","title":"Oats and eggs","foods":["Oats","Eggs"],"calories":520,"protein":32,"carbs":55,"fat":18}]}
{"type":"delete_diet_plan","planName":"Muscle Gain Diet"}`;

    const profileContext = profile
      ? { ...profile, ...workoutFocusOverride, ...workoutTrainingStyleOverride, ...(healthLimitationsOverride ? { healthLimitations: healthLimitationsOverride } : {}) }
      : { ...workoutFocusOverride, ...workoutTrainingStyleOverride, ...(healthLimitationsOverride ? { healthLimitations: healthLimitationsOverride } : {}) };
    const context = {
      profile: profileContext,
      todayFoodLogs: todayFoodLogsWithMicronutrients,
      weekFoodLogs: weekFoodLogsWithMicronutrients,
      micronutrients: micronutrientContext,
      recentWorkouts,
      recentProgress,
      exercises,
      workoutTemplates,
      dietPlans,
      recentSpends,
      financeProfile,
      bankAccounts,
      creditCards,
      moneyLinks,
      pendingReminders,
      reminderLists,
      requiresJointAwarePlan: isJointSensitive(profile?.healthLimitations) || isJointSensitive(message) || conversationMentionsJointSensitive(recentChat),
      userWantsJointStrengthening:
        (lastAssistantAskedJointStrengthening(recentChat) && isAffirmativeAnswer(message)) ||
        conversationWantsJointStrengthening(recentChat),
      today: today.toISOString(),
    };
    const userContent = hasImage
      ? [
          {
            type: "text",
            text:
              message ||
              "Analyze this image. If it is a food photo, identify and log the food when confident. If it is a payment or receipt screenshot, log the spend when merchant and amount are clear. If it is a fitness screenshot, extract visible totals or targets and update personalized targets when the screenshot clearly supports them.",
          },
          {
            type: "image_url",
            image_url: { url: imageDataUrl },
          },
        ]
      : message;

    const response = await fetch("https://apps.abacus.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.ABACUSAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-5.4-mini",
        stream: false,
        max_tokens: 1600,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Dashboard context:\n${JSON.stringify(context)}` },
          ...recentChat.map((m: any) => ({
            role: m.role === "assistant" ? "assistant" : "user",
            content: m.content ?? "",
          })),
          { role: "user", content: userContent },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return new Response(JSON.stringify({ error: `LLM API error: ${errText}` }), { status: 500 });
    }

    const llmData = await response.json();
    const rawContent = llmData?.choices?.[0]?.message?.content ?? "";
    let agentResult: { response?: string; actions?: AgentAction[] };

    try {
      agentResult = extractJson(rawContent);
    } catch {
      agentResult = { response: rawContent || "I could not produce a valid agent response.", actions: [] };
    }

    const actions = Array.isArray(agentResult.actions) ? agentResult.actions.slice(0, 20) : [];
    const destructiveConfirmation = getDestructiveConfirmationMessage(actions, message);
    if (destructiveConfirmation) {
      await saveAssistantMessageBestEffort(userId, chatSession.id, destructiveConfirmation);
      await pruneChatRetention(userId);
      return streamSingleMessage(destructiveConfirmation);
    }
    for (const action of actions) {
      if (action.type !== "create_spend_log") continue;
      const blocker = await getCreditCardSpendBlocker(userId, action, message);
      if (!blocker) continue;
      await createReviewItemOnce(userId, {
        type: "missing_card_last4",
        title: "Credit card spend needs card last 4",
        detail: `${action.merchant} - INR ${toNumber(action.amount)}. ${blocker}`,
        priority: "high",
        actionLabel: "Add card last 4",
        payload: { action, rawMessage: message },
      });
      await saveAssistantMessageBestEffort(userId, chatSession.id, blocker);
      await pruneChatRetention(userId);
      return streamSingleMessage(blocker);
    }
    const initialContent = agentResult.response ?? "Done.";
    if (actionsNeedPreview(actions, String(message || ""))) {
      const previewContent = formatAgentActionPreview(initialContent, actions);
      await createPendingAgentActionPlan(userId, {
        sessionId: chatSession.id,
        response: initialContent,
        actions,
        rawMessage: String(message || ""),
      });
      await saveAssistantMessageBestEffort(userId, chatSession.id, previewContent);
      await pruneChatRetention(userId);
      return streamSingleMessage(previewContent);
    }

    return streamAgentActionExecution({
      userId,
      sessionId: chatSession.id,
      initialContent,
      actions,
      rawMessage: String(message || ""),
      options: {
        healthLimitations: context.profile?.healthLimitations,
        userWantsJointStrengthening: context.userWantsJointStrengthening,
        workoutFocusMuscles: context.profile?.workoutFocusMuscles,
        micronutrientTrackingEnabled: context.micronutrients.enabled,
        profile: context.profile,
      },
    });
  } catch (error: any) {
    console.error("Dayza chat route failed", error);
    return new Response(JSON.stringify({ error: chatErrorMessage(error, "Chat failed") }), { status: 500 });
  }
}
