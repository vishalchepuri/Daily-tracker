export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { estimateMicronutrientsForFood } from "@/lib/micronutrient-estimator";
import { upsertFoodMicronutrientLog } from "@/lib/firestore-app-data";

function parseFoodText(value: string) {
  const text = value.trim();
  const servingMatch = text.match(/(\d+(?:\.\d+)?)\s*(g|kg|ml)\b/i);
  const servingSize = servingMatch ? `${servingMatch[1]} ${servingMatch[2].toLowerCase()}` : null;
  const foodName = servingMatch ? text.slice(0, servingMatch.index).replace(/[-–,]+$/g, "").trim() : text;
  return { foodName: foodName || text, servingSize };
}

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
      if (foods.length > 0 && foods.every((food: any) => typeof food === "string")) {
        foodLogs.push({
          userId,
          date: today,
          mealType: meal.mealType ?? "meal",
          foodName: meal.title ?? foods[0] ?? "Diet meal",
          servingSize: foods.join(", "),
          calories: Number(meal.calories ?? 0),
          protein: Number(meal.protein ?? 0),
          carbs: Number(meal.carbs ?? 0),
          fat: Number(meal.fat ?? 0),
          fiber: Number(meal.fiber ?? 0),
        });
        continue;
      }
      for (const food of foods) {
        const parsedFood = typeof food === "string" ? parseFoodText(food) : null;
        foodLogs.push({
          userId, date: today,
          mealType: meal.mealType ?? "meal",
          foodName: parsedFood?.foodName ?? food.name ?? meal.title ?? "Food",
          servingSize: parsedFood?.servingSize ?? food.servingSize ?? null,
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
    const created = [];
    for (const foodLog of foodLogs) {
      const log = await prisma.foodLog.create({ data: foodLog });
      created.push(log);
      const micronutrients = estimateMicronutrientsForFood(log.foodName, log.servingSize);
      if (Object.keys(micronutrients).length > 0) {
        await upsertFoodMicronutrientLog(userId, log.id, {
          foodName: log.foodName,
          mealType: log.mealType,
          servingSize: log.servingSize,
          date: log.date,
          micronutrients,
          source: "estimated",
        });
      }
    }
    return NextResponse.json({ ok: true, count: created.length });
  } catch (error: any) {
    return NextResponse.json({ error: process.env.NODE_ENV === "production" ? "Failed" : error?.message ?? "Failed" }, { status: 500 });
  }
}
