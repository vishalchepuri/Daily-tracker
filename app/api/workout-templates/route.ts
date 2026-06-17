export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const user = await requireCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = user.id;
    const templates = await prisma.workoutTemplate.findMany({
      where: { userId },
      include: {
        exercises: {
          orderBy: { orderIndex: "asc" },
          include: {
            exercise: {
              select: { id: true, name: true, muscleGroup: true, equipment: true, category: true, status: true },
            },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json({ templates }, { headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=120" } });
  } catch (error: any) {
    return NextResponse.json({ error: process.env.NODE_ENV === "production" ? "Failed" : error?.message ?? "Failed" }, { status: 500 });
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

function normalizeRoutineItems(items: any[] = []) {
  return items
    .map((item) => {
      if (typeof item === "string") return { name: item.trim(), duration: "", notes: "" };
      return {
        name: String(item?.name ?? "").trim(),
        duration: String(item?.duration ?? item?.time ?? "").trim(),
        notes: String(item?.notes ?? item?.description ?? "").trim(),
      };
    })
    .filter((item) => item.name);
}

function routineJson(items: any[] = []) {
  const normalized = normalizeRoutineItems(items);
  return normalized.length ? JSON.stringify(normalized) : null;
}

export async function POST(req: Request) {
  try {
    const user = await requireCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = user.id;
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
        warmupJson: routineJson(data.warmups ?? data.warmup),
        stretchesJson: routineJson(data.stretches ?? data.cooldown ?? data.cooldowns),
        exercises: { create: normalizeExercises(data.exercises) },
      },
      include: { exercises: { include: { exercise: true }, orderBy: { orderIndex: "asc" } } },
    });
    return NextResponse.json({ template });
  } catch (error: any) {
    return NextResponse.json({ error: process.env.NODE_ENV === "production" ? "Failed" : error?.message ?? "Failed" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const user = await requireCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = user.id;
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
        warmupJson: routineJson(data.warmups ?? data.warmup),
        stretchesJson: routineJson(data.stretches ?? data.cooldown ?? data.cooldowns),
        exercises: {
          deleteMany: {},
          create: normalizeExercises(data.exercises),
        },
      },
      include: { exercises: { include: { exercise: true }, orderBy: { orderIndex: "asc" } } },
    });
    return NextResponse.json({ template });
  } catch (error: any) {
    return NextResponse.json({ error: process.env.NODE_ENV === "production" ? "Failed" : error?.message ?? "Failed" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await requireCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = user.id;
    const data = await req.json();
    if (!data?.id) {
      return NextResponse.json({ error: "Workout day ID is required" }, { status: 400 });
    }

    const existing = await prisma.workoutTemplate.findFirst({ where: { id: data.id, userId } });
    if (!existing) return NextResponse.json({ error: "Workout day not found" }, { status: 404 });

    await prisma.workoutTemplate.delete({ where: { id: existing.id } });
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: process.env.NODE_ENV === "production" ? "Failed" : error?.message ?? "Failed" }, { status: 500 });
  }
}
