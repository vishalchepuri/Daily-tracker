import { prisma } from "@/lib/db";

export async function sendTelegramMessage(chatId: string, text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not configured");

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Telegram send failed: ${errorText}`);
  }
}

function parseAmount(text: string, unit: string) {
  const match = text.match(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*${unit}`, "i"));
  return match ? Number(match[1]) : null;
}

function parseDateTime(text: string) {
  const lower = text.toLowerCase();
  const now = new Date();
  const date = new Date(now);
  if (lower.includes("tomorrow")) date.setDate(date.getDate() + 1);

  const timeMatch = lower.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  if (timeMatch) {
    let hour = Number(timeMatch[1]);
    const minute = Number(timeMatch[2] ?? 0);
    const meridiem = timeMatch[3];
    if (meridiem === "pm" && hour < 12) hour += 12;
    if (meridiem === "am" && hour === 12) hour = 0;
    date.setHours(hour, minute, 0, 0);
  } else {
    date.setHours(9, 0, 0, 0);
  }
  return date;
}

function mealTypeFromText(text: string) {
  const lower = text.toLowerCase();
  if (lower.includes("breakfast")) return "breakfast";
  if (lower.includes("lunch")) return "lunch";
  if (lower.includes("dinner")) return "dinner";
  return "snack";
}

async function logDietMeal(userId: string, text: string) {
  const mealType = mealTypeFromText(text);
  const plans = await prisma.dietPlan.findMany({ where: { userId }, orderBy: { updatedAt: "desc" } });
  for (const plan of plans) {
    let meals: any[] = [];
    try {
      meals = JSON.parse(plan.mealsJson ?? "[]");
    } catch {
      meals = [];
    }
    const meal = meals.find((item) => String(item?.mealType ?? "").toLowerCase().includes(mealType));
    if (!meal) continue;
    const log = await prisma.foodLog.create({
      data: {
        userId,
        mealType,
        foodName: meal.title || `${plan.name} ${meal.mealType}`,
        servingSize: Array.isArray(meal.foods) ? meal.foods.join(", ") : meal.foods || null,
        calories: Number(meal.calories) || 0,
        protein: Number(meal.protein) || 0,
        carbs: Number(meal.carbs) || 0,
        fat: Number(meal.fat) || 0,
        fiber: Number(meal.fiber) || 0,
      },
    });
    return `Logged ${log.foodName} from ${plan.name}.`;
  }
  return "I could not find that meal in your saved diet. Add a diet plan in Nutrition first, or say which diet meal to use.";
}

export async function processTelegramText(chatId: string, text: string) {
  const profile = await prisma.userProfile.findFirst({
    where: { telegramChatId: chatId, telegramEnabled: true },
  });
  if (!profile) return "This Telegram chat is not linked to an account. Add this chat ID in Reminders > Telegram first.";

  const userId = profile.userId;
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();
  await prisma.chatMessage.create({ data: { userId, role: "user", content: `[Telegram] ${trimmed}` } });

  let response = "I saved that to your account.";

  if (lower.includes("diet") && (lower.includes("breakfast") || lower.includes("lunch") || lower.includes("dinner") || lower.includes("snack"))) {
    response = await logDietMeal(userId, lower);
  } else if (lower.includes("water")) {
    const amount = parseAmount(lower, "ml") ?? parseAmount(lower, "l");
    if (!amount) {
      response = "How much water should I log? Example: log 500ml water.";
    } else {
      const amountMl = lower.includes("l") && !lower.includes("ml") ? amount * 1000 : amount;
      await prisma.waterLog.create({ data: { userId, amountMl } });
      response = `Logged ${Math.round(amountMl)} ml water.`;
    }
  } else if (lower.includes("weight")) {
    const weight = parseAmount(lower, "kg");
    if (!weight) {
      response = "What weight should I log? Example: log weight 78kg.";
    } else {
      await prisma.progressEntry.create({ data: { userId, weight, notes: "Logged from Telegram" } });
      response = `Logged weight ${weight} kg.`;
    }
  } else if (lower.includes("remind")) {
    const title = trimmed.replace(/remind me to/i, "").replace(/remind me/i, "").trim() || trimmed;
    await prisma.reminder.create({
      data: {
        userId,
        title,
        dueDate: parseDateTime(lower),
        notes: "Created from Telegram",
      },
    });
    response = `Created reminder: ${title}.`;
  } else if (lower.includes("food") || lower.includes("ate") || lower.includes("meal")) {
    response = "For Telegram food logging, use a saved diet meal like: log my diet breakfast. Manual calorie estimation still works best inside AI Coach.";
  } else {
    response = "I can log water, weight, reminders, and saved diet meals from Telegram. Try: log 500ml water, log weight 78kg, remind me to drink water at 6pm, or log my diet breakfast.";
  }

  await prisma.chatMessage.create({ data: { userId, role: "assistant", content: `[Telegram] ${response}` } });
  return response;
}
