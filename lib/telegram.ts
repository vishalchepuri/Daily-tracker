import { prisma } from "@/lib/db";
import {
  addFirestoreChatAttachment,
  addFirestoreChatMessage,
  createFirestoreChatSession,
  listFirestoreChatSessions,
} from "@/lib/firestore-chat";
import { formatAppDate } from "@/lib/local-dates";

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

function extractJsonObject(text: string) {
  const cleaned = text.replace(/```json|```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) throw new Error("No JSON object found");
  return JSON.parse(cleaned.slice(start, end + 1));
}

function parseMoney(text: string) {
  const match = text.match(/(?:rs\.?|inr|₹)\s*([\d,]+(?:\.\d+)?)/i) ?? text.match(/([\d,]+(?:\.\d+)?)\s*(?:rs\.?|inr|₹)/i);
  return match ? Number(match[1].replace(/,/g, "")) : null;
}

function detectCategory(text: string) {
  const lower = text.toLowerCase();
  if (/(zepto|blinkit|bigbasket|grocery|supermarket|mart)/.test(lower)) return "Groceries";
  if (/(swiggy|zomato|restaurant|food|cafe|coffee|tea)/.test(lower)) return "Food";
  if (/(spotify|netflix|prime|subscription|youtube)/.test(lower)) return "Subscriptions";
  if (/(uber|ola|metro|fuel|petrol|diesel|travel|flight|train)/.test(lower)) return "Travel";
  if (/(medical|pharmacy|hospital|doctor|medicine)/.test(lower)) return "Health";
  if (/(gym|fitness|protein|sports)/.test(lower)) return "Fitness";
  if (/(amazon|flipkart|myntra|shopping)/.test(lower)) return "Shopping";
  return "Other";
}

function extractMerchant(text: string) {
  const patterns = [
    /towards\s+(.+?)(?:\s+on\s+\d|\s+for\s+rs|\s+for\s+inr|\.|$)/i,
    /at\s+(.+?)(?:\s+on\s+\d|\s+for\s+rs|\s+for\s+inr|\.|$)/i,
    /to\s+(.+?)(?:\s+on\s+\d|\s+ref|\.|$)/i,
    /info:\s*(.+?)(?:\s+if\s+|\.|$)/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    const merchant = match?.[1]?.replace(/\s+/g, " ").trim();
    if (merchant && merchant.length > 2 && !/your|account|card|upi/i.test(merchant)) return merchant.slice(0, 80);
  }
  return "Telegram Spend";
}

function extractLast4(text: string) {
  return text.match(/(?:ending|a\/c no\.?|account number|account ending|card ending)\s*(?:xx|x+)?(\d{4})/i)?.[1] ?? null;
}

