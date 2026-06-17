export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(req: Request) {
  try {
    const user = await requireCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = (user as any).id;
    const { planId } = await req.json();
    if (!planId) return NextResponse.json({ error: "planId required" }, { status: 400 });

    const plan = await prisma.dietPlan.findFirst({ where: { id: planId, userId } });
    if (!plan) return NextResponse.json({ error: "Plan not found" }, { status: 404 });

    let meals: any[] = [];
    try { meals = JSON.parse(plan.mealsJson ?? "[]"); } catch { meals = []; }

    const today = new Date();
    today.setHours(12, 0, 0, 0);

    const foodLogs: any[] = [];
    for (const meal of meals) {
      const foods = meal.foods ?? [];
      for (const food of foods) {
        foodLogs.push({
          userId, date: today,
          mealType: meal.mealType ?? "meal",
          foodName: food.name ?? meal.title ?? "Food",
          servingSize: food.servingSize ?? null,
          calories: Number(food.calories ?? 0),
          protein: Number(food.protein ?? 0),
          carbs: Number(food.carbs ?? 0),
          fat: Number(food.fat ?? 0),
          fiber: Number(food.fiber ?? 0),
        });
      }
      if (foods.length === 0 && meal.title) {
        foodLogs.push({
          userId, date: today,
          mealType: meal.mealType ?? "meal",
          foodName: meal.title,
          servingSize: null,
          calories: Number(meal.calories ?? 0),
          protein: Number(meal.protein ?? 0),
          carbs: Number(meal.carbs ?? 0),
          fat: Number(meal.fat ?? 0),
          fiber: 0,
        });
      }
    }

    if (foodLogs.length === 0) return NextResponse.json({ error: "No meals found in plan" }, { status: 400 });
    await prisma.foodLog.createMany({ data: foodLogs });
    return NextResponse.json({ ok: true, count: foodLogs.length });
  } catch (error: any) {
    return NextResponse.json({ error: process.env.NODE_ENV === "production" ? "Failed" : error?.message ?? "Failed" }, { status: 500 });
  }
}
