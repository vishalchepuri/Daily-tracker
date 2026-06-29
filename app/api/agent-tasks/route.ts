export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { computeNextRunAt } from "@/lib/agent-scheduled-tasks";
import { isAgentTaskVectorMemoryConfigured } from "@/lib/agent-task-vector-memory";

function cleanString(value: unknown, fallback = "") {
  return String(value ?? fallback).trim();
}

function cleanUrl(value: unknown) {
  const raw = cleanString(value);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  const user = await requireCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [tasks, lastCronHit, recentCronHits] = await Promise.all([
    prisma.agentScheduledTask.findMany({
      where: { userId: user.id },
      include: { runs: { orderBy: { createdAt: "desc" }, take: 20 } },
      orderBy: [{ active: "desc" }, { nextRunAt: "asc" }, { createdAt: "desc" }],
    }),
    prisma.agentCronHit.findFirst({
      where: { mode: "cron" },
      orderBy: { createdAt: "desc" },
    }),
    prisma.agentCronHit.findMany({
      where: { mode: "cron" },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
  ]);

  const origin = new URL(req.url).origin;
  return NextResponse.json({
    tasks,
    cron: {
      endpoint: `${origin}/api/agent-tasks/dispatch`,
      authorizationHeader: "Authorization: Bearer YOUR_CRON_SECRET",
      lastHit: lastCronHit,
      recentHits: recentCronHits,
      secretConfigured: Boolean(process.env.CRON_SECRET),
    },
    vectorMemory: {
      configured: isAgentTaskVectorMemoryConfigured(),
    },
  });
}

export async function POST(req: Request) {
  const user = await requireCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const data = await req.json();
  const name = cleanString(data.name);
  const prompt = cleanString(data.prompt);
  if (!name || !prompt) return NextResponse.json({ error: "Name and task details are required" }, { status: 400 });

  const scheduleType = ["daily", "weekly", "manual"].includes(data.scheduleType) ? data.scheduleType : "daily";
  const timeOfDay = cleanString(data.timeOfDay, "09:00") || "09:00";
  const daysOfWeek = Array.isArray(data.daysOfWeek) ? data.daysOfWeek.join(",") : cleanString(data.daysOfWeek);

  const task = await prisma.agentScheduledTask.create({
    data: {
      userId: user.id,
      name,
      prompt,
      trainingNotes: cleanString(data.trainingNotes) || null,
      outputFormat: cleanString(data.outputFormat) || null,
      templateId: cleanString(data.templateId) || null,
      url: cleanUrl(data.url),
      scheduleType,
      timeOfDay: scheduleType === "manual" ? null : timeOfDay,
      daysOfWeek: scheduleType === "weekly" ? daysOfWeek : null,
      active: data.active !== false,
      notifyOnRun: data.notifyOnRun !== false,
      nextRunAt: data.active === false ? null : computeNextRunAt({ scheduleType, timeOfDay, daysOfWeek }),
    },
  });

  return NextResponse.json({ task });
}

export async function PATCH(req: Request) {
  const user = await requireCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const data = await req.json();
  const id = cleanString(data.id);
  if (!id) return NextResponse.json({ error: "Task ID is required" }, { status: 400 });

  const existing = await prisma.agentScheduledTask.findFirst({ where: { id, userId: user.id } });
  if (!existing) return NextResponse.json({ error: "Task not found" }, { status: 404 });

  const scheduleType = ["daily", "weekly", "manual"].includes(data.scheduleType) ? data.scheduleType : existing.scheduleType;
  const timeOfDay = cleanString(data.timeOfDay, existing.timeOfDay ?? "09:00") || "09:00";
  const daysOfWeek = Array.isArray(data.daysOfWeek) ? data.daysOfWeek.join(",") : cleanString(data.daysOfWeek, existing.daysOfWeek ?? "");
  const active = "active" in data ? data.active === true : existing.active;

  const task = await prisma.agentScheduledTask.update({
    where: { id },
    data: {
      name: "name" in data ? cleanString(data.name, existing.name) || existing.name : existing.name,
      prompt: "prompt" in data ? cleanString(data.prompt, existing.prompt) || existing.prompt : existing.prompt,
      trainingNotes: "trainingNotes" in data ? cleanString(data.trainingNotes) || null : existing.trainingNotes,
      outputFormat: "outputFormat" in data ? cleanString(data.outputFormat) || null : existing.outputFormat,
      url: "url" in data ? cleanUrl(data.url) : existing.url,
      scheduleType,
      timeOfDay: scheduleType === "manual" ? null : timeOfDay,
      daysOfWeek: scheduleType === "weekly" ? daysOfWeek : null,
      active,
      notifyOnRun: "notifyOnRun" in data ? data.notifyOnRun === true : existing.notifyOnRun,
      nextRunAt: active ? computeNextRunAt({ scheduleType, timeOfDay, daysOfWeek }) : null,
    },
  });

  return NextResponse.json({ task });
}

export async function DELETE(req: Request) {
  const user = await requireCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Task ID is required" }, { status: 400 });

  const existing = await prisma.agentScheduledTask.findFirst({ where: { id, userId: user.id } });
  if (!existing) return NextResponse.json({ error: "Task not found" }, { status: 404 });

  await prisma.agentScheduledTask.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
