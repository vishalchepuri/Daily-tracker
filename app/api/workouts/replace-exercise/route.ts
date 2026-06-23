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
const rareEquipment = ["hack squat", "pendulum", "reverse pec deck", "glute drive", "assisted dip", "assisted pull", "landmine", "t-bar machine"];
const commonEquipment = ["dumbbell", "barbell", "bench", "cable", "lat pulldown", "seated row", "leg press", "leg extension", "leg curl", "bodyweight", "mat", "machine"];

function normalize(value: unknown) {
  return String(value ?? "").toLowerCase().trim();
}

function words(value: unknown) {
  return normalize(value).split(/[^a-z0-9]+/).filter((word) => word.length > 2);
}

function hasRareEquipment(exercise: any) {
  const text = `${exercise?.name ?? ""} ${exercise?.equipment ?? ""} ${exercise?.description ?? ""}`.toLowerCase();
  return rareEquipment.some((item) => text.includes(item));
}

function exerciseSimilarity(a: any, b: any) {
  const aWords = new Set(words(`${a?.name ?? ""} ${a?.equipment ?? ""}`));
  const bWords = words(`${b?.name ?? ""} ${b?.equipment ?? ""}`);
  if (aWords.size === 0 || bWords.length === 0) return 0;
  return bWords.filter((word) => aWords.has(word)).length;
}

function scoreReplacement(exercise: any, currentExercise: any, usedIds: Set<string>, usedNames: Set<string>, recentNames: Set<string>) {
  if (!exercise?.id || exercise.id === currentExercise?.id) return -999;
  if (usedIds.has(String(exercise.id))) return -999;
  const name = normalize(exercise.name);
  if (!name || usedNames.has(name) || recentNames.has(name)) return -999;

  let score = 0;
  const text = `${exercise.name ?? ""} ${exercise.equipment ?? ""} ${exercise.category ?? ""}`.toLowerCase();
  const currentEquipment = normalize(currentExercise?.equipment);
  const equipment = normalize(exercise.equipment);

  if (exercise.status === "approved") score += 30;
  if (exercise.status === "pending") score += 8;
  if (equipment && currentEquipment && equipment === currentEquipment) score += 22;
  if (equipment && commonEquipment.some((item) => equipment.includes(item) || text.includes(item))) score += 18;
  if (normalize(exercise.category) === normalize(currentExercise?.category)) score += 8;
  if (hasRareEquipment(exercise)) score -= 70;

  const similarity = exerciseSimilarity(exercise, currentExercise);
  score -= similarity * 12;

  if (/\bor\b/.test(name)) score += 7;
  if (/goblet|dumbbell|cable|bodyweight|mat|push-up|row|pulldown|leg press|curl|extension/i.test(text)) score += 8;
  if (/smith|machine/i.test(text) && !/cable|lat pulldown|seated row|leg press|leg extension|leg curl/i.test(text)) score -= 8;
  return score;
}

function rankLibrary(library: any[], currentExercise: any, usedIds: string[], usedNames: string[], recentReplacementNames: string[]) {
  const usedIdSet = new Set(usedIds.map(String));
  const usedNameSet = new Set(usedNames.map(normalize).filter(Boolean));
  const recentNameSet = new Set(recentReplacementNames.map(normalize).filter(Boolean));
  return library
    .map((exercise) => ({
      exercise,
      score: scoreReplacement(exercise, currentExercise, usedIdSet, usedNameSet, recentNameSet),
    }))
    .filter((item) => item.score > -999)
    .sort((a, b) => b.score - a.score || String(a.exercise.name).localeCompare(String(b.exercise.name)));
}

