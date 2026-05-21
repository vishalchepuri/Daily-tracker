import { redirect } from "next/navigation";
import { Shield, Users, Mail, Activity, CalendarClock } from "lucide-react";
import { requireAdminUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function formatDate(value?: Date | null) {
  if (!value) return "Never";
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

export default async function AdminPage() {
  const admin = await requireAdminUser();
  if (!admin) redirect("/dashboard");

  const [users, totals] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        name: true,
        email: true,
        emailVerified: true,
        createdAt: true,
        updatedAt: true,
        accounts: { select: { provider: true } },
        profile: {
          select: {
            age: true,
            weight: true,
            height: true,
            goal: true,
            telegramEnabled: true,
            telegramChatId: true,
          },
        },
        _count: {
          select: {
            chatMessages: true,
            workoutLogs: true,
            workoutTemplates: true,
            foodLogs: true,
            spends: true,
            reminders: true,
            medications: true,
            progressEntries: true,
          },
        },
      },
    }),
    prisma.user.aggregate({
      _count: { id: true },
    }),
  ]);

  const googleUsers = users.filter((user) => user.accounts.some((account) => account.provider === "google")).length;
  const profileUsers = users.filter((user) => user.profile?.age && user.profile?.weight && user.profile?.height).length;
  const telegramUsers = users.filter((user) => user.profile?.telegramEnabled && user.profile?.telegramChatId).length;

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-2 text-primary">
          <Shield className="h-5 w-5" />
          <span className="text-sm font-semibold uppercase tracking-wide">Admin</span>
        </div>
        <h2 className="mt-2 font-display text-2xl font-bold tracking-tight">Users</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Read-only view of registered Dayza users and their activity counts.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-lg bg-primary/10 p-2 text-primary"><Users className="h-5 w-5" /></div>
            <div>
              <p className="text-sm text-muted-foreground">Total users</p>
              <p className="text-2xl font-bold">{totals._count.id}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-lg bg-primary/10 p-2 text-primary"><Mail className="h-5 w-5" /></div>
            <div>
              <p className="text-sm text-muted-foreground">Google linked</p>
              <p className="text-2xl font-bold">{googleUsers}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-lg bg-primary/10 p-2 text-primary"><Activity className="h-5 w-5" /></div>
            <div>
              <p className="text-sm text-muted-foreground">Profiles ready</p>
              <p className="text-2xl font-bold">{profileUsers}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-lg bg-primary/10 p-2 text-primary"><CalendarClock className="h-5 w-5" /></div>
            <div>
              <p className="text-sm text-muted-foreground">Telegram linked</p>
              <p className="text-2xl font-bold">{telegramUsers}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Latest Users</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Login</TableHead>
                <TableHead>Profile</TableHead>
                <TableHead>Activity</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => {
                const providers = user.accounts.map((account) => account.provider);
                const profileReady = Boolean(user.profile?.age && user.profile?.weight && user.profile?.height);
                const totalActivity =
                  user._count.chatMessages +
                  user._count.workoutLogs +
                  user._count.foodLogs +
                  user._count.spends +
                  user._count.reminders +
                  user._count.medications +
                  user._count.progressEntries;

                return (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div className="min-w-48">
                        <p className="font-semibold">{user.name || "No name"}</p>
                        <p className="text-xs text-muted-foreground">{user.email}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {providers.length > 0 ? providers.map((provider) => (
                          <Badge key={provider} variant="secondary" className="capitalize">{provider}</Badge>
                        )) : <Badge variant="outline">Email</Badge>}
                        {user.emailVerified && <Badge variant="outline">Verified</Badge>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <Badge variant={profileReady ? "default" : "outline"}>{profileReady ? "Ready" : "Missing"}</Badge>
                        {user.profile?.goal && <p className="text-xs text-muted-foreground">{user.profile.goal.replace(/_/g, " ")}</p>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="grid gap-1 text-xs text-muted-foreground">
                        <span>{totalActivity} total records</span>
                        <span>{user._count.chatMessages} chats, {user._count.spends} spends</span>
                        <span>{user._count.workoutLogs} workouts, {user._count.foodLogs} meals</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDate(user.createdAt)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDate(user.updatedAt)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {users.length === 0 && (
            <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              No users found yet.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
