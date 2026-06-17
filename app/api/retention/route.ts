export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireAdminUser, requireCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { pruneFirestoreChatRetention } from "@/lib/firestore-chat";

const CHAT_SESSION_LIMIT = 7;
const CHAT_MESSAGE_LIMIT = 10;
const ACTIVITY_DAYS = 30;

async function cleanupUser(userId: string) {
  const now = new Date();
  const activityCutoff = new Date(now.getTime() - ACTIVITY_DAYS * 86_400_000);

  const retention = await pruneFirestoreChatRetention(userId, CHAT_SESSION_LIMIT, CHAT_MESSAGE_LIMIT);

  return { expiredImages: retention.expiredImages, deletedMessages: retention.deletedMessages, activityCutoff: activityCutoff.toISOString() };
}

export async function POST() {
  try {
    const user = await requireCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = user.id;
    const result = await cleanupUser(userId);
    return NextResponse.json({ ok: true, ...result });
  } catch (error: any) {
    return NextResponse.json({ error: process.env.NODE_ENV === "production" ? "Failed" : error?.message ?? "Failed" }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const admin = await requireAdminUser();
    if (!admin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    const users = await prisma.user.findMany({ select: { id: true }, take: 500 });
    const results = [];
    for (const user of users) results.push(await cleanupUser(user.id));
    return NextResponse.json({ ok: true, users: users.length, results });
  } catch (error: any) {
    return NextResponse.json({ error: process.env.NODE_ENV === "production" ? "Failed" : error?.message ?? "Failed" }, { status: 500 });
  }
}
