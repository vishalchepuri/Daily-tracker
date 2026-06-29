"use client";

import { useEffect, useMemo, useState } from "react";
import { HeartPulse, Loader2, Moon, Save, SmilePlus, Zap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { FadeIn } from "@/components/ui/animate";

const moods = ["Good", "Okay", "Stressed", "Tired", "Sore", "Motivated"];

function formatDate(value?: string) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function readiness(item: any) {
  if (!item) return 0;
  const sleep = Math.min(5, Math.max(1, Number(item.sleepHours ?? 0) / 1.6));
  const energy = Number(item.energy ?? 3);
  const sorenessPenalty = Number(item.soreness ?? 3);
  return Math.max(0, Math.min(100, Math.round(((sleep + energy + (6 - sorenessPenalty)) / 15) * 100)));
}

export default function RecoveryPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ sleepHours: "", energy: "3", soreness: "3", mood: "Okay", notes: "" });

  const latest = items[0];
  const score = useMemo(() => readiness(latest), [latest]);

  const loadItems = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/recovery-checkins");
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? "Failed to load recovery");
        return;
      }
      setItems(data?.items ?? []);
    } catch {
      toast.error("Failed to load recovery");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadItems(); }, []);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/recovery-checkins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? "Failed to save check-in");
        return;
      }
      toast.success("Recovery check-in saved");
      setForm({ sleepHours: "", energy: "3", soreness: "3", mood: "Okay", notes: "" });
      loadItems();
    } catch {
      toast.error("Failed to save check-in");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5 sm:space-y-6">
      <FadeIn>
        <div>
          <h2 className="font-display text-2xl font-bold leading-tight tracking-tight">Recovery</h2>
          <p className="mt-1 text-sm text-muted-foreground">Track sleep, soreness, energy, and mood before training.</p>
        </div>
      </FadeIn>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.1fr]">
        <FadeIn delay={0.08}>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <HeartPulse className="h-5 w-5 text-primary" />
                Today Check-in
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <Label>Sleep hours</Label>
                  <Input type="number" min="0" max="18" step="0.5" value={form.sleepHours} onChange={(e) => setForm({ ...form, sleepHours: e.target.value })} className="mt-1" placeholder="7.5" />
                </div>
                <div>
                  <Label>Energy</Label>
                  <Select value={form.energy} onValueChange={(energy) => setForm({ ...form, energy })}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>{[1, 2, 3, 4, 5].map((n) => <SelectItem key={n} value={String(n)}>{n} / 5</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Soreness</Label>
                  <Select value={form.soreness} onValueChange={(soreness) => setForm({ ...form, soreness })}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>{[1, 2, 3, 4, 5].map((n) => <SelectItem key={n} value={String(n)}>{n} / 5</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Mood</Label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {moods.map((mood) => (
                    <Button key={mood} type="button" size="sm" variant={form.mood === mood ? "default" : "outline"} onClick={() => setForm({ ...form, mood })}>{mood}</Button>
                  ))}
                </div>
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="mt-1" placeholder="Any pain, stress, travel, or recovery notes?" />
              </div>
              <Button type="button" className="w-full" onClick={save} loading={saving} disabled={saving}>
                <Save className="mr-2 h-4 w-4" />
                Save Check-in
              </Button>
            </CardContent>
          </Card>
        </FadeIn>

        <FadeIn delay={0.12}>
          <Card>
            <CardHeader>
              <CardTitle>Readiness</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {loading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading...</div>
              ) : !latest ? (
                <div className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">No check-ins yet.</div>
              ) : (
                <>
                  <div className="rounded-[24px] border border-border bg-muted/20 p-4">
                    <p className="text-xs text-muted-foreground">Latest readiness</p>
                    <p className="mt-1 font-mono text-4xl font-bold">{score}%</p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {score >= 75 ? "Good day to train normally." : score >= 50 ? "Train, but keep volume controlled." : "Consider lighter work or recovery."}
                    </p>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-3">
                    <Badge variant="outline"><Moon className="mr-1 h-3.5 w-3.5" />{latest.sleepHours ?? "-"}h</Badge>
                    <Badge variant="outline"><Zap className="mr-1 h-3.5 w-3.5" />Energy {latest.energy ?? "-"}</Badge>
                    <Badge variant="outline"><SmilePlus className="mr-1 h-3.5 w-3.5" />{latest.mood ?? "-"}</Badge>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </FadeIn>
      </div>

      <FadeIn delay={0.16}>
        <Card>
          <CardHeader><CardTitle>Recent Check-ins</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {items.length === 0 ? (
              <p className="text-sm text-muted-foreground">Your recent recovery logs will appear here.</p>
            ) : items.map((item) => (
              <div key={item.id} className="rounded-2xl border border-border bg-muted/20 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold">{formatDate(item.date)}</p>
                  <Badge variant="secondary">{readiness(item)}%</Badge>
                  <Badge variant="outline">{item.mood ?? "Mood -"}</Badge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">Sleep {item.sleepHours ?? "-"}h, energy {item.energy ?? "-"}, soreness {item.soreness ?? "-"}</p>
                {item.notes && <p className="mt-2 text-sm text-muted-foreground">{item.notes}</p>}
              </div>
            ))}
          </CardContent>
        </Card>
      </FadeIn>
    </div>
  );
}
