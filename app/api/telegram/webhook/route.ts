export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { processTelegramMessage, sendTelegramMessage } from "@/lib/telegram";

export async function POST(req: Request) {
  try {
    const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (process.env.NODE_ENV === "production" && !expectedSecret) {
      return NextResponse.json({ ok: false, error: "Telegram webhook secret is not configured" }, { status: 503 });
    }
    if (expectedSecret && req.headers.get("x-telegram-bot-api-secret-token") !== expectedSecret) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }
    const update = await req.json();
    const message = update?.message ?? update?.edited_message;
    const chatId = message?.chat?.id == null ? "" : String(message.chat.id);
    const text = message?.text ?? message?.caption ?? "";
    const photo = Array.isArray(message?.photo) ? message.photo.at(-1) : null;
    const photoFileId = photo?.file_id ? String(photo.file_id) : null;
    if (!chatId || (!text && !photoFileId)) return NextResponse.json({ ok: true });

    const response = await processTelegramMessage(chatId, text, { photoFileId });
    await sendTelegramMessage(chatId, response);
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    const message = process.env.NODE_ENV === "production" ? "Failed" : error?.message ?? "Failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
