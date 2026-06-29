import { prisma } from "@/lib/db";
import { sendPushToUser } from "@/lib/web-push";

const WEEK_DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export function isCronAuthorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

function parseTimeOfDay(value?: string | null) {
  const match = String(value ?? "09:00").match(/^(\d{1,2}):(\d{2})$/);
  const hour = Math.min(23, Math.max(0, Number(match?.[1] ?? 9)));
  const minute = Math.min(59, Math.max(0, Number(match?.[2] ?? 0)));
  return { hour, minute };
}

export function computeNextRunAt(task: { scheduleType?: string | null; timeOfDay?: string | null; daysOfWeek?: string | null }, from = new Date()) {
  const scheduleType = task.scheduleType || "daily";
  if (scheduleType === "manual") return null;

  const { hour, minute } = parseTimeOfDay(task.timeOfDay);
  const candidate = new Date(from);
  candidate.setSeconds(0, 0);
  candidate.setHours(hour, minute, 0, 0);

  if (scheduleType === "daily") {
    if (candidate <= from) candidate.setDate(candidate.getDate() + 1);
    return candidate;
  }

  if (scheduleType === "weekly") {
    const days = String(task.daysOfWeek ?? "")
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter((item) => WEEK_DAYS.includes(item));
    const selected = days.length ? days : [WEEK_DAYS[from.getDay()]];
    for (let offset = 0; offset <= 7; offset += 1) {
      const next = new Date(candidate);
      next.setDate(candidate.getDate() + offset);
      if (selected.includes(WEEK_DAYS[next.getDay()]) && next > from) return next;
    }
  }

  return null;
}

function cleanText(value: string) {
  return value.replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractPageTitle(html: string) {
  return html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, " ").trim() ?? "";
}

async function inspectUrl(url: string) {
  const res = await fetch(url, {
    headers: { "User-Agent": "Dayza-Agent-Task/1.0" },
    signal: AbortSignal.timeout(20000),
  });
  const contentType = res.headers.get("content-type") ?? "";
  const body = await res.text();
  const title = contentType.includes("html") ? extractPageTitle(body) : "";
  const text = cleanText(body).slice(0, 1400);
  return {
    ok: res.ok,
    status: res.status,
    title,
    summary: [
      `URL checked: ${url}`,
      `HTTP ${res.status}${res.ok ? " OK" : ""}`,
      title ? `Title: ${title}` : "",
      text ? `Preview: ${text.slice(0, 500)}` : "",
    ].filter(Boolean).join("\n"),
  };
}

export async function runAgentScheduledTask(taskId: string) {
  const task = await prisma.agentScheduledTask.findUnique({
    where: { id: taskId },
    include: { user: { select: { profile: { select: { notifyAgentTasks: true } } } } },
  });
  if (!task) throw new Error("Task not found");

  const run = await prisma.agentScheduledTaskRun.create({
    data: { userId: task.userId, taskId: task.id, status: "running" },
  });

  try {
    let summary = `Task: ${task.name}\nInstruction: ${task.prompt}`;
    let status = "completed";

    if (task.url) {
      const result = await inspectUrl(task.url);
      summary = `${summary}\n\n${result.summary}`;
      status = result.ok ? "completed" : "warning";
    }

    const finishedAt = new Date();
    const updatedRun = await prisma.agentScheduledTaskRun.update({
      where: { id: run.id },
      data: { status, summary, finishedAt },
    });

    const nextRunAt = computeNextRunAt(task, finishedAt);
    await prisma.agentScheduledTask.update({
      where: { id: task.id },
      data: { lastRunAt: finishedAt, lastStatus: status, lastSummary: summary.slice(0, 2000), nextRunAt },
    });

    if (task.notifyOnRun && task.user?.profile?.notifyAgentTasks !== false) {
      await sendPushToUser(task.userId, {
        title: `Agent task: ${task.name}`,
        body: summary.slice(0, 240),
        url: "/agent-tasks",
        tag: `agent-task-${task.id}`,
        data: { taskId: task.id, kind: "agent-task" },
      }).catch(() => null);
    }

    return updatedRun;
  } catch (error: any) {
    const message = error?.message ?? "Task failed";
    const finishedAt = new Date();
    const updatedRun = await prisma.agentScheduledTaskRun.update({
      where: { id: run.id },
      data: { status: "failed", error: message, finishedAt },
    });
    await prisma.agentScheduledTask.update({
      where: { id: task.id },
      data: {
        lastRunAt: finishedAt,
        lastStatus: "failed",
        lastSummary: message,
        nextRunAt: computeNextRunAt(task, finishedAt),
      },
    });
    return updatedRun;
  }
}
