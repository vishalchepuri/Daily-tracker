export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions, requireAdminUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

const CHAT_SESSION_LIMIT = 7;
const CHAT_MESSAGE_LIMIT = 10;
const CHAT_IMAGE_DAYS = 5;
const ACTIVITY_DAYS = 30;

async function cleanupUser(userId: string) {
  const now = new Date();
  const imageCutoff = new Date(now.getTime() - CHAT_IMAGE_DAYS * 86_400_000);
  const activityCutoff = new Date(now.getTime() - ACTIVITY_DAYS * 86_400_000);

  const sessions = await prisma.chatSession.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    select: { id: true },
  });
  const oldSessionIds = sessions.slice(CHAT_SESSION_LIMIT).map((session) => session.id);
  if (oldSessionIds.length) {
    await prisma.chatSession.deleteMany({ where: { userId, id: { in: oldSessionIds } } });
  }

  for (const session of sessions.slice(0, CHAT_SESSION_LIMIT)) {
    const oldMessages = await prisma.chatMessage.findMany({
      where: { userId, sessionId: session.id },
      orderBy: { createdAt: "desc" },
      skip: CHAT_MESSAGE_LIMIT,
      select: { id: true },
    });
    const oldMessageIds = oldMessages.map((message) => message.id);
    if (!oldMessageIds.length) continue;
    await prisma.chatAttachment.deleteMany({ where: { userId, messageId: { in: oldMessageIds } } });
    await prisma.chatMessage.deleteMany({ where: { userId, id: { in: oldMessageIds } } });
  }

  const expiredImages = await prisma.chatAttachment.updateMany({
    where: {
      userId,
      deletedAt: null,
      OR: [{ expiresAt: { lte: now } }, { createdAt: { lt: imageCutoff } }],
      imageData: { not: null },
    },
    data: { imageData: null, deletedAt: now },
  });

  return { expiredImages: expiredImages.count, activityCutoff: activityCutoff.toISOString() };
}

export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = (session.user as any)?.id;
    const result = await cleanupUser(userId);
    return NextResponse.json({ ok: true, ...result });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Failed" }, { status: 500 });
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
    return NextResponse.json({ error: error?.message ?? "Failed" }, { status: 500 });
  }
}
