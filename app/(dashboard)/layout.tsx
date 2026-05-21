import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { DashboardShell } from "./_components/dashboard-shell";
import { prisma } from "@/lib/db";

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T) {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  const userId = (session.user as any)?.id;
  const profile = await withTimeout(
    prisma.userProfile.findUnique({ where: { userId } }).catch((error) => {
      console.warn("Could not load user profile", error);
      return null;
    }),
    1200,
    null
  );
  return <DashboardShell user={session.user} initialProfile={profile}>{children}</DashboardShell>;
}
