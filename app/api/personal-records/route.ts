export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const user = await requireCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = (user as any).id;
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const logs = await prisma.exerciseLog.findMany({
      where: { workoutLog: { userId, date: { gte: ninetyDaysAgo } } },
      include: {
        exercise: { select: { name: true, muscleGroup: true } },
        workoutLog: { select: { date: true } },
      },
      orderBy: { workoutLog: { date: "desc" } },
      take: 500,
    });

    const prs: Record<string, { exerciseName: string; muscleGroup: string; maxWeight: number; maxReps: number; date: string; totalSets: number }> = {};

    for (const log of logs) {
      const exId = log.exerciseId;
      if (!prs[exId]) {
        prs[exId] = {
          exerciseName: log.exercise.name,
          muscleGroup: log.exercise.muscleGroup,
          maxWeight: 0,
          maxReps: 0,
          date: log.workoutLog.date.toISOString(),
          totalSets: 0,
        };
      }
      prs[exId].totalSets += 1;
      if (log.weight > prs[exId].maxWeight || (log.weight === prs[exId].maxWeight && log.reps > prs[exId].maxReps)) {
        prs[exId].maxWeight = log.weight;
        prs[exId].maxReps = log.reps;
        prs[exId].date = log.workoutLog.date.toISOString();
      }
    }

    const records = Object.values(prs).sort((a, b) => b.maxWeight - a.maxWeight);
    return NextResponse.json({ records });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Failed" }, { status: 500 });
  }
}
