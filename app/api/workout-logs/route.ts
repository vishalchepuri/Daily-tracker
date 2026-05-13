export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = (session.user as any)?.id;
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
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = (session.user as any)?.id;
    const data = await req.json();
    const { templateName, duration, notes, exercises: exerciseData } = data;
    
    const log = await prisma.workoutLog.create({
      data: {
        userId,
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
