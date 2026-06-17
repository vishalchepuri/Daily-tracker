export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";

export async function GET(req: Request) {
  try {
    const user = await requireCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = (user as any).id;

    const limited = rateLimit(req, "ai-report", { limit: 5, windowMs: 60 * 60 * 1000, userId });
    if (!limited.ok) {
      return NextResponse.json({ error: "Rate limited. Try again later." }, { status: 429, headers: rateLimitHeaders(limited) });
    }

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const [foodLogs, waterLogs, workoutLogs, progressEntries, profile] = await Promise.all([
      prisma.foodLog.findMany({ where: { userId, date: { gte: sevenDaysAgo } } }),
      prisma.waterLog.findMany({ where: { userId, date: { gte: sevenDaysAgo } } }),
      prisma.workoutLog.findMany({ where: { userId, date: { gte: sevenDaysAgo } }, include: { exerciseLogs: true } }),
      prisma.progressEntry.findMany({ where: { userId }, orderBy: { date: "desc" }, take: 5 }),
      prisma.userProfile.findUnique({ where: { userId } }),
    ]);

    const totalCalories = foodLogs.reduce((s, l) => s + (l.calories ?? 0), 0);
    const totalProtein = foodLogs.reduce((s, l) => s + (l.protein ?? 0), 0);
    const avgCalories = foodLogs.length > 0 ? Math.round(totalCalories / 7) : 0;
    const avgProtein = foodLogs.length > 0 ? Math.round(totalProtein / 7) : 0;
    const totalWaterMl = waterLogs.reduce((s, l) => s + (l.amountMl ?? 0), 0);
    const avgWaterMl = Math.round(totalWaterMl / 7);
    const workoutCount = workoutLogs.length;
    const mealDays = new Set(foodLogs.map((l) => new Date(l.date).toDateString())).size;
    const latestWeight = progressEntries[0]?.weight;
    const targetCal = profile?.targetCalories ?? 2000;
    const targetProtein = profile?.targetProtein ?? 150;
    const targetWater = profile?.targetWaterMl ?? 3000;

    const stats = { avgCalories, targetCal, avgProtein, targetProtein, avgWaterMl, targetWater, workoutCount, mealDays, latestWeight, goal: profile?.goal ?? "maintain" };

    if (workoutCount === 0 && foodLogs.length === 0 && waterLogs.length === 0) {
      return NextResponse.json({ empty: true, stats, message: "Start logging workouts, meals, or water to get your weekly AI report card!" });
    }

    const prompt = `You are Dayza AI, a personal health coach. Generate a structured weekly report for a user with these stats from the past 7 days:
- Goal: ${stats.goal}
- Avg daily calories: ${stats.avgCalories} kcal (target: ${stats.targetCal} kcal)
- Avg daily protein: ${stats.avgProtein}g (target: ${stats.targetProtein}g)
- Avg daily water: ${Math.round((stats.avgWaterMl / 1000) * 10) / 10}L (target: ${Math.round((stats.targetWater / 1000) * 10) / 10}L)
- Workout sessions: ${stats.workoutCount} (target: 4-5/week)
- Days with meals logged: ${stats.mealDays}/7
${stats.latestWeight ? `- Latest weight: ${stats.latestWeight}kg` : ""}

Return ONLY a valid JSON object with this exact structure:
{"overallScore":82,"overallGrade":"B+","overallComment":"Short 2-sentence overall assessment","nutritionGrade":"A","nutritionComment":"1-2 sentences on nutrition","fitnessGrade":"B","fitnessComment":"1-2 sentences on workouts","hydrationGrade":"C+","hydrationComment":"1-2 sentences on water intake","topWins":["Win 1","Win 2","Win 3"],"actionItems":["Action 1","Action 2","Action 3"],"motivationalQuote":"A short motivational quote"}
Do not include any text outside the JSON object.`;

    const aiRes = await fetch("https://apps.abacus.ai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.ABACUSAI_API_KEY}` },
      body: JSON.stringify({ model: "gpt-5.4-mini", stream: false, max_tokens: 800, messages: [{ role: "user", content: prompt }] }),
    });
    const aiData = await aiRes.json();
    const content = aiData?.choices?.[0]?.message?.content ?? "{}";
    const cleaned = content.replace(/^```json\n?/, "").replace(/\n?```$/, "").trim();
    const report = JSON.parse(cleaned);
    return NextResponse.json({ report, stats, generatedAt: new Date().toISOString() });
  } catch (error: any) {
    return NextResponse.json({ error: process.env.NODE_ENV === "production" ? "Failed to generate report" : error?.message ?? "Failed to generate report" }, { status: 500 });
  }
}
