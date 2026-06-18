export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdminUser, requireCurrentUser } from "@/lib/auth";
import { cacheDeletePattern, cacheGetJson, cacheSetJson } from "@/lib/cache";
import { prisma } from "@/lib/db";
import { ensureStarterExerciseLibrarySafe } from "@/lib/exercise-library";

const EXERCISE_CACHE_TTL_SECONDS = 10 * 60;

const compactExerciseSelect = {
  id: true,
  name: true,
  muscleGroup: true,
  equipment: true,
  category: true,
  status: true,
};

type CompactExercise = {
  id: string;
  name: string;
  muscleGroup: string;
  equipment: string | null;
  category: string | null;
  status: string;
};

function approvedExerciseCacheKey(muscleGroup: string | null) {
  return `v1:exercises:compact:${muscleGroup ? `muscle:${muscleGroup}` : "muscle:all"}:approved`;
}

async function invalidateExerciseCache() {
  await cacheDeletePattern("v1:exercises:*");
}

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

    if (compact && !admin) {
      const cacheKey = approvedExerciseCacheKey(muscleGroup);
      let approvedExercises = await cacheGetJson<CompactExercise[]>(cacheKey);
      let cacheStatus = "HIT";

      if (!approvedExercises) {
        approvedExercises = await prisma.exercise.findMany({
          where: {
            ...(muscleGroup ? { muscleGroup } : {}),
            status: "approved",
          },
          select: compactExerciseSelect,
          orderBy: { name: "asc" },
        });
        await cacheSetJson(cacheKey, approvedExercises, EXERCISE_CACHE_TTL_SECONDS);
        cacheStatus = "MISS";
      }

      const pendingExercises = userId
        ? await prisma.exercise.findMany({
            where: {
              ...(muscleGroup ? { muscleGroup } : {}),
              status: "pending",
              submittedById: userId,
            },
            select: compactExerciseSelect,
            orderBy: { name: "asc" },
          })
        : [];

      const exercises = [...approvedExercises, ...pendingExercises].sort((a, b) => a.name.localeCompare(b.name));
      return NextResponse.json(
        { exercises },
        {
          headers: {
            "Cache-Control": "private, max-age=60, stale-while-revalidate=600",
            "X-Dayza-Cache": cacheStatus,
          },
        }
      );
    }

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
    const exercises = await prisma.exercise.findMany({
      where,
      include: admin ? { submittedBy: { select: { name: true, email: true } } } : undefined,
      orderBy: { name: "asc" },
    });
    return NextResponse.json(
      { exercises },
      { headers: { "Cache-Control": admin ? "no-store" : "private, max-age=60, stale-while-revalidate=600", "X-Dayza-Cache": "SKIP" } }
    );
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
    await invalidateExerciseCache();
    return NextResponse.json({ exercise, pending: exercise.status === "pending" });
  } catch (error: any) {
    return NextResponse.json({ error: process.env.NODE_ENV === "production" ? "Failed" : error?.message ?? "Failed" }, { status: 500 });
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
    await invalidateExerciseCache();
    return NextResponse.json({ exercise });
  } catch (error: any) {
    return NextResponse.json({ error: process.env.NODE_ENV === "production" ? "Failed" : error?.message ?? "Failed" }, { status: 500 });
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
    await invalidateExerciseCache();
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: process.env.NODE_ENV === "production" ? "Failed" : error?.message ?? "Failed" }, { status: 500 });
  }
}
