export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireAdminUser, requireCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { processTelegramMessage, sendTelegramMessage } from "@/lib/telegram";

export async function POST() {
  try {
    const admin = await requireAdminUser();
    if (!admin && process.env.NODE_ENV === "production") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }
    if (!admin) {
      const user = await requireCurrentUser();
      if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) return NextResponse.json({ error: "TELEGRAM_BOT_TOKEN is not configured" }, { status: 500 });

    const state = await prisma.telegramBotState.upsert({
      where: { id: "default" },
      update: {},
      create: { id: "default", offset: 0 },
    });

    const response = await fetch(`https://api.telegram.org/bot${token}/getUpdates?offset=${state.offset}&timeout=0`);
    const data = await response.json();
    if (!data?.ok) return NextResponse.json({ error: "Telegram getUpdates failed" }, { status: 500 });

    let nextOffset = state.offset;
    let processed = 0;
    for (const update of data.result ?? []) {
      nextOffset = Math.max(nextOffset, Number(update.update_id) + 1);
      const message = update?.message ?? update?.edited_message;
      const chatId = message?.chat?.id == null ? "" : String(message.chat.id);
      const text = message?.text ?? message?.caption ?? "";
      const photo = Array.isArray(message?.photo) ? message.photo.at(-1) : null;
      const photoFileId = photo?.file_id ? String(photo.file_id) : null;
      if (!chatId || (!text && !photoFileId)) continue;
      const botResponse = await processTelegramMessage(chatId, text, { photoFileId });
      await sendTelegramMessage(chatId, botResponse);
      processed += 1;
    }

    await prisma.telegramBotState.update({
      where: { id: "default" },
      data: { offset: nextOffset },
    });

    return NextResponse.json({ processed });
  } catch (error: any) {
    return NextResponse.json({ error: process.env.NODE_ENV === "production" ? "Failed" : error?.message ?? "Failed" }, { status: 500 });
  }
}
