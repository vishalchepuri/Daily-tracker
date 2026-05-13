import { ensureStarterExerciseLibrary } from "@/lib/exercise-library";
import { prisma } from "@/lib/db";

async function main() {
  await ensureStarterExerciseLibrary();
  console.log("Exercise library seed completed.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
