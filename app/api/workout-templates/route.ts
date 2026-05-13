export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = (session.user as any)?.id;
    const templates = await prisma.workoutTemplate.findMany({
      where: { userId },
      include: { exercises: { include: { exercise: true }, orderBy: { orderIndex: "asc" } } },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json({ templates });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Failed" }, { status: 500 });
  }
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeExercises(exercises: any[] = []) {
  return exercises
    .filter((item) => item?.exerciseId)
    .map((item, index) => ({
      exerciseId: item.exerciseId,
      sets: parseInt(item.sets ?? "3"),
      reps: item.reps || "8-12",
      restSeconds: parseInt(item.restSeconds ?? "90"),
      orderIndex: index,
    }));
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = (session.user as any)?.id;
    const data = await req.json();
    if (!data?.name) {
      return NextResponse.json({ error: "Workout day name is required" }, { status: 400 });
    }

    const baseId = slugify(data.name);
    let id = baseId;
    let suffix = 2;
    while (await prisma.workoutTemplate.findUnique({ where: { id } })) {
      id = `${baseId}-${suffix}`;
      suffix += 1;
    }

    const template = await prisma.workoutTemplate.create({
      data: {
        id,
        userId,
        name: data.name,
        description: data.description || null,
        dayOfWeek: data.dayOfWeek || null,
        muscleGroups: data.muscleGroups || null,
        difficulty: data.difficulty || "intermediate",
        exercises: { create: normalizeExercises(data.exercises) },
      },
      include: { exercises: { include: { exercise: true }, orderBy: { orderIndex: "asc" } } },
    });
    return NextResponse.json({ template });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Failed" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = (session.user as any)?.id;
    const data = await req.json();
    if (!data?.id || !data?.name) {
      return NextResponse.json({ error: "ID and workout day name are required" }, { status: 400 });
    }

    const existing = await prisma.workoutTemplate.findFirst({ where: { id: data.id, userId } });
    if (!existing) return NextResponse.json({ error: "Workout day not found" }, { status: 404 });

    const template = await prisma.workoutTemplate.update({
      where: { id: existing.id },
      data: {
        name: data.name,
        description: data.description || null,
        dayOfWeek: data.dayOfWeek || null,
        muscleGroups: data.muscleGroups || null,
        difficulty: data.difficulty || "intermediate",
        exercises: {
          deleteMany: {},
          create: normalizeExercises(data.exercises),
        },
      },
      include: { exercises: { include: { exercise: true }, orderBy: { orderIndex: "asc" } } },
    });
    return NextResponse.json({ template });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Failed" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = (session.user as any)?.id;
    const data = await req.json();
    if (!data?.id) {
      return NextResponse.json({ error: "Workout day ID is required" }, { status: 400 });
    }

    const existing = await prisma.workoutTemplate.findFirst({ where: { id: data.id, userId } });
    if (!existing) return NextResponse.json({ error: "Workout day not found" }, { status: 404 });

    await prisma.workoutTemplate.delete({ where: { id: existing.id } });
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Failed" }, { status: 500 });
  }
}
