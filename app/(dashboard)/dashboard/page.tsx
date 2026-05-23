"use client";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Flame, Target, Dumbbell, TrendingUp, Zap, Utensils, Calendar, CheckCircle2, Circle, Droplets, Plus, ListTodo, ChevronRight } from "lucide-react";
import { FadeIn, SlideIn } from "@/components/ui/animate";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { IssueReportForm } from "@/components/issue-report-form";
import { toast } from "sonner";

interface DashboardData {
  profile: any;
  todayMacros: { calories: number; protein: number; carbs: number; fat: number };
  todayWorkout: any;
  recentProgress: any[];
  workoutCount: number;
  streak: number;
  todayFoodLogs: any[];
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [reminders, setReminders] = useState<any[]>([]);
  const [waterLogs, setWaterLogs] = useState<any[]>([]);
  const [remindersLoading, setRemindersLoading] = useState(true);
  const [waterLoading, setWaterLoading] = useState(true);
  const [waterAdding, setWaterAdding] = useState(false);

  const fetchReminders = async () => {
    try {
      const res = await fetch("/api/reminders");
      if (res.ok) {
        const d = await res.json();
        setReminders(d.reminders ?? []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setRemindersLoading(false);
    }
  };

  const fetchWaterLogs = async () => {
    try {
      const res = await fetch("/api/water-logs");
      if (res.ok) {
        const d = await res.json();
        setWaterLogs(d.logs ?? []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setWaterLoading(false);
    }
  };

  useEffect(() => {
    fetch("/api/dashboard")
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(console.error)
      .finally(() => setLoading(false));

    fetchReminders();
    fetchWaterLogs();
  }, []);

  const toggleReminder = async (id: string, completed: boolean) => {
    try {
      const res = await fetch("/api/reminders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, completed }),
      });
      if (res.ok) {
        toast.success(completed ? "Reminder completed" : "Reminder active");
        setReminders((prev) =>
          prev.map((r) =>
            r.id === id ? { ...r, completed, completedAt: completed ? new Date().toISOString() : null } : r
          )
        );
      } else {
        toast.error("Failed to update reminder");
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to update reminder");
    }
  };

  const addWater = async (amountMl: number) => {
    setWaterAdding(true);
    try {
      const res = await fetch("/api/water-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountMl }),
      });
      if (res.ok) {
        toast.success(`Logged ${amountMl}ml of water`);
        fetchWaterLogs();
      } else {
        toast.error("Failed to log water");
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to log water");
    } finally {
      setWaterAdding(false);
    }
  };


  if (loading) {
    return (
      <div className="space-y-6">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-32 bg-muted animate-pulse rounded-lg" />
        ))}
      </div>
    );
  }

  const profile = data?.profile;
  const macros = data?.todayMacros ?? { calories: 0, protein: 0, carbs: 0, fat: 0 };
  const targetCal = profile?.targetCalories ?? 2500;
  const targetProtein = profile?.targetProtein ?? 150;
  const targetCarbs = profile?.targetCarbs ?? 300;
  const targetFat = profile?.targetFat ?? 70;

  const macroCards = [
    { label: "Calories", value: Math.round(macros.calories), target: targetCal, unit: "kcal", color: "text-orange-500", bgColor: "bg-orange-500/10", icon: Flame },
    { label: "Protein", value: Math.round(macros.protein), target: targetProtein, unit: "g", color: "text-blue-500", bgColor: "bg-blue-500/10", icon: Target },
    { label: "Carbs", value: Math.round(macros.carbs), target: targetCarbs, unit: "g", color: "text-green-500", bgColor: "bg-green-500/10", icon: Zap },
    { label: "Fat", value: Math.round(macros.fat), target: targetFat, unit: "g", color: "text-purple-500", bgColor: "bg-purple-500/10", icon: Target },
  ];

  return (
    <div className="space-y-5 sm:space-y-6">
      <FadeIn>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl font-bold tracking-tight leading-tight">Today&apos;s Overview</h2>
            <p className="text-muted-foreground text-sm mt-1">Track your daily nutrition and workouts</p>
          </div>
          {!profile && (
            <Link href="/profile">
              <Button size="sm">Set Up Profile</Button>
            </Link>
          )}
        </div>
      </FadeIn>

      {/* Stats Row */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <SlideIn from="bottom" delay={0}>
          <Card className="relative overflow-hidden">
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center sm:h-10 sm:w-10">
                  <Flame className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Streak</p>
                  <p className="text-2xl font-bold font-mono">{data?.streak ?? 0}</p>
                  <p className="text-xs text-muted-foreground">days</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </SlideIn>
        <SlideIn from="bottom" delay={0.1}>
          <Card>
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="w-9 h-9 rounded-lg bg-blue-500/10 flex items-center justify-center sm:h-10 sm:w-10">
                  <Dumbbell className="w-5 h-5 text-blue-500" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Workouts</p>
                  <p className="text-2xl font-bold font-mono">{data?.workoutCount ?? 0}</p>
                  <p className="text-xs text-muted-foreground">total</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </SlideIn>
        <SlideIn from="bottom" delay={0.2}>
          <Card>
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="w-9 h-9 rounded-lg bg-orange-500/10 flex items-center justify-center sm:h-10 sm:w-10">
                  <Utensils className="w-5 h-5 text-orange-500" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Meals Today</p>
                  <p className="text-2xl font-bold font-mono">{(data?.todayFoodLogs ?? [])?.length ?? 0}</p>
                  <p className="text-xs text-muted-foreground">logged</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </SlideIn>
        <SlideIn from="bottom" delay={0.3}>
          <Card>
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="w-9 h-9 rounded-lg bg-green-500/10 flex items-center justify-center sm:h-10 sm:w-10">
                  <TrendingUp className="w-5 h-5 text-green-500" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Goal</p>
                  <p className="text-base font-bold leading-tight sm:text-lg">Muscle Gain</p>
                  <p className="text-xs text-muted-foreground">+{targetCal > 0 ? 300 : 0} kcal surplus</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </SlideIn>
      </div>

      {/* Macros Section */}
      <FadeIn delay={0.2}>
        <Card>
          <CardHeader className="p-4 pb-2 sm:p-6 sm:pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Utensils className="w-5 h-5 text-primary" />
              Today&apos;s Nutrition
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-2 sm:p-6 sm:pt-3">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
              {macroCards.map((macro: any) => {
                const pct = macro?.target > 0 ? Math.min(100, Math.round((macro?.value / macro?.target) * 100)) : 0;
                return (
                  <div key={macro?.label} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`w-8 h-8 rounded-md ${macro?.bgColor} flex items-center justify-center`}>
                          <macro.icon className={`w-4 h-4 ${macro?.color}`} />
                        </div>
                        <span className="text-sm font-medium">{macro?.label}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">{pct}%</span>
                    </div>
                    <Progress value={pct} className="h-2" />
                    <p className="text-sm">
                      <span className="font-mono font-bold">{macro?.value}</span>
                      <span className="text-muted-foreground"> / {macro?.target} {macro?.unit}</span>
                    </p>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </FadeIn>

      {/* Today's Workout & Recent Food */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <FadeIn delay={0.3}>
          <Card className="h-full">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Dumbbell className="w-5 h-5 text-primary" />
                  Today&apos;s Workout
                </CardTitle>
                <Link href="/workouts">
                  <Button variant="ghost" size="sm">View All</Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {data?.todayWorkout ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium">{data.todayWorkout?.templateName ?? "Workout"}</h3>
                    <Badge variant="secondary">{data.todayWorkout?.duration ?? 0} min</Badge>
                  </div>
                  {(data.todayWorkout?.exerciseLogs ?? []).slice(0, 5).map((log: any) => (
                    <div key={log?.id} className="flex items-center justify-between text-sm py-1 border-b border-border/50 last:border-0">
                      <span>{log?.exercise?.name ?? "Exercise"}</span>
                      <span className="text-muted-foreground font-mono">
                        {log?.weight ?? 0}kg × {log?.reps ?? 0}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Dumbbell className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No workout logged today</p>
                  <Link href="/workouts">
                    <Button size="sm" className="mt-3">Log Workout</Button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
        </FadeIn>

        <FadeIn delay={0.4}>
          <Card className="h-full">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Calendar className="w-5 h-5 text-primary" />
                  Recent Food Log
                </CardTitle>
                <Link href="/nutrition">
                  <Button variant="ghost" size="sm">View All</Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {(data?.todayFoodLogs ?? [])?.length > 0 ? (
                <div className="space-y-2">
                  {(data?.todayFoodLogs ?? []).slice(0, 6).map((log: any) => (
                    <div key={log?.id} className="flex items-center justify-between text-sm py-1.5 border-b border-border/50 last:border-0">
                      <div>
                        <span className="font-medium">{log?.foodName ?? "Food"}</span>
                        <Badge variant="outline" className="ml-2 text-xs">{log?.mealType ?? "meal"}</Badge>
                      </div>
                      <span className="text-muted-foreground font-mono">{Math.round(log?.calories ?? 0)} kcal</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Utensils className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No meals logged today</p>
                  <Link href="/nutrition">
                    <Button size="sm" className="mt-3">Log Meal</Button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
        </FadeIn>
      </div>

      {/* Reminders & Water Logs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Reminders Card */}
        <FadeIn delay={0.45}>
          <Card className="h-full flex flex-col justify-between">
            <div>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <ListTodo className="w-5 h-5 text-primary" />
                  Due Reminders
                </CardTitle>
                <Link href="/reminders" className="text-xs text-primary hover:underline flex items-center gap-1">
                  Manage <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              </CardHeader>
              <CardContent>
                {remindersLoading ? (
                  <div className="space-y-2 py-4">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="h-10 bg-muted/45 animate-pulse rounded" />
                    ))}
                  </div>
                ) : reminders.filter((r) => !r.completed).length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-center text-sm text-muted-foreground">
                    <CheckCircle2 className="w-10 h-10 text-primary/50 mb-2" />
                    <p className="font-medium text-foreground">All caught up! 🎉</p>
                    <p className="text-xs mt-1">You have no pending reminders for today.</p>
                  </div>
                ) : (
                  <div className="space-y-3 py-2">
                    {reminders
                      .filter((r) => !r.completed)
                      .slice(0, 5)
                      .map((r) => (
                        <div
                          key={r.id}
                          className="flex items-center justify-between rounded-lg border border-border/40 bg-muted/20 px-3 py-2.5 hover:bg-muted/40 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => toggleReminder(r.id, true)}
                              className="text-muted-foreground hover:text-primary transition-colors focus:outline-none"
                              aria-label="Mark reminder completed"
                            >
                              <Circle className="w-5 h-5" />
                            </button>
                            <div className="text-sm">
                              <p className="font-medium text-foreground">{r.title}</p>
                              {r.notes && <p className="text-xs text-muted-foreground line-clamp-1">{r.notes}</p>}
                            </div>
                          </div>
                          {r.priority && r.priority !== "none" && (
                            <Badge
                              variant="outline"
                              className={`text-[10px] uppercase font-mono ${
                                r.priority === "high"
                                  ? "border-destructive text-destructive bg-destructive/5"
                                  : r.priority === "medium"
                                  ? "border-amber-500 text-amber-500 bg-amber-500/5"
                                  : "border-blue-500 text-blue-500 bg-blue-500/5"
                              }`}
                            >
                              {r.priority}
                            </Badge>
                          )}
                        </div>
                      ))}
                  </div>
                )}
              </CardContent>
            </div>
          </Card>
        </FadeIn>

        {/* Water Tracker Card */}
        <FadeIn delay={0.45}>
          <Card className="h-full flex flex-col justify-between">
            <div>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Droplets className="w-5 h-5 text-blue-500" />
                  Water Tracker
                </CardTitle>
                <Badge variant="outline" className="text-blue-500 border-blue-500/30 bg-blue-500/5 font-mono">
                  {Math.round(waterLogs.reduce((sum, log: any) => sum + (log.amountMl ?? 0), 0))} / {Math.round(profile?.targetWaterMl ?? 3000)} ml
                </Badge>
              </CardHeader>
              <CardContent className="space-y-4">
                {waterLoading ? (
                  <div className="space-y-2 py-4">
                    <div className="h-4 bg-muted animate-pulse rounded" />
                    <div className="h-10 bg-muted animate-pulse rounded" />
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Water Level Wave Progress Bar */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>Daily Hydration Goal</span>
                        <span className="font-mono font-bold text-blue-500">
                          {profile?.targetWaterMl && profile.targetWaterMl > 0
                            ? Math.min(100, Math.round((waterLogs.reduce((sum, log: any) => sum + (log.amountMl ?? 0), 0) / profile.targetWaterMl) * 100))
                            : Math.min(100, Math.round((waterLogs.reduce((sum, log: any) => sum + (log.amountMl ?? 0), 0) / 3000) * 100))}%
                        </span>
                      </div>
                      <div className="relative h-4 w-full overflow-hidden rounded-full bg-blue-950/20 border border-blue-500/20">
                        <div
                          className="h-full bg-gradient-to-r from-blue-600 to-blue-400 transition-all duration-500 ease-out"
                          style={{
                            width: `${
                              profile?.targetWaterMl && profile.targetWaterMl > 0
                                ? Math.min(100, Math.round((waterLogs.reduce((sum, log: any) => sum + (log.amountMl ?? 0), 0) / profile.targetWaterMl) * 100))
                                : Math.min(100, Math.round((waterLogs.reduce((sum, log: any) => sum + (log.amountMl ?? 0), 0) / 3000) * 100))
                            }%`
                          }}
                        />
                      </div>
                    </div>

                    {/* Quick Add Buttons */}
                    <div className="grid grid-cols-3 gap-2">
                      {[250, 500, 750].map((amount) => (
                        <Button
                          key={amount}
                          variant="outline"
                          disabled={waterAdding}
                          onClick={() => addWater(amount)}
                          className="flex flex-col items-center gap-1 py-3 h-auto text-blue-500 hover:text-white border-blue-500/30 hover:border-blue-500 hover:bg-blue-600/90 transition-all"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span className="font-mono text-xs font-bold">{amount}ml</span>
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </div>
          </Card>
        </FadeIn>
      </div>

      <FadeIn delay={0.5}>
        <IssueReportForm compact defaultPage="Dashboard" />
      </FadeIn>
    </div>
  );
}
