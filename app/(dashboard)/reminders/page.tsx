"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, BriefcaseBusiness, CalendarDays, CheckCircle2, Circle, Clock3, Flag, Home, Inbox, ListPlus, ListTodo, Loader2, Mic, MicOff, Pencil, Plus, Repeat, Send, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { FadeIn } from "@/components/ui/animate";
import { dateTimeInputToIso, formatAppDate, formatAppDateTime, formatAppTime, formatLocalDateInput, getZonedDateParts } from "@/lib/local-dates";

declare global {
  interface Window {
    SpeechRecognition?: any;
    webkitSpeechRecognition?: any;
  }
}

const blankReminder = {
  id: "",
  title: "",
  notes: "",
  contextTag: "general",
  sourceLabel: "",
  dueDate: "",
  dueTime: "",
  recurrence: "none",
  recurrenceCustom: "",
  priority: "none",
  flagged: false,
  listId: "",
};

const listColors = ["#22c55e", "#3b82f6", "#a855f7", "#f97316", "#ef4444", "#06b6d4"];
const contextOptions = [
  { value: "general", label: "General" },
  { value: "home", label: "Home" },
  { value: "office", label: "Office" },
  { value: "leaving_home", label: "Leaving Home" },
  { value: "tonight", label: "Tonight" },
  { value: "shopping", label: "Shopping" },
  { value: "billing", label: "Bills" },
  { value: "bring", label: "Bring" },
  { value: "follow_up", label: "Follow Up" },
];

const leavingHomeChecklist = [
  { title: "Take lunch box", priority: "high", notes: "Check before leaving home" },
  { title: "Switch off lights", priority: "medium", notes: "Check rooms and kitchen" },
  { title: "Take wallet", priority: "high", notes: "Before locking the door" },
  { title: "Take keys", priority: "high", notes: "House and vehicle keys" },
  { title: "Take charger", priority: "medium", notes: "Phone or laptop charger" },
  { title: "Take water bottle", priority: "medium", notes: "Fill and carry" },
  { title: "Take ID card", priority: "medium", notes: "Office access card" },
];

function splitDateTime(value?: string | null) {
  if (!value) return { dueDate: "", dueTime: "" };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { dueDate: "", dueTime: "" };
  const zoned = getZonedDateParts(date);
  return {
    dueDate: formatLocalDateInput(date),
    dueTime: `${zoned.hour}:${zoned.minute}`,
  };
}

function buildDueDate(dateValue: string, timeValue: string) {
  return dateTimeInputToIso(dateValue, timeValue);
}

