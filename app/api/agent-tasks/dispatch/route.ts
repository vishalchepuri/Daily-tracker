export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isCronAuthorized, runAgentScheduledTask } from "@/lib/agent-scheduled-tasks";

async function dispatch(req: Request) {
  try {
    const user = await requireCurrentUser();
    const cronMode = !user && isCronAuthorized(req);
    if (!user && !cronMode) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(req.url);
    const taskId = url.searchParams.get("taskId");
    const now = new Date();

    const tasks = taskId
      ? await prisma.agentScheduledTask.findMany({
          where: { id: taskId, ...(cronMode ? {} : { userId: user!.id }) },
          take: 1,
        })
      : await prisma.agentScheduledTask.findMany({
          where: {
            active: true,
            nextRunAt: { lte: now },
            ...(cronMode ? {} : { userId: user!.id }),
          },
          orderBy: { nextRunAt: "asc" },
          take: cronMode ? 20 : 5,
        });

    const runs = [];
    for (const task of tasks) {
      runs.push(await runAgentScheduledTask(task.id));
    }

    return NextResponse.json({ mode: cronMode ? "cron" : "user", checked: tasks.length, runs });
  } catch (error: any) {
    return NextResponse.json({ error: process.env.NODE_ENV === "production" ? "Failed" : error?.message ?? "Failed" }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return dispatch(req);
}

export async function POST(req: Request) {
  return dispatch(req);
}
