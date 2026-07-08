export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { sendPushToUser } from "@/lib/web-push";
import { isMedicationDueOn, isMedicationTimeDueNow } from "@/lib/medication-schedule";
import { DEFAULT_TIME_ZONE, formatAppTime, getZonedDateParts, normalizeTimeZone } from "@/lib/local-dates";

function isCronAuthorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

function minutesFromTime(value?: string | null) {
  const match = /^(\d{2}):(\d{2})$/.exec(String(value ?? ""));
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function inQuietHours(profile: any, date = new Date()) {
  const start = minutesFromTime(profile?.notificationQuietStart);
  const end = minutesFromTime(profile?.notificationQuietEnd);
  if (start == null || end == null || start === end) return false;
  const now = getZonedDateParts(date, normalizeTimeZone(profile?.timeZone ?? DEFAULT_TIME_ZONE)).minuteOfDay;
  return start < end ? now >= start && now < end : now >= start || now < end;
}

async function dispatchPush(req: Request) {
  try {
    const authedUser = await requireCurrentUser();
    const cronMode = !authedUser && isCronAuthorized(req);

    if (!authedUser && !cronMode) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const now = new Date();
    const reminders = await prisma.reminder.findMany({
      where: {
        completed: false,
        dueDate: { lte: now },
        user: {
          webPushSubscriptions: { some: {} },
        },
        ...(cronMode ? {} : { userId: authedUser!.id }),
      },
      include: {
        list: true,
        user: {
          select: {
            id: true,
            name: true,
            profile: {
              select: {
                timeZone: true,
                notificationQuietStart: true,
                notificationQuietEnd: true,
                notifyReminders: true,
              },
            },
          },
        },
      },
      orderBy: { dueDate: "asc" },
      take: cronMode ? 50 : 10,
    });

    const medications = await prisma.medication.findMany({
      where: {
        active: true,
        user: {
          webPushSubscriptions: { some: {} },
        },
        ...(cronMode ? {} : { userId: authedUser!.id }),
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            profile: {
              select: {
                timeZone: true,
                notificationQuietStart: true,
                notificationQuietEnd: true,
                notifyMedications: true,
                notifyRefills: true,
              },
            },
          },
        },
      },
      orderBy: [{ timeOfDay: "asc" }, { createdAt: "desc" }],
    });

    const logWindowStart = new Date(now.getTime() - 48 * 60 * 60 * 1000);
    const logWindowEnd = new Date(now.getTime() + 6 * 60 * 60 * 1000);
    const medicationLogs = await prisma.medicationLog.findMany({
      where: {
        userId: cronMode ? undefined : authedUser!.id,
        scheduledFor: {
          gte: logWindowStart,
          lte: logWindowEnd,
        },
      },
      select: {
        medicationId: true,
        status: true,
        scheduledFor: true,
      },
    });

    let sent = 0;
    let reminderCount = 0;
    let medicationCount = 0;
    let refillCount = 0;

    for (const reminder of reminders) {
      const lastSentAt = reminder.pushSentAt ? new Date(reminder.pushSentAt) : null;
      const isOverdue = reminder.dueDate ? reminder.dueDate.getTime() < now.getTime() : false;
      const priority = String(reminder.priority ?? "none");
      const realertWindowMs = priority === "high" ? 2 * 60 * 60 * 1000 : priority === "medium" ? 6 * 60 * 60 * 1000 : 12 * 60 * 60 * 1000;
      const shouldSend = !lastSentAt || (isOverdue && (now.getTime() - lastSentAt.getTime()) >= realertWindowMs);
      if (!shouldSend) continue;
      if (reminder.user?.profile?.notifyReminders === false || inQuietHours(reminder.user?.profile, now)) continue;

      const due = reminder.dueDate
        ? formatAppTime(reminder.dueDate)
        : "now";
      const listLabel = reminder.list?.name ? ` · ${reminder.list.name}` : "";
      const prefix = isOverdue ? "Overdue: " : "";
      const body = `${prefix}${reminder.title}${listLabel} due ${due}${reminder.notes ? `\n${reminder.notes}` : ""}`;

      const result = await sendPushToUser(reminder.userId, {
        title: isOverdue ? "Overdue reminder" : "Reminder",
        body: due === "now" ? reminder.title : `${reminder.title} - ${due}`,
        url: "/reminders",
        tag: `reminder-${reminder.id}`,
        requireInteraction: true,
        data: { reminderId: reminder.id, kind: "reminder" },
      });

      if (result.sent > 0) {
        await prisma.reminder.update({
          where: { id: reminder.id },
          data: { pushSentAt: new Date() },
        });
        sent += result.sent;
        reminderCount += 1;
      }
    }

    for (const medication of medications) {
      const timeZone = normalizeTimeZone(medication.user?.profile?.timeZone ?? DEFAULT_TIME_ZONE);
      const nowZoned = getZonedDateParts(now, timeZone);
      if (inQuietHours(medication.user?.profile, now)) continue;
      if (!isMedicationDueOn(medication, now, timeZone)) continue;
      if (!isMedicationTimeDueNow(medication, now, timeZone)) continue;

      const alreadyLogged = medicationLogs.some((log) => (
        log.medicationId === medication.id
        && getZonedDateParts(log.scheduledFor, timeZone).dateKey === nowZoned.dateKey
      ));
      if (!alreadyLogged) {
        const lastPushAt = medication.lastPushSentAt ? new Date(medication.lastPushSentAt) : null;
        const alreadyPushedToday = lastPushAt && getZonedDateParts(lastPushAt, timeZone).dateKey === nowZoned.dateKey;
        if (!alreadyPushedToday && medication.user?.profile?.notifyMedications !== false) {
          const result = await sendPushToUser(medication.userId, {
            title: "Medication reminder",
            body: `Take ${medication.name}${medication.dosage ? ` (${medication.dosage})` : ""} - ${medication.timeOfDay}`,
            url: "/medications",
            tag: `medication-${medication.id}-${nowZoned.dateKey}`,
            requireInteraction: true,
            data: { medicationId: medication.id, kind: "medication" },
          });

          if (result.sent > 0) {
            await prisma.medication.update({
              where: { id: medication.id },
              data: { lastPushSentAt: new Date() },
            });
            sent += result.sent;
            medicationCount += 1;
          }
        }
      }

      if (medication.user?.profile?.notifyRefills !== false && medication.stockCount != null && medication.refillAt != null && medication.stockCount <= medication.refillAt) {
        const lastRefillPushAt = medication.lastRefillPushAt ? new Date(medication.lastRefillPushAt) : null;
        const refillCooldownMs = 24 * 60 * 60 * 1000;
        if (!lastRefillPushAt || (now.getTime() - lastRefillPushAt.getTime()) >= refillCooldownMs) {
          const result = await sendPushToUser(medication.userId, {
            title: "Refill alert",
            body: `${medication.name} is low${medication.stockCount != null ? ` - ${medication.stockCount} left` : ""}`,
            url: "/medications",
            tag: `medication-refill-${medication.id}`,
            requireInteraction: true,
            data: { medicationId: medication.id, kind: "refill" },
          });

          if (result.sent > 0) {
            await prisma.medication.update({
              where: { id: medication.id },
              data: { lastRefillPushAt: new Date() },
            });
            sent += result.sent;
            refillCount += 1;
          }
        }
      }
    }

    return NextResponse.json({
      sent,
      reminders: reminderCount,
      medications: medicationCount,
      refills: refillCount,
      mode: cronMode ? "cron" : "user",
    });
  } catch (error: any) {
    return NextResponse.json({ error: process.env.NODE_ENV === "production" ? "Failed" : error?.message ?? "Failed" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  return dispatchPush(req);
}

export async function GET(req: Request) {
  return dispatchPush(req);
}
