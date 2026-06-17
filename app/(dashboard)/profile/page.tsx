"use client";
import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Activity,
  AlertTriangle,
  Banknote,
  BellRing,
  Bot,
  Brain,
  Calculator,
  CalendarCheck,
  CheckCircle2,
  Clock3,
  Dumbbell,
  Inbox,
  KeyRound,
  Pill,
  Save,
  Send,
  MessageCircle,
  Eye,
  EyeOff,
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
import { getFirebaseClientAuth } from "@/lib/firebase-client";
import { EmailAuthProvider, linkWithCredential, updatePassword } from "firebase/auth";
import { registerPushNotifications, supportsPushNotifications, unregisterPushNotifications } from "@/lib/push-notifications-client";

const RESET_FEATURE_OPTIONS = [
  { id: "profile", label: "Profile", detail: "Body stats, goals, targets, safety notes, Telegram link settings" },
  { id: "nutrition", label: "Nutrition", detail: "Food logs, water logs, and diet plans" },
  { id: "workouts", label: "Workouts", detail: "Workout programs, workout history, sets, and PR history" },
  { id: "spends", label: "Spends", detail: "Spends, cards, bank accounts, finance profile, lend and borrow entries" },
  { id: "reminders", label: "Reminders", detail: "Reminder lists and reminder items" },
  { id: "medications", label: "Medications", detail: "Medication schedules and medication logs" },
  { id: "progress", label: "Progress", detail: "Progress measurements and progress photo records" },
  { id: "agent", label: "Agent Chats", detail: "Chat sessions, messages, and chat attachments" },
  { id: "reviews", label: "Reviews & Reports", detail: "Review inbox items and issue reports" },
  { id: "integrations", label: "Integrations", detail: "Connected OAuth accounts and Telegram link settings" },
] as const;

