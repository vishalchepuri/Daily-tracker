import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { listRecentIssueReports } from "@/lib/firestore-app-data";

function formatDate(value?: Date | string | number | null) {
  if (!value) return "Never";
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatInr(value?: number | null, currency = "INR") {
  return `${currency} ${Number(value ?? 0).toFixed(0)}`;
}

export async function GET(request: NextRequest) {
  const admin = await requireAdminUser();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const panel = request.nextUrl.searchParams.get("panel");

  if (panel === "review-queue") {
    const [pendingExercises, pendingAgentTemplates, issueReports] = await Promise.all([
      prisma.exercise.findMany({
        where: { status: "pending" },
        orderBy: { createdAt: "asc" },
        take: 20,
        select: {
          id: true,
          name: true,
          muscleGroup: true,
          equipment: true,
          createdAt: true,
          submittedBy: { select: { name: true, email: true } },
        },
      }),
      prisma.agentTaskTemplate.findMany({
        where: { status: "pending", shared: true },
        orderBy: { createdAt: "asc" },
        take: 20,
        select: {
          id: true,
          name: true,
          description: true,
          category: true,
          createdAt: true,
          submittedBy: { select: { name: true, email: true } },
        },
      }),
      listRecentIssueReports(8),
    ]);

    const items = [
      ...pendingExercises.map((exercise) => ({
        id: exercise.id,
        type: "Exercise",
        title: exercise.name,
        detail: `${exercise.muscleGroup}${exercise.equipment ? ` - ${exercise.equipment}` : ""}`,
        user: exercise.submittedBy?.name || exercise.submittedBy?.email || "Unknown user",
        createdAt: exercise.createdAt.toISOString(),
        kind: "exercise",
      })),
      ...pendingAgentTemplates.map((template) => ({
        id: template.id,
        type: "Agent Template",
        title: template.name,
        detail: `${template.category}${template.description ? ` - ${template.description}` : ""}`,
        user: template.submittedBy?.name || template.submittedBy?.email || "Unknown user",
        createdAt: template.createdAt.toISOString(),
        kind: "agent-template",
      })),
      ...issueReports
        .filter((issue) => issue.status === "open")
        .map((issue) => {
          const createdAt = new Date(issue.createdAt ?? Date.now());
          return {
            id: issue.id,
            type: "Issue",
            title: issue.category,
            detail: issue.message,
            user: issue.name || issue.email || "Anonymous",
            createdAt: createdAt.toISOString(),
            kind: "issue",
          };
        }),
    ]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 12);

    return NextResponse.json({ items });
  }

  if (panel === "recent-spends") {
    const spends = await prisma.spend.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        id: true,
        merchant: true,
        amount: true,
        currency: true,
        source: true,
        user: { select: { name: true, email: true } },
      },
    });

    return NextResponse.json({
      items: spends.map((spend) => ({
        id: spend.id,
        title: spend.merchant || "Spend",
        detail: `${spend.user.name || spend.user.email} - ${spend.source || "manual"}`,
        value: formatInr(Number(spend.amount ?? 0), spend.currency ?? "INR"),
      })),
    });
  }

  if (panel === "recent-workouts") {
    const workouts = await prisma.workoutLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 6,
      select: {
        id: true,
        templateName: true,
        duration: true,
        date: true,
        user: { select: { name: true, email: true } },
      },
    });

    return NextResponse.json({
      items: workouts.map((workout) => ({
        id: workout.id,
        title: workout.templateName || "Workout",
        detail: `${workout.user.name || workout.user.email} - ${formatDate(workout.date)}`,
        value: workout.duration ? `${workout.duration} min` : "Logged",
      })),
    });
  }

  return NextResponse.json({ error: "Unknown admin panel" }, { status: 400 });
}
