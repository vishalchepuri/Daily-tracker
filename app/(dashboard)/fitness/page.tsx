"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Activity, CalendarDays, Dumbbell, Flame, Plus, Target, Trophy } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { FadeIn } from "@/components/ui/animate";

export default function FitnessPage() {
  const [templates, setTemplates] = useState<any[]>([]);
  const [workoutLogs, setWorkoutLogs] = useState<any[]>([]);
  const [healthMetrics, setHealthMetrics] = useState<any[]>([]);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/workout-templates").then((r) => r.json()),
      fetch("/api/workout-logs?limit=100").then((r) => r.json()),
      fetch("/api/health-metrics").then((r) => r.json()),
      fetch("/api/profile").then((r) => r.json()),
    ])
      .then(([templatesData, logsData, healthData, profileData]) => {
        setTemplates(templatesData?.templates ?? []);
        setWorkoutLogs(logsData?.logs ?? []);
        setHealthMetrics(healthData?.metrics ?? []);
        setProfile(profileData?.profile ?? null);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const stats = useMemo(() => {
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - 6);
    weekStart.setHours(0, 0, 0, 0);
    const thisWeek = (workoutLogs ?? []).filter((log) => new Date(log.date) >= weekStart);
    const volume = thisWeek.reduce((sum, log) => sum + (log.exerciseLogs ?? []).reduce((inner: number, item: any) => inner + ((item.weight ?? 0) * (item.reps ?? 0)), 0), 0);
    const minutes = thisWeek.reduce((sum, log) => sum + (log.duration ?? 0), 0);
    const activeEnergy = (healthMetrics ?? [])
      .filter((metric) => metric.type === "active_energy" && new Date(metric.startDate) >= weekStart)
      .reduce((sum, metric) => sum + (metric.value ?? 0), 0);
    return { workouts: thisWeek.length, volume, minutes, activeEnergy };
  }, [healthMetrics, workoutLogs]);
  const targets = {
    workoutSessions: Math.round(profile?.targetWorkoutSessions ?? 5),
    trainingMinutes: Math.round(profile?.targetTrainingMinutes ?? 240),
    liftVolume: Math.round(profile?.targetLiftVolume ?? 12000),
    weeklyActiveEnergy: Math.round(profile?.targetWeeklyActiveEnergy ?? 2500),
  };

  if (loading) return <div className="space-y-4">{[1,2,3].map((i) => <div key={i} className="h-28 bg-muted animate-pulse rounded-lg" />)}</div>;

  return (
    <div className="space-y-6">
      <FadeIn>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-display font-bold tracking-tight">Fitness</h2>
            <p className="text-muted-foreground text-sm mt-1">Plan training days, track weekly workload, and review recent sessions</p>
          </div>
          <Button asChild>
            <Link href="/workouts"><Plus className="w-4 h-4 mr-2" />Add Workout</Link>
          </Button>
        </div>
      </FadeIn>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <FitnessStat title="Workouts This Week" value={stats.workouts} target={targets.workoutSessions} unit="sessions" icon={Dumbbell} />
        <FitnessStat title="Training Time" value={stats.minutes} target={targets.trainingMinutes} unit="min" icon={CalendarDays} />
        <FitnessStat title="Lift Volume" value={Math.round(stats.volume)} target={targets.liftVolume} unit="kg reps" icon={Trophy} />
        <FitnessStat title="Active Burn" value={Math.round(stats.activeEnergy)} target={targets.weeklyActiveEnergy} unit="kcal" icon={Flame} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="flex items-center gap-2"><Target className="w-5 h-5 text-primary" />Workout Days</CardTitle></CardHeader>
          <CardContent>
            {(templates ?? []).length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground">Add workout days from the Workouts page.</div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {(templates ?? []).map((template) => (
                  <div key={template.id} className="rounded-lg border border-border p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-medium">{template.name}</h3>
                        <p className="mt-1 text-xs text-muted-foreground">{template.description ?? "Training day"}</p>
                      </div>
                      {template.dayOfWeek && <Badge variant="outline">{template.dayOfWeek}</Badge>}
                    </div>
                    <div className="mt-3 space-y-1 text-sm">
                      {(template.exercises ?? []).slice(0, 4).map((item: any) => (
                        <div key={item.id} className="flex justify-between gap-2">
                          <span className="text-muted-foreground">{item.exercise?.name}</span>
                          <span className="font-mono">{item.sets} x {item.reps}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Activity className="w-5 h-5 text-primary" />Recent Sessions</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {(workoutLogs ?? []).slice(0, 6).map((log) => (
              <div key={log.id} className="rounded-lg bg-muted/40 p-3">
                <p className="text-sm font-medium">{log.templateName ?? "Workout"}</p>
                <p className="text-xs text-muted-foreground">{new Date(log.date).toLocaleDateString()} {log.duration ? `• ${log.duration} min` : ""}</p>
              </div>
            ))}
            {(workoutLogs ?? []).length === 0 && <p className="text-sm text-muted-foreground">No workouts logged yet.</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function FitnessStat({ title, value, target, unit, icon: Icon }: any) {
  const pct = target > 0 ? Math.min(100, Math.round((value / target) * 100)) : 0;
  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center">
            <Icon className="w-5 h-5 text-primary" />
          </div>
          <span className="text-sm font-medium">{title}</span>
        </div>
        <Progress value={pct} className="h-2" />
        <p className="text-sm font-mono"><span className="font-bold">{value.toLocaleString()}</span> / {target.toLocaleString()} {unit}</p>
      </CardContent>
    </Card>
  );
}
