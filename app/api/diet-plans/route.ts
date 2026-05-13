export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

function safeMealsJson(value: unknown) {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return JSON.stringify(value);
  return "[]";
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = (session.user as any)?.id;

    const plans = await prisma.dietPlan.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
    });
    return NextResponse.json({ plans });
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
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = (session.user as any)?.id;
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
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = (session.user as any)?.id;
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
