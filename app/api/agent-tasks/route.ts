export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { computeNextRunAt } from "@/lib/agent-scheduled-tasks";
import { describeAgentTaskMemory } from "@/lib/agent-task-vector-memory";

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

async function createTaskVersion(task: any, source = "manual", previewSummary?: string | null) {
  const latest = await prisma.agentTaskVersion.findFirst({
    where: { taskId: task.id },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  const version = await prisma.agentTaskVersion.create({
    data: {
      userId: task.userId,
      taskId: task.id,
      version: (latest?.version ?? 0) + 1,
      name: task.name,
      prompt: task.prompt,
      trainingNotes: task.trainingNotes,
      outputFormat: task.outputFormat,
      url: task.url,
      scheduleType: task.scheduleType,
      timeOfDay: task.timeOfDay,
      daysOfWeek: task.daysOfWeek,
      previewSummary: previewSummary ?? null,
      source,
      activatedAt: new Date(),
    },
  });
  await prisma.agentScheduledTask.update({
    where: { id: task.id },
    data: { activeVersionId: version.id },
  });
  return version;
}

function hasVersionedChange(data: any) {
  return ["name", "prompt", "trainingNotes", "outputFormat", "url", "scheduleType", "timeOfDay", "daysOfWeek", "previewSummary"].some((key) => key in data);
}

export async function GET(req: Request) {
  const user = await requireCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [tasks, lastCronHit, recentCronHits] = await Promise.all([
    prisma.agentScheduledTask.findMany({
      where: { userId: user.id },
      include: {
        runs: { orderBy: { createdAt: "desc" }, take: 20 },
        versions: { orderBy: { version: "desc" }, take: 8 },
      },
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

  const [origin, vectorMemory] = [new URL(req.url).origin, await describeAgentTaskMemory()];
  return NextResponse.json({
    tasks,
    cron: {
      endpoint: `${origin}/api/agent-tasks/dispatch`,
      authorizationHeader: "Authorization: Bearer YOUR_CRON_SECRET",
      lastHit: lastCronHit,
      recentHits: recentCronHits,
      secretConfigured: Boolean(process.env.CRON_SECRET),
    },
    vectorMemory,
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
  const version = await createTaskVersion(task, cleanString(data.versionSource, "create"), cleanString(data.previewSummary) || null);

  return NextResponse.json({ task: { ...task, activeVersionId: version.id } });
}

export async function PATCH(req: Request) {
  const user = await requireCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const data = await req.json();
  const id = cleanString(data.id);
  if (!id) return NextResponse.json({ error: "Task ID is required" }, { status: 400 });

  const existing = await prisma.agentScheduledTask.findFirst({ where: { id, userId: user.id } });
  if (!existing) return NextResponse.json({ error: "Task not found" }, { status: 404 });

  if (data.rollbackVersionId) {
    const version = await prisma.agentTaskVersion.findFirst({
      where: { id: cleanString(data.rollbackVersionId), taskId: existing.id, userId: user.id },
    });
    if (!version) return NextResponse.json({ error: "Version not found" }, { status: 404 });
    const task = await prisma.agentScheduledTask.update({
      where: { id },
      data: {
        name: version.name,
        prompt: version.prompt,
        trainingNotes: version.trainingNotes,
        outputFormat: version.outputFormat,
        url: version.url,
        scheduleType: version.scheduleType,
        timeOfDay: version.scheduleType === "manual" ? null : version.timeOfDay,
        daysOfWeek: version.scheduleType === "weekly" ? version.daysOfWeek : null,
        activeVersionId: version.id,
        nextRunAt: existing.active ? computeNextRunAt(version) : null,
      },
    });
    await prisma.agentTaskVersion.update({ where: { id: version.id }, data: { activatedAt: new Date() } });
    return NextResponse.json({ task });
  }

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
  if (hasVersionedChange(data)) {
    await createTaskVersion(task, cleanString(data.versionSource, "manual"), cleanString(data.previewSummary) || null);
  }

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
