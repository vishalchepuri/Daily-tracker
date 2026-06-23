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
const indiaFriendlyReplacementPool: Record<string, Array<{ name: string; equipment: string; category: string; description: string; formTips: string }>> = {
  chest: [
    { name: "Dumbbell Bench Press", equipment: "dumbbell, bench", category: "compound", description: "Common chest press using dumbbells and a flat bench.", formTips: "Keep shoulder blades set and press in a pain-free range." },
    { name: "Incline Dumbbell Press", equipment: "dumbbell, incline bench", category: "compound", description: "Upper-chest focused press available in most Indian gyms.", formTips: "Use a modest incline and avoid flaring elbows hard." },
    { name: "Machine Chest Press", equipment: "machine", category: "compound", description: "Joint-friendly chest press if the gym has a basic chest press machine.", formTips: "Set handles near mid-chest and control the return." },
    { name: "Cable Chest Fly", equipment: "cable", category: "isolation", description: "Cable fly for chest tension without needing specialty machines.", formTips: "Keep a soft elbow bend and stop before shoulder discomfort." },
    { name: "Push-Up", equipment: "bodyweight, mat", category: "compound", description: "Bodyweight chest exercise with easy incline/knee regressions.", formTips: "Brace core and keep elbows about 30-45 degrees from the body." },
    { name: "Incline Push-Up", equipment: "bodyweight, bench", category: "compound", description: "Beginner and joint-friendly push-up variation.", formTips: "Use a bench height that lets you keep clean reps." },
    { name: "Dumbbell Floor Press", equipment: "dumbbell, mat", category: "compound", description: "Shoulder-friendly chest press done on a mat.", formTips: "Pause triceps lightly on the floor and press smoothly." },
    { name: "Low Cable Fly", equipment: "cable", category: "isolation", description: "Upper-chest cable fly option using a cable station.", formTips: "Move slowly and keep ribs down." },
    { name: "Flat Barbell Bench Press", equipment: "barbell, bench", category: "compound", description: "Standard chest compound lift.", formTips: "Use a spotter or safe pins for heavier sets." },
    { name: "Single-Arm Cable Press", equipment: "cable", category: "compound", description: "Cable press that trains chest with core stability.", formTips: "Do not twist the torso; press straight forward." },
  ],
  back: [
    { name: "Lat Pulldown", equipment: "lat pulldown", category: "compound", description: "Common vertical pull for lats.", formTips: "Pull elbows down, not the bar behind the neck." },
    { name: "Seated Cable Row", equipment: "seated row, cable", category: "compound", description: "Common cable row for mid-back.", formTips: "Stay tall and squeeze shoulder blades gently." },
    { name: "One-Arm Dumbbell Row", equipment: "dumbbell, bench", category: "compound", description: "Reliable dumbbell row for lats and mid-back.", formTips: "Keep hips square and row toward the hip." },
    { name: "Chest-Supported Dumbbell Row", equipment: "dumbbell, incline bench", category: "compound", description: "Back row that reduces lower-back strain.", formTips: "Let shoulder blades move, then squeeze at the top." },
    { name: "Cable Straight-Arm Pulldown", equipment: "cable", category: "isolation", description: "Lat isolation using a cable station.", formTips: "Keep arms mostly straight and avoid shrugging." },
    { name: "Assisted Inverted Row", equipment: "smith machine/bar", category: "compound", description: "Bodyweight row option using a fixed bar.", formTips: "Walk feet closer to make it easier." },
    { name: "Dumbbell Pullover", equipment: "dumbbell, bench", category: "isolation", description: "Lat and chest accessory using a dumbbell.", formTips: "Keep ribs controlled and use a light load." },
    { name: "Close-Grip Lat Pulldown", equipment: "lat pulldown", category: "compound", description: "Lat pulldown variation with a neutral or close grip.", formTips: "Keep shoulders away from ears." },
    { name: "Cable Face Pull", equipment: "cable", category: "isolation", description: "Rear-delt and upper-back friendly cable exercise.", formTips: "Pull toward eye level with light weight." },
    { name: "Dumbbell Rear-Delt Row", equipment: "dumbbell", category: "isolation", description: "Upper-back and rear-delt row using dumbbells.", formTips: "Use lighter weight and lead with elbows." },
  ],
  shoulders: [
    { name: "Seated Dumbbell Shoulder Press", equipment: "dumbbell, bench", category: "compound", description: "Common shoulder press option.", formTips: "Keep elbows slightly forward and avoid painful depth." },
    { name: "Standing Dumbbell Lateral Raise", equipment: "dumbbell", category: "isolation", description: "Side-delt raise with dumbbells.", formTips: "Use light weight and stop around shoulder height." },
    { name: "Cable Lateral Raise", equipment: "cable", category: "isolation", description: "Side-delt raise using one cable handle.", formTips: "Lean slightly away and move slowly." },
    { name: "Dumbbell Front Raise", equipment: "dumbbell", category: "isolation", description: "Front-delt accessory.", formTips: "Do not swing; stop if shoulder pinches." },
    { name: "Face Pull", equipment: "cable", category: "isolation", description: "Rear-delt and shoulder-health movement.", formTips: "Pull high with elbows out and light load." },
    { name: "Band External Rotation", equipment: "band", category: "rehab", description: "Rotator cuff strengthening for shoulder control.", formTips: "Keep elbow tucked and move slowly." },
    { name: "Dumbbell Arnold Press", equipment: "dumbbell", category: "compound", description: "Shoulder press variation with controlled rotation.", formTips: "Use light-moderate weight and no painful rotation." },
    { name: "Rear-Delt Dumbbell Fly", equipment: "dumbbell", category: "isolation", description: "Rear-delt option available in any dumbbell area.", formTips: "Hinge lightly and keep neck relaxed." },
    { name: "Scapular Wall Slide", equipment: "bodyweight", category: "mobility", description: "Shoulder mobility and control drill.", formTips: "Move only in a pain-free range." },
    { name: "Pike Push-Up", equipment: "bodyweight, mat", category: "compound", description: "Mat/bodyweight shoulder press option.", formTips: "Use a small range if wrists or shoulders complain." },
  ],
  legs: [
    { name: "Leg Press", equipment: "leg press", category: "compound", description: "Common lower-body machine in Indian gyms.", formTips: "Use pain-free depth and keep knees tracking over toes." },
    { name: "Goblet Squat", equipment: "dumbbell", category: "compound", description: "Simple squat alternative using a dumbbell.", formTips: "Keep chest tall and control depth." },
    { name: "Romanian Deadlift", equipment: "barbell or dumbbell", category: "compound", description: "Hip-hinge for hamstrings and glutes.", formTips: "Soft knees, hips back, neutral spine." },
    { name: "Dumbbell Split Squat", equipment: "dumbbell", category: "compound", description: "Single-leg strength using dumbbells.", formTips: "Shorten range if knees feel sensitive." },
    { name: "Leg Extension", equipment: "leg extension", category: "isolation", description: "Quad isolation machine commonly available.", formTips: "Use smooth reps and avoid locking aggressively." },
    { name: "Seated or Lying Leg Curl", equipment: "leg curl", category: "isolation", description: "Hamstring curl using whichever machine is available.", formTips: "Control both lift and return." },
    { name: "Hip Thrust or Glute Bridge", equipment: "bench or mat", category: "compound", description: "Glute exercise with bench or mat fallback.", formTips: "Posteriorly tilt pelvis and avoid lower-back arching." },
    { name: "Step-Up", equipment: "bench, dumbbell", category: "compound", description: "Leg exercise using a stable bench or box.", formTips: "Choose a low height and drive through the whole foot." },
    { name: "Standing Calf Raise", equipment: "bodyweight or dumbbell", category: "isolation", description: "Calf exercise with no special machine required.", formTips: "Pause at the top and lower slowly." },
    { name: "Terminal Knee Extension", equipment: "band", category: "rehab", description: "Knee-friendly quad control drill.", formTips: "Squeeze quad without knee pain." },
  ],
  arms: [
    { name: "Dumbbell Curl", equipment: "dumbbell", category: "isolation", description: "Basic biceps curl.", formTips: "Keep elbows still and avoid swinging." },
    { name: "Hammer Curl", equipment: "dumbbell", category: "isolation", description: "Biceps and forearm-friendly curl.", formTips: "Use neutral grip and pain-free range." },
    { name: "Cable Curl", equipment: "cable", category: "isolation", description: "Cable biceps curl with steady tension.", formTips: "Stand tall and control the return." },
    { name: "Rope Pushdown", equipment: "cable", category: "isolation", description: "Common triceps cable exercise.", formTips: "Keep elbows close; swap handle if elbows hurt." },
    { name: "Straight-Bar Pushdown", equipment: "cable", category: "isolation", description: "Triceps pushdown with bar attachment.", formTips: "Use lighter load if wrists or elbows complain." },
    { name: "Cross-Body Cable Triceps Extension", equipment: "cable", category: "isolation", description: "Elbow-friendly triceps option.", formTips: "Move slowly and keep shoulder stable." },
    { name: "Close-Grip Push-Up", equipment: "bodyweight, mat", category: "compound", description: "Triceps-focused bodyweight option.", formTips: "Use incline if wrists or elbows feel strained." },
    { name: "Dumbbell Overhead Triceps Extension", equipment: "dumbbell", category: "isolation", description: "Triceps long-head exercise.", formTips: "Use light load and stop if elbows pinch." },
    { name: "Wrist Curl And Extension", equipment: "dumbbell", category: "isolation", description: "Forearm strengthening with light dumbbells.", formTips: "Use slow reps and small pain-free range." },
    { name: "Farmer Carry", equipment: "dumbbell", category: "compound", description: "Grip and forearm exercise.", formTips: "Walk tall and keep shoulders packed." },
  ],
  core: [
    { name: "Dead Bug", equipment: "mat", category: "core", description: "Core stability drill.", formTips: "Keep lower back gently pressed to the mat." },
    { name: "Plank", equipment: "mat", category: "core", description: "Basic anti-extension core hold.", formTips: "Brace abs and stop before form breaks." },
    { name: "Side Plank", equipment: "mat", category: "core", description: "Oblique and lateral core hold.", formTips: "Stack hips and keep neck relaxed." },
    { name: "Pallof Press", equipment: "cable or band", category: "core", description: "Anti-rotation core exercise.", formTips: "Do not let the torso rotate." },
    { name: "Cable Wood Chop", equipment: "cable", category: "core", description: "Rotational core exercise using cable.", formTips: "Rotate through torso, not lower back." },
    { name: "Mountain Climber", equipment: "mat", category: "conditioning", description: "Core and cardio movement.", formTips: "Keep hips controlled and choose a low-impact pace." },
    { name: "Bird Dog", equipment: "mat", category: "core", description: "Spine-friendly core stability drill.", formTips: "Reach long without twisting." },
    { name: "Reverse Crunch", equipment: "mat", category: "core", description: "Lower-ab focused mat movement.", formTips: "Curl pelvis up; avoid swinging legs." },
    { name: "Bicycle Crunch", equipment: "mat", category: "core", description: "Abs and obliques movement.", formTips: "Move slowly and keep elbows wide." },
    { name: "Hollow Hold Regression", equipment: "mat", category: "core", description: "Core tension drill with easier bent-knee option.", formTips: "Use the easiest version that keeps your back safe." },
  ],
};

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

