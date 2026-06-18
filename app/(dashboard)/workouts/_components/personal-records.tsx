"use client";
import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trophy, Dumbbell } from "lucide-react";
import { FadeIn } from "@/components/ui/animate";
import { formatAppDate } from "@/lib/local-dates";

export function PersonalRecordsTab() {
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/personal-records");
        if (res.ok) {
          const d = await res.json();
          setRecords(d.records ?? []);
        }
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    })();
  }, []);

  const muscleGroups = ["all", ...Array.from(new Set(records.map((r) => r.muscleGroup))).sort()];
  const filtered = filter === "all" ? records : records.filter((r) => r.muscleGroup === filter);

  if (loading) return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{[1, 2, 3, 4, 5, 6].map((i) => <div key={i} className="h-28 bg-muted animate-pulse rounded-lg" />)}</div>;

  if (records.length === 0) {
    return (
      <Card><CardContent className="flex flex-col items-center py-16 text-center text-muted-foreground">
        <Trophy className="w-12 h-12 mb-3 text-muted-foreground/30" />
        <p className="font-semibold text-foreground">No personal records yet</p>
        <p className="text-sm mt-1">Complete some workouts to see your PRs here</p>
      </CardContent></Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{filtered.length} exercises tracked</p>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-[160px] h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>{muscleGroups.map((g) => <SelectItem key={g} value={g} className="capitalize text-xs">{g === "all" ? "All muscles" : g}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((pr, i) => (
          <FadeIn key={pr.exerciseName} delay={i * 0.03}>
            <Card className="hover:border-primary/30 transition-colors">
              <CardContent className="p-3 sm:p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-sm truncate">{pr.exerciseName}</p>
                    <Badge variant="outline" className="text-[10px] capitalize mt-1">{pr.muscleGroup}</Badge>
                  </div>
                  <Trophy className="w-5 h-5 text-yellow-500 shrink-0" />
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-bold font-mono">{pr.maxWeight}</span>
                  <span className="text-sm text-muted-foreground">kg</span>
                  <span className="text-xs text-muted-foreground ml-1">× {pr.maxReps} reps</span>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{formatAppDate(pr.date, { month: "short", day: "numeric", year: "numeric" })}</span>
                  <span>{pr.totalSets} total sets</span>
                </div>
              </CardContent>
            </Card>
          </FadeIn>
        ))}
      </div>
    </div>
  );
}
