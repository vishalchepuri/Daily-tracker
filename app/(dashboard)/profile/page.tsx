"use client";
import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserCircle, Calculator, Save, Trash2, Send, MessageCircle, RefreshCw } from "lucide-react";
import { FadeIn } from "@/components/ui/animate";
import { toast } from "sonner";
import { signOut } from "next-auth/react";

export default function ProfilePage() {
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingTelegram, setSavingTelegram] = useState(false);
  const [checkingTelegram, setCheckingTelegram] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [telegramForm, setTelegramForm] = useState({ telegramChatId: "", telegramEnabled: false, botConfigured: false });
  const [form, setForm] = useState({
    age: "", weight: "", height: "", gender: "male", activityLevel: "moderate", goal: "muscle_gain",
    healthLimitations: "", foodAllergies: "", goalOutcome: "", goalTimelineDays: "", goalTargetWeight: "", linkedinUrl: "",
  });

  useEffect(() => {
    fetch("/api/profile").then(r => r.json()).then(d => {
      const p = d?.profile;
      if (p) {
        setProfile(p);
        setForm({
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
      }
    }).catch(console.error).finally(() => setLoading(false));
    fetch("/api/telegram-settings").then(r => r.json()).then(d => {
      setTelegramForm({
        telegramChatId: d?.telegramChatId ?? "",
        telegramEnabled: Boolean(d?.telegramEnabled),
        botConfigured: Boolean(d?.botConfigured),
      });
    }).catch(console.error);
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
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
      await signOut({ callbackUrl: "/signup" });
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

  if (loading) return <div className="h-64 bg-muted animate-pulse rounded-lg" />;

  return (
    <div className="space-y-6 max-w-2xl">
      <FadeIn>
        <h2 className="text-2xl font-display font-bold tracking-tight">Profile & Goals</h2>
        <p className="text-muted-foreground text-sm mt-1">Set your body stats and fitness goals</p>
      </FadeIn>

      <FadeIn delay={0.1}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserCircle className="w-5 h-5 text-primary" />
              Body Stats
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
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
    </div>
  );
}
