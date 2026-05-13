import { prisma } from "@/lib/db";

const starterExercises = [
  { name: "Barbell Bench Press", muscleGroup: "chest", equipment: "barbell", category: "compound", description: "Flat bench press for chest, shoulders, and triceps.", formTips: "Keep shoulder blades back, feet planted, and lower the bar under control." },
  { name: "Incline Dumbbell Press", muscleGroup: "chest", equipment: "dumbbell", category: "compound", description: "Incline press focused on upper chest.", formTips: "Use a controlled range and avoid flaring elbows too wide." },
  { name: "Barbell Back Squat", muscleGroup: "legs", equipment: "barbell", category: "compound", description: "Foundational lower-body squat movement.", formTips: "Brace, keep chest up, and drive through the mid-foot." },
  { name: "Romanian Deadlift", muscleGroup: "legs", equipment: "barbell", category: "compound", description: "Hip hinge for hamstrings and glutes.", formTips: "Push hips back, keep the bar close, and maintain a neutral spine." },
  { name: "Barbell Row", muscleGroup: "back", equipment: "barbell", category: "compound", description: "Back thickness movement using a bent-over row.", formTips: "Brace your core and pull elbows toward your hips." },
  { name: "Lat Pulldown", muscleGroup: "back", equipment: "cable", category: "compound", description: "Vertical pull for lats and upper back.", formTips: "Pull elbows down and avoid using momentum." },
  { name: "Overhead Press", muscleGroup: "shoulders", equipment: "barbell", category: "compound", description: "Vertical pressing movement for shoulders.", formTips: "Brace hard and press straight overhead." },
  { name: "Lateral Raises", muscleGroup: "shoulders", equipment: "dumbbell", category: "isolation", description: "Side delt isolation exercise.", formTips: "Lead with elbows and keep reps controlled." },
  { name: "Barbell Curl", muscleGroup: "arms", equipment: "barbell", category: "isolation", description: "Biceps curl with a barbell.", formTips: "Keep elbows pinned and avoid swinging." },
  { name: "Tricep Dips", muscleGroup: "arms", equipment: "bodyweight", category: "compound", description: "Bodyweight dip for triceps and chest.", formTips: "Control the descent and use a comfortable shoulder range." },
  { name: "Plank", muscleGroup: "core", equipment: "bodyweight", category: "isolation", description: "Core stabilization hold.", formTips: "Keep ribs down, glutes tight, and hips level." },
  { name: "Deadlift", muscleGroup: "back", equipment: "barbell", category: "compound", description: "Full-body pull from the floor.", formTips: "Keep the bar close and push the floor away." },
];

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function ensureStarterExerciseLibrary() {
  const count = await prisma.exercise.count();
  if (count > 0) return;

  for (const exercise of starterExercises) {
    await prisma.exercise.upsert({
      where: { id: slugify(exercise.name) },
      update: {},
      create: {
        id: slugify(exercise.name),
        ...exercise,
      },
    });
  }
}
