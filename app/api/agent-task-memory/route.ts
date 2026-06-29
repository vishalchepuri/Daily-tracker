export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { clearAgentTaskMemory, describeAgentTaskMemory } from "@/lib/agent-task-vector-memory";

function cleanString(value: unknown) {
  return String(value ?? "").trim();
}

export async function GET() {
  const user = await requireCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ vectorMemory: await describeAgentTaskMemory() });
}

export async function DELETE(req: Request) {
  const user = await requireCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const data = await req.json().catch(() => ({}));
  const taskId = cleanString(data.taskId);
  if (taskId) {
    const task = await prisma.agentScheduledTask.findFirst({ where: { id: taskId, userId: user.id } });
    if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });
    const result = await clearAgentTaskMemory({ userId: user.id, taskId });
    if (!result.ok) return NextResponse.json({ error: "Agent memory is not configured or could not be cleared." }, { status: 503 });
    await prisma.agentScheduledTask.update({
      where: { id: taskId },
      data: { lastMemoryWriteAt: null, lastMemorySearchAt: null, lastMemorySearchUsed: false, lastMemoryVectorCount: 0 },
    });
    return NextResponse.json({ ok: true });
  }

  const result = await clearAgentTaskMemory({ userId: user.id });
  if (!result.ok) return NextResponse.json({ error: "Agent memory is not configured or could not be cleared." }, { status: 503 });
  await prisma.agentScheduledTask.updateMany({
    where: { userId: user.id },
    data: { lastMemoryWriteAt: null, lastMemorySearchAt: null, lastMemorySearchUsed: false, lastMemoryVectorCount: 0 },
  });
  return NextResponse.json({ ok: true });
}
