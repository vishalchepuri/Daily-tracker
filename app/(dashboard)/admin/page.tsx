import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { AlertCircle, Banknote, CalendarClock, CheckCircle2, Database, Dumbbell, HeartPulse, Mail, MessageSquare, Shield, Users, WalletCards, XCircle } from "lucide-react";
import { requireAdminUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { listFirestoreChatSessions, pruneFirestoreChatRetention } from "@/lib/firestore-chat";
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

function formatNumber(value?: number | null) {
  return new Intl.NumberFormat("en-IN").format(value ?? 0);
}

function formatInr(value?: number | null) {
  return `INR ${Number(value ?? 0).toFixed(0)}`;
}

async function approveExerciseSubmission(formData: FormData) {
  "use server";
  const admin = await requireAdminUser();
  if (!admin) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await prisma.exercise.update({
    where: { id },
    data: {
      status: "approved",
      reviewedById: admin.id,
      reviewedAt: new Date(),
    },
  });
  revalidatePath("/admin");
}

async function rejectExerciseSubmission(formData: FormData) {
  "use server";
  const admin = await requireAdminUser();
  if (!admin) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await prisma.exercise.update({
    where: { id },
    data: {
      status: "rejected",
      reviewedById: admin.id,
      reviewedAt: new Date(),
    },
  });
  revalidatePath("/admin");
}

async function runRetentionCleanup() {
  "use server";
  const admin = await requireAdminUser();
  if (!admin) return;
  const users = await prisma.user.findMany({ select: { id: true }, take: 500 });

  for (const user of users) {
    await pruneFirestoreChatRetention(user.id, 7, 10);
  }

  revalidatePath("/admin");
}

export default async function AdminPage() {
  const admin = await requireAdminUser();
  if (!admin) redirect("/dashboard");

  const [users, totals, spendTotals, moneyLinkTotals, issueReports, recentSpends, recentWorkoutLogs, pendingExercises] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        name: true,
        email: true,
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
    prisma.spend.aggregate({
      _count: { id: true },
      _sum: { amount: true },
    }),
    prisma.moneyLink.aggregate({
      where: { settled: false },
      _count: { id: true },
      _sum: { amount: true },
    }),
    prisma.issueReport.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { user: { select: { name: true, email: true } } },
    }),
    prisma.spend.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { id: true, merchant: true, amount: true, currency: true, source: true, createdAt: true, user: { select: { name: true, email: true } } },
    }),
    prisma.workoutLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 6,
      select: { id: true, templateName: true, duration: true, date: true, user: { select: { name: true, email: true } } },
    }),
    prisma.exercise.findMany({
      where: { status: "pending" },
      orderBy: { createdAt: "asc" },
      take: 20,
      include: { submittedBy: { select: { name: true, email: true } } },
    }),
  ]);

  const googleUsers = users.filter((user) => user.accounts.some((account) => account.provider === "google")).length;
  const profileUsers = users.filter((user) => user.profile?.age && user.profile?.weight && user.profile?.height).length;
  const telegramUsers = users.filter((user) => user.profile?.telegramEnabled && user.profile?.telegramChatId).length;
  const openIssues = issueReports.filter((issue) => issue.status === "open").length;
  const totalActivity = users.reduce((sum, user) => (
    sum +
    user._count.workoutLogs +
    user._count.foodLogs +
    user._count.spends +
    user._count.reminders +
    user._count.medications +
    user._count.progressEntries
  ), 0);
  const usersWithChatCounts = await Promise.all(
    users.map(async (user) => {
      const sessions = await listFirestoreChatSessions(user.id, 0, 7).catch(() => []);
      return {
        ...user,
        chatCount: sessions.reduce((sum, session) => sum + (session.messageCount ?? 0), 0),
      };
    })
  );
  const topActiveUsers = usersWithChatCounts
    .filter((user) => user.chatCount > 0)
    .sort((a, b) => b.chatCount - a.chatCount)
    .slice(0, 5);
  const reviewQueue = [
    ...pendingExercises.map((exercise) => ({
      id: exercise.id,
      type: "Exercise",
      title: exercise.name,
      detail: `${exercise.muscleGroup}${exercise.equipment ? ` - ${exercise.equipment}` : ""}`,
      user: exercise.submittedBy?.name || exercise.submittedBy?.email || "Unknown user",
      createdAt: exercise.createdAt,
      kind: "exercise" as const,
    })),
    ...issueReports
      .filter((issue) => issue.status === "open")
      .map((issue) => ({
        id: issue.id,
        type: "Issue",
        title: issue.category,
        detail: issue.message,
        user: issue.user?.name || issue.user?.email || issue.email || "Anonymous",
        createdAt: issue.createdAt,
        kind: "issue" as const,
      })),
  ]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 12);

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-2 text-primary">
          <Shield className="h-5 w-5" />
          <span className="text-sm font-semibold uppercase tracking-wide">Admin</span>
        </div>
        <h2 className="mt-2 font-display text-2xl font-bold tracking-tight">Admin Command Center</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Monitor users, product usage, finance activity, workouts, and reported issues.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <AdminMetric title="Total users" value={formatNumber(totals._count.id)} detail={`${profileUsers} profiles ready`} icon={Users} />
        <AdminMetric title="Total activity" value={formatNumber(totalActivity)} detail="records across users" icon={HeartPulse} />
        <AdminMetric title="Spend volume" value={formatInr(spendTotals._sum.amount)} detail={`${formatNumber(spendTotals._count.id)} spend records`} icon={WalletCards} />
        <AdminMetric title="Open issues" value={formatNumber(openIssues)} detail={`${formatNumber(issueReports.length)} recent reports`} icon={AlertCircle} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <AdminMetric title="Google linked" value={formatNumber(googleUsers)} detail="OAuth accounts" icon={Mail} compact />
        <AdminMetric title="Telegram linked" value={formatNumber(telegramUsers)} detail="reminder-ready users" icon={CalendarClock} compact />
        <AdminMetric title="Money links" value={formatInr(moneyLinkTotals._sum.amount)} detail={`${formatNumber(moneyLinkTotals._count.id)} unsettled`} icon={Banknote} compact />
        <AdminMetric title="Exercise approvals" value={formatNumber(pendingExercises.length)} detail="waiting for review" icon={Dumbbell} compact />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_22rem]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Shield className="h-5 w-5 text-primary" />Smart Review Queue</CardTitle>
          </CardHeader>
          <CardContent>
            {reviewQueue.length === 0 ? (
              <EmptyState label="Nothing needs review right now." />
            ) : (
              <div className="grid gap-2">
                {reviewQueue.map((item) => (
                  <div key={`${item.kind}-${item.id}`} className="grid gap-3 rounded-lg bg-muted/40 p-3 md:grid-cols-[1fr_auto] md:items-center">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={item.kind === "exercise" ? "default" : "secondary"}>{item.type}</Badge>
                        <p className="truncate font-semibold">{item.title}</p>
                      </div>
                      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{item.detail}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{item.user} - {formatDate(item.createdAt)}</p>
                    </div>
                    {item.kind === "exercise" ? (
                      <div className="flex flex-wrap gap-2">
                        <form action={approveExerciseSubmission}>
                          <input type="hidden" name="id" value={item.id} />
                          <button className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90">
                            <CheckCircle2 className="h-4 w-4" /> Approve
                          </button>
                        </form>
                        <form action={rejectExerciseSubmission}>
                          <input type="hidden" name="id" value={item.id} />
                          <button className="inline-flex h-9 items-center gap-2 rounded-md border border-destructive/40 px-3 text-sm font-medium text-destructive hover:bg-destructive/10">
                            <XCircle className="h-4 w-4" /> Reject
                          </button>
                        </form>
                      </div>
                    ) : (
                      <Badge variant="outline">Open</Badge>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Database className="h-5 w-5 text-primary" />Retention Cleanup</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Applies chat limits for every user: 7 chats, 10 messages per chat, and image data only for 5 days.
            </p>
            <form action={runRetentionCleanup}>
              <button className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90">
                <Database className="h-4 w-4" /> Run Cleanup
              </button>
            </form>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Dumbbell className="h-5 w-5 text-primary" />Exercise Approval Queue</CardTitle>
        </CardHeader>
        <CardContent>
          {pendingExercises.length === 0 ? (
            <EmptyState label="No exercise submissions waiting for approval." />
          ) : (
            <div className="grid gap-2">
              {pendingExercises.map((exercise) => (
                <div key={exercise.id} className="grid gap-3 rounded-lg bg-muted/40 p-3 lg:grid-cols-[1fr_auto] lg:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">{exercise.name}</p>
                      <Badge variant="secondary" className="capitalize">{exercise.muscleGroup}</Badge>
                      {exercise.equipment && <Badge variant="outline">{exercise.equipment}</Badge>}
                      {exercise.category && <Badge variant="outline">{exercise.category}</Badge>}
                    </div>
                    {exercise.description && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{exercise.description}</p>}
                    {exercise.formTips && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">Tips: {exercise.formTips}</p>}
                    <p className="mt-1 text-xs text-muted-foreground">
                      Submitted by {exercise.submittedBy?.name || exercise.submittedBy?.email || "Unknown user"} on {formatDate(exercise.createdAt)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <form action={approveExerciseSubmission}>
                      <input type="hidden" name="id" value={exercise.id} />
                      <button className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90">
                        <CheckCircle2 className="h-4 w-4" /> Approve
                      </button>
                    </form>
                    <form action={rejectExerciseSubmission}>
                      <input type="hidden" name="id" value={exercise.id} />
                      <button className="inline-flex h-9 items-center gap-2 rounded-md border border-destructive/40 px-3 text-sm font-medium text-destructive hover:bg-destructive/10">
                        <XCircle className="h-4 w-4" /> Reject
                      </button>
                    </form>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><MessageSquare className="h-5 w-5 text-primary" />Top Chat Users</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {topActiveUsers.length === 0 ? (
              <EmptyState label="No chat usage yet." />
            ) : topActiveUsers.map((user) => (
              <AdminListRow
                key={user.id}
                title={user.name || user.email}
                detail={user.email}
                value={`${formatNumber(user.chatCount)} chats`}
              />
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><WalletCards className="h-5 w-5 text-primary" />Recent Spends</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {recentSpends.length === 0 ? (
              <EmptyState label="No spends recorded yet." />
            ) : recentSpends.map((spend) => (
              <AdminListRow
                key={spend.id}
                title={spend.merchant}
                detail={`${spend.user.name || spend.user.email} - ${spend.source}`}
                value={`${spend.currency} ${Number(spend.amount ?? 0).toFixed(0)}`}
              />
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Dumbbell className="h-5 w-5 text-primary" />Recent Workouts</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {recentWorkoutLogs.length === 0 ? (
              <EmptyState label="No workout logs yet." />
            ) : recentWorkoutLogs.map((log) => (
              <AdminListRow
                key={log.id}
                title={log.templateName || "Workout"}
                detail={`${log.user.name || log.user.email} - ${formatDate(log.date)}`}
                value={log.duration ? `${log.duration} min` : "Logged"}
              />
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><AlertCircle className="h-5 w-5 text-primary" />Issue Queue</CardTitle>
        </CardHeader>
        <CardContent>
          {issueReports.length === 0 ? (
            <EmptyState label="No issue reports yet." />
          ) : (
            <div className="grid gap-2">
              {issueReports.map((issue) => (
                <div key={issue.id} className="grid gap-2 rounded-lg bg-muted/40 p-3 md:grid-cols-[1fr_auto] md:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-medium">{issue.category}</p>
                      <Badge variant={issue.status === "open" ? "default" : "outline"}>{issue.status}</Badge>
                      {issue.page && <Badge variant="secondary">{issue.page}</Badge>}
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{issue.message}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{issue.user?.email || issue.email || "Anonymous"}</p>
                  </div>
                  <span className="text-xs text-muted-foreground">{formatDate(issue.createdAt)}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Latest Users</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto ios-scroll">
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
              {usersWithChatCounts.map((user) => {
                const providers = user.accounts.map((account) => account.provider);
                const profileReady = Boolean(user.profile?.age && user.profile?.weight && user.profile?.height);
                const totalActivity =
                  user.chatCount +
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
                        <span>{user.chatCount} chats, {user._count.spends} spends</span>
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

function AdminMetric({ title, value, detail, icon: Icon, compact }: any) {
  return (
    <Card>
      <CardContent className={`flex min-h-[6.5rem] items-center gap-3 ${compact ? "p-4" : "p-5"}`}>
        <div className="shrink-0 rounded-lg bg-primary/10 p-2.5 text-primary"><Icon className="h-5 w-5" /></div>
        <div className="min-w-0">
          <p className="truncate text-sm text-muted-foreground">{title}</p>
          <p className={`${compact ? "text-xl" : "text-2xl"} font-bold`}>{value}</p>
          <p className="truncate text-xs text-muted-foreground">{detail}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function AdminListRow({ title, detail, value }: { title: string; detail: string; value: string }) {
  return (
    <div className="grid grid-cols-[1fr_auto] gap-3 rounded-lg bg-muted/40 px-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{title}</p>
        <p className="truncate text-xs text-muted-foreground">{detail}</p>
      </div>
      <span className="whitespace-nowrap font-mono text-sm">{value}</span>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">{label}</div>;
}
