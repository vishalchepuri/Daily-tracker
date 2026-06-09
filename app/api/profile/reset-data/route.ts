export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireCurrentUser } from "@/lib/auth";
import { deleteAllFirestoreChatData } from "@/lib/firestore-chat";
import { deleteFoodMicronutrientLogsForUser, deleteIssueReportsForUser, deleteProgressPhotoMetadata, deleteReviewItemsForUser } from "@/lib/firestore-app-data";

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

async function resetFeature(userId: string, feature: ResetFeature): Promise<Record<string, number>> {
  if (feature === "profile") {
    const result = await prisma.userProfile.deleteMany({ where: { userId } });
    return { userProfile: result.count };
  }

  if (feature === "nutrition") {
    const foodLogs = await prisma.foodLog.deleteMany({ where: { userId } });
    const waterLogs = await prisma.waterLog.deleteMany({ where: { userId } });
    const dietPlans = await prisma.dietPlan.deleteMany({ where: { userId } });
    const micronutrientLogs = await deleteFoodMicronutrientLogsForUser(userId);
    return { foodLogs: foodLogs.count, waterLogs: waterLogs.count, dietPlans: dietPlans.count, micronutrientLogs };
  }

  if (feature === "workouts") {
    const exerciseLogs = await prisma.exerciseLog.deleteMany({ where: { workoutLog: { userId } } });
    const workoutLogs = await prisma.workoutLog.deleteMany({ where: { userId } });
    const workoutExercises = await prisma.workoutExercise.deleteMany({ where: { workoutTemplate: { userId } } });
    const workoutTemplates = await prisma.workoutTemplate.deleteMany({ where: { userId } });
    return {
      exerciseLogs: exerciseLogs.count,
      workoutLogs: workoutLogs.count,
      workoutExercises: workoutExercises.count,
      workoutTemplates: workoutTemplates.count,
    };
  }

  if (feature === "spends") {
    const spends = await prisma.spend.deleteMany({ where: { userId } });
    const moneyLinks = await prisma.moneyLink.deleteMany({ where: { userId } });
    const bankTransfers = await prisma.bankTransfer.deleteMany({ where: { userId } });
    const financeProfile = await prisma.financeProfile.deleteMany({ where: { userId } });
    const bankAccounts = await prisma.bankAccount.deleteMany({ where: { userId } });
    const creditCards = await prisma.creditCard.deleteMany({ where: { userId } });
    return {
      spends: spends.count,
      moneyLinks: moneyLinks.count,
      bankTransfers: bankTransfers.count,
      financeProfiles: financeProfile.count,
      bankAccounts: bankAccounts.count,
      creditCards: creditCards.count,
    };
  }

  if (feature === "reminders") {
    const reminders = await prisma.reminder.deleteMany({ where: { userId } });
    const reminderLists = await prisma.reminderList.deleteMany({ where: { userId } });
    return { reminders: reminders.count, reminderLists: reminderLists.count };
  }

  if (feature === "medications") {
    const medicationLogs = await prisma.medicationLog.deleteMany({ where: { userId } });
    const medications = await prisma.medication.deleteMany({ where: { userId } });
    return { medicationLogs: medicationLogs.count, medications: medications.count };
  }

  if (feature === "progress") {
    const progressEntries = await prisma.progressEntry.deleteMany({ where: { userId } });
    const progressPhotos = await deleteProgressPhotoMetadata(userId);
    return { progressEntries: progressEntries.count, progressPhotos };
  }

  if (feature === "agent") {
    const firestoreDeleted = await deleteAllFirestoreChatData(userId);
    return firestoreDeleted;
  }

  if (feature === "reviews") {
    const [reviewItems, issueReports] = await Promise.all([
      deleteReviewItemsForUser(userId),
      deleteIssueReportsForUser(userId),
    ]);
    return { reviewItems, issueReports };
  }

  const accounts = await prisma.account.deleteMany({ where: { userId } });
  const profileUpdate = await prisma.userProfile.updateMany({
      where: { userId },
      data: { telegramChatId: null, telegramEnabled: false },
  });
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

    const deleted: Record<string, Record<string, number>> = {};
    for (const feature of features) {
      deleted[feature] = await resetFeature(user.id, feature);
    }

    return NextResponse.json({ ok: true, features, deleted });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Failed to reset selected data" }, { status: 500 });
  }
}
