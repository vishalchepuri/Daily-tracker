export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const user = await requireCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = user.id;
    const profile = await prisma.userProfile.findUnique({ where: { userId } });
    return NextResponse.json({
      telegramChatId: profile?.telegramChatId ?? "",
      telegramEnabled: Boolean(profile?.telegramEnabled),
      botConfigured: Boolean(process.env.TELEGRAM_BOT_TOKEN),
    });
  } catch (error: any) {
    return NextResponse.json({ error: process.env.NODE_ENV === "production" ? "Failed" : error?.message ?? "Failed" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const user = await requireCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = user.id;
    const data = await req.json();
    const telegramChatId = String(data.telegramChatId ?? "").trim();
    const telegramEnabled = Boolean(data.telegramEnabled && telegramChatId);

    const profile = await prisma.userProfile.upsert({
      where: { userId },
      update: { telegramChatId, telegramEnabled },
      create: { userId, telegramChatId, telegramEnabled },
    });

    return NextResponse.json({
      telegramChatId: profile.telegramChatId ?? "",
      telegramEnabled: profile.telegramEnabled,
      botConfigured: Boolean(process.env.TELEGRAM_BOT_TOKEN),
    });
  } catch (error: any) {
    return NextResponse.json({ error: process.env.NODE_ENV === "production" ? "Failed" : error?.message ?? "Failed" }, { status: 500 });
  }
}
