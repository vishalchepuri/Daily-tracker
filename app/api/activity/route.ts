export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { listRecentAssistantChatMessages } from "@/lib/firestore-chat";

function formatAmount(currency: string | null | undefined, value: number | null | undefined) {
  if (value == null) return undefined;
  return `${currency || "INR"} ${Number(value).toFixed(0)}`;
}

export async function GET() {
  try {
    const user = await requireCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = user.id;
    const activitySince = new Date();
    activitySince.setDate(activitySince.getDate() - 30);

    const [spends, moneyLinks, workouts, foodLogs, progressEntries, reminders, medicationLogs, chatMessages] = await Promise.all([
      prisma.spend.findMany({
        where: { userId, createdAt: { gte: activitySince } },
        orderBy: { createdAt: "desc" },
        take: 12,
        select: { id: true, merchant: true, amount: true, currency: true, category: true, createdAt: true },
      }),
      prisma.moneyLink.findMany({
        where: { userId, updatedAt: { gte: activitySince } },
        orderBy: { updatedAt: "desc" },
        take: 12,
        select: { id: true, person: true, type: true, amount: true, currency: true, settled: true, updatedAt: true },
      }),
      prisma.workoutLog.findMany({
        where: { userId, createdAt: { gte: activitySince } },
        orderBy: { createdAt: "desc" },
        take: 12,
        select: { id: true, templateName: true, duration: true, createdAt: true, exerciseLogs: { select: { id: true } } },
      }),
      prisma.foodLog.findMany({
        where: { userId, createdAt: { gte: activitySince } },
        orderBy: { createdAt: "desc" },
        take: 12,
        select: { id: true, foodName: true, mealType: true, calories: true, protein: true, createdAt: true },
      }),
      prisma.progressEntry.findMany({
        where: { userId, createdAt: { gte: activitySince } },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: { id: true, weight: true, notes: true, createdAt: true },
      }),
      prisma.reminder.findMany({
        where: { userId, updatedAt: { gte: activitySince } },
        orderBy: { updatedAt: "desc" },
        take: 12,
        select: { id: true, title: true, completed: true, dueDate: true, updatedAt: true },
      }),
      prisma.medicationLog.findMany({
        where: { userId, createdAt: { gte: activitySince } },
        orderBy: { createdAt: "desc" },
        take: 12,
        select: { id: true, status: true, scheduledFor: true, createdAt: true, medication: { select: { name: true } } },
      }),
      listRecentAssistantChatMessages(userId, activitySince, 10),
    ]);

    const items = [
      ...spends.map((item) => ({
        id: `spend-${item.id}`,
        type: "spend",
        title: item.merchant,
        detail: item.category ? `${item.category} expense` : "Expense logged",
        amount: formatAmount(item.currency, item.amount),
        href: "/spends",
        at: item.createdAt.toISOString(),
      })),
      ...moneyLinks.map((item) => ({
        id: `money-${item.id}`,
        type: "money",
        title: `${item.type === "borrow" ? "Borrowed from" : "Lent to"} ${item.person}`,
        detail: item.settled ? "Settled" : "Open",
        amount: formatAmount(item.currency, item.amount),
        href: "/spends",
        at: item.updatedAt.toISOString(),
      })),
      ...workouts.map((item) => ({
        id: `workout-${item.id}`,
        type: "workout",
        title: item.templateName || "Workout logged",
        detail: `${item.exerciseLogs.length} sets${item.duration ? `, ${item.duration} min` : ""}`,
        href: "/workouts",
        at: item.createdAt.toISOString(),
      })),
      ...foodLogs.map((item) => ({
        id: `food-${item.id}`,
        type: "food",
        title: item.foodName,
        detail: `${item.mealType} - ${Math.round(item.calories)} cal - ${Math.round(item.protein)}g protein`,
        href: "/nutrition",
        at: item.createdAt.toISOString(),
      })),
      ...progressEntries.map((item) => ({
        id: `progress-${item.id}`,
        type: "progress",
        title: item.weight ? `Progress logged: ${item.weight} kg` : "Progress logged",
        detail: item.notes || "Body measurement update",
        href: "/progress",
        at: item.createdAt.toISOString(),
      })),
      ...reminders.map((item) => ({
        id: `reminder-${item.id}`,
        type: "reminder",
        title: item.title,
        detail: item.completed ? "Completed reminder" : item.dueDate ? `Due ${item.dueDate.toISOString()}` : "Reminder updated",
        href: "/reminders",
        at: item.updatedAt.toISOString(),
      })),
      ...medicationLogs.map((item) => ({
        id: `medication-${item.id}`,
        type: "medication",
        title: item.medication?.name || "Medication",
        detail: `${item.status} - scheduled ${item.scheduledFor.toISOString()}`,
        href: "/medications",
        at: item.createdAt.toISOString(),
      })),
      ...chatMessages.map((item) => ({
        id: `agent-${item.id}`,
        type: "agent",
        title: "Dayza Agent replied",
        detail: item.content.replace(/\s+/g, " ").slice(0, 140),
        href: "/chat",
        at: item.createdAt.toISOString(),
      })),
    ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, 80);

    const counts = items.reduce<Record<string, number>>((acc, item) => {
      acc[item.type] = (acc[item.type] ?? 0) + 1;
      return acc;
    }, {});

    return NextResponse.json({ items, counts, retentionDays: 30 });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Failed" }, { status: 500 });
  }
}
