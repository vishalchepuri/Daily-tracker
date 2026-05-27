export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

function safeMealsJson(value: unknown) {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return JSON.stringify(value);
  return "[]";
}

export async function GET(req: Request) {
  try {
    const user = await requireCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = user.id;
    const { searchParams } = new URL(req.url);
    const offset = Math.max(0, Number(searchParams.get("offset") ?? 0) || 0);
    const limit = Math.min(50, Math.max(5, Number(searchParams.get("limit") ?? 10) || 10));

    const plans = await prisma.dietPlan.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      skip: offset,
      take: limit + 1,
    });
    return NextResponse.json({
      plans: plans.slice(0, limit),
      nextOffset: offset + Math.min(plans.length, limit),
      hasMore: plans.length > limit,
    });
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
    if (!data?.name) return NextResponse.json({ error: "Diet name is required" }, { status: 400 });

    const plan = await prisma.dietPlan.create({
      data: {
        userId,
        name: data.name,
        goal: data.goal || null,
        notes: data.notes || null,
        mealsJson: safeMealsJson(data.meals),
      },
    });
    return NextResponse.json({ plan });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Failed" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const user = await requireCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = user.id;
    const data = await req.json();
    if (!data?.id) return NextResponse.json({ error: "Diet ID is required" }, { status: 400 });

    const existing = await prisma.dietPlan.findFirst({ where: { id: data.id, userId } });
    if (!existing) return NextResponse.json({ error: "Diet plan not found" }, { status: 404 });

    const plan = await prisma.dietPlan.update({
      where: { id: existing.id },
      data: {
        name: data.name ?? existing.name,
        goal: data.goal ?? existing.goal,
        notes: data.notes ?? existing.notes,
        mealsJson: data.meals == null ? existing.mealsJson : safeMealsJson(data.meals),
      },
    });
    return NextResponse.json({ plan });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Failed" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await requireCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = user.id;
    const data = await req.json();
    if (!data?.id) return NextResponse.json({ error: "Diet ID is required" }, { status: 400 });

    const existing = await prisma.dietPlan.findFirst({ where: { id: data.id, userId } });
    if (!existing) return NextResponse.json({ error: "Diet plan not found" }, { status: 404 });

    await prisma.dietPlan.delete({ where: { id: existing.id } });
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Failed" }, { status: 500 });
  }
}
