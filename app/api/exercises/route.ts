export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ensureStarterExerciseLibrarySafe } from "@/lib/exercise-library";

export async function GET(req: Request) {
  try {
    await ensureStarterExerciseLibrarySafe();
    const { searchParams } = new URL(req.url);
    const muscleGroup = searchParams.get("muscleGroup");
    const where = muscleGroup ? { muscleGroup } : {};
    const exercises = await prisma.exercise.findMany({ where, orderBy: { name: "asc" } });
    return NextResponse.json({ exercises });
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

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const data = await req.json();
    if (!data?.name || !data?.muscleGroup) {
      return NextResponse.json({ error: "Name and muscle group are required" }, { status: 400 });
    }

    const baseId = slugify(data.name);
    let id = baseId;
    let suffix = 2;
    while (await prisma.exercise.findUnique({ where: { id } })) {
      id = `${baseId}-${suffix}`;
      suffix += 1;
    }

    const exercise = await prisma.exercise.create({
      data: {
        id,
        name: data.name,
        muscleGroup: data.muscleGroup,
        equipment: data.equipment || null,
        category: data.category || null,
        description: data.description || null,
        formTips: data.formTips || null,
      },
    });
    return NextResponse.json({ exercise });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Failed" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const data = await req.json();
    if (!data?.id || !data?.name || !data?.muscleGroup) {
      return NextResponse.json({ error: "ID, name, and muscle group are required" }, { status: 400 });
    }

    const exercise = await prisma.exercise.update({
      where: { id: data.id },
      data: {
        name: data.name,
        muscleGroup: data.muscleGroup,
        equipment: data.equipment || null,
        category: data.category || null,
        description: data.description || null,
        formTips: data.formTips || null,
      },
    });
    return NextResponse.json({ exercise });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Failed" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const data = await req.json();
    if (!data?.id) {
      return NextResponse.json({ error: "Exercise ID is required" }, { status: 400 });
    }

    await prisma.exercise.delete({ where: { id: data.id } });
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Failed" }, { status: 500 });
  }
}
