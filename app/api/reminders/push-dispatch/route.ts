export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { sendPushToUser } from "@/lib/web-push";

function isCronAuthorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
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
        pushSentAt: null,
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
          },
        },
      },
      orderBy: { dueDate: "asc" },
      take: cronMode ? 50 : 10,
    });

    let sent = 0;

    for (const reminder of reminders) {
      const due = reminder.dueDate
        ? reminder.dueDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        : "now";
      const listLabel = reminder.list?.name ? ` · ${reminder.list.name}` : "";
      const body = `${reminder.title}${listLabel} due ${due}${reminder.notes ? `\n${reminder.notes}` : ""}`;

      const result = await sendPushToUser(reminder.userId, {
        title: "Dayza reminder",
        body,
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
      }
    }

    return NextResponse.json({ sent, reminders: reminders.length, mode: cronMode ? "cron" : "user" });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Failed" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  return dispatchPush(req);
}

export async function GET(req: Request) {
  return dispatchPush(req);
}