function dedupeRanked(items: Array<{ exercise: any; score: number }>) {
  const seen = new Set<string>();
  const output = [];
  for (const item of items) {
    const key = String(item.exercise?.id ?? item.exercise?.name ?? "").toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(item);
  }
  return output;
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

async function createSeedReplacementExercises(muscleGroup: string, currentExercise: any, usedNames: string[], recentReplacementNames: string[], userId: string) {
  const seedOptions = indiaFriendlyReplacementPool[muscleGroup] ?? [];
  if (seedOptions.length === 0) return [];

  const blockedNames = new Set([...usedNames, ...recentReplacementNames, currentExercise?.name].map(normalize).filter(Boolean));
  const created = [];

  for (const option of seedOptions) {
    const name = option.name.trim();
    if (!name || blockedNames.has(normalize(name))) continue;

    const existing = await prisma.exercise.findFirst({
      where: {
        name: { equals: name, mode: "insensitive" },
        OR: [
          { status: "approved" },
          { status: "pending", submittedById: userId },
        ],
      },
    });
    if (existing) {
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
        muscleGroup,
        equipment: option.equipment,
        category: option.category,
        description: option.description,
        formTips: option.formTips,
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
    const seedExercises = await createSeedReplacementExercises(
      muscleGroup,
      currentExercise,
      usedNames,
      recentReplacementNames,
      user.id
    );
    const rankedSeeds = rankLibrary(seedExercises, { ...currentExercise, id: currentId }, usedIds, usedNames, recentReplacementNames);

    const shouldUseAi =
      !bestLibrary ||
      bestLibrary.score < 45 ||
      recentReplacementNames.length > 0 ||
      library.length < 12 ||
      rankedSeeds.length > rankedLibrary.length;

    const rankedLibraryWithSeeds = dedupeRanked([...rankedSeeds, ...rankedLibrary].sort((a, b) => b.score - a.score));
    const bestLibraryWithSeed = rankedLibraryWithSeeds[0];

    if (!shouldUseAi && bestLibraryWithSeed) {
      return NextResponse.json({
        exercise: bestLibraryWithSeed.exercise,
        options: rankedLibraryWithSeeds.slice(0, 10).map((item) => item.exercise),
        source: bestLibraryWithSeed.exercise.status === "pending" ? "pending" : "library",
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
    const candidates = dedupeRanked([...rankedAi, ...rankedSeeds, ...rankedLibrary].sort((a, b) => b.score - a.score));
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
