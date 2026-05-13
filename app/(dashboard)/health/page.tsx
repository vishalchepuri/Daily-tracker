"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, Droplets, Flame, HeartPulse, Moon, ShieldCheck, TrendingUp, Watch } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { FadeIn } from "@/components/ui/animate";

const metricLabels: Record<string, string> = {
  steps: "Steps",
  active_energy: "Active Energy",
  basal_energy: "Basal Energy",
  walking_running_distance: "Distance",
  heart_rate: "Heart Rate",
  resting_heart_rate: "Resting HR",
  exercise_minutes: "Exercise Time",
  flights_climbed: "Flights",
  vo2_max: "VO2 Max",
  body_weight: "Body Weight",
  sleep_minutes: "Sleep",
  sleep_awake_minutes: "Awake",
  sleep_rem_minutes: "REM Sleep",
  sleep_core_minutes: "Core Sleep",
  sleep_deep_minutes: "Deep Sleep",
};

export default function HealthPage() {
  const [metrics, setMetrics] = useState<any[]>([]);
  const [waterLogs, setWaterLogs] = useState<any[]>([]);
  const [progressEntries, setProgressEntries] = useState<any[]>([]);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/health-metrics").then((r) => r.json()),
      fetch("/api/water-logs").then((r) => r.json()),
      fetch("/api/progress").then((r) => r.json()),
      fetch("/api/profile").then((r) => r.json()),
    ])
      .then(([healthData, waterData, progressData, profileData]) => {
        setMetrics(healthData?.metrics ?? []);
        setWaterLogs(waterData?.logs ?? []);
        setProgressEntries(progressData?.entries ?? []);
        setProfile(profileData?.profile ?? null);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const todayMetrics = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return (metrics ?? []).filter((metric) => new Date(metric.startDate) >= start);
  }, [metrics]);

  const sumMetric = (type: string) =>
    todayMetrics.filter((metric) => metric.type === type).reduce((sum, metric) => sum + (metric.value ?? 0), 0);
  const latestMetric = (type: string) => (metrics ?? []).find((metric) => metric.type === type);

  const steps = Math.round(sumMetric("steps"));
  const activeEnergy = Math.round(sumMetric("active_energy"));
  const exerciseMinutes = Math.round(sumMetric("exercise_minutes"));
  const sleepMinutes = Math.round(sumMetric("sleep_minutes"));
  const waterTotal = Math.round((waterLogs ?? []).reduce((sum, log) => sum + (log.amountMl ?? 0), 0));
  const latestWeight = [...(progressEntries ?? [])].reverse().find((entry) => entry.weight != null)?.weight;
  const restingHr = latestMetric("resting_heart_rate")?.value;
  const vo2Max = latestMetric("vo2_max")?.value;
  const healthMetricsWithoutSleep = (metrics ?? []).filter((metric) => !metric.type?.startsWith?.("sleep_"));
  const sleepSummary = {
    total: sleepMinutes,
    awake: Math.round(sumMetric("sleep_awake_minutes")),
    rem: Math.round(sumMetric("sleep_rem_minutes")),
    core: Math.round(sumMetric("sleep_core_minutes")),
    deep: Math.round(sumMetric("sleep_deep_minutes")),
  };
  const targets = {
    steps: Math.round(profile?.targetSteps ?? 10000),
    activeEnergy: Math.round(profile?.targetActiveEnergy ?? 500),
    exerciseMinutes: Math.round(profile?.targetExerciseMinutes ?? 30),
    sleepMinutes: Math.round(profile?.targetSleepMinutes ?? 480),
    waterMl: Math.round(profile?.targetWaterMl ?? 3000),
  };

  if (loading) return <div className="space-y-4">{[1,2,3].map((i) => <div key={i} className="h-28 bg-muted animate-pulse rounded-lg" />)}</div>;

  return (
    <div className="space-y-6">
      <FadeIn>
        <div>
          <h2 className="text-2xl font-display font-bold tracking-tight">Health</h2>
          <p className="text-muted-foreground text-sm mt-1">Daily health signals from your logs and Apple Health imports</p>
        </div>
      </FadeIn>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        <HealthCard title="Steps" value={steps.toLocaleString()} target={targets.steps.toLocaleString()} percent={Math.min(100, (steps / targets.steps) * 100)} icon={Activity} />
        <HealthCard title="Active Calories" value={activeEnergy.toLocaleString()} target={`${targets.activeEnergy} kcal`} percent={Math.min(100, (activeEnergy / targets.activeEnergy) * 100)} icon={Flame} />
        <HealthCard title="Exercise" value={`${exerciseMinutes}`} target={`${targets.exerciseMinutes} min`} percent={Math.min(100, (exerciseMinutes / targets.exerciseMinutes) * 100)} icon={Watch} />
        <HealthCard title="Sleep" value={formatMinutes(sleepMinutes)} target={formatMinutes(targets.sleepMinutes)} percent={Math.min(100, (sleepMinutes / targets.sleepMinutes) * 100)} icon={Moon} />
        <HealthCard title="Water" value={`${waterTotal}`} target={`${targets.waterMl} ml`} percent={Math.min(100, (waterTotal / targets.waterMl) * 100)} icon={Droplets} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><HeartPulse className="w-5 h-5 text-primary" />Vitals</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <MetricRow label="Resting heart rate" value={restingHr ? `${Math.round(restingHr)} bpm` : "No data"} />
            <MetricRow label="VO2 max" value={vo2Max ? `${vo2Max.toFixed(1)}` : "No data"} />
            <MetricRow label="Body weight" value={latestWeight ? `${latestWeight.toFixed(1)} kg` : "No data"} />
            <MetricRow label="Sleep today" value={sleepMinutes ? formatMinutes(sleepMinutes) : "No data"} />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="flex items-center gap-2"><TrendingUp className="w-5 h-5 text-primary" />Recent Health Metrics</CardTitle></CardHeader>
          <CardContent>
            {healthMetricsWithoutSleep.length === 0 ? (
              <div className="text-center py-8">
                <ShieldCheck className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Import Apple Health data from Integrations to populate this view.</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {healthMetricsWithoutSleep.slice(0, 20).map((metric) => (
                  <div key={metric.id} className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2 text-sm">
                    <div>
                      <p className="font-medium">{metricLabels[metric.type] ?? metric.type}</p>
                      <p className="text-xs text-muted-foreground">{new Date(metric.startDate).toLocaleString()}</p>
                    </div>
                    <Badge variant="secondary">{Math.round(metric.value * 10) / 10} {metric.unit ?? ""}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Moon className="w-5 h-5 text-primary" />Sleep Summary</CardTitle></CardHeader>
        <CardContent>
          {!sleepSummary.total ? (
            <p className="text-sm text-muted-foreground">No sleep data imported yet.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <SleepSummaryItem label="Total" value={sleepSummary.total} />
              <SleepSummaryItem label="Awake" value={sleepSummary.awake} />
              <SleepSummaryItem label="REM" value={sleepSummary.rem} />
              <SleepSummaryItem label="Core" value={sleepSummary.core} />
              <SleepSummaryItem label="Deep" value={sleepSummary.deep} />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function formatMinutes(minutes: number) {
  const hrs = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
}

function HealthCard({ title, value, target, percent, icon: Icon }: any) {
  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center">
            <Icon className="w-5 h-5 text-primary" />
          </div>
          <span className="text-sm font-medium">{title}</span>
        </div>
        <Progress value={percent} className="h-2" />
        <p className="text-sm font-mono"><span className="font-bold">{value}</span> / {target}</p>
      </CardContent>
    </Card>
  );
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function SleepSummaryItem({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-muted/40 p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value ? formatMinutes(value) : "0m"}</p>
    </div>
  );
}
