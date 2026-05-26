export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { getFirestoreChatAttachment, renderFirestoreChatAttachment } from "@/lib/firestore-chat";

export async function GET(req: Request) {
  const user = await requireCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get("sessionId");
  const attachmentId = searchParams.get("attachmentId");
  if (!sessionId || !attachmentId) {
    return NextResponse.json({ error: "sessionId and attachmentId are required" }, { status: 400 });
  }

  const attachment = await getFirestoreChatAttachment(user.id, sessionId, attachmentId);
  if (!attachment) return NextResponse.json({ error: "Attachment not found" }, { status: 404 });

  const rendered = await renderFirestoreChatAttachment(attachment);
  return NextResponse.json(rendered);
}
