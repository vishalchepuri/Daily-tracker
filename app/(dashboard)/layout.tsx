import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { DashboardShell } from "./_components/dashboard-shell";
import { prisma } from "@/lib/db";
import { ensureStarterExerciseLibrary } from "@/lib/exercise-library";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  const userId = (session.user as any)?.id;
  const [profile] = await Promise.all([
    prisma.userProfile.findUnique({ where: { userId } }),
    ensureStarterExerciseLibrary(),
  ]);
  return <DashboardShell user={session.user} initialProfile={profile}>{children}</DashboardShell>;
}
