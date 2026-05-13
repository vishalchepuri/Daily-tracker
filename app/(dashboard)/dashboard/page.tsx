"use client";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Flame, Target, Dumbbell, TrendingUp, Zap, Utensils, Calendar } from "lucide-react";
import { FadeIn, SlideIn } from "@/components/ui/animate";
import Link from "next/link";
import { Button } from "@/components/ui/button";

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

  useEffect(() => {
    fetch("/api/dashboard")
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

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
    <div className="space-y-6">
      <FadeIn>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-display font-bold tracking-tight">Today&apos;s Overview</h2>
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
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SlideIn from="bottom" delay={0}>
          <Card className="relative overflow-hidden">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
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
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
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
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-orange-500/10 flex items-center justify-center">
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
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-green-500" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Goal</p>
                  <p className="text-lg font-bold">Muscle Gain</p>
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
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Utensils className="w-5 h-5 text-primary" />
              Today&apos;s Nutrition
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
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
    </div>
  );
}
