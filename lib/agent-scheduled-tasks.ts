import { prisma } from "@/lib/db";
import { queryAgentTaskMemory, rememberAgentTaskRun } from "@/lib/agent-task-vector-memory";
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

function cleanTextPreserveScripts(value: string) {
  return value.replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractPageTitle(html: string) {
  return html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, " ").trim() ?? "";
}

function decodeHtml(value: string) {
  return value
    .replace(/\\u003c/g, "<")
    .replace(/\\u003e/g, ">")
    .replace(/\\u0026/g, "&")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&#8377;/g, "INR")
    .replace(/₹/g, "INR");
}

function extractHtmlTables(html: string) {
  const tables: string[] = [];
  for (const tableMatch of html.matchAll(/<table[\s\S]*?<\/table>/gi)) {
    const rows: string[] = [];
    for (const rowMatch of tableMatch[0].matchAll(/<tr[\s\S]*?<\/tr>/gi)) {
      const cells = [...rowMatch[0].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)]
        .map((cell) => cleanText(decodeHtml(cell[1])))
        .filter(Boolean);
      if (cells.length) rows.push(cells.join(" | "));
    }
    if (rows.length) tables.push(rows.slice(0, 20).join("\n"));
  }
  return tables.slice(0, 3).join("\n\n");
}

function extractPageContext(html: string) {
  const decoded = decodeHtml(html);
  const tables = extractHtmlTables(decoded);
  const visibleText = cleanText(decoded).slice(0, 3500);
  const embeddedText = cleanTextPreserveScripts(decoded).slice(0, 2500);
  return [
    tables ? `TABLES:\n${tables}` : "",
    visibleText ? `VISIBLE TEXT:\n${visibleText}` : "",
    embeddedText && embeddedText !== visibleText ? `EMBEDDED PAGE DATA:\n${embeddedText}` : "",
  ].filter(Boolean).join("\n\n");
}

async function summarizeWithAi(input: { taskName: string; prompt: string; outputFormat?: string | null; url: string; title: string; status: number; context: string; memory?: string }) {
  if (!process.env.ABACUSAI_API_KEY || !input.context.trim()) return "";
  const aiPrompt = `You are Dayza Agent running a scheduled web-check task.

Task name: ${input.taskName}
User instruction: ${input.prompt}
Expected output: ${input.outputFormat || "Concise plain-text summary with important facts and changes."}
URL: ${input.url}
HTTP status: ${input.status}
Page title: ${input.title || "-"}

Use the page context below to answer the user's instruction. Extract concrete data such as names, dates, amounts, status, table rows, changes, and alerts when present. If related past runs are available, compare the current page with them and call out only new, changed, or important items. Do not say the page has no data just because a placeholder table says "No data available" if useful names or data appear elsewhere. Keep it concise, plain text, and useful.

${input.memory ? `RELATED PAST RUNS:\n${input.memory.slice(0, 5000)}\n\n` : ""}

PAGE CONTEXT:
${input.context.slice(0, 9000)}`;

  const res = await fetch("https://apps.abacus.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.ABACUSAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-5.4-mini",
      stream: false,
      max_tokens: 700,
      messages: [{ role: "user", content: aiPrompt }],
    }),
    signal: AbortSignal.timeout(25000),
  });
  if (!res.ok) return "";
  const data = await res.json().catch(() => ({}));
  return String(data?.choices?.[0]?.message?.content ?? "").trim();
}

async function inspectUrl(task: { name: string; prompt: string; outputFormat?: string | null; url: string }, memory?: string) {
  const url = task.url;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 Dayza-Agent-Task/1.0" },
    signal: AbortSignal.timeout(20000),
  });
  const contentType = res.headers.get("content-type") ?? "";
  const body = await res.text();
  const title = contentType.includes("html") ? extractPageTitle(body) : "";
  const context = contentType.includes("html") ? extractPageContext(body) : cleanText(body).slice(0, 5000);
  const aiSummary = await summarizeWithAi({
    taskName: task.name,
    prompt: task.prompt,
    outputFormat: task.outputFormat,
    url,
    title,
    status: res.status,
    context,
    memory,
  }).catch(() => "");
  const text = cleanText(body).slice(0, 1400);
  return {
    ok: res.ok,
    status: res.status,
    title,
    summary: [
      `URL checked: ${url}`,
      `HTTP ${res.status}${res.ok ? " OK" : ""}`,
      title ? `Title: ${title}` : "",
      aiSummary ? `Agent summary:\n${aiSummary}` : "",
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
      const memory = await queryAgentTaskMemory({
        userId: task.userId,
        taskId: task.id,
        prompt: task.prompt,
        url: task.url,
      });
      const result = await inspectUrl({ name: task.name, prompt: task.prompt, outputFormat: task.outputFormat, url: task.url }, memory);
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

    await rememberAgentTaskRun({
      userId: task.userId,
      taskId: task.id,
      taskName: task.name,
      prompt: task.prompt,
      url: task.url,
      runId: updatedRun.id,
      summary,
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
