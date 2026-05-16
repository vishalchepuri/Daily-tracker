export const dynamic = "force-dynamic";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

type WorkoutExerciseWithExercise = {
  id: string;
  exercise: {
    name: string;
  };
};

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
      date?: string;
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
      creditCardName?: string;
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
      type: "create_sleep_log";
      date?: string;
      totalMinutes: number;
      awakeMinutes?: number;
      remMinutes?: number;
      coreMinutes?: number;
      deepMinutes?: number;
    }
  | {
      type: "update_wellness_targets";
      targetSteps?: number;
      targetActiveEnergy?: number;
      targetExerciseMinutes?: number;
      targetSleepMinutes?: number;
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
      type: "create_workout_template";
      name: string;
      dayOfWeek?: string;
      muscleGroups?: string;
      difficulty?: string;
      exercises?: Array<{
        exerciseId?: string;
        exerciseName?: string;
        muscleGroup?: string;
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

function isDataImageUrl(value: unknown): value is string {
  return typeof value === "string" && /^data:image\/(png|jpe?g|webp);base64,/i.test(value);
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

function isWorkoutPlanIntent(text: unknown) {
  if (typeof text !== "string") return false;
  return includesAny(text, ["workout plan", "training plan", "gym plan", "exercise plan", "weekly split", "split plan"]);
}

function isFoodPlanIntent(text: unknown) {
  if (typeof text !== "string") return false;
  return includesAny(text, ["meal plan", "diet plan", "food plan", "nutrition plan", "what should i eat"]);
}

function isJointSensitive(value?: string | null) {
  if (!value) return false;
  return includesAny(value, ["pain", "joint", "knee", "elbow", "shoulder", "hip", "ankle", "wrist", "fracture", "surgery", "injury"]);
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

async function findOrCreateExercise(input: { exerciseId?: string; exerciseName?: string; muscleGroup?: string }) {
  if (input.exerciseId) {
    const byId = await prisma.exercise.findUnique({ where: { id: input.exerciseId } });
    if (byId) return byId;
  }

  const name = (input.exerciseName ?? input.exerciseId ?? "").trim();
  if (!name) throw new Error("Exercise name is required");

  const existing = await prisma.exercise.findFirst({
    where: { name: { equals: name } },
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
      equipment: null,
      category: null,
      description: `${name} exercise.`,
      formTips: "Use controlled form and a pain-free range of motion.",
    },
  });
}

async function executeAgentAction(userId: string, action: AgentAction) {
  if (action.type === "create_exercise") {
    const exercise = await findOrCreateExercise({ exerciseName: action.name, muscleGroup: action.muscleGroup });
    return { type: action.type, label: `Added ${exercise.name} to Exercise Library`, id: exercise.id };
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
    return { type: action.type, label: `Logged ${log.foodName}`, id: log.id };
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
    return { type: action.type, label: "Saved progress entry", id: entry.id };
  }

  if (action.type === "create_spend_log") {
    const card = action.creditCardName
      ? await prisma.creditCard.findFirst({
          where: {
            userId,
            active: true,
            name: { contains: action.creditCardName, mode: "insensitive" },
          },
        })
      : null;
    const spend = await prisma.spend.create({
      data: {
        userId,
        merchant: action.merchant,
        amount: toNumber(action.amount),
        currency: action.currency || "INR",
        category: action.category || null,
        date: action.date ? new Date(action.date) : new Date(),
        notes: action.notes || "Logged by AI Coach.",
        source: "manual",
        creditCardId: card?.id ?? null,
      },
    });
    return { type: action.type, label: `Logged spend at ${spend.merchant}${card ? ` on ${card.name}` : ""}`, id: spend.id };
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
    return { type: action.type, label: `Added credit card ${card.name}`, id: card.id };
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
    return { type: action.type, label: `Added bank account ${account.name}`, id: account.id };
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
        notes: action.notes || "Logged by AI Coach.",
      },
    });
    return { type: action.type, label: `${moneyLink.type === "lend" ? "Lent" : "Borrowed"} INR ${moneyLink.amount} ${moneyLink.type === "lend" ? "to" : "from"} ${moneyLink.person}`, id: moneyLink.id };
  }

  if (action.type === "create_workout_log") {
    const exerciseRows = [];
    for (const exercise of action.exercises ?? []) {
      const resolved = await findOrCreateExercise(exercise);
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
    return { type: action.type, label: "Logged workout", id: log.id };
  }

  if (action.type === "create_sleep_log") {
    const baseDate = action.date ? new Date(action.date) : new Date();
    const startDate = new Date(baseDate);
    startDate.setHours(0, 0, 0, 0);
    const externalBase = `ai-sleep:${userId}:${startDate.toISOString()}`;
    const rows = [
      { type: "sleep_minutes", value: toNumber(action.totalMinutes), unit: "min", source: "AI Sleep Screenshot", suffix: "total" },
      { type: "sleep_awake_minutes", value: toNumber(action.awakeMinutes), unit: "min", source: "AI Sleep Screenshot Awake", suffix: "awake" },
      { type: "sleep_rem_minutes", value: toNumber(action.remMinutes), unit: "min", source: "AI Sleep Screenshot REM", suffix: "rem" },
      { type: "sleep_core_minutes", value: toNumber(action.coreMinutes), unit: "min", source: "AI Sleep Screenshot Core", suffix: "core" },
      { type: "sleep_deep_minutes", value: toNumber(action.deepMinutes), unit: "min", source: "AI Sleep Screenshot Deep", suffix: "deep" },
    ].filter((row) => row.value > 0);

    for (const row of rows) {
      await prisma.healthMetric.upsert({
        where: { userId_externalId: { userId, externalId: `${externalBase}:${row.suffix}` } },
        update: {
          value: row.value,
          unit: row.unit,
          source: row.source,
          startDate,
          endDate: null,
        },
        create: {
          userId,
          type: row.type,
          value: row.value,
          unit: row.unit,
          source: row.source,
          startDate,
          endDate: null,
          externalId: `${externalBase}:${row.suffix}`,
        },
      });
    }
    return { type: action.type, label: `Logged ${Math.floor(toNumber(action.totalMinutes) / 60)}h ${toNumber(action.totalMinutes) % 60}m sleep`, id: externalBase };
  }

  if (action.type === "update_wellness_targets") {
    const data = {
      targetSteps: action.targetSteps == null ? undefined : Math.round(toNumber(action.targetSteps)),
      targetActiveEnergy: action.targetActiveEnergy == null ? undefined : Math.round(toNumber(action.targetActiveEnergy)),
      targetExerciseMinutes: action.targetExerciseMinutes == null ? undefined : Math.round(toNumber(action.targetExerciseMinutes)),
      targetSleepMinutes: action.targetSleepMinutes == null ? undefined : Math.round(toNumber(action.targetSleepMinutes)),
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

  if (action.type === "create_workout_template") {
    const exerciseRows = [];
    for (const [index, item] of (action.exercises ?? []).entries()) {
      const exercise = await findOrCreateExercise(item);
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
        exercises: { create: exerciseRows },
      },
    });
    return { type: action.type, label: `Created ${template.name}`, id: template.id };
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
    for (const match of matches) {
      await prisma.workoutExercise.delete({ where: { id: match.id } });
    }
    return { type: action.type, label: `Removed ${action.exerciseName} from ${template.name}`, id: template.id };
  }

  if (action.type === "add_exercise_to_template") {
    const template = await prisma.workoutTemplate.findFirst({
      where: { userId, name: { contains: action.templateName } },
      include: { exercises: true },
    });
    if (!template) return { type: action.type, label: `Could not find ${action.templateName}`, id: action.templateName };
    const exercise = await findOrCreateExercise({ exerciseName: action.exerciseName, muscleGroup: action.muscleGroup });
    await prisma.workoutExercise.create({
      data: {
        workoutTemplateId: template.id,
        exerciseId: exercise.id,
        sets: Math.round(toNumber(action.sets, 3)),
        reps: action.reps || "8-12",
        restSeconds: Math.round(toNumber(action.restSeconds, 90)),
        orderIndex: template.exercises.length,
      },
    });
    return { type: action.type, label: `Added ${exercise.name} to ${template.name}`, id: template.id };
  }

  if (action.type === "delete_workout_template") {
    const template = await prisma.workoutTemplate.findFirst({
      where: { userId, name: { contains: action.templateName } },
    });
    if (!template) return { type: action.type, label: `Could not find ${action.templateName}`, id: action.templateName };
    await prisma.workoutTemplate.delete({ where: { id: template.id } });
    return { type: action.type, label: `Deleted ${template.name}`, id: template.id };
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
    return { type: action.type, label: `Created diet plan ${plan.name}`, id: plan.id };
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

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }
    const userId = (session.user as any)?.id;
    const messages = await prisma.chatMessage.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
      take: 50,
    });
    return new Response(JSON.stringify({ messages }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error?.message ?? "Failed" }), { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    const userId = (session.user as any)?.id;
    const { message, imageDataUrl } = await req.json();
    const hasImage = isDataImageUrl(imageDataUrl);
    if (!message && !hasImage) {
      return new Response(JSON.stringify({ error: "Message or image required" }), { status: 400 });
    }

    await prisma.chatMessage.create({
      data: {
        userId,
        role: "user",
        content: hasImage ? `${message || "Analyze this food photo."}\n[Food photo attached]` : message,
      },
    });

    const today = new Date();
    const startOfDay = new Date(today);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(today);
    endOfDay.setHours(23, 59, 59, 999);

    const [profile, todayFoodLogs, recentWorkouts, recentProgress, exercises, workoutTemplates, dietPlans, recentSpends, financeProfile, bankAccounts, creditCards, moneyLinks, recentChat] =
      await Promise.all([
        prisma.userProfile.findUnique({ where: { userId } }),
        prisma.foodLog.findMany({
          where: { userId, date: { gte: startOfDay, lte: endOfDay } },
          orderBy: { createdAt: "asc" },
        }),
        prisma.workoutLog.findMany({
          where: { userId },
          include: { exerciseLogs: { include: { exercise: true } } },
          orderBy: { date: "desc" },
          take: 5,
        }),
        prisma.progressEntry.findMany({
          where: { userId },
          orderBy: { date: "desc" },
          take: 5,
        }),
        prisma.exercise.findMany({
          orderBy: { name: "asc" },
          select: { id: true, name: true, muscleGroup: true },
        }),
        prisma.workoutTemplate.findMany({
          where: { userId },
          include: { exercises: { include: { exercise: true }, orderBy: { orderIndex: "asc" } } },
          orderBy: { createdAt: "asc" },
        }),
        prisma.dietPlan.findMany({
          where: { userId },
          orderBy: { updatedAt: "desc" },
          take: 10,
        }),
        prisma.spend.findMany({
          where: { userId },
          include: { creditCard: true },
          orderBy: { date: "desc" },
          take: 20,
        }),
        prisma.financeProfile.findUnique({ where: { userId } }),
        prisma.bankAccount.findMany({
          where: { userId, active: true },
          orderBy: { createdAt: "desc" },
        }),
        prisma.creditCard.findMany({
          where: { userId, active: true },
          orderBy: { createdAt: "desc" },
        }),
        prisma.moneyLink.findMany({
          where: { userId },
          orderBy: [{ settled: "asc" }, { date: "desc" }],
          take: 20,
        }),
        prisma.chatMessage.findMany({
          where: { userId },
          orderBy: { createdAt: "desc" },
          take: 10,
        }),
      ]);

    if (isWorkoutPlanIntent(message) && !hasKnownAnswer(profile?.healthLimitations)) {
      const content =
        "Before I build a workout plan, do you have any joint pain, previous fractures, surgeries, injuries, or medical restrictions? If none, say “none.”";
      await prisma.chatMessage.create({ data: { userId, role: "assistant", content } });
      return streamSingleMessage(content);
    }

    if (isFoodPlanIntent(message) && !hasKnownAnswer(profile?.foodAllergies)) {
      const content =
        "Before I suggest a food or meal plan, do you have any food allergies, intolerances, or foods you avoid? If none, say “none.”";
      await prisma.chatMessage.create({ data: { userId, role: "assistant", content } });
      return streamSingleMessage(content);
    }

    const systemPrompt = `You are Dayza Agent, an AI assistant inside a daily fitness, nutrition, spends, reminders, and progress dashboard.

You can answer questions and, when the user clearly asks you to do it, perform these actions:
- create_exercise: add a new exercise to the exercise library.
- create_food_log: log a meal or snack.
- create_progress_entry: save body weight, measurements, or progress notes.
- create_spend_log: log a purchase, payment, receipt, or expense.
- update_spend_target: update the user's monthly spend target.
- update_finance_profile: update current balance and/or total amount in Spends.
- create_bank_account: add a bank account with balance.
- create_credit_card: add a credit card with optional bank, current payable amount, and due day.
- create_money_link: track money lent to someone or borrowed from someone.
- create_workout_log: save a completed workout. Only use exercise IDs that appear in context.
- create_sleep_log: save sleep from a sleep screenshot or manual sleep message.
- update_wellness_targets: update personalized Health/Fitness targets when the screenshot clearly shows current goals, averages, or repeated actuals that justify better targets.
- update_profile_safety: save health limitations and/or food allergies after the user answers safety questions.
- create_workout_template: create a workout day after the user confirms a draft plan. You may use exerciseName for missing exercises; the app will create them first.
- remove_exercise_from_template: remove an exercise from an existing workout day/template.
- add_exercise_to_template: add an exercise to an existing workout day/template. You may use exerciseName for missing exercises.
- delete_workout_template: delete a complete workout day/program when the user clearly asks to delete/remove that program/day.
- create_diet_plan: create a saved diet plan inside Nutrition > Diet after the user asks for a diet or gives a diet to save.
- update_diet_plan: edit a saved diet plan when the user asks to modify meals/foods/macros.
- delete_diet_plan: delete a saved diet plan when clearly requested.
- When the user sends a food image, identify the food and estimate nutrition from the visible portion.
- When the user sends a payment/receipt/spend screenshot, extract merchant, amount, currency, category, and date when visible.
- When the user sends a sleep screenshot, read total sleep and stages, then log sleep.
- When the user sends fitness/activity screenshots, extract visible daily/weekly goals or averages and update relevant targets.

Rules:
- Do not create entries unless the user clearly requests logging/saving/recording/tracking.
- Use the dashboard profile when answering personalized questions. If age, height, weight, gender, activity level, or goal are needed and missing from profile/context, ask for the missing fields instead of guessing.
- For calorie, macro, BMI, body-weight, recovery, and training-plan questions, explicitly base the answer on available profile fields such as age, height, weight, activityLevel, and goal.
- Workout plan safety flow:
  1. If user asks for a workout plan and profile.healthLimitations is missing, first ask whether they have joint pain, previous fractures, surgeries, injuries, or medical restrictions. Do not draft yet.
  2. When they answer, save it with update_profile_safety. If they answer only the health question, continue to ask plan days/focus in the same response when clear.
  3. Ask how many days they prefer: 3, 4, 5, or custom.
  4. Ask whether they want full body or particular muscle focus. If particular muscles, ask which muscles.
  5. Draft only a short weekly split and ask for confirmation. Do not create workout templates until they say proceed/confirm/create/save/looks good.
  6. If they request changes, update the draft and ask for confirmation again.
  7. After confirmation, create workout templates with exercises for each non-rest day. Create missing exercises first by using exerciseName in create_workout_template.
- Exercise selection rules for workout plans:
  - When drafting a plan with exercises, include at least 2 exercises for each muscle/focus listed on that day.
  - Keep exercises simple, effective, and easy to perform with common gym equipment.
  - Prefer reliable basics over novelty: machine presses, dumbbell presses, rows, pulldowns, lateral raises, curls, pushdowns, leg press, Romanian deadlift, hip thrust, leg curl, calf raise, planks, cable woodchops.
  - Avoid overcomplicating with too many advanced or high-skill movements unless the user specifically asks.
  - Sets/reps should be practical: mostly 3 sets of 8-12 reps, isolation 10-15 reps, core 30-60 seconds or 10-15 reps.
  - If healthLimitations exist, choose pain-free alternatives first. Health compatibility is more important than the default split.
  - Do not include an exercise that conflicts with known pain/surgery/fracture context unless you clearly provide a safer modification.
- Joint-aware plan rules:
  - If profile.healthLimitations mentions joint pain, elbow pain, knee pain, fractures, surgery, or injuries, the workout draft must visibly adapt to that limitation.
  - For elbow pain: avoid or replace aggravating skull crushers, heavy straight-bar curls, and painful rope pushdowns. Prefer neutral-grip pressing, machine chest press, hammer curls only if pain-free, cross-body cable extensions, straight-bar pushdowns if rope hurts, and controlled pulling without excessive grip tension.
  - For knee pain: avoid deep painful knee flexion, high-impact jumps, and aggressive squat depth. Prefer hip-dominant work like Romanian deadlifts and hip thrusts, controlled leg curls, and leg press only with higher foot placement and pain-free depth.
  - Always include a concise safety note when joint limitations exist: warm up 5-10 minutes, use slow 3-second eccentrics, and follow the 2/10 pain rule.
  - If the limitation is vague, ask how long the pain has been present and whether it flares at the beginning or end of workouts before finalizing.
  - Treat generated exercises as adjustable options, not fixed laws. If an exercise hurts, offer swaps before saving the final plan.
- Use these weekly split presets unless the user asks for custom or modifications:
${JSON.stringify({
  muscle_gain: {
    "3_day_split": { Monday: ["Chest", "Triceps", "Shoulders"], Tuesday: "Rest", Wednesday: ["Back", "Biceps", "Forearms"], Thursday: "Rest", Friday: ["Quads", "Hamstrings", "Calves"], Saturday: "Rest", Sunday: "Rest" },
    "4_day_split": { Monday: ["Chest", "Triceps"], Tuesday: ["Back", "Biceps"], Wednesday: "Rest", Thursday: ["Shoulders", "Abs"], Friday: ["Quads", "Hamstrings", "Calves"], Saturday: "Rest", Sunday: "Rest" },
    "5_day_split": { Monday: ["Chest"], Tuesday: ["Back"], Wednesday: ["Shoulders"], Thursday: ["Legs"], Friday: ["Arms", "Abs"], Saturday: "Rest", Sunday: "Rest" },
  },
  fat_loss: {
    "3_day_split": { Monday: ["Full Body", "Cardio"], Tuesday: "Rest", Wednesday: ["Full Body", "Cardio"], Thursday: "Rest", Friday: ["Full Body", "Cardio"], Saturday: "Rest", Sunday: "Rest" },
    "4_day_split": { Monday: ["Upper Body", "HIIT"], Tuesday: ["Lower Body", "Abs"], Wednesday: "Rest", Thursday: ["Upper Body", "HIIT"], Friday: ["Lower Body", "Abs"], Saturday: "Rest", Sunday: "Rest" },
    "5_day_split": { Monday: ["Push Muscles", "Cardio"], Tuesday: ["Pull Muscles", "Cardio"], Wednesday: ["Legs", "Abs"], Thursday: ["Full Body Circuit"], Friday: ["Steady State Cardio", "Abs"], Saturday: "Rest", Sunday: "Rest" },
  },
  strength: {
    "3_day_split": { Monday: ["Squat", "Bench Press", "Accessory Muscles"], Tuesday: "Rest", Wednesday: ["Deadlift", "Overhead Press", "Accessory Muscles"], Thursday: "Rest", Friday: ["Squat", "Bench Press", "Power Cleans"], Saturday: "Rest", Sunday: "Rest" },
    "4_day_split": { Monday: ["Bench Press", "Chest", "Triceps"], Tuesday: ["Deadlift", "Back", "Biceps"], Wednesday: "Rest", Thursday: ["Overhead Press", "Shoulders", "Abs"], Friday: ["Squat", "Quads", "Hamstrings"], Saturday: "Rest", Sunday: "Rest" },
    "5_day_split": { Monday: ["Max Effort Upper Body"], Tuesday: ["Max Effort Lower Body"], Wednesday: "Rest", Thursday: ["Dynamic Effort Upper Body"], Friday: ["Dynamic Effort Lower Body"], Saturday: ["Accessory Movements", "Grip Strength"], Sunday: "Rest" },
  },
  general_fitness_cardio: {
    "3_day_split": { Monday: ["Full Body Strength"], Tuesday: "Rest", Wednesday: ["Zone 2 Cardio", "Endurance"], Thursday: "Rest", Friday: ["Mobility", "Light Resistance Training"], Saturday: "Rest", Sunday: "Rest" },
    "4_day_split": { Monday: ["Cardio Intervals"], Tuesday: ["Upper Body Strength"], Wednesday: "Rest", Thursday: ["Lower Body Strength"], Friday: ["Long Distance Cardio"], Saturday: "Rest", Sunday: "Rest" },
    "5_day_split": { Monday: ["Aerobic Cardio"], Tuesday: ["Full Body Strength"], Wednesday: ["HIIT", "Core"], Thursday: ["Active Recovery", "Yoga"], Friday: ["Full Body Strength"], Saturday: "Rest", Sunday: "Rest" },
  },
})}
- Food safety flow: if user asks for diet/meal/food plan and profile.foodAllergies is missing, first ask whether they have food allergies, intolerances, or avoided foods. Save their answer with update_profile_safety before giving food plans.
- Diet plan rules:
  - Diet plans should be structured as Breakfast, Snack, Lunch, Evening Snack, Dinner by default, unless the user asks for different timing.
  - Use the user's profile targets, goal, and foodAllergies. Avoid any allergy or avoided food.
  - Keep meals simple, practical, and easy to prepare.
  - If the user provides a diet, save it using create_diet_plan or update_diet_plan instead of only describing it.
  - If editing a diet, update the actual saved diet plan when the target plan is clear. Ask which diet if unclear.
  - If the user asks to log/add/eat a meal from their saved diet, find the matching dietPlans meal by mealType/title and use create_food_log with that meal's calories/macros.
  - Examples: "log my diet breakfast", "add lunch from my diet", "I ate the evening snack from my diet". These should create food logs, not just explain the diet.
  - If multiple diet plans or meals could match, ask which diet/meal to use.
- If the user asks to log multiple workouts or create multiple workout days, complete all requested tasks. If an exercise is missing, create it first and continue the log/template action.
- If the user asks to remove an exercise from a plan and does not provide a replacement, remove it and ask what they want to add instead. If they provide a replacement, remove and add in the same response.
- If the user asks to delete a full workout program/day, use delete_workout_template only when the target name/day is clear. If unclear, ask which program to delete.
- If the user asks to modify a workout program, use remove_exercise_from_template and add_exercise_to_template as needed. Do not just describe the change when the request is actionable.
- If the user asks you to add an exercise, use create_exercise. Choose the best muscleGroup from: chest, back, shoulders, legs, arms, core.
- For create_exercise, ask a follow-up only if the exercise name is unclear. Otherwise use sensible defaults for equipment/category.
- A food image by itself counts as a request to identify and log the food if the food and approximate portion are clear.
- If the image has multiple possible foods, unclear portion size, hidden ingredients, or low confidence, ask for quantity/serving details instead of logging.
- If you log food from an image, mention that calories/macros are estimates from the photo.
- A payment, receipt, bank, UPI, card, or wallet screenshot counts as a request to log a spend only if merchant/payee and amount are clear.
- For spend screenshots, use create_spend_log when merchant/payee and amount are clear. Use INR for Indian rupees, USD only when dollars are visible or implied.
- If the spend screenshot is missing merchant, amount, category, or whether it was a transfer vs purchase, ask one short follow-up question instead of logging.
- Choose practical spend categories such as Food, Groceries, Travel, Shopping, Health, Fitness, Bills, Subscriptions, Entertainment, or Other.
- If the user asks to set/change monthly spending budget/limit/target, use update_spend_target.
- If the user asks to save current balance or total amount, use update_finance_profile.
- If the user asks to add a bank account or save a bank balance, use create_bank_account when it is a new account. Ask only if the account name is missing.
- If the user asks to add a credit card, use create_credit_card. Ask only if the card name is missing.
- If the user logs a spend and says it was on a saved credit card, include creditCardName so the spend is attached to that card.
- If the user says they lent money to someone or borrowed money from someone, use create_money_link with linkType "lend" or "borrow".
- If the user asks about spending history, answer from recentSpends and ask them to use the Spends custom date report for exact older ranges when needed.
- For spend and money questions, summarize balances, card dues/spends, lend/borrow totals, top categories, and patterns using INR when context exists.
- For sleep screenshots, extract date, total sleep, Awake, REM, Core, and Deep when visible. Convert hours/minutes to minutes.
- If a sleep screenshot has total sleep visible, use create_sleep_log. If stages are not visible, log total only.
- For sleep screenshots, also use update_wellness_targets with targetSleepMinutes when the screenshot shows a sleep goal or a reliable typical sleep duration.
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
{"type":"create_food_log","foodName":"Chicken breast","mealType":"lunch","servingSize":"200g","calories":330,"protein":62,"carbs":0,"fat":7,"fiber":0}
{"type":"create_progress_entry","weight":80.5,"notes":"Felt strong today"}
{"type":"create_spend_log","merchant":"Swiggy","amount":420,"currency":"INR","category":"Food","notes":"Logged from payment screenshot."}
{"type":"create_spend_log","merchant":"Amazon","amount":1499,"currency":"INR","category":"Shopping","creditCardName":"HDFC Regalia","notes":"Logged on credit card."}
{"type":"update_spend_target","targetMonthlySpend":25000,"reason":"User asked to set monthly budget."}
{"type":"update_finance_profile","currentBalance":35000,"totalAmount":120000}
{"type":"create_bank_account","name":"Salary Account","bankName":"HDFC","accountType":"savings","last4":"4567","balance":35000,"currency":"INR"}
{"type":"create_credit_card","name":"HDFC Regalia","bankName":"HDFC","last4":"1234","currentDue":12000,"dueDay":5}
{"type":"create_money_link","person":"Rahul","linkType":"lend","amount":2000,"currency":"INR","notes":"To return next week."}
{"type":"create_workout_log","templateName":"Push Day","duration":60,"notes":"Good session","exercises":[{"exerciseId":"barbell-bench-press","setNumber":1,"reps":8,"weight":70}]}
{"type":"create_sleep_log","date":"2026-05-12","totalMinutes":452,"awakeMinutes":45,"remMinutes":100,"coreMinutes":294,"deepMinutes":58}
{"type":"update_wellness_targets","targetSleepMinutes":452,"targetSteps":9000,"targetActiveEnergy":550,"targetExerciseMinutes":45,"targetWorkoutSessions":4,"targetTrainingMinutes":220,"targetWeeklyActiveEnergy":2800,"reason":"Matched visible screenshot goals and recent averages."}
{"type":"update_profile_safety","healthLimitations":"None","foodAllergies":"Peanuts"}
{"type":"create_workout_template","name":"Monday - Chest & Triceps","dayOfWeek":"Monday","muscleGroups":"chest,arms","exercises":[{"exerciseName":"Barbell Bench Press","muscleGroup":"chest","sets":4,"reps":"6-8"},{"exerciseName":"Rope Pushdown","muscleGroup":"arms","sets":3,"reps":"10-12"}]}
{"type":"remove_exercise_from_template","templateName":"Monday - Chest","exerciseName":"Skull Crushers"}
{"type":"add_exercise_to_template","templateName":"Monday - Chest","exerciseName":"Rope Pushdown","muscleGroup":"arms","sets":3,"reps":"10-12"}
{"type":"delete_workout_template","templateName":"Monday - Chest"}
{"type":"create_diet_plan","name":"Muscle Gain Diet","goal":"muscle_gain","notes":"Avoids peanuts.","meals":[{"mealType":"Breakfast","title":"Oats and eggs","foods":["Oats","Eggs","Banana"],"calories":600,"protein":35,"carbs":75,"fat":18},{"mealType":"Snack","title":"Greek yogurt bowl","foods":["Greek yogurt","Berries"],"calories":250,"protein":22,"carbs":30,"fat":4},{"mealType":"Lunch","title":"Chicken rice bowl","foods":["Chicken breast","Rice","Vegetables"],"calories":700,"protein":50,"carbs":80,"fat":15},{"mealType":"Evening Snack","title":"Protein shake","foods":["Whey protein","Milk"],"calories":250,"protein":30,"carbs":15,"fat":6},{"mealType":"Dinner","title":"Salmon and potato","foods":["Salmon","Sweet potato","Salad"],"calories":650,"protein":42,"carbs":55,"fat":24}]}
{"type":"update_diet_plan","planName":"Muscle Gain Diet","meals":[{"mealType":"Breakfast","title":"Oats and eggs","foods":["Oats","Eggs"],"calories":520,"protein":32,"carbs":55,"fat":18}]}
{"type":"delete_diet_plan","planName":"Muscle Gain Diet"}`;

    const context = {
      profile,
      todayFoodLogs,
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
      requiresJointAwarePlan: isJointSensitive(profile?.healthLimitations),
      today: today.toISOString(),
    };
    const userContent = hasImage
      ? [
          {
            type: "text",
            text:
              message ||
              "Analyze this image. If it is a food photo, identify and log the food when confident. If it is a payment or receipt screenshot, log the spend when merchant and amount are clear. If it is a sleep or fitness screenshot, extract visible totals/goals, log the activity or sleep, and update personalized targets when the screenshot clearly supports them.",
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
          ...recentChat.reverse().map((m: any) => ({
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
    const actionResults = [];
    for (const action of actions) {
      const result = await executeAgentAction(userId, action);
      if (result) actionResults.push(result);
    }

    const actionSummary =
      actionResults.length > 0
        ? `\n\nActions completed:\n${actionResults.map((result) => `- ${result.label}`).join("\n")}`
        : "";
    const fullContent = `${agentResult.response ?? "Done."}${actionSummary}`;

    await prisma.chatMessage.create({
      data: { userId, role: "assistant", content: fullContent },
    });

    const stream = new ReadableStream({
      async start(controller) {
        await writeSse(controller, { content: fullContent });
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
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error?.message ?? "Chat failed" }), { status: 500 });
  }
}
