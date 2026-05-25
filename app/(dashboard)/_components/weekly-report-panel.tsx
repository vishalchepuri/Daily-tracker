"use client";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, CheckCircle2, ChevronRight, Droplets, Dumbbell, Utensils, RefreshCw, TrendingUp, Quote } from "lucide-react";
import { FadeIn, SlideIn } from "@/components/ui/animate";
import { toast } from "sonner";

function gradeColor(grade: string) {
  if (grade?.startsWith("A")) return "text-green-500";
  if (grade?.startsWith("B")) return "text-blue-500";
  if (grade?.startsWith("C")) return "text-yellow-500";
  return "text-red-500";
}

function gradeBg(grade: string) {
  if (grade?.startsWith("A")) return "bg-green-500/10 border-green-500/30";
  if (grade?.startsWith("B")) return "bg-blue-500/10 border-blue-500/30";
  if (grade?.startsWith("C")) return "bg-yellow-500/10 border-yellow-500/30";
  return "bg-red-500/10 border-red-500/30";
}

export function WeeklyReportPanel() {
  const [report, setReport] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [empty, setEmpty] = useState(false);
  const [error, setError] = useState("");

  const loadReport = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/ai-report");
      const d = await res.json();
      if (!res.ok) { setError(d?.error ?? "Failed"); return; }
      if (d.empty) { setEmpty(true); setStats(d.stats); return; }
      setReport(d.report);
      setStats(d.stats);
      setEmpty(false);
    } catch (e: any) { setError(e?.message ?? "Failed"); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadReport(); }, []);

  if (loading) {
    return (
      <div className="space-y-5">
        <div className="h-10 w-48 bg-muted animate-pulse rounded-lg" />
        <div className="grid gap-4 md:grid-cols-3">{[1, 2, 3].map((i) => <div key={i} className="h-40 bg-muted animate-pulse rounded-lg" />)}</div>
        <div className="h-48 bg-muted animate-pulse rounded-lg" />
      </div>
    );
  }

  if (empty) {
    return (
      <div className="space-y-5">
        <FadeIn>
          <h2 className="font-display text-2xl font-bold tracking-tight">Weekly Report</h2>
        </FadeIn>
        <Card><CardContent className="flex flex-col items-center py-16 text-center text-muted-foreground">
          <Sparkles className="w-12 h-12 mb-3 text-primary/40" />
          <p className="font-semibold text-foreground text-lg">No data yet</p>
          <p className="text-sm mt-1 max-w-sm">Start logging workouts, meals, or water to get your personalized weekly AI report card!</p>
        </CardContent></Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-5">
        <h2 className="font-display text-2xl font-bold tracking-tight">Weekly Report</h2>
        <Card><CardContent className="p-6 text-center text-destructive">{error}</CardContent></Card>
      </div>
    );
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      <FadeIn>
        <div className="grid gap-3 sm:flex sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-2xl font-bold leading-tight tracking-tight">Weekly Report</h2>
            <p className="mt-1 text-sm text-muted-foreground">AI-powered analysis of your last 7 days</p>
          </div>
          <Button variant="outline" onClick={loadReport} disabled={loading}><RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />Regenerate</Button>
        </div>
      </FadeIn>

      {/* Overall Score */}
      <SlideIn from="bottom">
        <Card className="overflow-hidden">
          <CardContent className="p-6 flex flex-col items-center text-center sm:flex-row sm:text-left sm:gap-6">
            <div className="relative flex items-center justify-center w-28 h-28 shrink-0">
              <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                <circle cx="50" cy="50" r="42" fill="none" stroke="hsl(var(--muted))" strokeWidth="8" />
                <circle cx="50" cy="50" r="42" fill="none" stroke="hsl(var(--primary))" strokeWidth="8" strokeLinecap="round" strokeDasharray={`${(report?.overallScore ?? 0) * 2.64} 999`} />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl font-bold font-mono">{report?.overallScore ?? 0}</span>
                <span className={`text-sm font-bold ${gradeColor(report?.overallGrade)}`}>{report?.overallGrade ?? "?"}</span>
              </div>
            </div>
            <div className="mt-4 sm:mt-0">
              <h3 className="text-lg font-bold">Overall Score</h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-md">{report?.overallComment ?? ""}</p>
            </div>
          </CardContent>
        </Card>
      </SlideIn>

      {/* Grade Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        {[
          { title: "Nutrition", grade: report?.nutritionGrade, comment: report?.nutritionComment, icon: Utensils },
          { title: "Fitness", grade: report?.fitnessGrade, comment: report?.fitnessComment, icon: Dumbbell },
          { title: "Hydration", grade: report?.hydrationGrade, comment: report?.hydrationComment, icon: Droplets },
        ].map((item, i) => (
          <SlideIn key={item.title} from="bottom" delay={i * 0.1}>
            <Card className={`border ${gradeBg(item.grade)}`}>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <item.icon className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-semibold">{item.title}</span>
                  </div>
                  <span className={`text-2xl font-bold font-mono ${gradeColor(item.grade)}`}>{item.grade ?? "?"}</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{item.comment ?? ""}</p>
              </CardContent>
            </Card>
          </SlideIn>
        ))}
      </div>

      {/* Wins + Actions */}
      <div className="grid gap-4 md:grid-cols-2">
        <FadeIn delay={0.2}>
          <Card>
            <CardHeader><CardTitle className="text-lg flex items-center gap-2"><CheckCircle2 className="w-5 h-5 text-green-500" />Top Wins This Week</CardTitle></CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {(report?.topWins ?? []).map((win: string, i: number) => (
                  <li key={i} className="flex gap-2 text-sm"><CheckCircle2 className="w-4 h-4 text-green-500 shrink-0 mt-0.5" /><span>{win}</span></li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </FadeIn>
        <FadeIn delay={0.3}>
          <Card>
            <CardHeader><CardTitle className="text-lg flex items-center gap-2"><TrendingUp className="w-5 h-5 text-primary" />Action Items</CardTitle></CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {(report?.actionItems ?? []).map((item: string, i: number) => (
                  <li key={i} className="flex gap-2 text-sm"><ChevronRight className="w-4 h-4 text-primary shrink-0 mt-0.5" /><span>{item}</span></li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </FadeIn>
      </div>

      {/* Quote */}
      {report?.motivationalQuote && (
        <FadeIn delay={0.4}>
          <Card className="bg-primary/5 border-primary/20">
            <CardContent className="p-5 flex items-start gap-3">
              <Quote className="w-5 h-5 text-primary shrink-0 mt-0.5" />
              <p className="text-sm italic text-foreground leading-relaxed">{report.motivationalQuote}</p>
            </CardContent>
          </Card>
        </FadeIn>
      )}

      {/* Stats Summary */}
      {stats && (
        <FadeIn delay={0.5}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Card><CardContent className="min-h-[5.5rem] p-4 text-center"><p className="text-xs text-muted-foreground">Avg Calories</p><p className="mt-1 text-lg font-bold font-mono">{stats.avgCalories}</p><p className="text-[10px] text-muted-foreground">/ {stats.targetCal} kcal</p></CardContent></Card>
            <Card><CardContent className="min-h-[5.5rem] p-4 text-center"><p className="text-xs text-muted-foreground">Avg Protein</p><p className="mt-1 text-lg font-bold font-mono">{stats.avgProtein}g</p><p className="text-[10px] text-muted-foreground">/ {stats.targetProtein}g</p></CardContent></Card>
            <Card><CardContent className="min-h-[5.5rem] p-4 text-center"><p className="text-xs text-muted-foreground">Avg Water</p><p className="mt-1 text-lg font-bold font-mono">{Math.round(stats.avgWaterMl / 100) / 10}L</p><p className="text-[10px] text-muted-foreground">/ {Math.round(stats.targetWater / 1000 * 10) / 10}L</p></CardContent></Card>
            <Card><CardContent className="min-h-[5.5rem] p-4 text-center"><p className="text-xs text-muted-foreground">Workouts</p><p className="mt-1 text-lg font-bold font-mono">{stats.workoutCount}</p><p className="text-[10px] text-muted-foreground">sessions</p></CardContent></Card>
          </div>
        </FadeIn>
      )}
    </div>
  );
}
