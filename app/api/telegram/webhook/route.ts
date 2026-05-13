export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { processTelegramText, sendTelegramMessage } from "@/lib/telegram";

export async function POST(req: Request) {
  try {
    const update = await req.json();
    const message = update?.message ?? update?.edited_message;
    const chatId = message?.chat?.id == null ? "" : String(message.chat.id);
    const text = message?.text;
    if (!chatId || !text) return NextResponse.json({ ok: true });

    const response = await processTelegramText(chatId, text);
    await sendTelegramMessage(chatId, response);
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message ?? "Failed" }, { status: 500 });
  }
}