async function createAiExercises(muscleGroup: string, currentExercise: any, usedNames: string[], recentReplacementNames: string[], userId: string) {
  if (!process.env.ABACUSAI_API_KEY) return [];
  const response = await fetch("https://apps.abacus.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.ABACUSAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-5.4-mini",
      stream: false,
      max_tokens: 1400,
      messages: [
        {
          role: "system",
          content:
            "You are a practical strength coach for Indian commercial gyms and Cult-style gyms. Return ONLY JSON. Generate exactly 10 high-quality replacement exercises ranked best first. Use only these muscle groups: chest, back, shoulders, legs, arms, core. Replacements must train the same main muscle but should not be near-duplicates of the current exercise or each other. Prefer common equipment: dumbbells, barbells, bench, cable station, lat pulldown, seated row, leg press, leg extension, leg curl, treadmill/cycle/cross-trainer, bodyweight, and mat movements. Avoid uncommon/specialty machines such as hack squat, pendulum squat, reverse pec deck, machine lateral raise, glute drive machine, assisted dip/pull-up machine, landmine setup, and specialty T-bar row unless the current exercise clearly uses that exact equipment. If a machine may be unavailable, include a fallback in description or formTips, not in the name. Include pain-aware cues when useful, for example neutral grip, pain-free range, slow tempo, or lighter load. Make every option clearly different, practical, and useful for a normal Indian gym user.",
        },
        {
          role: "user",
          content: `Need a replacement for:
Current exercise: ${currentExercise?.name ?? "Unknown"}
Current equipment: ${currentExercise?.equipment ?? "unknown"}
Current category: ${currentExercise?.category ?? "unknown"}
Muscle group: ${muscleGroup}
Already used names: ${usedNames.join(", ")}
Recently rejected/replaced names: ${recentReplacementNames.join(", ")}

Return:
{"exercises":[{"name":"Exercise Name","muscleGroup":"${muscleGroup}","equipment":"dumbbell","category":"compound","description":"short description","formTips":"short coaching cue"}]}`,
        },
      ],
    }),
  });
  if (!response.ok) return [];
  const data = await response.json().catch(() => ({}));
  const parsed = JSON.parse(cleanAiJson(data?.choices?.[0]?.message?.content ?? "{}"));
  const options = Array.isArray(parsed?.exercises) ? parsed.exercises : [parsed];
  const normalizedUsed = new Set([...usedNames, ...recentReplacementNames].map(normalize).filter(Boolean));
  const created = [];

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
    if (existing && !normalizedUsed.has(existing.name.toLowerCase())) {
      created.push(existing);
      continue;
    }

    let id = slugify(name);
    let suffix = 2;
    while (await prisma.exercise.findUnique({ where: { id } })) {
      id = `${slugify(name)}-${suffix}`;
      suffix += 1;
    }
    const exercise = await prisma.exercise.create({
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
    created.push(exercise);
  }
  return created;
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
    const usedNames = Array.isArray(data?.usedExerciseNames) ? data.usedExerciseNames.map(String) : [];
    const recentReplacementNames = Array.isArray(data?.recentReplacementNames) ? data.recentReplacementNames.map(String) : [];
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
    const rankedLibrary = rankLibrary(library, { ...currentExercise, id: currentId }, usedIds, usedNames, recentReplacementNames);
    const bestLibrary = rankedLibrary[0];

    const shouldUseAi =
      !bestLibrary ||
      bestLibrary.score < 45 ||
      recentReplacementNames.length > 0 ||
      library.length < 12;

    if (!shouldUseAi && bestLibrary) {
      return NextResponse.json({
        exercise: bestLibrary.exercise,
        options: rankedLibrary.slice(0, 10).map((item) => item.exercise),
        source: bestLibrary.exercise.status === "pending" ? "pending" : "library",
        reason: "Matched by muscle, common equipment, and workout context.",
      });
    }

    const aiExercises = await createAiExercises(
      muscleGroup,
      currentExercise,
      [...usedNames, currentExercise?.name].filter(Boolean),
      recentReplacementNames,
      user.id
    );
    const rankedAi = rankLibrary(aiExercises, { ...currentExercise, id: currentId }, usedIds, usedNames, recentReplacementNames);
    const candidates = [...rankedAi, ...rankedLibrary].sort((a, b) => b.score - a.score);
    const best = candidates[0];
    if (best) {
      return NextResponse.json({
        exercise: best.exercise,
        options: candidates.slice(0, 10).map((item) => item.exercise),
        source: best.exercise.status === "pending" ? "ai_pending" : "library",
        reason: best.exercise.status === "pending" ? "Generated a new India-friendly option for admin approval." : "Selected from library with AI-backed ranking.",
      });
    }
    return NextResponse.json({ error: `No alternate ${muscleGroup} exercise found` }, { status: 404 });
  } catch (error: any) {
    return NextResponse.json({ error: process.env.NODE_ENV === "production" ? "Failed to replace exercise" : error?.message ?? "Failed to replace exercise" }, { status: 500 });
  }
}
