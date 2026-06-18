import "dotenv/config";
import { prisma } from "@/lib/db";
import { sendTelegramMessage } from "@/lib/telegram";
import { formatAppDateTime } from "@/lib/local-dates";

const intervalMs = Number(process.env.TELEGRAM_REMINDER_INTERVAL_MS ?? 60_000);

async function dispatchDueReminders() {
  const now = new Date();
  const reminders = await prisma.reminder.findMany({
    where: {
      completed: false,
      dueDate: { lte: now },
      telegramSentAt: null,
      user: {
        profile: {
          telegramEnabled: true,
          telegramChatId: { not: null },
        },
      },
    },
    include: {
      list: true,
      user: { include: { profile: true } },
    },
    orderBy: { dueDate: "asc" },
    take: 50,
  });

  for (const reminder of reminders) {
    const chatId = reminder.user.profile?.telegramChatId;
    if (!chatId) continue;

    const due = reminder.dueDate ? formatAppDateTime(reminder.dueDate) : "No due time";
    const list = reminder.list?.name ? `\nList: ${reminder.list.name}` : "";
    const notes = reminder.notes ? `\nNotes: ${reminder.notes}` : "";

    await sendTelegramMessage(
      chatId,
      `⏰ Reminder\n\n<b>${reminder.title}</b>\nDue: ${due}${list}${notes}`
    );

    await prisma.reminder.update({
      where: { id: reminder.id },
      data: { telegramSentAt: new Date() },
    });

    console.log(`[telegram-reminder-worker] sent reminder ${reminder.id}: ${reminder.title}`);
  }
}

async function tick() {
  try {
    await dispatchDueReminders();
  } catch (error) {
    console.error("[telegram-reminder-worker] dispatch failed", error);
  }
}

console.log(`[telegram-reminder-worker] running every ${Math.round(intervalMs / 1000)}s`);
tick();
setInterval(tick, intervalMs);
