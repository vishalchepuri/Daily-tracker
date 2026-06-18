"use client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Scale, Ruler, TrendingUp } from "lucide-react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, Legend } from "recharts";
import { formatAppDate } from "@/lib/local-dates";

interface Props {
  entries: any[];
  type: "weight" | "measurements" | "strength";
  workoutLogs?: any[];
}

export default function ProgressCharts({ entries, type, workoutLogs }: Props) {
  const safeEntries = entries ?? [];
  const safeWorkoutLogs = workoutLogs ?? [];

  if (type === "weight") {
    const data = safeEntries
      .filter((e: any) => e?.weight != null)
      .map((e: any) => ({
        date: formatAppDate(e?.date ?? Date.now(), { month: "short", day: "numeric" }),
        weight: e?.weight ?? 0,
      }));

    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Scale className="w-5 h-5 text-primary" />
            Weight Progress
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data?.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">No weight data yet. Log your first entry!</div>
          ) : (
            <div style={{ width: "100%", height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data} margin={{ top: 5, right: 20, bottom: 20, left: 10 }}>
                  <XAxis
                    dataKey="date"
                    tickLine={false}
                    tick={{ fontSize: 10 }}
                    label={{ value: "Date", position: "insideBottom", offset: -15, style: { textAnchor: "middle", fontSize: 11 } }}
                  />
                  <YAxis
                    tickLine={false}
                    tick={{ fontSize: 10 }}
                    label={{ value: "kg", angle: -90, position: "insideLeft", style: { textAnchor: "middle", fontSize: 11 } }}
                    domain={["auto", "auto"]}
                  />
                  <Tooltip contentStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="weight" stroke="#22C55E" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  if (type === "measurements") {
    const data = safeEntries
      .filter((e: any) => e?.chest != null || e?.arms != null || e?.waist != null)
      .map((e: any) => ({
        date: formatAppDate(e?.date ?? Date.now(), { month: "short", day: "numeric" }),
        chest: e?.chest ?? null,
        arms: e?.arms ?? null,
        waist: e?.waist ?? null,
        thighs: e?.thighs ?? null,
      }));

    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Ruler className="w-5 h-5 text-primary" />
            Body Measurements
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data?.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">No measurement data yet.</div>
          ) : (
            <div style={{ width: "100%", height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data} margin={{ top: 5, right: 20, bottom: 20, left: 10 }}>
                  <XAxis dataKey="date" tickLine={false} tick={{ fontSize: 10 }} />
                  <YAxis tickLine={false} tick={{ fontSize: 10 }} label={{ value: "cm", angle: -90, position: "insideLeft", style: { textAnchor: "middle", fontSize: 11 } }} />
                  <Tooltip contentStyle={{ fontSize: 11 }} />
                  <Legend verticalAlign="top" wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="chest" stroke="#60B5FF" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                  <Line type="monotone" dataKey="arms" stroke="#FF9149" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                  <Line type="monotone" dataKey="waist" stroke="#FF9898" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                  <Line type="monotone" dataKey="thighs" stroke="#A19AD3" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  if (type === "strength") {
    const exercisePRs: Record<string, { date: string; weight: number }[]> = {};
    (safeWorkoutLogs ?? []).forEach((log: any) => {
      const dateStr = formatAppDate(log?.date ?? Date.now(), { month: "short", day: "numeric" });
      (log?.exerciseLogs ?? []).forEach((el: any) => {
        const name = el?.exercise?.name ?? "Unknown";
        if (!exercisePRs[name]) exercisePRs[name] = [];
        exercisePRs[name].push({ date: dateStr, weight: el?.weight ?? 0 });
      });
    });

    const topExercises = Object.entries(exercisePRs ?? {})
      .sort((a: any, b: any) => (b?.[1]?.length ?? 0) - (a?.[1]?.length ?? 0))
      .slice(0, 4);

    const colors = ["#22C55E", "#60B5FF", "#FF9149", "#A19AD3"];

    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-primary" />
            Strength Progress (Max Weight)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {topExercises?.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">Log workouts to track strength progress.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {topExercises.map(([name, data]: any, idx: number) => {
                const maxPerDate: Record<string, number> = {};
                (data ?? []).forEach((d: any) => {
                  maxPerDate[d?.date] = Math.max(maxPerDate[d?.date] ?? 0, d?.weight ?? 0);
                });
                const chartData = Object.entries(maxPerDate ?? {}).map(([date, w]: any) => ({ date, weight: w }));
                return (
                  <div key={name}>
                    <h4 className="text-sm font-medium mb-2">{name}</h4>
                    <div style={{ width: "100%", height: 200 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData} margin={{ top: 5, right: 10, bottom: 15, left: 10 }}>
                          <XAxis dataKey="date" tickLine={false} tick={{ fontSize: 9 }} />
                          <YAxis tickLine={false} tick={{ fontSize: 9 }} />
                          <Tooltip contentStyle={{ fontSize: 11 }} />
                          <Line type="monotone" dataKey="weight" stroke={colors[idx % 4]} strokeWidth={2} dot={{ r: 3 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return null;
}