export default function ProfilePage() {
  const [profile, setProfile] = useState<any>(null);
  const [activityItems, setActivityItems] = useState<any[]>([]);
  const [activityCounts, setActivityCounts] = useState<Record<string, number>>({});
  const [reviewItems, setReviewItems] = useState<any[]>([]);
  const [reviewCounts, setReviewCounts] = useState<any[]>([]);
  const [reviewFilter, setReviewFilter] = useState("open");
  const [reviewLoading, setReviewLoading] = useState(false);
  const [pendingExercises, setPendingExercises] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState("profile");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingTelegram, setSavingTelegram] = useState(false);
  const [checkingTelegram, setCheckingTelegram] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [pushSending, setPushSending] = useState(false);
  const [showAccountPassword, setShowAccountPassword] = useState(false);
  const [cleaningRetention, setCleaningRetention] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [resetOpen, setResetOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetFeatures, setResetFeatures] = useState<string[]>([]);
  const [resetConfirm, setResetConfirm] = useState("");
  const [telegramForm, setTelegramForm] = useState({ telegramChatId: "", telegramEnabled: false, botConfigured: false });
  const [pushStatus, setPushStatus] = useState({ supported: false, configured: false, subscribed: false, permission: "default" });
  const [passwordForm, setPasswordForm] = useState({ password: "", confirmPassword: "" });
  const [form, setForm] = useState({
    firstName: "", lastName: "",
    age: "", weight: "", height: "", gender: "male", activityLevel: "moderate", goal: "muscle_gain",
    healthLimitations: "", foodAllergies: "", workoutFocusMuscles: "", workoutFocusGoal: "", workoutTrainingStyle: "indian_gym", goalOutcome: "", goalTimelineDays: "", goalTargetWeight: "", linkedinUrl: "",
    micronutrientTrackingEnabled: false,
  });

  useEffect(() => {
    const tab = new URLSearchParams(window.location.search).get("tab");
    if (tab && ["profile", "memory", "review", "report", "progress", "activity", "integrations", "danger"].includes(tab)) {
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
          workoutFocusMuscles: p?.workoutFocusMuscles ?? "",
          workoutFocusGoal: p?.workoutFocusGoal ?? "",
          workoutTrainingStyle: p?.workoutTrainingStyle ?? "indian_gym",
          goalOutcome: p?.goalOutcome ?? "",
          goalTimelineDays: String(p?.goalTimelineDays ?? ""),
          goalTargetWeight: String(p?.goalTargetWeight ?? ""),
          linkedinUrl: p?.linkedinUrl ?? "",
          micronutrientTrackingEnabled: Boolean(p?.micronutrientTrackingEnabled),
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
    if (supportsPushNotifications()) {
      fetch("/api/push/subscription")
        .then((r) => r.ok ? r.json() : { configured: false, subscribed: false })
        .then((d) => {
          setPushStatus({
            supported: true,
            configured: Boolean(d?.configured),
            subscribed: Boolean(d?.subscribed),
            permission: typeof Notification !== "undefined" ? Notification.permission : "default",
          });
        })
        .catch(() => {
          setPushStatus({
            supported: true,
            configured: false,
            subscribed: false,
            permission: typeof Notification !== "undefined" ? Notification.permission : "default",
          });
        });
    } else {
      setPushStatus({ supported: false, configured: false, subscribed: false, permission: "default" });
    }
    fetch("/api/activity").then(r => r.ok ? r.json() : { items: [], counts: {} }).then(d => {
      setActivityItems(d?.items ?? []);
      setActivityCounts(d?.counts ?? {});
    }).catch(console.error);
    fetch("/api/exercises?compact=1").then(r => r.ok ? r.json() : { exercises: [] }).then(d => {
      setPendingExercises((d?.exercises ?? []).filter((exercise: any) => exercise?.status === "pending"));
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
          workoutFocusMuscles: form.workoutFocusMuscles || null,
          workoutFocusGoal: form.workoutFocusGoal || null,
          workoutTrainingStyle: form.workoutTrainingStyle || "indian_gym",
          goalOutcome: form.goalOutcome || null,
          goalTimelineDays: parseInt(form.goalTimelineDays) || null,
          goalTargetWeight: parseFloat(form.goalTargetWeight) || null,
          linkedinUrl: form.linkedinUrl || null,
          micronutrientTrackingEnabled: form.micronutrientTrackingEnabled,
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

  const handleSetAccountPassword = async () => {
    if (savingPassword) return;
    const password = passwordForm.password.trim();
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters.");
      return;
    }
    if (password !== passwordForm.confirmPassword.trim()) {
      toast.error("Passwords do not match.");
      return;
    }
    setSavingPassword(true);
    try {
      const auth = getFirebaseClientAuth();
      const user = auth.currentUser;
      if (!user?.email) {
        toast.error("Please sign in again before setting a password.");
        return;
      }
      const credential = EmailAuthProvider.credential(user.email, password);
      const hasPasswordProvider = user.providerData.some((provider) => provider.providerId === "password");
      if (hasPasswordProvider) {
        await updatePassword(user, password);
        toast.success("Password updated. You can sign in with Google or password.");
      } else {
        await linkWithCredential(user, credential);
        toast.success("Password created. You can sign in with Google or password.");
      }
      setPasswordForm({ password: "", confirmPassword: "" });
    } catch (error: any) {
      const message =
        error?.code === "auth/requires-recent-login"
          ? "Please sign out, sign in with Google again, then set the password."
          : error?.code === "auth/provider-already-linked"
            ? "Password login is already enabled for this account."
            : error?.code === "auth/email-already-in-use" || error?.code === "auth/credential-already-in-use"
              ? "This email is already linked to another password account."
              : error?.code === "auth/weak-password"
                ? "Password is too weak. Use at least 6 characters."
                : error?.message ?? "Could not set account password.";
      toast.error(message);
    } finally {
      setSavingPassword(false);
    }
  };

  const clearMemoryFields = (fields: Array<keyof typeof form>) => {
    setForm((current) => {
      const next = { ...current };
      for (const field of fields) {
        if (field === "micronutrientTrackingEnabled") {
          next[field] = false;
        } else if (field === "workoutTrainingStyle") {
          next[field] = "indian_gym";
        } else {
          next[field] = "";
        }
      }
      return next;
    });
    toast.info("Memory cleared locally. Save to apply.");
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

  const toggleResetFeature = (feature: string, checked: boolean) => {
    setResetFeatures((current) => {
      if (checked) return Array.from(new Set([...current, feature]));
      return current.filter((item) => item !== feature);
    });
  };

  const toggleAllResetFeatures = (checked: boolean) => {
    setResetFeatures(checked ? RESET_FEATURE_OPTIONS.map((feature) => feature.id) : []);
  };

  const handleResetSelectedData = async () => {
    if (resetFeatures.length === 0) {
      toast.error("Select at least one feature to reset");
      return;
    }
    if (resetConfirm !== "RESET") {
      toast.error("Type RESET to confirm");
      return;
    }
    setResetting(true);
    try {
      const res = await fetch("/api/profile/reset-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ features: resetFeatures }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? "Failed to reset selected data");
        return;
      }
      toast.success("Selected feature data reset");
      setResetOpen(false);
      setResetConfirm("");
      setResetFeatures([]);
      window.location.reload();
    } catch {
      toast.error("Failed to reset selected data");
    } finally {
      setResetting(false);
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

  const enablePushNotifications = async () => {
    setPushLoading(true);
    try {
      await registerPushNotifications();
      setPushStatus({
        supported: true,
        configured: true,
        subscribed: true,
        permission: typeof Notification !== "undefined" ? Notification.permission : "granted",
      });
      toast.success("Push notifications enabled");
    } catch (error: any) {
      toast.error(error?.message ?? "Failed to enable push notifications");
    } finally {
      setPushLoading(false);
    }
  };

  const disablePushNotifications = async () => {
    setPushLoading(true);
    try {
      await unregisterPushNotifications();
      setPushStatus((current) => ({ ...current, subscribed: false }));
      toast.success("Push notifications disabled");
    } catch (error: any) {
      toast.error(error?.message ?? "Failed to disable push notifications");
    } finally {
      setPushLoading(false);
    }
  };

  const sendPushTest = async () => {
    setPushSending(true);
    try {
      const res = await fetch("/api/push/test", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? "Failed to send test notification");
        return;
      }
      toast.success(data?.sent ? "Test notification sent" : "No device subscription found");
    } catch {
      toast.error("Failed to send test notification");
    } finally {
      setPushSending(false);
    }
  };

  const sendDuePush = async () => {
    setPushSending(true);
    try {
      const res = await fetch("/api/reminders/push-dispatch", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? "Failed to send push reminders");
        return;
      }
      toast.success(data?.sent ? `Sent ${data.sent} push notification(s)` : "No due reminders to send");
    } catch {
      toast.error("Failed to send push reminders");
    } finally {
      setPushSending(false);
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

  return (
    <div className="space-y-5 sm:space-y-6">
      <FadeIn>
        <h2 className="font-display text-xl font-bold tracking-tight sm:text-2xl">Profile & Goals</h2>
        <p className="text-muted-foreground text-sm mt-1">Set your body stats and fitness goals</p>
      </FadeIn>

      {pendingExercises.length > 0 && (
        <FadeIn delay={0.05}>
          <Card className="border-amber-500/30 bg-amber-500/5">
            <CardContent className="grid gap-3 p-4 sm:grid-cols-[1fr_auto] sm:items-center">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Dumbbell className="h-4 w-4 text-amber-500" />
                  <p className="font-semibold">{pendingExercises.length} exercise{pendingExercises.length === 1 ? "" : "s"} waiting for admin approval</p>
                </div>
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                  {pendingExercises.slice(0, 3).map((exercise) => exercise.name).join(", ")}
                  {pendingExercises.length > 3 ? ` and ${pendingExercises.length - 3} more` : ""}
                </p>
              </div>
              <Button type="button" variant="outline" onClick={() => setActiveTab("review")}>
                View Status
              </Button>
            </CardContent>
          </Card>
        </FadeIn>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="flex h-auto w-full gap-2 overflow-x-auto bg-transparent p-0">
          <TabsTrigger value="profile" className="min-w-24 rounded-lg border border-border bg-transparent data-[state=active]:border-primary/30 data-[state=active]:bg-primary/15">Profile</TabsTrigger>
          <TabsTrigger value="memory" className="min-w-24 rounded-lg border border-border bg-transparent data-[state=active]:border-primary/30 data-[state=active]:bg-primary/15">Memory</TabsTrigger>
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
                    <SelectItem value="other">Other</SelectItem>
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
              <div><Label>Workout focus muscles</Label><Input value={form.workoutFocusMuscles} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({...form, workoutFocusMuscles: e.target.value})} className="mt-1" placeholder="core, legs, glutes, chest..." /></div>
              <div><Label>Workout focus goal</Label><Input value={form.workoutFocusGoal} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({...form, workoutFocusGoal: e.target.value})} className="mt-1" placeholder="fat_loss, muscle_gain, cardio..." /></div>
              <div>
                <Label>Workout style</Label>
                <Select value={form.workoutTrainingStyle} onValueChange={(v: string) => setForm({...form, workoutTrainingStyle: v})}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="indian_gym">Indian/Cult-style gym</SelectItem>
                    <SelectItem value="machines">Machines</SelectItem>
                    <SelectItem value="mat_bodyweight">Mat/bodyweight</SelectItem>
                    <SelectItem value="mixed">Mixed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
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
            <label className="flex items-start gap-3 rounded-lg border border-orange-500/20 bg-orange-500/5 p-3">
              <Checkbox
                checked={form.micronutrientTrackingEnabled}
                onCheckedChange={(checked) => setForm({ ...form, micronutrientTrackingEnabled: checked === true })}
                className="mt-0.5"
              />
              <span>
                <span className="block text-sm font-medium">Track vitamins & minerals</span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  Adds detailed micronutrient targets and food-photo estimates in Nutrition.
                </span>
              </span>
            </label>
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

        <TabsContent value="memory" className="space-y-6">
          <FadeIn delay={0.1}>
            <Card>
              <CardHeader>
                <div className="grid gap-3 sm:flex sm:items-center sm:justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Brain className="h-5 w-5 text-primary" />
                      Dayza Memory
                    </CardTitle>
                    <p className="mt-1 text-sm text-muted-foreground">Review and edit what Dayza uses to personalize plans and answers.</p>
                  </div>
                  <Button onClick={handleSave} loading={saving}>
                    <Save className="h-4 w-4" />
                    Save Memory
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="grid gap-4 lg:grid-cols-2">
                <MemorySection
                  title="Safety & Food"
                  description="Used before workout and diet plans."
                  onClear={() => clearMemoryFields(["healthLimitations", "foodAllergies"])}
                >
                  <div><Label>Health limitations</Label><Input value={form.healthLimitations} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({...form, healthLimitations: e.target.value})} className="mt-1" placeholder="None, knee pain, shoulder surgery..." /></div>
                  <div><Label>Food allergies</Label><Input value={form.foodAllergies} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({...form, foodAllergies: e.target.value})} className="mt-1" placeholder="None, peanuts, lactose..." /></div>
                </MemorySection>

                <MemorySection
                  title="Workout Preferences"
                  description="Used for strict workout planning and exercise choices."
                  onClear={() => clearMemoryFields(["workoutFocusMuscles", "workoutFocusGoal", "workoutTrainingStyle"])}
                >
                  <div><Label>Focus muscles</Label><Input value={form.workoutFocusMuscles} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({...form, workoutFocusMuscles: e.target.value})} className="mt-1" placeholder="core, legs, glutes, chest..." /></div>
                  <div><Label>Focus goal</Label><Input value={form.workoutFocusGoal} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({...form, workoutFocusGoal: e.target.value})} className="mt-1" placeholder="fat_loss, muscle_gain, cardio..." /></div>
                  <div>
                    <Label>Training style</Label>
                    <Select value={form.workoutTrainingStyle} onValueChange={(v: string) => setForm({...form, workoutTrainingStyle: v})}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="indian_gym">Indian/Cult-style gym</SelectItem>
                        <SelectItem value="machines">Machines</SelectItem>
                        <SelectItem value="mat_bodyweight">Mat/bodyweight</SelectItem>
                        <SelectItem value="mixed">Mixed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </MemorySection>

                <MemorySection
                  title="Goal Timeline"
                  description="Used to keep plans realistic and paced."
                  onClear={() => clearMemoryFields(["goalOutcome", "goalTimelineDays", "goalTargetWeight"])}
                >
                  <div><Label>Goal outcome</Label><Input value={form.goalOutcome} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({...form, goalOutcome: e.target.value})} className="mt-1" placeholder="Fat loss, muscle gain..." /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Timeline days</Label><Input type="number" value={form.goalTimelineDays} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({...form, goalTimelineDays: e.target.value})} className="mt-1" /></div>
                    <div><Label>Target weight</Label><Input type="number" value={form.goalTargetWeight} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({...form, goalTargetWeight: e.target.value})} className="mt-1" /></div>
                  </div>
                </MemorySection>

                <MemorySection
                  title="Nutrition Depth"
                  description="Used for vitamins, minerals, and detailed food-photo estimates."
                  onClear={() => clearMemoryFields(["micronutrientTrackingEnabled"])}
                >
                  <label className="flex items-start gap-3 rounded-lg border border-border bg-background/70 p-3">
                    <Checkbox
                      checked={form.micronutrientTrackingEnabled}
                      onCheckedChange={(checked) => setForm({ ...form, micronutrientTrackingEnabled: checked === true })}
                      className="mt-0.5"
                    />
                    <span>
                      <span className="block text-sm font-medium">Track vitamins & minerals</span>
                      <span className="mt-1 block text-xs text-muted-foreground">Dayza can estimate and track micronutrients from food logs and food photos.</span>
                    </span>
                  </label>
                </MemorySection>
              </CardContent>
            </Card>
          </FadeIn>
        </TabsContent>

        <TabsContent value="review" className="space-y-6">
      {pendingExercises.length > 0 && (
        <FadeIn delay={0.1}>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Dumbbell className="h-5 w-5 text-primary" />
                Pending Exercise Submissions
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2">
              {pendingExercises.map((exercise) => (
                <div key={exercise.id} className="rounded-lg border border-border bg-muted/30 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{exercise.name}</p>
                    <Badge variant="secondary" className="capitalize">{exercise.muscleGroup}</Badge>
                    {exercise.equipment && <Badge variant="outline">{exercise.equipment}</Badge>}
                    <Badge className="bg-amber-500/15 text-amber-500 hover:bg-amber-500/15">Pending approval</Badge>
                  </div>
                  {exercise.description && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{exercise.description}</p>}
                </div>
              ))}
            </CardContent>
          </Card>
        </FadeIn>
      )}
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
      <FadeIn delay={0.14}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-primary" />
              Account Password
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Add a password to this account so you can sign in with Google or email/password.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>New Password</Label>
                <div className="relative mt-1">
                  <Input
                    type={showAccountPassword ? "text" : "password"}
                    value={passwordForm.password}
                    onChange={(e) => setPasswordForm({ ...passwordForm, password: e.target.value })}
                    placeholder="Min 6 characters"
                    className="pr-10"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowAccountPassword(!showAccountPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label={showAccountPassword ? "Hide password" : "Show password"}
                  >
                    {showAccountPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div>
                <Label>Confirm Password</Label>
                <Input
                  type={showAccountPassword ? "text" : "password"}
                  value={passwordForm.confirmPassword}
                  onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                  placeholder="Repeat password"
                  className="mt-1"
                  autoComplete="new-password"
                />
              </div>
            </div>
            <Button type="button" onClick={handleSetAccountPassword} loading={savingPassword}>
              <KeyRound className="mr-2 h-4 w-4" />
              Save Password
            </Button>
          </CardContent>
        </Card>
      </FadeIn>
      <FadeIn delay={0.18}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BellRing className="h-5 w-5 text-primary" />
              Push Notifications
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg bg-muted/40 p-3 text-sm text-muted-foreground">
              Enable real push notifications for reminders so Dayza can reach your phone even when the app is closed.
            </div>
            {!pushStatus.supported && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-600">
                This browser/device does not support web push notifications.
              </div>
            )}
            {pushStatus.supported && !pushStatus.configured && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-600">
                Push notifications are not configured on the server yet. Add VAPID keys first.
              </div>
            )}
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant={pushStatus.supported ? "secondary" : "outline"}>{pushStatus.supported ? "Supported" : "Not supported"}</Badge>
              <Badge variant={pushStatus.subscribed ? "default" : "outline"}>{pushStatus.subscribed ? "Subscribed" : "Not subscribed"}</Badge>
              <Badge variant="outline">Permission: {pushStatus.permission}</Badge>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={enablePushNotifications} loading={pushLoading} disabled={!pushStatus.supported || !pushStatus.configured || pushStatus.subscribed}>
                Enable Push
              </Button>
              <Button type="button" variant="outline" onClick={disablePushNotifications} loading={pushLoading} disabled={!pushStatus.subscribed}>
                Disable Push
              </Button>
              <Button type="button" variant="outline" onClick={sendPushTest} loading={pushSending} disabled={!pushStatus.subscribed}>
                Test Push
              </Button>
              <Button type="button" variant="outline" onClick={sendDuePush} loading={pushSending} disabled={!pushStatus.subscribed}>
                Send Due Now
              </Button>
            </div>
          </CardContent>
        </Card>
      </FadeIn>
      <FadeIn delay={0.2}>
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
      <FadeIn delay={0.24}>
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
      <FadeIn delay={0.25}>
        <Card className="border-amber-500/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-500">
              <RefreshCw className="h-5 w-5" />
              Reset Feature Data
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Choose one or more features to clear. This keeps your account and login intact.
            </p>
            <Button type="button" variant="outline" onClick={() => setResetOpen(true)}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Reset Selected Features
            </Button>
          </CardContent>
        </Card>
      </FadeIn>
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

      <Dialog open={resetOpen} onOpenChange={(open) => !resetting && setResetOpen(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Feature Data</DialogTitle>
            <DialogDescription>
              Select the features you want to clear. This cannot be undone, but it will not delete your account.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <label className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 p-3">
              <Checkbox
                checked={resetFeatures.length === RESET_FEATURE_OPTIONS.length}
                onCheckedChange={(checked) => toggleAllResetFeatures(checked === true)}
                className="mt-0.5"
              />
              <span className="min-w-0">
                <span className="block font-semibold">All features</span>
                <span className="block text-sm text-muted-foreground">Clear every feature group below while keeping the account.</span>
              </span>
            </label>
            <div className="grid max-h-[45svh] gap-2 overflow-y-auto pr-1 ios-scroll">
              {RESET_FEATURE_OPTIONS.map((feature) => (
                <label key={feature.id} className="flex items-start gap-3 rounded-lg border border-border p-3">
                  <Checkbox
                    checked={resetFeatures.includes(feature.id)}
                    onCheckedChange={(checked) => toggleResetFeature(feature.id, checked === true)}
                    className="mt-0.5"
                  />
                  <span className="min-w-0">
                    <span className="block font-medium">{feature.label}</span>
                    <span className="block text-sm text-muted-foreground">{feature.detail}</span>
                  </span>
                </label>
              ))}
            </div>
            <div>
              <Label>Type RESET to confirm</Label>
              <Input
                value={resetConfirm}
                onChange={(e) => setResetConfirm(e.target.value)}
                className="mt-1"
                placeholder="RESET"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setResetOpen(false)} disabled={resetting}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleResetSelectedData}
              loading={resetting}
              disabled={resetFeatures.length === 0 || resetConfirm !== "RESET" || resetting}
            >
              Reset Data
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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

function MemorySection({
  title,
  description,
  children,
  onClear,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  onClear: () => void;
}) {
  return (
    <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold">{title}</p>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onClear}>
          <Trash2 className="h-4 w-4" />
          Clear
        </Button>
      </div>
      <div className="space-y-3">{children}</div>
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
