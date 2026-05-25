export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { sendTelegramMessage } from "@/lib/telegram";

export async function POST() {
  try {
    const user = await requireCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = user.id;

    const profile = await prisma.userProfile.findUnique({ where: { userId } });
    if (!profile?.telegramEnabled || !profile.telegramChatId) {
      return NextResponse.json({ sent: 0, error: "Telegram reminders are not enabled" }, { status: 400 });
    }

    const now = new Date();
    const reminders = await prisma.reminder.findMany({
      where: {
        userId,
        completed: false,
        dueDate: { lte: now },
        telegramSentAt: null,
      },
      include: { list: true },
      orderBy: { dueDate: "asc" },
      take: 10,
    });

    for (const reminder of reminders) {
      const due = reminder.dueDate ? reminder.dueDate.toLocaleString() : "No due time";
      const list = reminder.list?.name ? `\nList: ${reminder.list.name}` : "";
      const notes = reminder.notes ? `\nNotes: ${reminder.notes}` : "";
      await sendTelegramMessage(
        profile.telegramChatId,
        `⏰ Reminder\n\n<b>${reminder.title}</b>\nDue: ${due}${list}${notes}`
      );
      await prisma.reminder.update({
        where: { id: reminder.id },
        data: { telegramSentAt: new Date() },
      });
    }

    return NextResponse.json({ sent: reminders.length });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Failed" }, { status: 500 });
  }
}
