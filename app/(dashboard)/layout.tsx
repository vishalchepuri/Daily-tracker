import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { DashboardShell } from "./_components/dashboard-shell";
import { prisma } from "@/lib/db";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  const userId = (session.user as any)?.id;
  const profile = await prisma.userProfile.findUnique({ where: { userId } })
    .catch((error) => {
      console.warn("Could not load user profile", error);
      return undefined;
    });
  return <DashboardShell user={session.user} initialProfile={profile}>{children}</DashboardShell>;
}
