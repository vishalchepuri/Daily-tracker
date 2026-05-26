export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import {
  createFirestoreChatSession,
  deleteFirestoreChatSession,
  listFirestoreChatSessions,
  pruneFirestoreChatRetention,
} from "@/lib/firestore-chat";

const CHAT_SESSION_RETENTION_LIMIT = 7;
const CHAT_MESSAGES_PER_SESSION_LIMIT = 10;

async function getUserId() {
  const user = await requireCurrentUser();
  return user?.id;
}

async function pruneOldChatSessions(userId: string) {
  await pruneFirestoreChatRetention(userId, CHAT_SESSION_RETENTION_LIMIT, CHAT_MESSAGES_PER_SESSION_LIMIT);
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

  const sessions = await listFirestoreChatSessions(userId, offset, limit);
  const sessionsForClient = sessions.map((session) => ({
    ...session,
    _count: { messages: session.messageCount ?? 0 },
    messages: session.lastMessage ? [{ content: session.lastMessage }] : [],
  }));

  const returnedCount = Math.min(sessionsForClient.length, limit);
  return NextResponse.json({
    sessions: sessionsForClient.slice(0, limit),
    nextOffset: offset + returnedCount,
    hasMore: sessionsForClient.length > limit && offset + returnedCount < CHAT_SESSION_RETENTION_LIMIT,
  });
}

export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const title = typeof body.title === "string" && body.title.trim() ? body.title.trim().slice(0, 48) : "New chat";
  const chat = await createFirestoreChatSession(userId, title);
  await pruneOldChatSessions(userId);
  return NextResponse.json({ session: chat });
}

export async function DELETE(req: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get("sessionId");
  if (!sessionId) return NextResponse.json({ error: "sessionId is required" }, { status: 400 });

  const deleted = await deleteFirestoreChatSession(userId, sessionId);
  if (!deleted) return NextResponse.json({ error: "Chat not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