function extractBankName(text: string) {
  const known = ["HDFC Bank", "Axis Bank", "SBI", "ICICI Bank", "Kotak Bank", "IDFC Bank"];
  const lower = text.toLowerCase();
  return known.find((bank) => lower.includes(bank.toLowerCase())) ?? null;
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

async function getTelegramSession(userId: string) {
  const sessions = await listFirestoreChatSessions(userId, 0, 7);
  const existing = sessions.find((session) => session.title === "Telegram Bot");
  if (existing) return existing;
  return createFirestoreChatSession(userId, "Telegram Bot");
}

async function saveTelegramChat(userId: string, role: "user" | "assistant", content: string, attachmentFileId?: string | null) {
  const session = await getTelegramSession(userId);
  const message = await addFirestoreChatMessage({ userId, sessionId: session.id, role, content: `[Telegram] ${content}` });
  if (attachmentFileId) {
    await addFirestoreChatAttachment({
      userId,
      sessionId: session.id,
      messageId: message.id,
      kind: "telegram_photo",
      cloudStoragePath: attachmentFileId,
    });
  }
}

async function telegramPhotoDataUrl(fileId: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not configured");

  const fileResponse = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`);
  const fileData = await fileResponse.json();
  const filePath = fileData?.result?.file_path;
  if (!fileData?.ok || !filePath) throw new Error("Could not download Telegram photo");

  const imageResponse = await fetch(`https://api.telegram.org/file/bot${token}/${filePath}`);
  if (!imageResponse.ok) throw new Error("Telegram photo download failed");
  const bytes = Buffer.from(await imageResponse.arrayBuffer());
  const mimeType = filePath.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
  return `data:${mimeType};base64,${bytes.toString("base64")}`;
}

async function logWorkoutFromVision(userId: string, details: any, caption: string) {
  const exerciseName = String(details?.exerciseName ?? "").trim();
  const sets = Math.max(1, Math.min(12, Number(details?.sets) || 0));
  const reps = Math.max(1, Math.min(100, Number(details?.reps) || 0));
  const weight = Math.max(0, Math.min(500, Number(details?.weightKg) || 0));
  const muscleGroup = String(details?.muscleGroup ?? "chest").toLowerCase().trim() || "chest";

  if (!exerciseName || !sets || !reps) return null;

  const existingExercise = await prisma.exercise.findFirst({
    where: { name: { equals: exerciseName, mode: "insensitive" } },
  });
  const exercise = existingExercise
    ? await prisma.exercise.update({
        where: { id: existingExercise.id },
        data: {
          muscleGroup,
          equipment: details?.equipment ? String(details.equipment).toLowerCase() : existingExercise.equipment,
        },
      })
    : await prisma.exercise.create({
      data: {
      name: exerciseName,
      muscleGroup,
      equipment: details?.equipment ? String(details.equipment).toLowerCase() : "machine",
      category: "compound",
      description: "Detected from Telegram workout photo.",
      },
    });

  const log = await prisma.workoutLog.create({
    data: {
      userId,
      templateName: "Telegram workout",
      notes: `Logged from Telegram photo. ${caption}`.slice(0, 500),
      exerciseLogs: {
        create: Array.from({ length: sets }, (_, index) => ({
          exerciseId: exercise.id,
          setNumber: index + 1,
          reps,
          weight,
        })),
      },
    },
  });

  return { log, exercise, sets, reps, weight };
}

async function analyzeTelegramWorkoutPhoto(userId: string, caption: string, photoFileId: string) {
  if (!process.env.ABACUSAI_API_KEY) {
    return "I received the workout photo, but AI vision is not configured. Reply with exercise name, sets, reps, and weight.";
  }

  const imageDataUrl = await telegramPhotoDataUrl(photoFileId);
  const response = await fetch("https://apps.abacus.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.ABACUSAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-5.4-mini",
      stream: false,
      max_tokens: 500,
      messages: [
        {
          role: "system",
          content:
            "You analyze Telegram workout photos for Dayza. Return only JSON with keys: isWorkoutPhoto boolean, exerciseName string, muscleGroup string, equipment string, sets number|null, reps number|null, weightKg number|null, confidence number from 0 to 1, question string. Use the caption for sets/reps/weight. If exercise is unclear, set confidence below 0.75 and ask one short confirmation question.",
        },
        {
          role: "user",
          content: [
            { type: "text", text: `Caption: ${caption || "(no caption)"}` },
            { type: "image_url", image_url: { url: imageDataUrl } },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Workout vision failed: ${errorText}`);
  }

  const data = await response.json();
  const raw = data?.choices?.[0]?.message?.content ?? "{}";
  const details = extractJsonObject(raw);

  if (!details?.isWorkoutPhoto) {
    return "I received the photo, but it does not look like a workout log. Add a caption like: Machine Chest Press, 3 sets, 12 reps, 18kg.";
  }

  if (Number(details.confidence ?? 0) < 0.75 || !details.exerciseName) {
    return details.question || "Which exercise is this? Reply with exercise name, sets, reps, and weight.";
  }

  const logged = await logWorkoutFromVision(userId, details, caption);
  if (!logged) {
    return `I think this is ${details.exerciseName}, but I still need sets, reps, and weight. Example: ${details.exerciseName}, 3 sets, 12 reps, 18kg.`;
  }

  return `Logged ${logged.sets} sets of ${logged.exercise.name}: ${logged.reps} reps each at ${logged.weight}kg.`;
}

async function logSpendFromTelegram(userId: string, text: string) {
  const amount = parseMoney(text);
  if (!amount) return "How much should I log? Example: spent ₹250 at Zepto.";

  const bankName = extractBankName(text);
  const last4 = extractLast4(text);
  const isCredit = /credit card/i.test(text);
  const isBankOrDebit = /debited|debit card|account|a\/c/i.test(text) && !isCredit;

  const merchant = extractMerchant(text);
  const category = detectCategory(text);

  const result = await prisma.$transaction(async (tx) => {
    let bankAccountId: string | null = null;
    let creditCardId: string | null = null;

    if (isCredit && (last4 || bankName)) {
      const card = await tx.creditCard.upsert({
        where: { id: `telegram-card-${userId}-${last4 ?? bankName ?? "unknown"}` },
        update: { currentDue: { increment: amount }, bankName: bankName ?? undefined, last4: last4 ?? undefined },
        create: {
          id: `telegram-card-${userId}-${last4 ?? bankName ?? "unknown"}`,
          userId,
          name: `${bankName ?? "Credit"} Card${last4 ? ` ending ${last4}` : ""}`,
          bankName,
          last4,
          currentDue: amount,
        },
      });
      creditCardId = card.id;
    } else if (isBankOrDebit && (last4 || bankName)) {
      const account = await tx.bankAccount.upsert({
        where: { id: `telegram-bank-${userId}-${last4 ?? bankName ?? "unknown"}` },
        update: { balance: { decrement: amount }, bankName: bankName ?? undefined, last4: last4 ?? undefined },
        create: {
          id: `telegram-bank-${userId}-${last4 ?? bankName ?? "unknown"}`,
          userId,
          name: `${bankName ?? "Bank"} Account${last4 ? ` ending ${last4}` : ""}`,
          bankName,
          last4,
          balance: 0 - amount,
        },
      });
      bankAccountId = account.id;
    }

    return tx.spend.create({
      data: {
        userId,
        merchant,
        amount,
        currency: "INR",
        category,
        source: "telegram",
        bankAccountId,
        creditCardId,
        balanceApplied: Boolean(bankAccountId || creditCardId),
        notes: text.slice(0, 500),
      },
    });
  });

  return `Logged ₹${Math.round(result.amount)} spend at ${result.merchant} as ${result.category ?? "Other"}.`;
}

function spendRangeFromText(text: string) {
  const lower = text.toLowerCase();
  const now = new Date();
  const start = new Date(now);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  if (lower.includes("week")) {
    const day = start.getDay();
    const diff = day === 0 ? 6 : day - 1;
    start.setDate(start.getDate() - diff);
    start.setHours(0, 0, 0, 0);
    return { label: "this week", start, end };
  }

  if (lower.includes("month")) {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    return { label: "this month", start, end };
  }

  if (lower.includes("yesterday")) {
    start.setDate(start.getDate() - 1);
    start.setHours(0, 0, 0, 0);
    end.setDate(end.getDate() - 1);
    return { label: "yesterday", start, end };
  }

  start.setHours(0, 0, 0, 0);
  return { label: "today", start, end };
}

async function summarizeSpendsFromTelegram(userId: string, text: string) {
  const range = spendRangeFromText(text);
  const spends = await prisma.spend.findMany({
    where: { userId, date: { gte: range.start, lte: range.end } },
    orderBy: { date: "desc" },
    take: 50,
  });

  const total = spends.reduce((sum, item) => sum + item.amount, 0);
  if (spends.length === 0) return `No spends logged ${range.label}.`;

  const categoryTotals = new Map<string, number>();
  for (const spend of spends) {
    const category = spend.category || "Other";
    categoryTotals.set(category, (categoryTotals.get(category) ?? 0) + spend.amount);
  }
  const topCategories = Array.from(categoryTotals.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([category, amount]) => `${category}: INR ${Math.round(amount)}`)
    .join(", ");
  const latest = spends.slice(0, 3).map((item) => `${item.merchant}: INR ${Math.round(item.amount)}`).join("; ");

  return [
    `You spent INR ${Math.round(total)} ${range.label}.`,
    `Transactions: ${spends.length}.`,
    topCategories ? `Top categories: ${topCategories}.` : "",
    latest ? `Latest: ${latest}.` : "",
  ].filter(Boolean).join("\n");
}

function weekdayFromText(text: string) {
  const weekdays = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
  const lower = text.toLowerCase();
  const found = weekdays.find((day) => lower.includes(day));
  if (found) return found[0].toUpperCase() + found.slice(1);
  if (lower.includes("today")) {
    return formatAppDate(new Date(), { weekday: "long" });
  }
  return null;
}

function parseRoutineJson(value?: string | null) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function routineLine(item: any) {
  const name = String(item?.name ?? item?.title ?? "").trim();
  const duration = String(item?.duration ?? "").trim();
  const notes = String(item?.notes ?? "").trim();
  return [name, duration, notes].filter(Boolean).join(" - ");
}

async function summarizeWorkoutPlanFromTelegram(userId: string, text: string) {
  const day = weekdayFromText(text);
  const templates = await prisma.workoutTemplate.findMany({
    where: {
      userId,
      ...(day ? { dayOfWeek: { equals: day, mode: "insensitive" as const } } : {}),
    },
    include: { exercises: { include: { exercise: true }, orderBy: { orderIndex: "asc" } } },
    orderBy: [{ dayOfWeek: "asc" }, { createdAt: "asc" }],
    take: day ? 3 : 7,
  });

  if (templates.length === 0) {
    return day
      ? `I could not find a saved workout plan for ${day}. Open Dayza > Workouts or ask Dayza Agent to create one.`
      : "I could not find any saved workout plans yet. Open Dayza > Workouts or ask Dayza Agent to create one.";
  }

  return templates.map((template) => {
    const warmups = parseRoutineJson(template.warmupJson).map(routineLine).filter(Boolean).slice(0, 3);
    const stretches = parseRoutineJson(template.stretchesJson).map(routineLine).filter(Boolean).slice(0, 3);
    const exercises = template.exercises.map((item, index) => {
      const exercise = item.exercise;
      return `${index + 1}. ${exercise.name} - ${item.sets} x ${item.reps}`;
    });

    return [
      `${template.dayOfWeek ? `${template.dayOfWeek} - ` : ""}${template.name}`,
      template.muscleGroups ? `Focus: ${template.muscleGroups}` : "",
      warmups.length ? `Warm-up: ${warmups.join("; ")}` : "Warm-up: 5-10 min light cardio + mobility.",
      exercises.length ? `Exercises:\n${exercises.join("\n")}` : "No exercises saved in this plan yet.",
      stretches.length ? `Stretches: ${stretches.join("; ")}` : "Stretches: 3-5 min cooldown + target muscle stretches.",
    ].filter(Boolean).join("\n");
  }).join("\n\n");
}

async function logMedicationFromTelegram(userId: string, text: string) {
  const lower = text.toLowerCase();
  const medications = await prisma.medication.findMany({ where: { userId, active: true }, orderBy: { timeOfDay: "asc" } });
  const medication = medications.find((item) => lower.includes(item.name.toLowerCase()));
  if (!medication) {
    if (medications.length === 0) return "You do not have active medications saved yet. Add them in Dayza > Medications first.";
    return `Which medication should I mark? Active meds: ${medications.map((item) => item.name).join(", ")}.`;
  }
  const status = lower.includes("skip") || lower.includes("miss") ? "skipped" : "taken";
  const [hour, minute] = medication.timeOfDay.split(":").map(Number);
  const scheduledFor = new Date();
  scheduledFor.setHours(hour || 0, minute || 0, 0, 0);
  await prisma.medicationLog.create({
    data: { userId, medicationId: medication.id, scheduledFor, status, notes: "Logged from Telegram" },
  });
  return `Marked ${medication.name} as ${status}.`;
}

function helpText(chatId: string) {
  return [
    "Dayza Telegram Agent is ready.",
    "",
    `Your chat ID: ${chatId}`,
    "",
    "Try:",
    "• spent ₹179 at Spotify",
    "• paste a bank/card SMS",
    "• log 500ml water",
    "• log weight 78kg",
    "• remind me to take medicine at 8pm",
    "• taken Vitamin D",
    "• log my diet breakfast",
    "",
    "Link this chat in Dayza > Reminders > Telegram if it is not connected yet.",
  ].join("\n");
}

export async function processTelegramText(chatId: string, text: string) {
  return processTelegramMessage(chatId, text);
}

export async function processTelegramMessage(chatId: string, text: string, options?: { photoFileId?: string | null }) {
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();
  if (lower === "/start" || lower === "/help" || lower === "help") return helpText(chatId);

  const profile = await prisma.userProfile.findFirst({
    where: { telegramChatId: chatId, telegramEnabled: true },
  });
  if (!profile) return `This Telegram chat is not linked to a Dayza account yet.\n\nYour chat ID: ${chatId}\n\nOpen Dayza > Reminders > Telegram, paste this chat ID, and enable Telegram.`;

  const userId = profile.userId;
  await saveTelegramChat(userId, "user", options?.photoFileId ? `${trimmed || "Photo uploaded"}\n[Photo: ${options.photoFileId}]` : trimmed, options?.photoFileId);

  let response = "I saved that to your account.";

  if (options?.photoFileId && !trimmed) {
    response = await analyzeTelegramWorkoutPhoto(userId, trimmed, options.photoFileId);
  } else if (options?.photoFileId && /(done|did|completed|sets?|workout|exercise|gym|reps?|kg)/i.test(trimmed)) {
    response = await analyzeTelegramWorkoutPhoto(userId, trimmed, options.photoFileId);
  } else if (lower === "/whoami" || lower.includes("chat id")) {
    response = `This Telegram chat is linked to Dayza. Chat ID: ${chatId}.`;
  } else if (/(workout|exercise|training|gym|plan|routine)/i.test(trimmed) && /(what|show|today|monday|tuesday|wednesday|thursday|friday|saturday|sunday|have)/i.test(trimmed)) {
    response = await summarizeWorkoutPlanFromTelegram(userId, trimmed);
  } else if (/how much|total|summary|spent today|spend today|spent this|spend this|expenses?|transactions?/i.test(trimmed) && /(spend|spent|expense|transaction|money)/i.test(trimmed)) {
    response = await summarizeSpendsFromTelegram(userId, trimmed);
  } else if (lower.includes("diet") && (lower.includes("breakfast") || lower.includes("lunch") || lower.includes("dinner") || lower.includes("snack"))) {
    response = await logDietMeal(userId, lower);
  } else if (/(spent|spend|debited|credited|upi|card|rs\.?|inr|₹)/i.test(trimmed) && parseMoney(trimmed)) {
    response = await logSpendFromTelegram(userId, trimmed);
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
  } else if (lower.includes("taken") || lower.includes("took") || lower.includes("medicine") || lower.includes("medication") || lower.includes("skip")) {
    response = await logMedicationFromTelegram(userId, trimmed);
  } else if (lower.includes("food") || lower.includes("ate") || lower.includes("meal")) {
    response = "For Telegram food logging, use a saved diet meal like: log my diet breakfast. Manual calorie estimation still works best inside Dayza Agent.";
  } else {
    response = "I can log spends, bank/card SMS, water, weight, medication doses, reminders, and saved diet meals from Telegram. Try: spent ₹250 at Zepto, log 500ml water, taken Vitamin D, or remind me to drink water at 6pm.";
  }

  await saveTelegramChat(userId, "assistant", response);
  return response;
}
