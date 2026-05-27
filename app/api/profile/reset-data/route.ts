export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireCurrentUser } from "@/lib/auth";
import { deleteAllFirestoreChatData } from "@/lib/firestore-chat";

const RESET_FEATURES = [
  "profile",
  "nutrition",
  "workouts",
  "spends",
  "reminders",
  "medications",
  "progress",
  "agent",
  "reviews",
  "integrations",
] as const;

type ResetFeature = (typeof RESET_FEATURES)[number];

function normalizeFeatures(value: unknown): ResetFeature[] {
  if (!Array.isArray(value)) return [];
  const allowed = new Set<string>(RESET_FEATURES);
  return Array.from(new Set(value.map(String).filter((item) => allowed.has(item)))) as ResetFeature[];
}

async function resetFeature(tx: Prisma.TransactionClient, userId: string, feature: ResetFeature): Promise<Record<string, number>> {
  if (feature === "profile") {
    const result = await tx.userProfile.deleteMany({ where: { userId } });
    return { userProfile: result.count };
  }

  if (feature === "nutrition") {
    const [foodLogs, waterLogs, dietPlans] = await Promise.all([
      tx.foodLog.deleteMany({ where: { userId } }),
      tx.waterLog.deleteMany({ where: { userId } }),
      tx.dietPlan.deleteMany({ where: { userId } }),
    ]);
    return { foodLogs: foodLogs.count, waterLogs: waterLogs.count, dietPlans: dietPlans.count };
  }

  if (feature === "workouts") {
    const exerciseLogs = await tx.exerciseLog.deleteMany({ where: { workoutLog: { userId } } });
    const workoutLogs = await tx.workoutLog.deleteMany({ where: { userId } });
    const workoutExercises = await tx.workoutExercise.deleteMany({ where: { workoutTemplate: { userId } } });
    const workoutTemplates = await tx.workoutTemplate.deleteMany({ where: { userId } });
    return {
      exerciseLogs: exerciseLogs.count,
      workoutLogs: workoutLogs.count,
      workoutExercises: workoutExercises.count,
      workoutTemplates: workoutTemplates.count,
    };
  }

  if (feature === "spends") {
    const spends = await tx.spend.deleteMany({ where: { userId } });
    const moneyLinks = await tx.moneyLink.deleteMany({ where: { userId } });
    const financeProfile = await tx.financeProfile.deleteMany({ where: { userId } });
    const bankAccounts = await tx.bankAccount.deleteMany({ where: { userId } });
    const creditCards = await tx.creditCard.deleteMany({ where: { userId } });
    return {
      spends: spends.count,
      moneyLinks: moneyLinks.count,
      financeProfiles: financeProfile.count,
      bankAccounts: bankAccounts.count,
      creditCards: creditCards.count,
    };
  }

  if (feature === "reminders") {
    const reminders = await tx.reminder.deleteMany({ where: { userId } });
    const reminderLists = await tx.reminderList.deleteMany({ where: { userId } });
    return { reminders: reminders.count, reminderLists: reminderLists.count };
  }

  if (feature === "medications") {
    const medicationLogs = await tx.medicationLog.deleteMany({ where: { userId } });
    const medications = await tx.medication.deleteMany({ where: { userId } });
    return { medicationLogs: medicationLogs.count, medications: medications.count };
  }

  if (feature === "progress") {
    const [progressEntries, progressPhotos] = await Promise.all([
      tx.progressEntry.deleteMany({ where: { userId } }),
      tx.progressPhoto.deleteMany({ where: { userId } }),
    ]);
    return { progressEntries: progressEntries.count, progressPhotos: progressPhotos.count };
  }

  if (feature === "agent") {
    const firestoreDeleted = await deleteAllFirestoreChatData(userId);
    return firestoreDeleted;
  }

  if (feature === "reviews") {
    const [reviewItems, issueReports] = await Promise.all([
      tx.reviewItem.deleteMany({ where: { userId } }),
      tx.issueReport.deleteMany({ where: { userId } }),
    ]);
    return { reviewItems: reviewItems.count, issueReports: issueReports.count };
  }

  const [accounts, profileUpdate] = await Promise.all([
    tx.account.deleteMany({ where: { userId } }),
    tx.userProfile.updateMany({
      where: { userId },
      data: { telegramChatId: null, telegramEnabled: false },
    }),
  ]);
  return { connectedAccounts: accounts.count, telegramProfiles: profileUpdate.count };
}

export async function POST(req: Request) {
  const user = await requireCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const features = normalizeFeatures(body?.features);
    if (features.length === 0) {
      return NextResponse.json({ error: "Select at least one feature to reset" }, { status: 400 });
    }

    const deleted = await prisma.$transaction(async (tx) => {
      const results: Record<string, Record<string, number>> = {};
      for (const feature of features) {
        results[feature] = await resetFeature(tx, user.id, feature);
      }
      return results;
    });

    return NextResponse.json({ ok: true, features, deleted });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Failed to reset selected data" }, { status: 500 });
  }
}
