export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { deleteFile } from "@/lib/s3";

async function getUserId() {
  const session = await getServerSession(authOptions);
  return (session?.user as any)?.id as string | undefined;
}

export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sessions = await prisma.chatSession.findMany({
    where: { userId },
    include: {
      _count: { select: { messages: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 1, select: { content: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json({ sessions });
}

export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const title = typeof body.title === "string" && body.title.trim() ? body.title.trim().slice(0, 48) : "New chat";
  const chat = await prisma.chatSession.create({ data: { userId, title } });
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
    if (attachment.cloudStoragePath) {
      await deleteFile(attachment.cloudStoragePath).catch((error) => {
        console.error("Failed to delete chat attachment", attachment.cloudStoragePath, error);
      });
    }
  }

  await prisma.chatSession.delete({ where: { id: sessionId } });
  return NextResponse.json({ ok: true });
}
