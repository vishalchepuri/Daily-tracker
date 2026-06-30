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

function financialYearFor(date: Date) {
  const month = date.getMonth() + 1;
  const year = date.getFullYear();
  return month < 4 ? `${year - 1}-${String(year).slice(-2)}` : `${year}-${String(year + 1).slice(-2)}`;
}

function formatRowsForContext(rows: any[], maxRows = 16) {
  return rows.slice(0, maxRows).map((row, index) => {
    const cells = Object.entries(row ?? {})
      .filter(([key]) => !key.startsWith("~"))
      .map(([key, value]) => {
        const text = cleanText(decodeHtml(String(value ?? "")));
        return text ? `${key}: ${text}` : "";
      })
      .filter(Boolean)
      .slice(0, 14);
    return cells.length ? `${index + 1}. ${cells.join(" | ")}` : "";
  }).filter(Boolean).join("\n");
}

async function extractInvestorGainReportContext(pageUrl: string) {
  const parsed = new URL(pageUrl);
  if (!parsed.hostname.includes("investorgain.com")) return "";
  const reportId = parsed.pathname.match(/\/report\/[^/]+\/(\d+)/i)?.[1];
  if (!reportId) return "";

  const headers = {
    Accept: "application/json",
    Origin: "https://www.investorgain.com",
    Referer: pageUrl,
    "User-Agent": "Mozilla/5.0 Dayza-Agent-Task/1.0",
  };
  const infoRes = await fetch(`https://webnodejs.investorgain.com/cloud/v2/report/info-read/${reportId}`, {
    headers,
    signal: AbortSignal.timeout(12000),
  });
  if (!infoRes.ok) return "";
  const info = await infoRes.json().catch(() => null);
  const reportInfo = info?.reportInfo?.[0] ?? {};
  const pathParts = parsed.pathname.split("/").filter(Boolean);
  const reportIdIndex = pathParts.findIndex((part) => part === reportId);
  const urlParameter = reportIdIndex >= 0 ? pathParts[reportIdIndex + 1] : "";
  const parameterCodes = [
    urlParameter,
    ...(Array.isArray(info?.reportParameterData) ? info.reportParameterData.map((item: any) => item?.code) : []),
    "all",
    "current",
  ].map((item) => String(item ?? "").trim()).filter(Boolean);
  const uniqueCodes = Array.from(new Set(parameterCodes));
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const financialYear = financialYearFor(now);
  const version = info?.version ? `&v=${encodeURIComponent(String(info.version))}` : "";

  for (const code of uniqueCodes.slice(0, 8)) {
    const dataUrl = `https://webnodejs.investorgain.com/cloud/v2/report/data-read/${reportId}/1/${month}/${year}/${financialYear}/0/${encodeURIComponent(code)}?search=${version}`;
    const dataRes = await fetch(dataUrl, { headers, signal: AbortSignal.timeout(12000) }).catch(() => null);
    if (!dataRes?.ok) continue;
    const data = await dataRes.json().catch(() => null);
    const rows = Array.isArray(data?.reportTableData) ? data.reportTableData : [];
    if (data?.msg !== 1 || rows.length === 0) continue;
    const rowText = formatRowsForContext(rows);
    if (!rowText) continue;
    return [
      "CLIENT-RENDERED REPORT DATA:",
      `Report: ${reportInfo.report_title || reportInfo.table_heading || reportId}`,
      `Parameter: ${code}`,
      `Total records: ${data.totalRecords ?? rows.length}`,
      "Rows:",
      rowText,
    ].join("\n");
  }

  return "";
}

async function extractSupplementalPageContext(pageUrl: string, _html: string) {
  return [
    await extractInvestorGainReportContext(pageUrl).catch(() => ""),
  ].filter(Boolean).join("\n\n");
}

function extractJsonObject(text: string) {
  const fenced = text.match(/```json\s*([\s\S]*?)```/i)?.[1];
  const raw = fenced || text.match(/\{[\s\S]*\}/)?.[0] || "";
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function stringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item ?? "").trim()).filter(Boolean).slice(0, 12);
}

