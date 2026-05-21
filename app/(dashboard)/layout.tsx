import { redirect } from "next/navigation";
import { DashboardShell } from "./_components/dashboard-shell";
import { prisma } from "@/lib/db";
import { requireCurrentUser } from "@/lib/auth";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireCurrentUser();
  if (!user) redirect("/login?staleSession=1");
  const userId = user.id;
  const profile = await prisma.userProfile.findUnique({ where: { userId } })
    .catch((error) => {
      console.warn("Could not load user profile", error);
      return undefined;
    });
  return <DashboardShell user={user} initialProfile={profile}>{children}</DashboardShell>;
}
