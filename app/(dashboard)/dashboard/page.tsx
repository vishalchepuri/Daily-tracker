"use client";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Flame, Target, Dumbbell, TrendingUp, Zap, Utensils, Calendar, CheckCircle2, Circle, Droplets, Plus, ListTodo, ChevronRight, Youtube, Sparkles, Settings } from "lucide-react";
import { FadeIn, SlideIn } from "@/components/ui/animate";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { IssueReportForm } from "@/components/issue-report-form";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";


interface DashboardData {
  profile: any;
  todayMacros: { calories: number; protein: number; carbs: number; fat: number };
  todayWorkout: any;
  recentProgress: any[];
  workoutCount: number;
  streak: number;
  todayFoodLogs: any[];
  weeklyTrends?: { date: string; fullDate: string; calories: number; protein: number; water: number }[];
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [reminders, setReminders] = useState<any[]>([]);
  const [waterLogs, setWaterLogs] = useState<any[]>([]);
  const [remindersLoading, setRemindersLoading] = useState(true);
  const [waterLoading, setWaterLoading] = useState(true);
  const [waterAdding, setWaterAdding] = useState(false);
  const [youtubeVideos, setYoutubeVideos] = useState<any[]>([]);
  const [youtubeLoading, setYoutubeLoading] = useState(true);
  const [youtubeNeedsConnection, setYoutubeNeedsConnection] = useState(false);

  // Targets Settings Drawer States
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [targetCalories, setTargetCalories] = useState<number>(2500);
  const [targetProtein, setTargetProtein] = useState<number>(150);
  const [targetCarbs, setTargetCarbs] = useState<number>(300);
  const [targetFat, setTargetFat] = useState<number>(70);
  const [targetWaterMl, setTargetWaterMl] = useState<number>(3000);
  const [savingTargets, setSavingTargets] = useState(false);

  // YouTube Summary Modal States
  const [activeSummaryVideo, setActiveSummaryVideo] = useState<any>(null);
  const [modalSummary, setModalSummary] = useState("");
  const [modalSource, setModalSource] = useState("");
  const [modalSummarizing, setModalSummarizing] = useState(false);

  useEffect(() => {
    if (data?.profile) {
      setTargetCalories(data.profile.targetCalories ?? 2500);
      setTargetProtein(data.profile.targetProtein ?? 150);
      setTargetCarbs(data.profile.targetCarbs ?? 300);
      setTargetFat(data.profile.targetFat ?? 70);
      setTargetWaterMl(data.profile.targetWaterMl ?? 3000);
    }
  }, [data?.profile, isSettingsOpen]);


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