function dateInputValue(date: Date) {
  return formatLocalDateInput(date);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function addDaysToDateKey(dateKey: string, days: number) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function appDayRange(dateKey = formatLocalDateInput(new Date())) {
  return {
    dateKey,
    start: new Date(dateTimeInputToIso(dateKey, "00:00")),
    evening: new Date(dateTimeInputToIso(dateKey, "18:00")),
    end: new Date(dateTimeInputToIso(dateKey, "23:59")),
  };
}

function contextLabel(value?: string | null) {
  return contextOptions.find((item) => item.value === value)?.label || String(value ?? "General").replace(/_/g, " ");
}

function priorityWeight(priority?: string | null) {
  if (priority === "high") return 3;
  if (priority === "medium") return 2;
  if (priority === "low") return 1;
  return 0;
}

function reminderImportanceScore(item: any) {
  const due = item?.dueDate ? new Date(item.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
  const now = Date.now();
  const overdueBoost = due < now ? 1_000_000_000_000 : 0;
  const flaggedBoost = item?.flagged ? 100_000_000_000 : 0;
  const priorityBoost = priorityWeight(item?.priority) * 10_000_000_000;
  return overdueBoost + flaggedBoost + priorityBoost - due;
}

function sortRemindersByImportance(items: any[]) {
  return [...items].sort((a, b) => reminderImportanceScore(b) - reminderImportanceScore(a));
}

function inferContextFromVoice(value: string) {
  const text = value.toLowerCase();
  if (/(office|work|meeting|desk|manager|friend|colleague)/.test(text)) return "office";
  if (/(home|house|room|light|lights|door|gas|stove|lock|keys|lunch|box|charger|wallet|leave|leaving)/.test(text)) return "leaving_home";
  if (/(bill|payment|current|electricity|rent|emi|due)/.test(text)) return "billing";
  if (/(buy|bring|take|carry|mango|fruit|shop|shopping)/.test(text)) return "bring";
  if (/(night|tonight|evening)/.test(text)) return "tonight";
  return "general";
}

function inferPriorityFromVoice(value: string) {
  const text = value.toLowerCase();
  if (/(urgent|important|must|today|bill|payment|lunch|keys|wallet|medicine)/.test(text)) return "high";
  if (/(tomorrow|office|bring|take|remember)/.test(text)) return "medium";
  return "none";
}

export default function RemindersPage() {
  const [reminders, setReminders] = useState<any[]>([]);
  const [lists, setLists] = useState<any[]>([]);
  const [remindersNextOffset, setRemindersNextOffset] = useState(0);
  const [remindersHasMore, setRemindersHasMore] = useState(false);
  const [loadingMoreReminders, setLoadingMoreReminders] = useState(false);
  const [filter, setFilter] = useState("today");
  const [loading, setLoading] = useState(true);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [telegramOpen, setTelegramOpen] = useState(false);
  const [savingReminder, setSavingReminder] = useState(false);
  const [savingList, setSavingList] = useState(false);
  const [showReminderAdvanced, setShowReminderAdvanced] = useState(false);
  const [pendingReminderActions, setPendingReminderActions] = useState<Record<string, "complete" | "snooze" | "delete">>({});
  const [voiceListening, setVoiceListening] = useState(false);
  const [voiceDraft, setVoiceDraft] = useState("");
  const [savingVoiceTask, setSavingVoiceTask] = useState(false);
  const [creatingChecklist, setCreatingChecklist] = useState(false);
  const [reminderForm, setReminderForm] = useState(blankReminder);
  const [listForm, setListForm] = useState({ name: "", color: "#22c55e" });
  const [telegramForm, setTelegramForm] = useState({ telegramChatId: "", telegramEnabled: false, botConfigured: false });
  const saveReminderLock = useRef(false);
  const saveListLock = useRef(false);
  const voiceRecognitionRef = useRef<any>(null);

  const loadData = async () => {
    setLoading(true);
    fetch("/api/reminders?offset=0&limit=30")
      .then((res) => res.ok ? res.json() : { reminders: [] })
      .then((data) => {
        setReminders(data?.reminders ?? []);
        setRemindersNextOffset(data?.nextOffset ?? (data?.reminders ?? []).length);
        setRemindersHasMore(Boolean(data?.hasMore));
      })
      .catch(console.error)
      .finally(() => setLoading(false));

    fetch("/api/reminder-lists")
      .then((res) => res.ok ? res.json() : { lists: [] })
      .then((data) => setLists(data?.lists ?? []))
      .catch(console.error);

    fetch("/api/telegram-settings")
      .then((res) => res.ok ? res.json() : {})
      .then((telegramData: any) => {
        setTelegramForm({
          telegramChatId: telegramData?.telegramChatId ?? "",
          telegramEnabled: Boolean(telegramData?.telegramEnabled),
          botConfigured: Boolean(telegramData?.botConfigured),
        });
      })
      .catch(console.error);
  };

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    return () => voiceRecognitionRef.current?.stop?.();
  }, []);

  const loadMoreReminders = async () => {
    if (loadingMoreReminders || !remindersHasMore) return;
    setLoadingMoreReminders(true);
    try {
      const res = await fetch(`/api/reminders?offset=${remindersNextOffset}&limit=30`);
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? "Failed to load more reminders");
        return;
      }
      setReminders((prev) => [...prev, ...(data?.reminders ?? [])]);
      setRemindersNextOffset(data?.nextOffset ?? remindersNextOffset + (data?.reminders ?? []).length);
      setRemindersHasMore(Boolean(data?.hasMore));
    } catch {
      toast.error("Failed to load more reminders");
    } finally {
      setLoadingMoreReminders(false);
    }
  };

  const smartCounts = useMemo(() => {
    const today = appDayRange();
    const tomorrow = appDayRange(addDaysToDateKey(today.dateKey, 1));
    const now = new Date();
    return {
      all: reminders.filter((item) => !item.completed).length,
      overdue: reminders.filter((item) => !item.completed && item.dueDate && new Date(item.dueDate) < now).length,
      today: reminders.filter((item) => !item.completed && item.dueDate && new Date(item.dueDate) >= today.start && new Date(item.dueDate) <= today.end).length,
      tonight: reminders.filter((item) => !item.completed && (item.contextTag === "tonight" || (item.dueDate && new Date(item.dueDate) >= today.evening && new Date(item.dueDate) <= today.end))).length,
      tomorrow: reminders.filter((item) => !item.completed && item.dueDate && new Date(item.dueDate) >= tomorrow.start && new Date(item.dueDate) <= tomorrow.end).length,
      office: reminders.filter((item) => !item.completed && item.contextTag === "office").length,
      leaving_home: reminders.filter((item) => !item.completed && item.contextTag === "leaving_home").length,
      scheduled: reminders.filter((item) => !item.completed && item.dueDate).length,
      flagged: reminders.filter((item) => !item.completed && item.flagged).length,
      completed: reminders.filter((item) => item.completed).length,
    };
  }, [reminders]);

  const filteredReminders = useMemo(() => {
    const today = appDayRange();
    const tomorrow = appDayRange(addDaysToDateKey(today.dateKey, 1));
    const now = new Date();
    const nextItems = reminders.filter((item) => {
      if (filter === "all") return !item.completed;
      if (filter === "overdue") return !item.completed && item.dueDate && new Date(item.dueDate) < now;
      if (filter === "today") return !item.completed && item.dueDate && new Date(item.dueDate) >= today.start && new Date(item.dueDate) <= today.end;
      if (filter === "tomorrow") return !item.completed && item.dueDate && new Date(item.dueDate) >= tomorrow.start && new Date(item.dueDate) <= tomorrow.end;
      if (filter === "tonight") return !item.completed && (item.contextTag === "tonight" || (item.dueDate && new Date(item.dueDate) >= today.evening && new Date(item.dueDate) <= today.end));
      if (filter === "office") return !item.completed && item.contextTag === "office";
      if (filter === "leaving_home") return !item.completed && item.contextTag === "leaving_home";
      if (filter === "scheduled") return !item.completed && item.dueDate;
      if (filter === "flagged") return !item.completed && item.flagged;
      if (filter === "completed") return item.completed;
      return item.listId === filter && !item.completed;
    });
    return sortRemindersByImportance(nextItems);
  }, [filter, reminders]);

  const openAddReminder = () => {
    setReminderForm({ ...blankReminder, listId: lists[0]?.id ?? "" });
    setShowReminderAdvanced(false);
    setReminderOpen(true);
  };

  const openQuickReminder = (preset: "water" | "meds" | "workout" | "meal") => {
    const today = new Date();
    const tomorrow = addDays(today, 1);
    const presets = {
      water: { title: "Drink water", notes: "Hydration check", contextTag: "general", dueDate: dateInputValue(today), dueTime: "18:00", recurrence: "daily", priority: "medium" },
      meds: { title: "Take medication", notes: "Confirm dose in Medications", contextTag: "tonight", dueDate: dateInputValue(today), dueTime: "21:00", recurrence: "daily", priority: "high" },
      workout: { title: "Workout session", notes: "Warm up first, then follow today's plan", contextTag: "office", dueDate: dateInputValue(tomorrow), dueTime: "07:00", recurrence: "none", priority: "medium" },
      meal: { title: "Meal prep", notes: "Prepare next planned meal", contextTag: "home", dueDate: dateInputValue(today), dueTime: "20:00", recurrence: "none", priority: "low" },
    } as const;
    setReminderForm({ ...blankReminder, ...presets[preset], listId: lists[0]?.id ?? "" });
    setShowReminderAdvanced(false);
    setReminderOpen(true);
  };

  const openContextReminder = (contextTag: string, title = "") => {
    const today = new Date();
    setReminderForm({
      ...blankReminder,
      title,
      contextTag,
      dueDate: dateInputValue(today),
      dueTime: contextTag === "leaving_home" ? "08:30" : contextTag === "tonight" ? "20:00" : "09:00",
      priority: contextTag === "leaving_home" || contextTag === "billing" ? "high" : "medium",
      flagged: contextTag === "leaving_home" || contextTag === "billing",
      listId: lists[0]?.id ?? "",
    });
    setShowReminderAdvanced(false);
    setReminderOpen(true);
  };

  const startVoiceCapture = () => {
    if (voiceListening) {
      voiceRecognitionRef.current?.stop?.();
      setVoiceListening(false);
      return;
    }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast.error("Voice capture is not supported in this browser");
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = "en-IN";
    recognition.interimResults = true;
    recognition.continuous = false;
    let finalTranscript = "";
    recognition.onresult = (event: any) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const transcript = event.results[i][0]?.transcript ?? "";
        if (event.results[i].isFinal) finalTranscript += transcript;
        else interim += transcript;
      }
      setVoiceDraft((finalTranscript + interim).trim());
    };
    recognition.onerror = () => {
      setVoiceListening(false);
      toast.error("Could not hear that clearly");
    };
    recognition.onend = () => {
      setVoiceListening(false);
      const spoken = finalTranscript.trim();
      if (spoken) setVoiceDraft(spoken);
    };
    voiceRecognitionRef.current = recognition;
    recognition.start();
    setVoiceListening(true);
  };

  const saveVoiceTask = async () => {
    const title = voiceDraft.trim();
    if (!title || savingVoiceTask) return;
    setSavingVoiceTask(true);
    const contextTag = inferContextFromVoice(title);
    const priority = inferPriorityFromVoice(title);
    const today = new Date();
    try {
      const res = await fetch("/api/reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          contextTag,
          priority,
          flagged: priority === "high",
          dueDate: buildDueDate(dateInputValue(today), contextTag === "tonight" ? "20:00" : contextTag === "leaving_home" ? "08:30" : "09:00"),
          sourceLabel: "voice",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.error ?? "Failed to save voice task");
        return;
      }
      toast.success("Voice task saved");
      setVoiceDraft("");
      loadData();
    } catch {
      toast.error("Failed to save voice task");
    } finally {
      setSavingVoiceTask(false);
    }
  };

  const createLeavingChecklist = async () => {
    if (creatingChecklist) return;
    setCreatingChecklist(true);
    const today = new Date();
    const existingTitles = new Set(
      reminders
        .filter((item) => !item.completed && item.contextTag === "leaving_home")
        .map((item) => String(item.title ?? "").trim().toLowerCase())
    );
    const missing = leavingHomeChecklist.filter((item) => !existingTitles.has(item.title.toLowerCase()));
    if (missing.length === 0) {
      toast.success("Leaving-home checklist is already ready");
      setFilter("leaving_home");
      setCreatingChecklist(false);
      return;
    }
    try {
      const results = await Promise.all(missing.map((item) =>
        fetch("/api/reminders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...item,
            contextTag: "leaving_home",
            dueDate: buildDueDate(dateInputValue(today), "08:30"),
            flagged: item.priority === "high",
            sourceLabel: "checklist",
          }),
        })
      ));
      const failed = results.filter((res) => !res.ok).length;
      if (failed) toast.error(`Could not add ${failed} checklist item(s)`);
      else toast.success(`Added ${missing.length} leaving-home item(s)`);
      setFilter("leaving_home");
      loadData();
    } catch {
      toast.error("Failed to create checklist");
    } finally {
      setCreatingChecklist(false);
    }
  };

  const openEditReminder = (item: any) => {
    const due = splitDateTime(item.dueDate);
    setReminderForm({
      id: item.id,
      title: item.title ?? "",
      notes: item.notes ?? "",
      contextTag: item.contextTag ?? "general",
      sourceLabel: item.sourceLabel ?? "",
      dueDate: due.dueDate,
      dueTime: due.dueTime,
      recurrence: item.recurrence ?? "none",
      recurrenceCustom: item.recurrenceCustom ?? "",
      priority: item.priority ?? "none",
      flagged: Boolean(item.flagged),
      listId: item.listId ?? "",
    });
    setShowReminderAdvanced(true);
    setReminderOpen(true);
  };

  const saveReminder = async () => {
    if (savingReminder || saveReminderLock.current) return;
    if (!reminderForm.title.trim()) {
      toast.error("Reminder title is required");
      return;
    }
    saveReminderLock.current = true;
    setSavingReminder(true);
    try {
      const res = await fetch("/api/reminders", {
        method: reminderForm.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...reminderForm, dueDate: buildDueDate(reminderForm.dueDate, reminderForm.dueTime) }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data?.error ?? "Failed to save reminder");
        return;
      }
      toast.success(reminderForm.id ? "Reminder updated" : "Reminder added");
      setReminderOpen(false);
      loadData();
    } catch {
      toast.error("Failed to save reminder");
    } finally {
      saveReminderLock.current = false;
      setSavingReminder(false);
    }
  };

  const setReminderAction = (id: string, action: "complete" | "snooze" | "delete" | null) => {
    setPendingReminderActions((current) => {
      const next = { ...current };
      if (action) next[id] = action;
      else delete next[id];
      return next;
    });
  };

  const toggleComplete = async (item: any) => {
    if (pendingReminderActions[item.id]) return;
    const nextCompleted = !item.completed;
    const previousReminders = reminders;
    setReminderAction(item.id, "complete");
    setReminders((current) =>
      current.map((reminder) =>
        reminder.id === item.id
          ? { ...reminder, completed: nextCompleted, completedAt: nextCompleted ? new Date().toISOString() : null }
          : reminder
      )
    );
    try {
      const res = await fetch("/api/reminders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, completed: nextCompleted }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setReminders(previousReminders);
        toast.error(data?.error ?? "Failed to update reminder");
        return;
      }
      toast.success(nextCompleted ? "Reminder completed" : "Reminder reopened");
    } catch {
      setReminders(previousReminders);
      toast.error("Failed to update reminder");
    } finally {
      setReminderAction(item.id, null);
    }
  };

  const snoozeReminder = async (item: any, minutesToAdd: number) => {
    if (pendingReminderActions[item.id]) return;
    const nextDue = new Date();
    nextDue.setMinutes(nextDue.getMinutes() + minutesToAdd);
    const previousReminders = reminders;
    setReminderAction(item.id, "snooze");
    setReminders((current) =>
      current.map((reminder) =>
        reminder.id === item.id ? { ...reminder, dueDate: nextDue.toISOString(), completed: false } : reminder
      )
    );
    try {
      const res = await fetch("/api/reminders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, dueDate: nextDue.toISOString(), completed: false }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setReminders(previousReminders);
        toast.error(data?.error ?? "Failed to snooze reminder");
        return;
      }
      toast.success(`Snoozed for ${minutesToAdd >= 60 ? `${minutesToAdd / 60}h` : `${minutesToAdd}m`}`);
    } catch {
      setReminders(previousReminders);
      toast.error("Failed to snooze reminder");
    } finally {
      setReminderAction(item.id, null);
    }
  };

  const deleteReminder = async (id: string) => {
    if (pendingReminderActions[id]) return;
    const previousReminders = reminders;
    setReminderAction(id, "delete");
    setReminders((current) => current.filter((reminder) => reminder.id !== id));
    try {
      const res = await fetch(`/api/reminders?id=${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setReminders(previousReminders);
        toast.error(data?.error ?? "Failed to delete reminder");
        return;
      }
      toast.success("Reminder deleted");
    } catch {
      setReminders(previousReminders);
      toast.error("Failed to delete reminder");
    } finally {
      setReminderAction(id, null);
    }
  };

  const saveList = async () => {
    if (savingList || saveListLock.current) return;
    if (!listForm.name.trim()) {
      toast.error("List name is required");
      return;
    }
    saveListLock.current = true;
    setSavingList(true);
    try {
      const res = await fetch("/api/reminder-lists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(listForm),
      });
      if (res.ok) {
        toast.success("List added");
        setListOpen(false);
        setListForm({ name: "", color: "#22c55e" });
        loadData();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data?.error ?? "Failed to add list");
      }
    } catch {
      toast.error("Failed to add list");
    } finally {
      saveListLock.current = false;
      setSavingList(false);
    }
  };

  const saveTelegram = async () => {
    const res = await fetch("/api/telegram-settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(telegramForm),
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
    toast.success("Telegram settings saved");
    setTelegramOpen(false);
  };

  const sendDueTelegram = async () => {
    const res = await fetch("/api/reminders/telegram-dispatch", { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data?.error ?? "Failed to send Telegram reminders");
      return;
    }
    toast.success(data?.sent ? `Sent ${data.sent} reminder(s)` : "No due reminders to send");
    loadData();
  };

  const checkTelegramMessages = async () => {
    const res = await fetch("/api/telegram/poll", { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data?.error ?? "Failed to check Telegram messages");
      return;
    }
    toast.success(data?.processed ? `Processed ${data.processed} message(s)` : "No new bot messages");
    loadData();
  };

  const upcomingReminders = useMemo(() => {
    const now = new Date();
    const weekEnd = addDays(now, 7);
    return reminders
      .filter((item) => !item.completed && item.dueDate && new Date(item.dueDate) >= now && new Date(item.dueDate) <= weekEnd)
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
      .slice(0, 5);
  }, [reminders]);

  const topPriorityToday = useMemo(() => {
    const today = appDayRange();
    return sortRemindersByImportance(
      reminders.filter((item) => !item.completed && item.dueDate && new Date(item.dueDate) >= today.start && new Date(item.dueDate) <= today.end)
    ).slice(0, 3);
  }, [reminders]);

  const leavingHomeTasks = useMemo(() => sortRemindersByImportance(
    reminders.filter((item) => !item.completed && item.contextTag === "leaving_home")
  ).slice(0, 5), [reminders]);

  const officeTasks = useMemo(() => sortRemindersByImportance(
    reminders.filter((item) => !item.completed && item.contextTag === "office")
  ).slice(0, 5), [reminders]);

  return (
    <div className="space-y-5 sm:space-y-6">
      <FadeIn>
        <div className="grid gap-2 sm:flex sm:items-center sm:justify-between sm:gap-3">
          <div className="hidden min-w-0 sm:block">
            <h2 className="font-display text-2xl font-bold leading-tight tracking-tight">Reminders</h2>
            <p className="mt-1 max-w-[20rem] text-sm text-muted-foreground sm:max-w-none">Local lists, smart views, due dates, flags, and priorities</p>
          </div>
          <div className="grid gap-2 rounded-xl border border-border/70 bg-card/80 p-2 shadow-sm shadow-black/10 sm:flex sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none">
            <Dialog open={listOpen} onOpenChange={setListOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="hidden h-11 w-full rounded-lg px-3 sm:inline-flex sm:h-10 sm:w-auto sm:px-4"><ListPlus className="w-4 h-4 sm:mr-2" /><span className="hidden sm:inline">New </span>List</Button>
              </DialogTrigger>
              <DialogContent className="max-w-sm sm:max-w-sm">
                <DialogHeader><DialogTitle>New List</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <div><Label>Name</Label><Input value={listForm.name} onChange={(e) => setListForm({ ...listForm, name: e.target.value })} className="mt-1" /></div>
                  <div className="flex gap-2">
                    {listColors.map((color) => (
                      <button key={color} type="button" onClick={() => setListForm({ ...listForm, color })} className="h-8 w-8 rounded-full border-2" style={{ backgroundColor: color, borderColor: listForm.color === color ? "white" : "transparent" }} />
                    ))}
                  </div>
                  <Button onClick={saveList} loading={savingList} disabled={savingList || !listForm.name.trim()} className="w-full">
                    {savingList ? "Creating..." : "Create List"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
            <Dialog open={telegramOpen} onOpenChange={setTelegramOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="hidden h-11 w-full rounded-lg px-3 sm:inline-flex sm:h-10 sm:w-auto sm:px-4"><Send className="w-4 h-4 sm:mr-2" />Telegram</Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader><DialogTitle>Telegram Reminders</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <div className="rounded-lg bg-muted/40 p-3 text-sm text-muted-foreground">
                    Create a Telegram bot with BotFather, add `TELEGRAM_BOT_TOKEN` to `.env`, message your bot once, then paste your Telegram chat ID here.
                  </div>
                  {!telegramForm.botConfigured && (
                    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-600">
                      Bot token is not configured yet. Add `TELEGRAM_BOT_TOKEN` to `.env` and restart the app.
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
                  <Button
                    type="button"
                    variant={telegramForm.telegramEnabled ? "default" : "outline"}
                    onClick={() => setTelegramForm({ ...telegramForm, telegramEnabled: !telegramForm.telegramEnabled })}
                    className="w-full"
                  >
                    {telegramForm.telegramEnabled ? "Telegram Enabled" : "Enable Telegram Reminders"}
                  </Button>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <Button onClick={saveTelegram}>Save</Button>
                    <Button type="button" variant="outline" onClick={sendDueTelegram}>Send Due Now</Button>
                    <Button type="button" variant="outline" onClick={checkTelegramMessages}>Check Bot Messages</Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
            <Button onClick={openAddReminder} className="h-11 w-full rounded-lg px-3 sm:h-10 sm:w-auto sm:px-4"><Plus className="w-4 h-4 sm:mr-2" /><span className="sm:hidden">New Reminder</span><span className="hidden sm:inline">New Reminder</span></Button>
          </div>
        </div>
      </FadeIn>

      <div className="grid gap-3 xl:grid-cols-[1.15fr_0.85fr]">
        <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-primary/10 via-card to-card">
          <CardContent className="grid gap-3 p-4 sm:grid-cols-[1fr_auto] sm:items-center">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15 text-primary">
                  {voiceListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                </div>
                <div>
                  <p className="font-display text-base font-bold">Voice Task Capture</p>
                  <p className="text-xs text-muted-foreground">Say lunch box, bills, office tasks, or anything you may forget.</p>
                </div>
              </div>
              <div className="mt-3 rounded-xl border border-border/60 bg-background/60 px-3 py-2 text-sm">
                <Input
                  value={voiceDraft}
                  onChange={(event) => setVoiceDraft(event.target.value)}
                  placeholder={voiceListening ? "Listening..." : "Tap Talk or type a quick task"}
                  className="border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
                />
              </div>
              {voiceDraft && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Dayza will save it as {contextLabel(inferContextFromVoice(voiceDraft))} with {inferPriorityFromVoice(voiceDraft)} priority.
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 sm:w-44 sm:grid-cols-1">
              <Button type="button" variant={voiceListening ? "default" : "outline"} onClick={startVoiceCapture} disabled={savingVoiceTask}>
                {voiceListening ? <MicOff className="mr-2 h-4 w-4" /> : <Mic className="mr-2 h-4 w-4" />}
                {voiceListening ? "Stop" : "Talk"}
              </Button>
              <Button type="button" onClick={saveVoiceTask} loading={savingVoiceTask} disabled={savingVoiceTask || !voiceDraft.trim()}>
                Save Task
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-emerald-500/20 bg-emerald-500/5">
          <CardContent className="space-y-3 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Home className="h-5 w-5 text-emerald-400" />
                  <p className="font-display text-base font-bold">Leaving Home Checklist</p>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">Lunch box, lights, keys, wallet, charger, ID, water bottle.</p>
              </div>
              <Badge variant="secondary">{smartCounts.leaving_home}</Badge>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" onClick={createLeavingChecklist} loading={creatingChecklist} disabled={creatingChecklist}>
                {creatingChecklist ? "Adding..." : "Prepare"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setFilter("leaving_home")}>
                View
              </Button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {leavingHomeChecklist.slice(0, 5).map((item) => (
                <button
                  key={item.title}
                  type="button"
                  onClick={() => openContextReminder("leaving_home", item.title)}
                  className="rounded-full border border-border/70 bg-background/70 px-2.5 py-1 text-[0.7rem] font-medium text-muted-foreground hover:border-primary/40 hover:text-foreground"
                >
                  + {item.title.replace(/^Take /, "")}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {smartCounts.today + smartCounts.overdue >= 8 && (
        <Card className="border-amber-500/25 bg-amber-500/10">
          <CardContent className="grid gap-3 p-4 sm:grid-cols-[1fr_auto] sm:items-center">
            <div className="flex min-w-0 gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-300">
                <Sparkles className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="font-semibold">You have many tasks today.</p>
                <p className="text-sm text-muted-foreground">Ask Dayza to sort the urgent ones first and suggest a realistic order.</p>
              </div>
            </div>
            <Button asChild>
              <Link href={`/chat?from=/reminders&mode=voice&prompt=${encodeURIComponent("Review my reminders and tasks for today. Ask me priority questions if needed, then give me the best order to finish them.")}`}>
                Ask Dayza
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-3 gap-2 md:hidden">
        <Button type="button" variant="outline" onClick={() => openContextReminder("office")} className="h-11 rounded-xl">
          <BriefcaseBusiness className="mr-1.5 h-4 w-4" />Office
        </Button>
        <Button type="button" variant="outline" onClick={() => openContextReminder("billing")} className="h-11 rounded-xl">
          <Flag className="mr-1.5 h-4 w-4" />Bill
        </Button>
        <Button type="button" variant="outline" onClick={() => openContextReminder("bring")} className="h-11 rounded-xl">
          <Plus className="mr-1.5 h-4 w-4" />Bring
        </Button>
      </div>

      <div className="hidden gap-3 md:grid md:grid-cols-[1fr_22rem]">
        <Card>
          <CardContent className="space-y-3 p-3 sm:p-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Plus className="h-4 w-4 text-primary" />
              Quick Add
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Button type="button" variant="outline" onClick={() => openQuickReminder("water")} className="h-11 justify-start rounded-lg bg-background/50">Water</Button>
            <Button type="button" variant="outline" onClick={() => openQuickReminder("meds")} className="h-11 justify-start rounded-lg bg-background/50">Medication</Button>
            <Button type="button" variant="outline" onClick={() => openQuickReminder("workout")} className="h-11 justify-start rounded-lg bg-background/50">Workout</Button>
            <Button type="button" variant="outline" onClick={() => openQuickReminder("meal")} className="h-11 justify-start rounded-lg bg-background/50">Meal prep</Button>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-3 p-3 sm:p-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Clock3 className="h-4 w-4 text-primary" />
              Next 7 Days
            </div>
            <div className="max-h-48 space-y-2 overflow-y-auto pr-1 sm:max-h-none sm:overflow-visible sm:pr-0">
            {upcomingReminders.length === 0 ? (
              <p className="text-sm text-muted-foreground">No upcoming reminders.</p>
            ) : upcomingReminders.map((item) => (
              <button key={item.id} type="button" onClick={() => openEditReminder(item)} className="flex w-full items-center justify-between gap-3 rounded-lg border border-border/50 bg-background/55 px-3 py-2.5 text-left text-sm hover:bg-muted">
                <span className="min-w-0 truncate">{item.title}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{formatAppDate(item.dueDate)}</span>
              </button>
            ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="hidden gap-3 lg:grid lg:grid-cols-3">
        <Card>
          <CardContent className="space-y-3 p-3 sm:p-4">
            <div className="flex items-center gap-2 text-sm font-semibold"><Flag className="h-4 w-4 text-primary" />Top Priorities Today</div>
            {topPriorityToday.length === 0 ? (
              <p className="text-sm text-muted-foreground">No urgent tasks for today.</p>
            ) : topPriorityToday.map((item) => (
              <button key={item.id} type="button" onClick={() => openEditReminder(item)} className="flex w-full items-center justify-between gap-3 rounded-lg border border-border/50 bg-background/55 px-3 py-2.5 text-left text-sm hover:bg-muted">
                <span className="min-w-0 truncate">{item.title}</span>
                <Badge variant="outline">{item.priority}</Badge>
              </button>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-3 p-3 sm:p-4">
            <div className="flex items-center gap-2 text-sm font-semibold"><Home className="h-4 w-4 text-primary" />Leaving Home</div>
            {leavingHomeTasks.length === 0 ? (
              <p className="text-sm text-muted-foreground">No leaving-home tasks right now.</p>
            ) : leavingHomeTasks.map((item) => (
              <button key={item.id} type="button" onClick={() => openEditReminder(item)} className="flex w-full items-center justify-between gap-3 rounded-lg border border-border/50 bg-background/55 px-3 py-2.5 text-left text-sm hover:bg-muted">
                <span className="min-w-0 truncate">{item.title}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{item.dueDate ? formatAppTime(item.dueDate) : "No time"}</span>
              </button>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-3 p-3 sm:p-4">
            <div className="flex items-center gap-2 text-sm font-semibold"><BriefcaseBusiness className="h-4 w-4 text-primary" />Office Queue</div>
            {officeTasks.length === 0 ? (
              <p className="text-sm text-muted-foreground">No office tasks lined up.</p>
            ) : officeTasks.map((item) => (
              <button key={item.id} type="button" onClick={() => openEditReminder(item)} className="flex w-full items-center justify-between gap-3 rounded-lg border border-border/50 bg-background/55 px-3 py-2.5 text-left text-sm hover:bg-muted">
                <span className="min-w-0 truncate">{item.title}</span>
                <Badge variant="secondary">{item.priority === "none" ? "task" : item.priority}</Badge>
              </button>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2 ios-scroll">
        <SmartButton active={filter === "overdue"} icon={AlertTriangle} label="Overdue" count={smartCounts.overdue} onClick={() => setFilter("overdue")} />
        <SmartButton active={filter === "today"} icon={CalendarDays} label="Today" count={smartCounts.today} onClick={() => setFilter("today")} />
        <SmartButton active={filter === "tonight"} icon={Clock3} label="Tonight" count={smartCounts.tonight} onClick={() => setFilter("tonight")} />
        <SmartButton active={filter === "tomorrow"} icon={CalendarDays} label="Tomorrow" count={smartCounts.tomorrow} onClick={() => setFilter("tomorrow")} />
        <SmartButton active={filter === "office"} icon={BriefcaseBusiness} label="Office" count={smartCounts.office} onClick={() => setFilter("office")} />
        <SmartButton active={filter === "leaving_home"} icon={Home} label="Leaving Home" count={smartCounts.leaving_home} onClick={() => setFilter("leaving_home")} />
        <SmartButton active={filter === "scheduled"} icon={CalendarDays} label="Scheduled" count={smartCounts.scheduled} onClick={() => setFilter("scheduled")} />
        <SmartButton active={filter === "all"} icon={Inbox} label="All" count={smartCounts.all} onClick={() => setFilter("all")} />
        <SmartButton active={filter === "flagged"} icon={Flag} label="Flagged" count={smartCounts.flagged} onClick={() => setFilter("flagged")} />
        <SmartButton active={filter === "completed"} icon={CheckCircle2} label="Completed" count={smartCounts.completed} onClick={() => setFilter("completed")} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
        <Card className="hidden lg:block">
          <CardHeader className="p-4 pb-2"><CardTitle className="flex items-center gap-2 text-base"><ListTodo className="w-4 h-4 text-primary" />Lists</CardTitle></CardHeader>
          <CardContent className="max-h-56 space-y-2 overflow-y-auto p-4 pt-2 lg:max-h-none lg:overflow-visible">
            {lists.map((list) => (
              <button key={list.id} onClick={() => setFilter(list.id)} className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm ${filter === list.id ? "bg-primary/10 text-primary" : "hover:bg-muted"}`}>
                <span className="flex items-center gap-2"><span className="h-3 w-3 rounded-full" style={{ backgroundColor: list.color }} />{list.name}</span>
                <Badge variant="secondary">{list._count?.reminders ?? 0}</Badge>
              </button>
            ))}
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/85 shadow-sm shadow-black/10">
          <CardHeader className="p-4 pb-2 sm:p-6 sm:pb-3">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-lg sm:text-xl">{viewTitle(filter, lists)}</CardTitle>
              <Badge variant="secondary">{filteredReminders.length}</Badge>
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-2 sm:p-6 sm:pt-0">
            {filteredReminders.length === 0 ? (
              <div className="text-center py-12 text-sm text-muted-foreground">No reminders here.</div>
            ) : (
              <div className="max-h-[36rem] space-y-2 overflow-y-auto pr-1 sm:max-h-none sm:overflow-visible sm:pr-0">
                {filteredReminders.map((item) => {
                  const pendingAction = pendingReminderActions[item.id];
                  const isCompleting = pendingAction === "complete";
                  const isSnoozing = pendingAction === "snooze";
                  const isDeleting = pendingAction === "delete";
                  const isBusy = Boolean(pendingAction);
                  return (
                  <div key={item.id} className={`grid grid-cols-[auto_1fr] gap-3 rounded-xl border border-border/60 bg-background/50 p-3 shadow-sm shadow-black/5 transition-opacity sm:grid-cols-[auto_1fr_auto_auto_auto] sm:items-start ${item.completed ? "opacity-60" : ""} ${isBusy ? "opacity-80" : ""}`}>
                    <button
                      type="button"
                      onClick={() => toggleComplete(item)}
                      disabled={isBusy}
                      aria-label={item.completed ? "Reopen reminder" : "Complete reminder"}
                      className="mt-0 flex h-9 w-9 items-center justify-center rounded-full border border-border/70 bg-card/80 text-muted-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-70 sm:mt-1"
                    >
                      {isCompleting ? (
                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      ) : item.completed ? (
                        <CheckCircle2 className="h-5 w-5 text-primary" />
                      ) : (
                        <Circle className="h-5 w-5" />
                      )}
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className={`font-medium ${item.completed ? "line-through" : ""}`}>{item.title}</p>
                        {item.flagged && <Flag className="w-4 h-4 text-orange-500" />}
                        {item.priority !== "none" && <Badge variant="outline">{item.priority}</Badge>}
                        {item.recurrence !== "none" && <Badge variant="outline"><Repeat className="mr-1 h-3 w-3" />{item.recurrence === "custom" ? item.recurrenceCustom || "custom" : item.recurrence}</Badge>}
                        {item.list && <Badge variant="secondary">{item.list.name}</Badge>}
                        {item.contextTag && <Badge variant="secondary">{contextLabel(item.contextTag)}</Badge>}
                        {item.sourceLabel && <Badge variant="outline">from {item.sourceLabel}</Badge>}
                      </div>
                      {item.notes && <p className="mt-1 text-sm text-muted-foreground">{item.notes}</p>}
                      {item.dueDate && <p className="mt-1 text-xs text-muted-foreground">{formatAppDateTime(item.dueDate)}</p>}
                    </div>
                    {!item.completed && (
                      <div className="col-span-2 flex shrink-0 flex-wrap gap-1 sm:col-auto">
                        <Button variant="outline" size="sm" onClick={() => snoozeReminder(item, 15)} loading={isSnoozing} disabled={isBusy}>
                          <Clock3 className="mr-1 h-3 w-3" />15m
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => snoozeReminder(item, 60)} loading={isSnoozing} disabled={isBusy}>
                          <Clock3 className="mr-1 h-3 w-3" />1h
                        </Button>
                      </div>
                    )}
                    <div className="col-span-2 grid grid-cols-2 gap-2 sm:contents">
                      <Button variant="ghost" size="icon" onClick={() => openEditReminder(item)} disabled={isBusy}><Pencil className="w-4 h-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => deleteReminder(item.id)} loading={isDeleting} disabled={isBusy && !isDeleting}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                    </div>
                  </div>
                )})}
                {remindersHasMore && (
                  <Button type="button" variant="outline" className="w-full" onClick={loadMoreReminders} loading={loadingMoreReminders} disabled={loadingMoreReminders}>
                    Load more reminders
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={reminderOpen} onOpenChange={(open) => { if (!savingReminder) setReminderOpen(open); }}>
        <DialogContent className="max-h-[calc(100svh-1rem)] w-[calc(100vw-1rem)] max-w-lg gap-3 overflow-y-auto rounded-2xl border-border/80 bg-card/95 p-3 sm:max-w-lg sm:p-5">
          <DialogHeader className="pr-8 text-left">
            <DialogTitle>{reminderForm.id ? "Edit Reminder" : "New Reminder"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div><Label>Title</Label><Input value={reminderForm.title} onChange={(e) => setReminderForm({ ...reminderForm, title: e.target.value })} className="mt-1" /></div>
            <div><Label>Notes</Label><Textarea value={reminderForm.notes} onChange={(e) => setReminderForm({ ...reminderForm, notes: e.target.value })} className="mt-1 min-h-20" /></div>
            <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 sm:grid-cols-3">
              <div>
                <Label>Date</Label>
                <Input
                  type="date"
                  value={reminderForm.dueDate}
                  onChange={(event) => setReminderForm({ ...reminderForm, dueDate: event.target.value })}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Time</Label>
                <Input
                  type="time"
                  value={reminderForm.dueTime || "09:00"}
                  onChange={(event) => setReminderForm({ ...reminderForm, dueTime: event.target.value })}
                  className="mt-1"
                />
              </div>
              <div className="min-[420px]:col-span-2 sm:col-span-1">
                <Label>Priority</Label>
                <Select value={reminderForm.priority} onValueChange={(value) => setReminderForm({ ...reminderForm, priority: value })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              className="w-full justify-between bg-background/50"
              onClick={() => setShowReminderAdvanced((current) => !current)}
            >
              More options
              <span className="text-xs text-muted-foreground">{showReminderAdvanced ? "Hide" : "Show"}</span>
            </Button>

            {showReminderAdvanced && (
              <div className="space-y-3 rounded-lg border border-border/60 bg-background/45 p-3">
                <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
                  <div>
                    <Label>Repeat</Label>
                    <Select value={reminderForm.recurrence} onValueChange={(value) => setReminderForm({ ...reminderForm, recurrence: value })}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Never</SelectItem>
                        <SelectItem value="daily">Daily</SelectItem>
                        <SelectItem value="weekly">Weekly</SelectItem>
                        <SelectItem value="monthly">Monthly</SelectItem>
                        <SelectItem value="custom">Custom</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {reminderForm.recurrence === "custom" && (
                    <div>
                      <Label>Custom Repeat</Label>
                      <Input value={reminderForm.recurrenceCustom} onChange={(e) => setReminderForm({ ...reminderForm, recurrenceCustom: e.target.value })} className="mt-1" placeholder="Every 2 weeks" />
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
                  <div>
                    <Label>Context</Label>
                    <Select value={reminderForm.contextTag} onValueChange={(value) => setReminderForm({ ...reminderForm, contextTag: value })}>
                      <SelectTrigger className="mt-1"><SelectValue placeholder="Context" /></SelectTrigger>
                      <SelectContent>
                        {contextOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Asked By / Source</Label>
                    <Input
                      value={reminderForm.sourceLabel}
                      onChange={(e) => setReminderForm({ ...reminderForm, sourceLabel: e.target.value })}
                      className="mt-1"
                      placeholder="Dad, friend, self"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
                  <div>
                    <Label>List</Label>
                    <Select value={reminderForm.listId} onValueChange={(value) => setReminderForm({ ...reminderForm, listId: value })}>
                      <SelectTrigger className="mt-1"><SelectValue placeholder="List" /></SelectTrigger>
                      <SelectContent>{lists.map((list) => <SelectItem key={list.id} value={list.id}>{list.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <Button type="button" variant={reminderForm.flagged ? "default" : "outline"} className="self-end" onClick={() => setReminderForm({ ...reminderForm, flagged: !reminderForm.flagged })}>
                    <Flag className="w-4 h-4 mr-2" />Flag
                  </Button>
                </div>
              </div>
            )}

            <div className="sticky bottom-0 -mx-3 -mb-3 border-t border-border/70 bg-card/95 p-3 backdrop-blur sm:-mx-5 sm:-mb-5 sm:p-4">
              <Button
                onClick={saveReminder}
                loading={savingReminder}
                disabled={savingReminder || !reminderForm.title.trim()}
                className="w-full"
              >
                {savingReminder ? "Saving..." : reminderForm.id ? "Update Reminder" : "Add Reminder"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SmartButton({ active, icon: Icon, label, count, onClick }: any) {
  return (
    <button onClick={onClick} className={`min-w-[6.25rem] rounded-xl border p-2.5 text-left shadow-sm shadow-black/5 transition-colors sm:min-w-36 sm:p-4 ${active ? "border-primary/40 bg-primary/10 text-primary" : "border-border/70 bg-card/90 hover:bg-muted"}`}>
      <div className="flex items-center justify-between gap-2">
        <Icon className="h-4 w-4 shrink-0 sm:h-5 sm:w-5" />
        <span className="shrink-0 text-lg font-semibold sm:text-xl">{count}</span>
      </div>
      <p className="mt-2 text-xs font-medium leading-tight sm:text-sm">{label}</p>
    </button>
  );
}

function viewTitle(filter: string, lists: any[]) {
  const smart: Record<string, string> = {
    overdue: "Overdue",
    today: "Today",
    tonight: "Tonight",
    tomorrow: "Tomorrow",
    office: "Office",
    leaving_home: "Leaving Home",
    scheduled: "Scheduled",
    all: "All",
    flagged: "Flagged",
    completed: "Completed",
  };
  return smart[filter] ?? lists.find((list) => list.id === filter)?.name ?? "Reminders";
}
