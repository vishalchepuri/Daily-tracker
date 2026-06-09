export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function cleanAiJson(value: string) {
  return value.replace(/^```json\n?/i, "").replace(/^```\n?/i, "").replace(/\n?```$/, "").trim();
}

const allowedMuscles = ["chest", "back", "shoulders", "legs", "arms", "core"];

async function createAiExercises(muscleGroup: string, currentExercise: any, usedNames: string[], userId: string) {
  if (!process.env.ABACUSAI_API_KEY) return null;
  const response = await fetch("https://apps.abacus.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.ABACUSAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-5.4-mini",
      stream: false,
      max_tokens: 1000,
      messages: [
        {
          role: "system",
          content:
            "You are a strength coach expanding an exercise library for Indian commercial gyms and Cult-style gyms. Return ONLY JSON. Generate 5 practical replacement exercises, newest and most useful first. Use only these muscle groups: chest, back, shoulders, legs, arms, core. Avoid duplicating the current exercise or used exercise names. Prefer common dumbbell, barbell, bench, cable, lat pulldown, seated row, leg press, leg extension, leg curl, treadmill/cycle/cross-trainer, bodyweight, and mat movements. Avoid uncommon/specialty machines such as hack squat, pendulum squat, reverse pec deck, machine lateral raise, glute drive machine, assisted dip/pull-up machine, landmine setup, and specialty T-bar row unless the current exercise already proves that equipment is available. Make each option clearly different.",
        },
        {
          role: "user",
          content: `Need a replacement for:
Current exercise: ${currentExercise?.name ?? "Unknown"}
Muscle group: ${muscleGroup}
Already used names: ${usedNames.join(", ")}

Return:
{"exercises":[{"name":"Exercise Name","muscleGroup":"${muscleGroup}","equipment":"dumbbell","category":"compound","description":"short description","formTips":"short coaching cue"}]}`,
        },
      ],
    }),
  });
  if (!response.ok) return null;
  const data = await response.json().catch(() => ({}));
  const parsed = JSON.parse(cleanAiJson(data?.choices?.[0]?.message?.content ?? "{}"));
  const options = Array.isArray(parsed?.exercises) ? parsed.exercises : [parsed];
  const normalizedUsed = new Set(usedNames.map((name) => name.toLowerCase().trim()).filter(Boolean));

  for (const option of options) {
    const name = String(option?.name ?? "").trim();
    if (!name || normalizedUsed.has(name.toLowerCase())) continue;

    const safeMuscle = allowedMuscles.includes(option?.muscleGroup) ? option.muscleGroup : muscleGroup;
    const existing = await prisma.exercise.findFirst({
      where: {
        name: { equals: name, mode: "insensitive" },
        status: { in: ["approved", "pending"] },
      },
    });
    if (existing && !normalizedUsed.has(existing.name.toLowerCase())) return existing;

    let id = slugify(name);
    let suffix = 2;
    while (await prisma.exercise.findUnique({ where: { id } })) {
      id = `${slugify(name)}-${suffix}`;
      suffix += 1;
    }
    return prisma.exercise.create({
      data: {
        id,
        name,
        muscleGroup: safeMuscle,
        equipment: option?.equipment || null,
        category: option?.category || null,
        description: option?.description || null,
        formTips: option?.formTips || null,
        status: "pending",
        submittedById: userId,
      },
    });
  }
  return null;
}

export async function POST(req: Request) {
  try {
    const user = await requireCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const data = await req.json();
    const currentExercise = data?.currentExercise ?? {};
    const currentId = String(currentExercise?.id ?? data?.currentExerciseId ?? "");
    const muscleGroup = String(data?.muscleGroup ?? currentExercise?.muscleGroup ?? "").toLowerCase();
    if (!currentId || !muscleGroup) return NextResponse.json({ error: "Current exercise and muscle group are required" }, { status: 400 });

    const usedIds = Array.isArray(data?.usedExerciseIds) ? data.usedExerciseIds.map(String) : [];
    const library = await prisma.exercise.findMany({
      where: {
        muscleGroup,
        OR: [
          { status: "approved" },
          { status: "pending", submittedById: user.id },
        ],
      },
      orderBy: [{ status: "asc" }, { name: "asc" }],
    });
    const rareEquipment = ["hack squat", "pendulum", "reverse pec deck", "glute drive", "assisted dip", "assisted pull", "landmine", "t-bar machine"];
    const preferred = library.find((exercise) => {
      const equipmentText = `${exercise.name} ${exercise.equipment ?? ""}`.toLowerCase();
      return exercise.id !== currentId && !usedIds.includes(exercise.id) && !rareEquipment.some((item) => equipmentText.includes(item));
    });
    const fallback = preferred ?? library.find((exercise) => exercise.id !== currentId);
    const usedNames = Array.isArray(data?.usedExerciseNames) ? data.usedExerciseNames.map(String) : [];

    if (fallback && library.length >= 8) return NextResponse.json({ exercise: fallback, source: fallback.status === "pending" ? "pending" : "library" });

    const aiExercise = await createAiExercises(muscleGroup, currentExercise, [...usedNames, ...library.map((item) => item.name)], user.id);
    if (aiExercise) return NextResponse.json({ exercise: aiExercise, source: aiExercise.status === "pending" ? "ai_pending" : "ai" });
    if (fallback) return NextResponse.json({ exercise: fallback, source: fallback.status === "pending" ? "pending" : "library" });
    return NextResponse.json({ error: `No alternate ${muscleGroup} exercise found` }, { status: 404 });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Failed to replace exercise" }, { status: 500 });
  }
}
