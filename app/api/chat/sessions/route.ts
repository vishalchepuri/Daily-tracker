export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { deleteFile } from "@/lib/s3";

const CHAT_SESSION_RETENTION_LIMIT = 7;

async function getUserId() {
  const session = await getServerSession(authOptions);
  return (session?.user as any)?.id as string | undefined;
}

async function pruneOldChatSessions(userId: string) {
  const oldSessions = await prisma.chatSession.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    skip: CHAT_SESSION_RETENTION_LIMIT,
    select: { id: true },
  });
  const oldSessionIds = oldSessions.map((session) => session.id);
  if (oldSessionIds.length > 0) {
    await prisma.chatSession.deleteMany({ where: { userId, id: { in: oldSessionIds } } });
  }
}

export async function GET(req: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await pruneOldChatSessions(userId);
  const { searchParams } = new URL(req.url);
  const offset = Math.max(0, Number(searchParams.get("offset") ?? 0) || 0);
  if (offset >= CHAT_SESSION_RETENTION_LIMIT) {
    return NextResponse.json({ sessions: [], nextOffset: CHAT_SESSION_RETENTION_LIMIT, hasMore: false });
  }
  const requestedLimit = Math.min(30, Math.max(5, Number(searchParams.get("limit") ?? 10) || 10));
  const limit = Math.min(requestedLimit, CHAT_SESSION_RETENTION_LIMIT - offset);

  const sessions = await prisma.chatSession.findMany({
    where: { userId },
    include: {
      _count: { select: { messages: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 1, select: { content: true } },
    },
    orderBy: { updatedAt: "desc" },
    skip: offset,
    take: limit + 1,
  });

  const returnedCount = Math.min(sessions.length, limit);
  return NextResponse.json({
    sessions: sessions.slice(0, limit),
    nextOffset: offset + returnedCount,
    hasMore: sessions.length > limit && offset + returnedCount < CHAT_SESSION_RETENTION_LIMIT,
  });
}

export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const title = typeof body.title === "string" && body.title.trim() ? body.title.trim().slice(0, 48) : "New chat";
  const chat = await prisma.chatSession.create({ data: { userId, title } });
  await pruneOldChatSessions(userId);
  return NextResponse.json({ session: chat });
}

export async function DELETE(req: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get("sessionId");
  if (!sessionId) return NextResponse.json({ error: "sessionId is required" }, { status: 400 });

  const chat = await prisma.chatSession.findFirst({
    where: { id: sessionId, userId },
    include: { attachments: true },
  });
  if (!chat) return NextResponse.json({ error: "Chat not found" }, { status: 404 });

  for (const attachment of chat.attachments) {
    if (attachment.cloudStoragePath && attachment.kind !== "telegram_photo") {
      await deleteFile(attachment.cloudStoragePath).catch((error) => {
        console.error("Failed to delete chat attachment", attachment.cloudStoragePath, error);
      });
    }
  }

  await prisma.chatSession.delete({ where: { id: sessionId } });
  return NextResponse.json({ ok: true });
}