  const fetchYoutubeVideos = async () => {
    try {
      const res = await fetch("/api/youtube/feed");
      const d = await res.json();
      if (res.ok) {
        setYoutubeVideos(d.videos ?? []);
      } else {
        if (d?.needsConnection) {
          setYoutubeNeedsConnection(true);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setYoutubeLoading(false);
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
    fetchYoutubeVideos();
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

  const handleSaveTargets = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingTargets(true);
    try {
      const res = await fetch("/api/nutrition-targets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetCalories,
          targetProtein,
          targetCarbs,
          targetFat,
          targetWaterMl,
        }),
      });
      const d = await res.json();
      if (res.ok) {
        toast.success("Targets updated successfully!");
        setData(prev => prev ? { ...prev, profile: d.profile } : prev);
        setIsSettingsOpen(false);
      } else {
        toast.error(d?.error ?? "Failed to update targets");
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to update targets");
    } finally {
      setSavingTargets(false);
    }
  };

  const handleVideoCardClick = async (video: any) => {
    setActiveSummaryVideo(video);
    setModalSummary("");
    setModalSource("");
    setModalSummarizing(true);
    try {
      const res = await fetch("/api/youtube/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId: video.id }),
      });
      const d = await res.json();
      if (res.ok) {
        setModalSummary(d.summary ?? "");
        setModalSource(d.source ?? "");
      } else {
        toast.error(d?.error?.message ?? d?.error ?? "Failed to generate summary");
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to generate summary");
    } finally {
      setModalSummarizing(false);
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

  const macroCards = [
    { label: "Calories", value: Math.round(macros.calories), target: targetCalories, unit: "kcal", color: "text-orange-500", bgColor: "bg-orange-500/10", icon: Flame },
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
                  <p className="text-xs text-muted-foreground">+{targetCalories > 0 ? 300 : 0} kcal surplus</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </SlideIn>
      </div>

      {/* Macros Section */}
      <FadeIn delay={0.2}>
        <Card>
          <CardHeader className="p-4 pb-2 sm:p-6 sm:pb-3 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Utensils className="w-5 h-5 text-primary" />
              Today&apos;s Nutrition
            </CardTitle>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsSettingsOpen(true)}
              className="h-8 w-8 text-muted-foreground hover:text-foreground rounded-full"
              aria-label="Edit targets"
            >
              <Settings className="w-4 h-4" />
            </Button>
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
                  {Math.round(waterLogs.reduce((sum, log: any) => sum + (log.amountMl ?? 0), 0))} / {Math.round(targetWaterMl)} ml
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
                          {targetWaterMl && targetWaterMl > 0
                            ? Math.min(100, Math.round((waterLogs.reduce((sum, log: any) => sum + (log.amountMl ?? 0), 0) / targetWaterMl) * 100))
                            : 0}%
                        </span>
                      </div>
                      <div className="relative h-4 w-full overflow-hidden rounded-full bg-blue-950/20 border border-blue-500/20">
                        <div
                          className="h-full bg-gradient-to-r from-blue-600 to-blue-400 transition-all duration-500 ease-out"
                          style={{
                            width: `${
                              targetWaterMl && targetWaterMl > 0
                                ? Math.min(100, Math.round((waterLogs.reduce((sum, log: any) => sum + (log.amountMl ?? 0), 0) / targetWaterMl) * 100))
                                : 0
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

      {/* YouTube Recommended Learning */}
      <FadeIn delay={0.5}>
        <Card className="mt-6">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Youtube className="w-5 h-5 text-red-500" />
                Recommended Learning
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">High-signal tech and AI videos from your subscriptions</p>
            </div>
            <Link href="/yt-summary" className="text-xs text-primary hover:underline flex items-center gap-1">
              View Feed <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </CardHeader>
          <CardContent>
            {youtubeLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 py-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-32 bg-muted/40 animate-pulse rounded-lg" />
                ))}
              </div>
            ) : youtubeNeedsConnection ? (
              <div className="flex flex-col items-center justify-center py-8 text-center text-sm text-muted-foreground border border-dashed border-border rounded-lg bg-muted/10">
                <Sparkles className="w-8 h-8 text-primary/60 mb-2" />
                <p className="font-semibold text-foreground">Unlock AI Video Summaries</p>
                <p className="text-xs max-w-sm mt-1 px-4">Connect your YouTube account to automatically analyze and summarize educational videos from your feeds.</p>
                <Link href="/yt-summary" className="mt-3">
                  <Button size="sm" variant="outline">Connect YouTube</Button>
                </Link>
              </div>
            ) : youtubeVideos.filter((v) => (v.priorityScore ?? 0) >= 35).length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center text-sm text-muted-foreground border border-dashed border-border rounded-lg bg-muted/10">
                <Youtube className="w-8 h-8 text-muted-foreground/40 mb-2" />
                <p className="font-semibold">No high-signal videos today</p>
                <p className="text-xs max-w-sm mt-1">We couldn&apos;t find any highly relevant learning content in your recent feed.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {youtubeVideos
                  .filter((v) => (v.priorityScore ?? 0) >= 35)
                  .sort((a, b) => (b.priorityScore ?? 0) - (a.priorityScore ?? 0))
                  .slice(0, 3)
                  .map((video) => (
                    <button
                      key={video.id}
                      type="button"
                      onClick={() => handleVideoCardClick(video)}
                      className="group block w-full text-left overflow-hidden rounded-lg border border-border/50 bg-muted/20 hover:border-primary/40 hover:bg-muted/40 transition-all p-3 focus:outline-none"
                    >
                      <div className="relative aspect-video rounded overflow-hidden bg-muted">
                        {video.thumbnail ? (
                          <img
                            src={video.thumbnail}
                            alt=""
                            className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                        ) : (
                          <div className="absolute inset-0 flex items-center justify-center"><Youtube className="w-6 h-6 text-muted-foreground" /></div>
                        )}
                        <div className="absolute top-2 left-2">
                          <Badge variant="default" className="text-[9px] h-4 py-0 bg-primary/95 text-primary-foreground font-semibold">
                            Score {video.priorityScore}
                          </Badge>
                        </div>
                      </div>
                      <div className="mt-2 space-y-1">
                        <p className="line-clamp-2 text-xs font-semibold text-foreground group-hover:text-primary transition-colors leading-relaxed">
                          {video.title}
                        </p>
                        <p className="truncate text-[10px] text-muted-foreground font-medium">{video.channelTitle}</p>
                      </div>
                    </button>
                  ))}
              </div>
            )}
          </CardContent>
        </Card>
      </FadeIn>

      {/* Weekly Trends */}
      {(data?.weeklyTrends ?? []).length > 0 && (
        <FadeIn delay={0.55}>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <TrendingUp className="w-5 h-5 text-primary" />
                Weekly Trends
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="calories">
                <TabsList className="mb-4 w-full sm:w-auto">
                  <TabsTrigger value="calories">Calories</TabsTrigger>
                  <TabsTrigger value="protein">Protein</TabsTrigger>
                  <TabsTrigger value="water">Water</TabsTrigger>
                </TabsList>
                <TabsContent value="calories">
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={data?.weeklyTrends ?? []}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                      <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                      <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 13 }} formatter={(v: any) => [`${v} kcal`, "Calories"]} />
                      <Line type="monotone" dataKey="calories" stroke="#f97316" strokeWidth={2} dot={{ fill: "#f97316", r: 4 }} activeDot={{ r: 6 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </TabsContent>
                <TabsContent value="protein">
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={data?.weeklyTrends ?? []}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                      <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                      <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 13 }} formatter={(v: any) => [`${v}g`, "Protein"]} />
                      <Line type="monotone" dataKey="protein" stroke="#3b82f6" strokeWidth={2} dot={{ fill: "#3b82f6", r: 4 }} activeDot={{ r: 6 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </TabsContent>
                <TabsContent value="water">
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={data?.weeklyTrends ?? []}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                      <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                      <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 13 }} formatter={(v: any) => [`${v} ml`, "Water"]} />
                      <Line type="monotone" dataKey="water" stroke="#60a5fa" strokeWidth={2} dot={{ fill: "#60a5fa", r: 4 }} activeDot={{ r: 6 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </FadeIn>
      )}

      <FadeIn delay={0.6}>
        <IssueReportForm compact defaultPage="Dashboard" />
      </FadeIn>

      {/* Targets Settings Drawer */}
      <Sheet open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md bg-background/95 backdrop-blur-md border-l border-border">
          <SheetHeader className="pb-4 border-b border-border">
            <SheetTitle className="text-xl font-bold tracking-tight flex items-center gap-2">
              <Settings className="w-5 h-5 text-primary" />
              Customize Targets
            </SheetTitle>
          </SheetHeader>
          <form onSubmit={handleSaveTargets} className="space-y-5 py-6">
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="targetCalories" className="text-sm font-semibold">Daily Calories Target (kcal)</Label>
                <Input
                  id="targetCalories"
                  type="number"
                  required
                  value={targetCalories}
                  onChange={(e) => setTargetCalories(Number(e.target.value))}
                  className="bg-muted/30 focus:border-primary/50"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="targetProtein" className="text-sm font-semibold">Target Protein (g)</Label>
                <Input
                  id="targetProtein"
                  type="number"
                  required
                  value={targetProtein}
                  onChange={(e) => setTargetProtein(Number(e.target.value))}
                  className="bg-muted/30 focus:border-primary/50"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="targetCarbs" className="text-sm font-semibold">Target Carbs (g)</Label>
                <Input
                  id="targetCarbs"
                  type="number"
                  required
                  value={targetCarbs}
                  onChange={(e) => setTargetCarbs(Number(e.target.value))}
                  className="bg-muted/30 focus:border-primary/50"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="targetFat" className="text-sm font-semibold">Target Fat (g)</Label>
                <Input
                  id="targetFat"
                  type="number"
                  required
                  value={targetFat}
                  onChange={(e) => setTargetFat(Number(e.target.value))}
                  className="bg-muted/30 focus:border-primary/50"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="targetWaterMl" className="text-sm font-semibold">Daily Hydration Target (ml)</Label>
                <Input
                  id="targetWaterMl"
                  type="number"
                  required
                  value={targetWaterMl}
                  onChange={(e) => setTargetWaterMl(Number(e.target.value))}
                  className="bg-muted/30 focus:border-primary/50"
                />
              </div>
            </div>
            <div className="pt-4 flex gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsSettingsOpen(false)}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={savingTargets}
                className="flex-1"
              >
                {savingTargets ? "Saving..." : "Save Targets"}
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>

      {/* YouTube Summary Modal */}
      <Dialog open={!!activeSummaryVideo} onOpenChange={(open) => !open && setActiveSummaryVideo(null)}>
        <DialogContent className="max-w-2xl bg-background/95 backdrop-blur-md border border-border/80 p-6 overflow-hidden flex flex-col max-h-[85vh]">
          {activeSummaryVideo && (
            <>
              <DialogHeader className="pb-2">
                <DialogTitle className="text-lg font-bold leading-tight line-clamp-2 pr-6 flex items-start gap-2">
                  <Youtube className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                  {activeSummaryVideo.title}
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  Channel: {activeSummaryVideo.channelTitle} • Priority Score: {activeSummaryVideo.priorityScore}
                </DialogDescription>
              </DialogHeader>

              {/* Embedded Player */}
              <div className="relative aspect-video w-full rounded-md overflow-hidden bg-black border border-border/50 shadow-inner">
                <iframe
                  src={`https://www.youtube.com/embed/${activeSummaryVideo.id}`}
                  title={activeSummaryVideo.title}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className="absolute inset-0 w-full h-full border-0"
                />
              </div>

              {/* AI Summary Box */}
              <div className="flex-1 overflow-y-auto mt-4 pr-1 ios-scroll min-h-[150px] max-h-[250px] rounded-lg bg-muted/30 border border-border/40 p-4">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-primary mb-2">
                  <Sparkles className="w-4 h-4 text-primary animate-pulse" />
                  AI Summary & Takeaways
                  {modalSource && <span className="text-[10px] text-muted-foreground font-normal ml-auto">Source: {modalSource}</span>}
                </div>

                {modalSummarizing ? (
                  <div className="space-y-2 py-2">
                    <div className="h-4 w-3/4 animate-pulse rounded bg-muted/65" />
                    <div className="h-4 w-full animate-pulse rounded bg-muted/65" />
                    <div className="h-4 w-5/6 animate-pulse rounded bg-muted/65" />
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                    {modalSummary || "No summary available for this video."}
                  </p>
                )}
              </div>

              <div className="mt-4 flex gap-3 justify-end border-t border-border pt-4">
                <Button variant="outline" size="sm" onClick={() => setActiveSummaryVideo(null)}>
                  Close
                </Button>
                <Button size="sm" asChild>
                  <Link href={`/yt-summary?videoId=${activeSummaryVideo.id}`}>
                    Open in Learning Feed
                  </Link>
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