function formatStructuredSummary(input: { summary?: string; changes?: string[]; importantItems?: string[]; actionItems?: string[] }) {
  return [
    input.summary ? `Summary: ${input.summary}` : "",
    input.changes?.length ? `Changes:\n${input.changes.map((item) => `- ${item}`).join("\n")}` : "",
    input.importantItems?.length ? `Important:\n${input.importantItems.map((item) => `- ${item}`).join("\n")}` : "",
    input.actionItems?.length ? `Action:\n${input.actionItems.map((item) => `- ${item}`).join("\n")}` : "",
  ].filter(Boolean).join("\n\n");
}

async function summarizeWithAi(input: { taskName: string; prompt: string; trainingNotes?: string | null; outputFormat?: string | null; url: string; title: string; status: number; context: string; memory?: string }) {
  if (!process.env.ABACUSAI_API_KEY || !input.context.trim()) return { text: "", structured: null as any };
  const aiPrompt = `You are Dayza Agent running a scheduled web-check task.

Task name: ${input.taskName}
User instruction: ${input.prompt}
Task training notes: ${input.trainingNotes || "-"}
Expected output: ${input.outputFormat || "Concise plain-text summary with important facts and changes."}
URL: ${input.url}
HTTP status: ${input.status}
Page title: ${input.title || "-"}

Use the page context below to answer the user's instruction. Extract concrete data such as names, dates, amounts, status, table rows, changes, and alerts when present. If related past runs are available, compare the current page with them and call out only new, changed, or important items. Do not say the page has no data just because a placeholder table says "No data available" if useful names or data appear elsewhere.

Return ONLY JSON:
{
  "summary": "short clean answer",
  "changes": ["new or changed items only"],
  "importantItems": ["important unchanged or notable items"],
  "actionItems": ["things the user should do, if any"],
  "confidence": 0.0
}

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
      max_tokens: 900,
      messages: [{ role: "user", content: aiPrompt }],
    }),
    signal: AbortSignal.timeout(25000),
  });
  if (!res.ok) return { text: "", structured: null as any };
  const data = await res.json().catch(() => ({}));
  const content = String(data?.choices?.[0]?.message?.content ?? "").trim();
  const parsed = extractJsonObject(content);
  if (!parsed) return { text: content, structured: null as any };
  const structured = {
    summary: String(parsed.summary ?? "").trim(),
    changes: stringArray(parsed.changes),
    importantItems: stringArray(parsed.importantItems),
    actionItems: stringArray(parsed.actionItems),
    confidence: Number.isFinite(Number(parsed.confidence)) ? Math.max(0, Math.min(1, Number(parsed.confidence))) : null,
  };
  return { text: formatStructuredSummary(structured) || content, structured };
}

async function inspectUrl(task: { name: string; prompt: string; trainingNotes?: string | null; outputFormat?: string | null; url: string }, memory?: string) {
  const url = task.url;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 Dayza-Agent-Task/1.0" },
    signal: AbortSignal.timeout(20000),
  });
  const contentType = res.headers.get("content-type") ?? "";
  const body = await res.text();
  const title = contentType.includes("html") ? extractPageTitle(body) : "";
  const baseContext = contentType.includes("html") ? extractPageContext(body) : cleanText(body).slice(0, 5000);
  const supplementalContext = contentType.includes("html") ? await extractSupplementalPageContext(url, body) : "";
  const context = [supplementalContext, baseContext].filter(Boolean).join("\n\n");
  const aiSummary = await summarizeWithAi({
    taskName: task.name,
    prompt: task.prompt,
    trainingNotes: task.trainingNotes,
    outputFormat: task.outputFormat,
    url,
    title,
    status: res.status,
    context,
    memory,
  }).catch(() => ({ text: "", structured: null as any }));
  const text = cleanText(body).slice(0, 1400);
  const rawPreview = text.slice(0, 500);
  return {
    ok: res.ok,
    status: res.status,
    title,
    structured: aiSummary.structured,
    rawPreview,
    summary: [
      `URL checked: ${url}`,
      `HTTP ${res.status}${res.ok ? " OK" : ""}`,
      title ? `Title: ${title}` : "",
      aiSummary.text ? `Agent summary:\n${aiSummary.text}` : "",
      rawPreview ? `Preview: ${rawPreview}` : "",
    ].filter(Boolean).join("\n"),
  };
}

export async function previewAgentTaskDraft(input: { userId: string; name: string; prompt: string; trainingNotes?: string | null; outputFormat?: string | null; url: string }) {
  const memory = await queryAgentTaskMemory({
    userId: input.userId,
    prompt: input.prompt,
    url: input.url,
  });
  return inspectUrl({
    name: input.name,
    prompt: input.prompt,
    trainingNotes: input.trainingNotes,
    outputFormat: input.outputFormat,
    url: input.url,
  }, memory.text);
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
    let structured: any = null;
    let rawPreview = "";
    let memoryUsed = false;
    let memorySearchAt: Date | null = null;

    if (task.url) {
      const memory = await queryAgentTaskMemory({
        userId: task.userId,
        taskId: task.id,
        prompt: task.prompt,
        url: task.url,
      });
      memoryUsed = memory.used;
      memorySearchAt = memory.searchedAt;
      const result = await inspectUrl({ name: task.name, prompt: task.prompt, trainingNotes: task.trainingNotes, outputFormat: task.outputFormat, url: task.url }, memory.text);
      structured = result.structured;
      rawPreview = result.rawPreview;
      summary = `${summary}\n\n${result.summary}`;
      status = result.ok ? "completed" : "warning";
    }

    const finishedAt = new Date();
    const updatedRun = await prisma.agentScheduledTaskRun.update({
      where: { id: run.id },
      data: {
        status,
        summary,
        structuredSummaryJson: structured ? JSON.stringify({ summary: structured.summary, actionItems: structured.actionItems }) : null,
        changesJson: structured ? JSON.stringify(structured.changes ?? []) : null,
        importantItemsJson: structured ? JSON.stringify(structured.importantItems ?? []) : null,
        rawPreview: rawPreview || null,
        confidence: structured?.confidence ?? null,
        memoryUsed,
        memorySearchAt,
        finishedAt,
      },
    });

    const nextRunAt = computeNextRunAt(task, finishedAt);
    await prisma.agentScheduledTask.update({
      where: { id: task.id },
      data: {
        lastRunAt: finishedAt,
        lastStatus: status,
        lastSummary: (structured?.summary || summary).slice(0, 2000),
        lastMemorySearchAt: memorySearchAt,
        lastMemorySearchUsed: memoryUsed,
        nextRunAt,
      },
    });

    const memoryWrite = await rememberAgentTaskRun({
      userId: task.userId,
      taskId: task.id,
      taskName: task.name,
      prompt: task.prompt,
      trainingNotes: task.trainingNotes,
      url: task.url,
      runId: updatedRun.id,
      summary,
      structuredSummary: structured ? formatStructuredSummary(structured) : null,
    });
    if (memoryWrite.ok) {
      await Promise.all([
        prisma.agentScheduledTaskRun.update({
          where: { id: updatedRun.id },
          data: { memoryWriteAt: memoryWrite.writtenAt },
        }),
        prisma.agentScheduledTask.update({
          where: { id: task.id },
          data: { lastMemoryWriteAt: memoryWrite.writtenAt, lastMemoryVectorCount: memoryWrite.vectorCount },
        }),
      ]);
    }

    if (task.notifyOnRun && task.user?.profile?.notifyAgentTasks !== false) {
      const notificationBody = structured?.summary
        ? [
            structured.summary,
            structured?.actionItems?.[0] ? `Action: ${structured.actionItems[0]}` : "",
          ].filter(Boolean).join(" • ")
        : status === "completed"
          ? "Task completed. Open Dayza to view the result."
          : "Task needs attention. Open Dayza to view the result.";
      await sendPushToUser(task.userId, {
        title: `Agent task: ${task.name}`,
        body: notificationBody.slice(0, 180),
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
