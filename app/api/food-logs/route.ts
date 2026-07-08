export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  deleteFoodMicronutrientLog,
  listFoodMicronutrientLogsForFoodLogs,
  upsertFoodMicronutrientLog,
} from "@/lib/firestore-app-data";
import { parseMicronutrientMap } from "@/lib/micronutrients";
import { estimateMicronutrientsForFood } from "@/lib/micronutrient-estimator";

export async function GET(req: Request) {
  try {
    const user = await requireCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = user.id;
    const { searchParams } = new URL(req.url);
    const dateStr = searchParams.get("date");
    const rangeDays = Math.min(31, Math.max(1, Number(searchParams.get("rangeDays") ?? 1) || 1));
    const date = dateStr ? new Date(dateStr) : new Date();
    const startOfDay = new Date(date);
    startOfDay.setDate(startOfDay.getDate() - (rangeDays - 1));
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);
    
    const logs = await prisma.foodLog.findMany({
      where: { userId, date: { gte: startOfDay, lte: endOfDay } },
      orderBy: { createdAt: "asc" },
    });
    const micronutrientsByFoodLogId = await listFoodMicronutrientLogsForFoodLogs(userId, logs.map((log) => log.id));
    return NextResponse.json({
      logs: logs.map((log) => ({
        ...log,
        micronutrients: micronutrientsByFoodLogId[log.id]?.micronutrients ?? {},
        micronutrientSource: micronutrientsByFoodLogId[log.id]?.source ?? null,
      })),
    });
  } catch (error: any) {
    return NextResponse.json({ error: process.env.NODE_ENV === "production" ? "Failed" : error?.message ?? "Failed" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = user.id;
    const data = await req.json();
    const log = await prisma.foodLog.create({
      data: {
        userId,
        foodName: data.foodName,
        mealType: data.mealType,
        servingSize: data.servingSize || null,
        calories: data.calories ?? 0,
        protein: data.protein ?? 0,
        carbs: data.carbs ?? 0,
        fat: data.fat ?? 0,
        fiber: data.fiber ?? 0,
        date: data.date ? new Date(data.date) : new Date(),
      },
    });
    let micronutrients = parseMicronutrientMap(data.micronutrients);
    if (Object.keys(micronutrients).length === 0) {
      micronutrients = estimateMicronutrientsForFood(log.foodName, log.servingSize);
    }
    if (Object.keys(micronutrients).length > 0) {
      await upsertFoodMicronutrientLog(userId, log.id, {
        foodName: log.foodName,
        mealType: log.mealType,
        servingSize: log.servingSize,
        date: log.date,
        micronutrients,
        source: data.micronutrientSource ?? (data.micronutrients ? "manual" : "estimated"),
      });
    }
    return NextResponse.json({ log });
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
    if (!data?.id) return NextResponse.json({ error: "ID required" }, { status: 400 });

    const existing = await prisma.foodLog.findFirst({ where: { id: data.id, userId } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const log = await prisma.foodLog.update({
      where: { id: existing.id },
      data: {
        foodName: data.foodName,
        mealType: data.mealType,
        servingSize: data.servingSize || null,
        calories: data.calories ?? 0,
        protein: data.protein ?? 0,
        carbs: data.carbs ?? 0,
        fat: data.fat ?? 0,
        fiber: data.fiber ?? 0,
        date: data.date ? new Date(data.date) : undefined,
      },
    });
    let micronutrients = parseMicronutrientMap(data.micronutrients);
    if (Object.keys(micronutrients).length === 0) {
      micronutrients = estimateMicronutrientsForFood(log.foodName, log.servingSize);
    }
    if (Object.keys(micronutrients).length > 0) {
      await upsertFoodMicronutrientLog(userId, log.id, {
        foodName: log.foodName,
        mealType: log.mealType,
        servingSize: log.servingSize,
        date: log.date,
        micronutrients,
        source: data.micronutrientSource ?? (data.micronutrients ? "manual" : "estimated"),
      });
    } else if ("micronutrients" in data) {
      await deleteFoodMicronutrientLog(userId, log.id);
    }
    return NextResponse.json({ log });
  } catch (error: any) {
    return NextResponse.json({ error: process.env.NODE_ENV === "production" ? "Failed" : error?.message ?? "Failed" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await requireCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });
    const existing = await prisma.foodLog.findFirst({ where: { id, userId: (user as any)?.id } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await prisma.foodLog.delete({ where: { id: existing.id } });
    await deleteFoodMicronutrientLog((user as any).id, existing.id);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: process.env.NODE_ENV === "production" ? "Failed" : error?.message ?? "Failed" }, { status: 500 });
  }
}
