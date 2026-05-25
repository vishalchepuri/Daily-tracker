"use client";
import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Activity,
  AlertTriangle,
  Banknote,
  Bot,
  Calculator,
  CalendarCheck,
  CheckCircle2,
  Clock3,
  Dumbbell,
  Inbox,
  Pill,
  Save,
  Send,
  MessageCircle,
  RefreshCw,
  Trash2,
  TrendingUp,
  UserCircle,
  Utensils,
  WalletCards,
  XCircle,
} from "lucide-react";
import { FadeIn } from "@/components/ui/animate";
import { toast } from "sonner";
import { WeeklyReportPanel } from "../_components/weekly-report-panel";
import { ProgressPanel } from "../_components/progress-panel";
import { signOutOfDayza } from "@/lib/firebase-session-client";

export default function ProfilePage() {
  const [profile, setProfile] = useState<any>(null);
  const [activityItems, setActivityItems] = useState<any[]>([]);
  const [activityCounts, setActivityCounts] = useState<Record<string, number>>({});
  const [reviewItems, setReviewItems] = useState<any[]>([]);
  const [reviewCounts, setReviewCounts] = useState<any[]>([]);
  const [reviewFilter, setReviewFilter] = useState("open");
  const [reviewLoading, setReviewLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("profile");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingTelegram, setSavingTelegram] = useState(false);
  const [checkingTelegram, setCheckingTelegram] = useState(false);
  const [cleaningRetention, setCleaningRetention] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [telegramForm, setTelegramForm] = useState({ telegramChatId: "", telegramEnabled: false, botConfigured: false });
  const [form, setForm] = useState({
    firstName: "", lastName: "",
    age: "", weight: "", height: "", gender: "male", activityLevel: "moderate", goal: "muscle_gain",
    healthLimitations: "", foodAllergies: "", goalOutcome: "", goalTimelineDays: "", goalTargetWeight: "", linkedinUrl: "",
  });

  useEffect(() => {
    const tab = new URLSearchParams(window.location.search).get("tab");
    if (tab && ["profile", "review", "report", "progress", "activity", "integrations", "danger"].includes(tab)) {
      setActiveTab(tab);
    }
    fetch("/api/profile").then(r => r.json()).then(d => {
      const p = d?.profile;
      const u = d?.user;
      if (p) {
        setProfile(p);
        setForm({
          firstName: u?.firstName ?? "",
          lastName: u?.lastName ?? "",
          age: String(p?.age ?? ""),
          weight: String(p?.weight ?? ""),
          height: String(p?.height ?? ""),
          gender: p?.gender ?? "male",
          activityLevel: p?.activityLevel ?? "moderate",
          goal: p?.goal ?? "muscle_gain",
          healthLimitations: p?.healthLimitations ?? "",
          foodAllergies: p?.foodAllergies ?? "",
          goalOutcome: p?.goalOutcome ?? "",
          goalTimelineDays: String(p?.goalTimelineDays ?? ""),
          goalTargetWeight: String(p?.goalTargetWeight ?? ""),
          linkedinUrl: p?.linkedinUrl ?? "",
        });
      } else if (u) {
        setForm((current) => ({ ...current, firstName: u?.firstName ?? "", lastName: u?.lastName ?? "" }));
      }
    }).catch(console.error).finally(() => setLoading(false));
    fetch("/api/telegram-settings").then(r => r.json()).then(d => {
      setTelegramForm({
        telegramChatId: d?.telegramChatId ?? "",
        telegramEnabled: Boolean(d?.telegramEnabled),
        botConfigured: Boolean(d?.botConfigured),
      });
    }).catch(console.error);
    fetch("/api/activity").then(r => r.ok ? r.json() : { items: [], counts: {} }).then(d => {
      setActivityItems(d?.items ?? []);
      setActivityCounts(d?.counts ?? {});
    }).catch(console.error);
  }, []);

  const loadReviewItems = useCallback(async () => {
    setReviewLoading(true);
    try {
      const res = await fetch(`/api/review-items?status=${reviewFilter}`);
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? "Failed to load review items");
        return;
      }
      setReviewItems(data?.items ?? []);
      setReviewCounts(data?.counts ?? []);
    } finally {
      setReviewLoading(false);
    }
  }, [reviewFilter]);

  useEffect(() => { loadReviewItems(); }, [loadReviewItems]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: form.firstName || null,
          lastName: form.lastName || null,
          age: parseInt(form.age) || null,
          weight: parseFloat(form.weight) || null,
          height: parseFloat(form.height) || null,
          gender: form.gender,
          activityLevel: form.activityLevel,
          goal: form.goal,
          healthLimitations: form.healthLimitations || "None",
          foodAllergies: form.foodAllergies || "None",
          goalOutcome: form.goalOutcome || null,
          goalTimelineDays: parseInt(form.goalTimelineDays) || null,
          goalTargetWeight: parseFloat(form.goalTargetWeight) || null,
          linkedinUrl: form.linkedinUrl || null,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setProfile(data?.profile);
        if (data?.user) {
          setForm((current) => ({ ...current, firstName: data.user.firstName ?? "", lastName: data.user.lastName ?? "" }));
        }
        toast.success("Profile and nutrition targets updated");
      }
    } catch { toast.error("Failed to save"); }
    finally { setSaving(false); }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirm !== "DELETE") {
      toast.error("Type DELETE to confirm");
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch("/api/account", { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? "Failed to delete account");
        return;
      }
      toast.success("Account deleted");
      await signOutOfDayza();
      window.location.href = "/signup";
    } finally {
      setDeleting(false);
    }
  };

  const saveTelegram = async () => {
    const telegramChatId = telegramForm.telegramChatId.trim();
    if (!telegramChatId) {
      toast.error("Paste your Telegram chat ID first");
      return;
    }
    setSavingTelegram(true);
    try {
      const res = await fetch("/api/telegram-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...telegramForm, telegramChatId, telegramEnabled: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? "Failed to save Telegram settings");
        return;
      }
      setTelegramForm({
        telegramChatId: data?.telegramChatId ?? "",
        telegramEnabled: Boolean(data?.telegramEnabled),
        botConfigured: Boolean(data?.botConfigured),
      });
      toast.success("Telegram connected");
    } catch {
      toast.error("Failed to save Telegram settings");
    } finally {
      setSavingTelegram(false);
    }
  };

  const sendDueTelegram = async () => {
    setCheckingTelegram(true);
    try {
      const res = await fetch("/api/reminders/telegram-dispatch", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? "Failed to send Telegram reminders");
        return;
      }
      toast.success(data?.sent ? `Sent ${data.sent} reminder(s)` : "No due reminders to send");
    } catch {
      toast.error("Failed to send Telegram reminders");
    } finally {
      setCheckingTelegram(false);
    }
  };

  const checkTelegramMessages = async () => {
    setCheckingTelegram(true);
    try {
      const res = await fetch("/api/telegram/poll", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? "Failed to check Telegram messages");
        return;
      }
      toast.success(data?.processed ? `Processed ${data.processed} message(s)` : "No new bot messages");
    } catch {
      toast.error("Failed to check Telegram messages");
    } finally {
      setCheckingTelegram(false);
    }
  };

  const runRetentionCleanup = async () => {
    setCleaningRetention(true);
    try {
      const res = await fetch("/api/retention", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? "Failed to clean old data");
        return;
      }
      toast.success("Old chat data cleaned");
    } catch {
      toast.error("Failed to clean old data");
    } finally {
      setCleaningRetention(false);
    }
  };

  const resolveReviewItem = async (item: any, status: "confirmed" | "ignored") => {
    const res = await fetch("/api/review-items", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: item.id, status }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data?.error ?? "Failed to update item");
      return;
    }
    toast.success(status === "confirmed" ? "Marked confirmed" : "Ignored");
    loadReviewItems();
  };

  if (loading) return <div className="h-64 bg-muted animate-pulse rounded-lg" />;

  return (
    <div className="space-y-5 sm:space-y-6">
      <FadeIn>
        <h2 className="font-display text-xl font-bold tracking-tight sm:text-2xl">Profile & Goals</h2>
        <p className="text-muted-foreground text-sm mt-1">Set your body stats and fitness goals</p>
      </FadeIn>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="flex h-auto w-full gap-2 overflow-x-auto bg-transparent p-0">
          <TabsTrigger value="profile" className="min-w-24 rounded-lg border border-border bg-transparent data-[state=active]:border-primary/30 data-[state=active]:bg-primary/15">Profile</TabsTrigger>
          <TabsTrigger value="review" className="min-w-24 rounded-lg border border-border bg-transparent data-[state=active]:border-primary/30 data-[state=active]:bg-primary/15">Review</TabsTrigger>
          <TabsTrigger value="report" className="min-w-24 rounded-lg border border-border bg-transparent data-[state=active]:border-primary/30 data-[state=active]:bg-primary/15">Report</TabsTrigger>
          <TabsTrigger value="progress" className="min-w-24 rounded-lg border border-border bg-transparent data-[state=active]:border-primary/30 data-[state=active]:bg-primary/15">Progress</TabsTrigger>
          <TabsTrigger value="activity" className="min-w-24 rounded-lg border border-border bg-transparent data-[state=active]:border-primary/30 data-[state=active]:bg-primary/15">Activity</TabsTrigger>
          <TabsTrigger value="integrations" className="min-w-28 rounded-lg border border-border bg-transparent data-[state=active]:border-primary/30 data-[state=active]:bg-primary/15">Integrations</TabsTrigger>
          <TabsTrigger value="danger" className="min-w-24 rounded-lg border border-border bg-transparent data-[state=active]:border-primary/30 data-[state=active]:bg-primary/15">Danger</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="space-y-6">
      <FadeIn delay={0.1}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserCircle className="w-5 h-5 text-primary" />
              Body Stats
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div><Label>First Name</Label><Input value={form.firstName} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({...form, firstName: e.target.value})} className="mt-1" /></div>
              <div><Label>Last Name</Label><Input value={form.lastName} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({...form, lastName: e.target.value})} className="mt-1" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Age</Label><Input type="number" value={form.age} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({...form, age: e.target.value})} className="mt-1" /></div>
              <div><Label>Weight (kg)</Label><Input type="number" value={form.weight} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({...form, weight: e.target.value})} className="mt-1" /></div>
              <div><Label>Height (cm)</Label><Input type="number" value={form.height} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({...form, height: e.target.value})} className="mt-1" /></div>
              <div>
                <Label>Gender</Label>
                <Select value={form.gender} onValueChange={(v: string) => setForm({...form, gender: v})}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Activity Level</Label>
                <Select value={form.activityLevel} onValueChange={(v: string) => setForm({...form, activityLevel: v})}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sedentary">Sedentary</SelectItem>
                    <SelectItem value="light">Lightly Active</SelectItem>
                    <SelectItem value="moderate">Moderately Active</SelectItem>
                    <SelectItem value="active">Very Active</SelectItem>
                    <SelectItem value="very_active">Extremely Active</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Fitness Goal</Label>
                <Select value={form.goal} onValueChange={(v: string) => setForm({...form, goal: v})}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="muscle_gain">Muscle Gain</SelectItem>
                    <SelectItem value="fat_loss">Fat Loss</SelectItem>
                    <SelectItem value="maintain">Maintain</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4">
              <div><Label>Joint pain, injuries, surgeries, restrictions</Label><Input value={form.healthLimitations} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({...form, healthLimitations: e.target.value})} className="mt-1" placeholder="None, knee pain, shoulder surgery..." /></div>
              <div><Label>Food allergies, intolerances, avoided foods</Label><Input value={form.foodAllergies} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({...form, foodAllergies: e.target.value})} className="mt-1" placeholder="None, peanuts, lactose..." /></div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <Label>Goal Outcome</Label>
                <Input value={form.goalOutcome} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({...form, goalOutcome: e.target.value})} className="mt-1" placeholder="Fat loss, muscle gain..." />
              </div>
              <div>
                <Label>Timeline (days)</Label>
                <Input type="number" min="1" value={form.goalTimelineDays} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({...form, goalTimelineDays: e.target.value})} className="mt-1" placeholder="56" />
              </div>
              <div>
                <Label>Target Weight (kg)</Label>
                <Input type="number" min="1" step="0.1" value={form.goalTargetWeight} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({...form, goalTargetWeight: e.target.value})} className="mt-1" placeholder="Optional" />
              </div>
            </div>
            <Button onClick={handleSave} loading={saving}><Save className="w-4 h-4 mr-2" />Save Profile</Button>
          </CardContent>
        </Card>
      </FadeIn>

      {profile && (
        <FadeIn delay={0.2}>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calculator className="w-5 h-5 text-primary" />
                Calculated Targets
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-lg bg-muted">
                  <p className="text-xs text-muted-foreground">TDEE</p>
                  <p className="text-2xl font-bold font-mono">{Math.round(profile?.tdee ?? 0)}</p>
                  <p className="text-xs text-muted-foreground">kcal/day</p>
                </div>
                <div className="p-4 rounded-lg bg-primary/10">
                  <p className="text-xs text-muted-foreground">Target Calories</p>
                  <p className="text-2xl font-bold font-mono text-primary">{Math.round(profile?.targetCalories ?? 0)}</p>
                  <p className="text-xs text-muted-foreground">kcal/day</p>
                </div>
                <div className="p-4 rounded-lg bg-blue-500/10">
                  <p className="text-xs text-muted-foreground">Protein Target</p>
                  <p className="text-2xl font-bold font-mono text-blue-500">{Math.round(profile?.targetProtein ?? 0)}g</p>
                </div>
                <div className="p-4 rounded-lg bg-green-500/10">
                  <p className="text-xs text-muted-foreground">Carbs Target</p>
                  <p className="text-2xl font-bold font-mono text-green-500">{Math.round(profile?.targetCarbs ?? 0)}g</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </FadeIn>
      )}
        </TabsContent>

        <TabsContent value="review" className="space-y-6">
      <FadeIn delay={0.16}>
        <Card>
          <CardHeader>
            <div className="grid gap-3 sm:flex sm:items-center sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Inbox className="h-5 w-5 text-primary" />
                  Review Inbox
                </CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">Confirm uncertain imports, agent actions, and account warnings.</p>
              </div>
              <Button type="button" variant="outline" onClick={loadReviewItems} loading={reviewLoading}>
                <RefreshCw className="h-4 w-4" />
                Refresh
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              <ReviewFilterButton active={reviewFilter === "open"} label="Open" count={reviewCount(reviewCounts, "open")} onClick={() => setReviewFilter("open")} />
              <ReviewFilterButton active={reviewFilter === "confirmed"} label="Confirmed" count={reviewCount(reviewCounts, "confirmed")} onClick={() => setReviewFilter("confirmed")} />
              <ReviewFilterButton active={reviewFilter === "ignored"} label="Ignored" count={reviewCount(reviewCounts, "ignored")} onClick={() => setReviewFilter("ignored")} />
            </div>
            {reviewLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((item) => <div key={item} className="h-24 animate-pulse rounded-lg bg-muted" />)}
              </div>
            ) : reviewItems.length === 0 ? (
              <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                Nothing to review here.
              </div>
            ) : (
              <div className="space-y-2">
                {reviewItems.map((item) => (
                  <div key={item.id} className="grid gap-3 rounded-lg bg-muted/40 p-3 sm:grid-cols-[1fr_auto] sm:items-center">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={item.priority === "high" ? "destructive" : "secondary"}>
                          {item.priority === "high" ? <AlertTriangle className="mr-1 h-3 w-3" /> : null}
                          {reviewTypeLabel(item.type)}
                        </Badge>
                        <Badge variant="outline">{item.status}</Badge>
                      </div>
                      <p className="mt-2 font-semibold">{item.title}</p>
                      {item.detail && <p className="mt-1 text-sm text-muted-foreground">{item.detail}</p>}
                      <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock3 className="h-3 w-3" />
                        {formatReviewDate(item.createdAt)}
                      </p>
                    </div>
                    {item.status === "open" && (
                      <div className="grid grid-cols-2 gap-2 sm:flex">
                        <Button type="button" size="sm" onClick={() => resolveReviewItem(item, "confirmed")}>
                          <CheckCircle2 className="h-4 w-4" />
                          Confirm
                        </Button>
                        <Button type="button" size="sm" variant="outline" onClick={() => resolveReviewItem(item, "ignored")}>
                          <XCircle className="h-4 w-4" />
                          Ignore
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </FadeIn>
        </TabsContent>

        <TabsContent value="report" className="space-y-6">
          <WeeklyReportPanel />
        </TabsContent>

        <TabsContent value="progress" className="space-y-6">
          <ProgressPanel />
        </TabsContent>

        <TabsContent value="activity" className="space-y-6">
      <FadeIn delay={0.25}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              Recent Activity
            </CardTitle>
            <p className="text-sm text-muted-foreground">Shows activity from the last 30 days.</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <ActivityMetric label="Total events" value={activityItems.length} />
              <ActivityMetric label="Money events" value={(activityCounts.spend ?? 0) + (activityCounts.money ?? 0)} />
              <ActivityMetric label="Fitness events" value={(activityCounts.workout ?? 0) + (activityCounts.progress ?? 0)} />
              <ActivityMetric label="Plan events" value={(activityCounts.reminder ?? 0) + (activityCounts.medication ?? 0)} />
            </div>
            {activityItems.length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                No activity yet.
              </div>
            ) : (
              <div className="relative max-h-[32rem] space-y-3 overflow-y-auto pr-1 before:absolute before:left-4 before:top-2 before:h-[calc(100%-1rem)] before:w-px before:bg-border ios-scroll">
                {activityItems.map((item) => {
                  const meta = activityMeta(item.type);
                  const Icon = meta.icon;
                  return (
                    <a
                      key={item.id}
                      href={item.href}
                      className="relative grid grid-cols-[2rem_1fr] gap-3 rounded-lg p-2 transition hover:bg-muted/40"
                    >
                      <div className={`z-10 flex h-8 w-8 items-center justify-center rounded-full border ${meta.className}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 rounded-lg border border-border bg-card p-3">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="break-words text-sm font-semibold">{item.title}</p>
                              <Badge variant="secondary">{meta.label}</Badge>
                            </div>
                            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{formatActivityDetail(item.detail)}</p>
                          </div>
                          {item.amount && <span className="whitespace-nowrap font-mono text-sm font-semibold">{item.amount}</span>}
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">{formatActivityDate(item.at)}</p>
                      </div>
                    </a>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </FadeIn>
        </TabsContent>

        <TabsContent value="integrations" className="space-y-6">
      <FadeIn delay={0.18}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5 text-primary" />
              Telegram Bot
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg bg-muted/40 p-3 text-sm text-muted-foreground">
              Message your Dayza Telegram bot once, send <span className="font-mono text-foreground">/start</span>, then paste the chat ID here. Once connected, Telegram can receive reminders and log spends, water, weight, medications, reminders, and saved diet meals.
            </div>
            {!telegramForm.botConfigured && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-600">
                Bot token is not configured. Add <span className="font-mono">TELEGRAM_BOT_TOKEN</span> and restart the app.
              </div>
            )}
            <div>
              <Label>Telegram Chat ID</Label>
              <Input
                value={telegramForm.telegramChatId}
                onChange={(e) => setTelegramForm({ ...telegramForm, telegramChatId: e.target.value })}
                className="mt-1"
                placeholder="123456789"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant={telegramForm.telegramEnabled ? "default" : "outline"}
                onClick={() => setTelegramForm({ ...telegramForm, telegramEnabled: !telegramForm.telegramEnabled })}
              >
                {telegramForm.telegramEnabled ? "Telegram Enabled" : "Enable Telegram"}
              </Button>
              <Button type="button" onClick={saveTelegram} loading={savingTelegram}>
                <Save className="mr-2 h-4 w-4" />
                Save Telegram
              </Button>
              <Button type="button" variant="outline" onClick={sendDueTelegram} loading={checkingTelegram}>
                <Send className="mr-2 h-4 w-4" />
                Send Due
              </Button>
              <Button type="button" variant="outline" onClick={checkTelegramMessages} loading={checkingTelegram}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Check Bot
              </Button>
            </div>
          </CardContent>
        </Card>
      </FadeIn>
      <FadeIn delay={0.22}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5 text-primary" />
              Data Retention
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Keeps the latest 7 chats, latest 10 messages in each chat, and removes image data after 5 days.
            </p>
          </CardHeader>
          <CardContent>
            <Button type="button" variant="outline" onClick={runRetentionCleanup} loading={cleaningRetention}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Run Cleanup
            </Button>
          </CardContent>
        </Card>
      </FadeIn>
        </TabsContent>

        <TabsContent value="danger" className="space-y-6">
      <FadeIn delay={0.3}>
        <Card className="border-destructive/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              Delete Account
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              This permanently deletes your account, profile, workouts, meals, diet plans, reminders, progress, chat history, and logs.
            </p>
            <div>
              <Label>Type DELETE to confirm</Label>
              <Input value={deleteConfirm} onChange={(e) => setDeleteConfirm(e.target.value)} className="mt-1" placeholder="DELETE" />
            </div>
            <Button variant="destructive" onClick={handleDeleteAccount} loading={deleting} disabled={deleteConfirm !== "DELETE"}>
              <Trash2 className="mr-2 h-4 w-4" />
              Delete My Account
            </Button>
          </CardContent>
        </Card>
      </FadeIn>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function formatActivityDate(value?: string) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function formatActivityDetail(value?: string) {
  if (!value) return "";
  return value.replace(/\s-\s/g, " - ");
}

function activityMeta(type: string) {
  const map: Record<string, { label: string; icon: any; className: string }> = {
    spend: { label: "Spend", icon: WalletCards, className: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" },
    money: { label: "Lend/Borrow", icon: Banknote, className: "bg-cyan-500/10 text-cyan-400 border-cyan-500/30" },
    workout: { label: "Workout", icon: Dumbbell, className: "bg-blue-500/10 text-blue-400 border-blue-500/30" },
    food: { label: "Food", icon: Utensils, className: "bg-orange-500/10 text-orange-400 border-orange-500/30" },
    progress: { label: "Progress", icon: TrendingUp, className: "bg-purple-500/10 text-purple-400 border-purple-500/30" },
    reminder: { label: "Reminder", icon: CalendarCheck, className: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30" },
    medication: { label: "Medication", icon: Pill, className: "bg-pink-500/10 text-pink-400 border-pink-500/30" },
    agent: { label: "Agent", icon: Bot, className: "bg-primary/10 text-primary border-primary/30" },
  };
  return map[type] ?? { label: "Activity", icon: Activity, className: "bg-muted text-muted-foreground border-border" };
}

function ActivityMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-muted/25 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-mono text-xl font-bold">{value}</p>
    </div>
  );
}

function reviewCount(counts: any[], status: string) {
  return counts.find((entry) => entry.status === status)?._count?.id ?? 0;
}

function reviewTypeLabel(type: string) {
  return type.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatReviewDate(value?: string) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function ReviewFilterButton({ active, label, count, onClick }: { active: boolean; label: string; count: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border p-3 text-left transition-colors ${active ? "border-primary/40 bg-primary/15 text-primary" : "border-border bg-card text-muted-foreground"}`}
    >
      <span className="text-xs font-medium">{label}</span>
      <p className="mt-1 font-mono text-xl font-bold">{count}</p>
    </button>
  );
}
