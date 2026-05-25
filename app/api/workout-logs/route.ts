export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(req: Request) {
  try {
    const user = await requireCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = user.id;
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get("limit") ?? "30");
    const logs = await prisma.workoutLog.findMany({
      where: { userId },
      include: { exerciseLogs: { include: { exercise: true } } },
      orderBy: { date: "desc" },
      take: limit,
    });
    return NextResponse.json({ logs });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Failed" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = user.id;
    const data = await req.json();
    const { templateName, duration, notes, exercises: exerciseData, submissionId } = data;
    if (submissionId) {
      const existing = await prisma.workoutLog.findUnique({
        where: { userId_submissionId: { userId, submissionId } },
        include: { exerciseLogs: { include: { exercise: true } } },
      });
      if (existing) return NextResponse.json({ log: existing, duplicate: true });
    }
    
    const log = await prisma.workoutLog.create({
      data: {
        userId,
        submissionId: submissionId || null,
        templateName,
        duration: duration ? parseInt(duration) : null,
        notes,
        exerciseLogs: {
          create: (exerciseData ?? []).map((ex: any) => ({
            exerciseId: ex.exerciseId,
            setNumber: ex.setNumber,
            reps: ex.reps,
            weight: ex.weight,
          })),
        },
      },
      include: { exerciseLogs: { include: { exercise: true } } },
    });
    return NextResponse.json({ log });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Failed" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await requireCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = user.id;
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });

    const existing = await prisma.workoutLog.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.workoutLog.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Failed" }, { status: 500 });
  }
}
