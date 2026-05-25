import { prisma } from "@/lib/db";

type StarterExercise = {
  name: string;
  muscleGroup: string;
  equipment: string;
  category: string;
  description: string;
  formTips: string;
};

function ex(name: string, muscleGroup: string, equipment: string, category = "compound", description?: string, formTips?: string): StarterExercise {
  const title = name.replace(/\b\w/g, (char) => char.toUpperCase());
  return {
    name,
    muscleGroup,
    equipment,
    category,
    description: description ?? `${title} for ${muscleGroup} training.`,
    formTips: formTips ?? "Use controlled reps, keep a stable setup, and stop if the movement causes joint pain.",
  };
}

const starterExercises: StarterExercise[] = [
  ex("Barbell Bench Press", "chest", "barbell", "compound", "Flat bench press for chest, shoulders, and triceps.", "Keep shoulder blades back, feet planted, and lower the bar under control."),
  ex("Incline Dumbbell Press", "chest", "dumbbell", "compound", "Incline press focused on upper chest.", "Use a controlled range and avoid flaring elbows too wide."),
  ex("Machine Chest Press", "chest", "machine"),
  ex("Incline Barbell Bench Press", "chest", "barbell"),
  ex("Decline Barbell Bench Press", "chest", "barbell"),
  ex("Dumbbell Bench Press", "chest", "dumbbell"),
  ex("Decline Dumbbell Press", "chest", "dumbbell"),
  ex("Cable Chest Fly", "chest", "cable", "isolation"),
  ex("Pec Deck Fly", "chest", "machine", "isolation"),
  ex("Push-Up", "chest", "bodyweight"),
  ex("Weighted Push-Up", "chest", "bodyweight"),
  ex("Dips", "chest", "bodyweight"),
  ex("Smith Machine Bench Press", "chest", "machine"),
  ex("Low Cable Fly", "chest", "cable", "isolation"),
  ex("High Cable Fly", "chest", "cable", "isolation"),
  ex("Dumbbell Pullover", "chest", "dumbbell"),
  ex("Landmine Chest Press", "chest", "barbell"),
  ex("Svend Press", "chest", "plate", "isolation"),
  ex("Single-Arm Cable Press", "chest", "cable"),
  ex("Close-Grip Push-Up", "chest", "bodyweight"),
  ex("Barbell Row", "back", "barbell", "compound", "Back thickness movement using a bent-over row.", "Brace your core and pull elbows toward your hips."),
  ex("Lat Pulldown", "back", "cable", "compound", "Vertical pull for lats and upper back.", "Pull elbows down and avoid using momentum."),
  ex("Deadlift", "back", "barbell", "compound", "Full-body pull from the floor.", "Keep the bar close and push the floor away."),
  ex("Pull-Up", "back", "bodyweight"),
  ex("Chin-Up", "back", "bodyweight"),
  ex("Seated Cable Row", "back", "cable"),
  ex("Chest-Supported Row", "back", "machine"),
  ex("One-Arm Dumbbell Row", "back", "dumbbell"),
  ex("T-Bar Row", "back", "machine"),
  ex("Machine Row", "back", "machine"),
  ex("Straight-Arm Pulldown", "back", "cable", "isolation"),
  ex("Face Pull", "back", "cable", "isolation"),
  ex("Inverted Row", "back", "bodyweight"),
  ex("Meadows Row", "back", "barbell"),
  ex("Rack Pull", "back", "barbell"),
  ex("Good Morning", "back", "barbell"),
  ex("Back Extension", "back", "machine"),
  ex("Reverse Pec Deck", "back", "machine", "isolation"),
  ex("Neutral-Grip Pulldown", "back", "cable"),
  ex("Wide-Grip Cable Row", "back", "cable"),
  ex("Overhead Press", "shoulders", "barbell", "compound", "Vertical pressing movement for shoulders.", "Brace hard and press straight overhead."),
  ex("Lateral Raises", "shoulders", "dumbbell", "isolation", "Side delt isolation exercise.", "Lead with elbows and keep reps controlled."),
  ex("Dumbbell Shoulder Press", "shoulders", "dumbbell"),
  ex("Machine Shoulder Press", "shoulders", "machine"),
  ex("Arnold Press", "shoulders", "dumbbell"),
  ex("Cable Lateral Raise", "shoulders", "cable", "isolation"),
  ex("Rear Delt Fly", "shoulders", "dumbbell", "isolation"),
  ex("Rear Delt Cable Fly", "shoulders", "cable", "isolation"),
  ex("Front Raise", "shoulders", "dumbbell", "isolation"),
  ex("Plate Front Raise", "shoulders", "plate", "isolation"),
  ex("Upright Row", "shoulders", "barbell"),
  ex("Landmine Press", "shoulders", "barbell"),
  ex("Push Press", "shoulders", "barbell"),
  ex("Pike Push-Up", "shoulders", "bodyweight"),
  ex("Handstand Push-Up", "shoulders", "bodyweight"),
  ex("Dumbbell Shrug", "shoulders", "dumbbell", "isolation"),
  ex("Barbell Shrug", "shoulders", "barbell", "isolation"),
  ex("Cable Y Raise", "shoulders", "cable", "isolation"),
  ex("Cuban Press", "shoulders", "dumbbell"),
  ex("Machine Lateral Raise", "shoulders", "machine", "isolation"),
  ex("Barbell Back Squat", "legs", "barbell", "compound", "Foundational lower-body squat movement.", "Brace, keep chest up, and drive through the mid-foot."),
  ex("Romanian Deadlift", "legs", "barbell", "compound", "Hip hinge for hamstrings and glutes.", "Push hips back, keep the bar close, and maintain a neutral spine."),
  ex("Leg Press", "legs", "machine"),
  ex("Hack Squat", "legs", "machine"),
  ex("Front Squat", "legs", "barbell"),
  ex("Goblet Squat", "legs", "dumbbell"),
  ex("Bulgarian Split Squat", "legs", "dumbbell"),
  ex("Walking Lunge", "legs", "dumbbell"),
  ex("Reverse Lunge", "legs", "dumbbell"),
  ex("Leg Extension", "legs", "machine", "isolation"),
  ex("Seated Leg Curl", "legs", "machine", "isolation"),
  ex("Lying Leg Curl", "legs", "machine", "isolation"),
  ex("Hip Thrust", "legs", "barbell"),
  ex("Glute Bridge", "legs", "bodyweight"),
  ex("Standing Calf Raise", "legs", "machine", "isolation"),
  ex("Seated Calf Raise", "legs", "machine", "isolation"),
  ex("Step-Up", "legs", "dumbbell"),
  ex("Sumo Deadlift", "legs", "barbell"),
  ex("Cable Pull-Through", "legs", "cable"),
  ex("Adductor Machine", "legs", "machine", "isolation"),
  ex("Abductor Machine", "legs", "machine", "isolation"),
  ex("Barbell Curl", "arms", "barbell", "isolation", "Biceps curl with a barbell.", "Keep elbows pinned and avoid swinging."),
  ex("Tricep Dips", "arms", "bodyweight", "compound", "Bodyweight dip for triceps and chest.", "Control the descent and use a comfortable shoulder range."),
  ex("Dumbbell Curl", "arms", "dumbbell", "isolation"),
  ex("Hammer Curl", "arms", "dumbbell", "isolation"),
  ex("Incline Dumbbell Curl", "arms", "dumbbell", "isolation"),
  ex("Preacher Curl", "arms", "machine", "isolation"),
  ex("Cable Curl", "arms", "cable", "isolation"),
  ex("Concentration Curl", "arms", "dumbbell", "isolation"),
  ex("EZ-Bar Curl", "arms", "barbell", "isolation"),
  ex("Rope Pushdown", "arms", "cable", "isolation"),
  ex("Straight-Bar Pushdown", "arms", "cable", "isolation"),
  ex("Overhead Cable Extension", "arms", "cable", "isolation"),
  ex("Dumbbell Overhead Triceps Extension", "arms", "dumbbell", "isolation"),
  ex("Close-Grip Bench Press", "arms", "barbell"),
  ex("Skull Crusher", "arms", "barbell", "isolation"),
  ex("Cable Kickback", "arms", "cable", "isolation"),
  ex("Wrist Curl", "arms", "dumbbell", "isolation"),
  ex("Reverse Curl", "arms", "barbell", "isolation"),
  ex("Farmer Carry", "arms", "dumbbell"),
  ex("Bench Dip", "arms", "bodyweight"),
  ex("Plank", "core", "bodyweight", "isolation", "Core stabilization hold.", "Keep ribs down, glutes tight, and hips level."),
  ex("Side Plank", "core", "bodyweight", "isolation"),
  ex("Hanging Knee Raise", "core", "bodyweight"),
  ex("Hanging Leg Raise", "core", "bodyweight"),
  ex("Cable Crunch", "core", "cable", "isolation"),
  ex("Ab Wheel Rollout", "core", "bodyweight"),
  ex("Dead Bug", "core", "bodyweight", "isolation"),
  ex("Bird Dog", "core", "bodyweight", "isolation"),
  ex("Pallof Press", "core", "cable", "isolation"),
  ex("Russian Twist", "core", "medicine ball", "isolation"),
  ex("Bicycle Crunch", "core", "bodyweight", "isolation"),
  ex("Reverse Crunch", "core", "bodyweight", "isolation"),
  ex("Mountain Climber", "core", "bodyweight"),
  ex("Cable Woodchop", "core", "cable"),
  ex("Decline Sit-Up", "core", "bodyweight"),
  ex("Weighted Crunch", "core", "plate", "isolation"),
  ex("V-Up", "core", "bodyweight"),
  ex("Toe Touch", "core", "bodyweight"),
  ex("Suitcase Carry", "core", "dumbbell"),
  ex("Stability Ball Crunch", "core", "stability ball", "isolation"),
];

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function ensureStarterExerciseLibrary() {
  for (const exercise of starterExercises) {
    await prisma.exercise.upsert({
      where: { id: slugify(exercise.name) },
      update: {
        muscleGroup: exercise.muscleGroup,
        equipment: exercise.equipment,
        category: exercise.category,
        description: exercise.description,
        formTips: exercise.formTips,
        status: "approved",
      },
      create: {
        id: slugify(exercise.name),
        ...exercise,
        status: "approved",
      },
    });
  }
}

export async function ensureStarterExerciseLibrarySafe() {
  try {
    await ensureStarterExerciseLibrary();
  } catch (error) {
    console.warn("Could not ensure starter exercise library", error);
  }
}
