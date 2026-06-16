export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdminUser, requireCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ensureStarterExerciseLibrarySafe } from "@/lib/exercise-library";

export async function GET(req: Request) {
  try {
    await ensureStarterExerciseLibrarySafe();
    const { searchParams } = new URL(req.url);
    const muscleGroup = searchParams.get("muscleGroup");
    const compact = searchParams.get("compact") === "1";
    const admin = await requireAdminUser();
    const user = await requireCurrentUser();
    const userId = user?.id;
    const status = admin ? searchParams.get("status") : null;
    const where = {
      ...(muscleGroup ? { muscleGroup } : {}),
      ...(admin
        ? { status: status || "approved" }
        : {
            OR: [
              { status: "approved" },
              ...(userId ? [{ status: "pending", submittedById: userId }] : []),
            ],
          }),
    };
    const exercises = compact && !admin
      ? await prisma.exercise.findMany({
          where,
          select: {
            id: true,
            name: true,
            muscleGroup: true,
            equipment: true,
            category: true,
            status: true,
          },
          orderBy: { name: "asc" },
        })
      : await prisma.exercise.findMany({
          where,
          include: admin ? { submittedBy: { select: { name: true, email: true } } } : undefined,
          orderBy: { name: "asc" },
        });
    return NextResponse.json(
      { exercises },
      { headers: { "Cache-Control": admin ? "no-store" : "private, max-age=60, stale-while-revalidate=600" } }
    );
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
    const user = await requireCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const admin = await requireAdminUser();
    const data = await req.json();
    if (!data?.name || !data?.muscleGroup) {
      return NextResponse.json({ error: "Name and muscle group are required" }, { status: 400 });
    }

    const existing = await prisma.exercise.findFirst({
      where: {
        name: { equals: String(data.name).trim(), mode: "insensitive" },
        status: { in: ["approved", "pending"] },
      },
    });
    if (existing) {
      return NextResponse.json(
        { error: existing.status === "pending" ? "This exercise is already waiting for admin approval." : "This exercise already exists in the library." },
        { status: 409 }
      );
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
        status: admin ? "approved" : "pending",
        submittedById: admin ? null : (user as any).id,
        reviewedById: admin ? admin.id : null,
        reviewedAt: admin ? new Date() : null,
      },
    });
    return NextResponse.json({ exercise, pending: exercise.status === "pending" });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Failed" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const user = await requireCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const admin = await requireAdminUser();
    if (!admin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    const data = await req.json();
    if (!data?.id) {
      return NextResponse.json({ error: "Exercise ID is required" }, { status: 400 });
    }

    const existing = await prisma.exercise.findUnique({ where: { id: data.id } });
    if (!existing) return NextResponse.json({ error: "Exercise not found" }, { status: 404 });

    const requestedStatus = typeof data.status === "string" ? String(data.status).trim().toLowerCase() : null;
    if (requestedStatus && !["approved", "rejected", "pending"].includes(requestedStatus)) {
      return NextResponse.json({ error: "Invalid exercise status" }, { status: 400 });
    }

    if (!requestedStatus && (!data?.name || !data?.muscleGroup)) {
      return NextResponse.json({ error: "ID, name, and muscle group are required" }, { status: 400 });
    }

    const exercise = await prisma.exercise.update({
      where: { id: data.id },
      data: {
        name: data.name ?? existing.name,
        muscleGroup: data.muscleGroup ?? existing.muscleGroup,
        equipment: data.equipment === undefined ? existing.equipment : data.equipment || null,
        category: data.category === undefined ? existing.category : data.category || null,
        description: data.description === undefined ? existing.description : data.description || null,
        formTips: data.formTips === undefined ? existing.formTips : data.formTips || null,
        status: requestedStatus ?? existing.status,
        reviewedById: requestedStatus ? admin.id : existing.reviewedById,
        reviewedAt: requestedStatus ? new Date() : existing.reviewedAt,
      },
    });
    if (requestedStatus) {
      revalidatePath("/admin");
      revalidatePath("/workouts");
      revalidatePath("/profile");
    }
    return NextResponse.json({ exercise });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Failed" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await requireCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const admin = await requireAdminUser();
    if (!admin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });
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
