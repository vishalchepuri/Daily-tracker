"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarDays, CheckCircle2, Circle, Clock3, Flag, Inbox, ListPlus, ListTodo, Pencil, Plus, Repeat, Send, Trash2 } from "lucide-react";
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
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const blankReminder = {
  id: "",
  title: "",
  notes: "",
  dueDate: "",
  dueTime: "",
  recurrence: "none",
  recurrenceCustom: "",
  priority: "none",
  flagged: false,
  listId: "",
};

const listColors = ["#22c55e", "#3b82f6", "#a855f7", "#f97316", "#ef4444", "#06b6d4"];
const hours = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, "0"));
const minutes = ["00", "05", "10", "15", "20", "25", "30", "35", "40", "45", "50", "55"];

function splitDateTime(value?: string | null) {
  if (!value) return { dueDate: "", dueTime: "" };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { dueDate: "", dueTime: "" };
  return {
    dueDate: date.toISOString().slice(0, 10),
    dueTime: `${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`,
  };
}

function buildDueDate(dateValue: string, timeValue: string) {
  if (!dateValue) return "";
  const time = timeValue || "09:00";
  return `${dateValue}T${time}`;
}

function dateInputValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
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
  const [reminderForm, setReminderForm] = useState(blankReminder);
  const [listForm, setListForm] = useState({ name: "", color: "#22c55e" });
  const [telegramForm, setTelegramForm] = useState({ telegramChatId: "", telegramEnabled: false, botConfigured: false });

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
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(todayStart);
    todayEnd.setHours(23, 59, 59, 999);
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);
    const tomorrowEnd = new Date(tomorrowStart);
    tomorrowEnd.setHours(23, 59, 59, 999);
    const now = new Date();
    return {
      all: reminders.filter((item) => !item.completed).length,
      overdue: reminders.filter((item) => !item.completed && item.dueDate && new Date(item.dueDate) < now).length,
      today: reminders.filter((item) => !item.completed && item.dueDate && new Date(item.dueDate) >= todayStart && new Date(item.dueDate) <= todayEnd).length,
      tomorrow: reminders.filter((item) => !item.completed && item.dueDate && new Date(item.dueDate) >= tomorrowStart && new Date(item.dueDate) <= tomorrowEnd).length,
      scheduled: reminders.filter((item) => !item.completed && item.dueDate).length,
      flagged: reminders.filter((item) => !item.completed && item.flagged).length,
      completed: reminders.filter((item) => item.completed).length,
    };
  }, [reminders]);

  const filteredReminders = useMemo(() => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(todayStart);
    todayEnd.setHours(23, 59, 59, 999);
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);
    const tomorrowEnd = new Date(tomorrowStart);
    tomorrowEnd.setHours(23, 59, 59, 999);
    const now = new Date();
    return reminders.filter((item) => {
      if (filter === "all") return !item.completed;
      if (filter === "overdue") return !item.completed && item.dueDate && new Date(item.dueDate) < now;
      if (filter === "today") return !item.completed && item.dueDate && new Date(item.dueDate) >= todayStart && new Date(item.dueDate) <= todayEnd;
      if (filter === "tomorrow") return !item.completed && item.dueDate && new Date(item.dueDate) >= tomorrowStart && new Date(item.dueDate) <= tomorrowEnd;
      if (filter === "scheduled") return !item.completed && item.dueDate;
      if (filter === "flagged") return !item.completed && item.flagged;
      if (filter === "completed") return item.completed;
      return item.listId === filter && !item.completed;
    });
  }, [filter, reminders]);

  const openAddReminder = () => {
    setReminderForm({ ...blankReminder, listId: lists[0]?.id ?? "" });
    setReminderOpen(true);
  };

  const openQuickReminder = (preset: "water" | "meds" | "workout" | "meal") => {
    const today = new Date();
    const tomorrow = addDays(today, 1);
    const presets = {
      water: { title: "Drink water", notes: "Hydration check", dueDate: dateInputValue(today), dueTime: "18:00", recurrence: "daily", priority: "medium" },
      meds: { title: "Take medication", notes: "Confirm dose in Medications", dueDate: dateInputValue(today), dueTime: "21:00", recurrence: "daily", priority: "high" },
      workout: { title: "Workout session", notes: "Warm up first, then follow today's plan", dueDate: dateInputValue(tomorrow), dueTime: "07:00", recurrence: "none", priority: "medium" },
      meal: { title: "Meal prep", notes: "Prepare next planned meal", dueDate: dateInputValue(today), dueTime: "20:00", recurrence: "none", priority: "low" },
    } as const;
    setReminderForm({ ...blankReminder, ...presets[preset], listId: lists[0]?.id ?? "" });
    setReminderOpen(true);
  };

  const openEditReminder = (item: any) => {
    const due = splitDateTime(item.dueDate);
    setReminderForm({
      id: item.id,
      title: item.title ?? "",
      notes: item.notes ?? "",
      dueDate: due.dueDate,
      dueTime: due.dueTime,
      recurrence: item.recurrence ?? "none",
      recurrenceCustom: item.recurrenceCustom ?? "",
      priority: item.priority ?? "none",
      flagged: Boolean(item.flagged),
      listId: item.listId ?? "",
    });
    setReminderOpen(true);
  };

  const saveReminder = async () => {
    if (!reminderForm.title.trim()) {
      toast.error("Reminder title is required");
      return;
    }
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
    }
  };

  const toggleComplete = async (item: any) => {
    await fetch("/api/reminders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: item.id, completed: !item.completed }),
    });
    loadData();
  };

  const snoozeReminder = async (item: any, minutesToAdd: number) => {
    const nextDue = new Date();
    nextDue.setMinutes(nextDue.getMinutes() + minutesToAdd);
    await fetch("/api/reminders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: item.id, dueDate: nextDue.toISOString(), completed: false }),
    });
    toast.success(`Snoozed for ${minutesToAdd >= 60 ? `${minutesToAdd / 60}h` : `${minutesToAdd}m`}`);
    loadData();
  };

  const deleteReminder = async (id: string) => {
    await fetch(`/api/reminders?id=${id}`, { method: "DELETE" });
    toast.success("Reminder deleted");
    loadData();
  };

  const saveList = async () => {
    if (!listForm.name.trim()) {
      toast.error("List name is required");
      return;
    }
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

  return (
    <div className="space-y-5 sm:space-y-6">
      <FadeIn>
        <div className="grid gap-3 sm:flex sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h2 className="font-display text-2xl font-bold leading-tight tracking-tight">Reminders</h2>
            <p className="mt-1 max-w-[20rem] text-sm text-muted-foreground sm:max-w-none">Local lists, smart views, due dates, flags, and priorities</p>
          </div>
          <div className="grid grid-cols-2 gap-2 min-[390px]:grid-cols-3 sm:flex">
            <Dialog open={listOpen} onOpenChange={setListOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="w-full px-3 sm:w-auto sm:px-4"><ListPlus className="w-4 h-4 sm:mr-2" /><span className="hidden sm:inline">New </span>List</Button>
              </DialogTrigger>
              <DialogContent className="max-w-sm">
                <DialogHeader><DialogTitle>New List</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <div><Label>Name</Label><Input value={listForm.name} onChange={(e) => setListForm({ ...listForm, name: e.target.value })} className="mt-1" /></div>
                  <div className="flex gap-2">
                    {listColors.map((color) => (
                      <button key={color} type="button" onClick={() => setListForm({ ...listForm, color })} className="h-8 w-8 rounded-full border-2" style={{ backgroundColor: color, borderColor: listForm.color === color ? "white" : "transparent" }} />
                    ))}
                  </div>
                  <Button onClick={saveList} className="w-full">Create List</Button>
                </div>
              </DialogContent>
            </Dialog>
            <Dialog open={telegramOpen} onOpenChange={setTelegramOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="w-full px-3 sm:w-auto sm:px-4"><Send className="w-4 h-4 sm:mr-2" />Telegram</Button>
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
            <Button onClick={openAddReminder} className="col-span-2 w-full px-3 min-[390px]:col-span-1 sm:w-auto sm:px-4"><Plus className="w-4 h-4 sm:mr-2" /><span className="hidden min-[390px]:inline sm:hidden">New</span><span className="min-[390px]:hidden sm:inline">New Reminder</span></Button>
          </div>
        </div>
      </FadeIn>

      <div className="grid gap-3 md:grid-cols-[1fr_22rem]">
        <Card>
          <CardContent className="space-y-3 p-3 sm:p-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Plus className="h-4 w-4 text-primary" />
              Quick Add
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Button type="button" variant="outline" onClick={() => openQuickReminder("water")} className="justify-start">Water</Button>
            <Button type="button" variant="outline" onClick={() => openQuickReminder("meds")} className="justify-start">Medication</Button>
            <Button type="button" variant="outline" onClick={() => openQuickReminder("workout")} className="justify-start">Workout</Button>
            <Button type="button" variant="outline" onClick={() => openQuickReminder("meal")} className="justify-start">Meal prep</Button>
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
              <button key={item.id} type="button" onClick={() => openEditReminder(item)} className="flex w-full items-center justify-between gap-3 rounded-md bg-muted/35 px-3 py-2 text-left text-sm hover:bg-muted">
                <span className="min-w-0 truncate">{item.title}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{new Date(item.dueDate).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
              </button>
            ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 ios-scroll">
        <SmartButton active={filter === "overdue"} icon={AlertTriangle} label="Overdue" count={smartCounts.overdue} onClick={() => setFilter("overdue")} />
        <SmartButton active={filter === "today"} icon={CalendarDays} label="Today" count={smartCounts.today} onClick={() => setFilter("today")} />
        <SmartButton active={filter === "tomorrow"} icon={CalendarDays} label="Tomorrow" count={smartCounts.tomorrow} onClick={() => setFilter("tomorrow")} />
        <SmartButton active={filter === "scheduled"} icon={CalendarDays} label="Scheduled" count={smartCounts.scheduled} onClick={() => setFilter("scheduled")} />
        <SmartButton active={filter === "all"} icon={Inbox} label="All" count={smartCounts.all} onClick={() => setFilter("all")} />
        <SmartButton active={filter === "flagged"} icon={Flag} label="Flagged" count={smartCounts.flagged} onClick={() => setFilter("flagged")} />
        <SmartButton active={filter === "completed"} icon={CheckCircle2} label="Completed" count={smartCounts.completed} onClick={() => setFilter("completed")} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
        <Card>
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

        <Card>
          <CardHeader><CardTitle>{viewTitle(filter, lists)}</CardTitle></CardHeader>
          <CardContent>
            {filteredReminders.length === 0 ? (
              <div className="text-center py-12 text-sm text-muted-foreground">No reminders here.</div>
            ) : (
              <div className="max-h-[36rem] space-y-2 overflow-y-auto pr-1 sm:max-h-none sm:overflow-visible sm:pr-0">
                {filteredReminders.map((item) => (
                  <div key={item.id} className={`grid gap-3 rounded-lg bg-muted/40 p-3 sm:grid-cols-[auto_1fr_auto_auto_auto] sm:items-start ${item.completed ? "opacity-60" : ""}`}>
                    <button onClick={() => toggleComplete(item)} className="mt-1 justify-self-start">
                      {item.completed ? <CheckCircle2 className="w-5 h-5 text-primary" /> : <Circle className="w-5 h-5 text-muted-foreground" />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className={`font-medium ${item.completed ? "line-through" : ""}`}>{item.title}</p>
                        {item.flagged && <Flag className="w-4 h-4 text-orange-500" />}
                        {item.priority !== "none" && <Badge variant="outline">{item.priority}</Badge>}
                        {item.recurrence !== "none" && <Badge variant="outline"><Repeat className="mr-1 h-3 w-3" />{item.recurrence === "custom" ? item.recurrenceCustom || "custom" : item.recurrence}</Badge>}
                        {item.list && <Badge variant="secondary">{item.list.name}</Badge>}
                      </div>
                      {item.notes && <p className="mt-1 text-sm text-muted-foreground">{item.notes}</p>}
                      {item.dueDate && <p className="mt-1 text-xs text-muted-foreground">{new Date(item.dueDate).toLocaleString()}</p>}
                    </div>
                    {!item.completed && (
                      <div className="flex shrink-0 flex-wrap gap-1">
                        <Button variant="outline" size="sm" onClick={() => snoozeReminder(item, 15)}>
                          <Clock3 className="mr-1 h-3 w-3" />15m
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => snoozeReminder(item, 60)}>
                          <Clock3 className="mr-1 h-3 w-3" />1h
                        </Button>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-2 sm:contents">
                      <Button variant="ghost" size="icon" onClick={() => openEditReminder(item)}><Pencil className="w-4 h-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => deleteReminder(item.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                    </div>
                  </div>
                ))}
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

      <Dialog open={reminderOpen} onOpenChange={setReminderOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{reminderForm.id ? "Edit Reminder" : "New Reminder"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Title</Label><Input value={reminderForm.title} onChange={(e) => setReminderForm({ ...reminderForm, title: e.target.value })} className="mt-1" /></div>
            <div><Label>Notes</Label><Textarea value={reminderForm.notes} onChange={(e) => setReminderForm({ ...reminderForm, notes: e.target.value })} className="mt-1" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button type="button" variant="outline" className="mt-1 w-full justify-start">
                      <CalendarDays className="mr-2 h-4 w-4" />
                      {reminderForm.dueDate ? new Date(`${reminderForm.dueDate}T00:00:00`).toLocaleDateString() : "Pick date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={reminderForm.dueDate ? new Date(`${reminderForm.dueDate}T00:00:00`) : undefined}
                      onSelect={(date) => setReminderForm({ ...reminderForm, dueDate: date ? date.toISOString().slice(0, 10) : "" })}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div>
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
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Hour</Label>
                <Select value={(reminderForm.dueTime || "09:00").split(":")[0]} onValueChange={(value) => setReminderForm({ ...reminderForm, dueTime: `${value}:${(reminderForm.dueTime || "09:00").split(":")[1]}` })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{hours.map((hour) => <SelectItem key={hour} value={hour}>{hour}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Minute</Label>
                <Select value={(reminderForm.dueTime || "09:00").split(":")[1]} onValueChange={(value) => setReminderForm({ ...reminderForm, dueTime: `${(reminderForm.dueTime || "09:00").split(":")[0]}:${value}` })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{minutes.map((minute) => <SelectItem key={minute} value={minute}>{minute}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
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
            <div className="grid grid-cols-2 gap-3">
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
            <Button onClick={saveReminder} className="w-full">{reminderForm.id ? "Update Reminder" : "Add Reminder"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SmartButton({ active, icon: Icon, label, count, onClick }: any) {
  return (
    <button onClick={onClick} className={`min-w-[5.75rem] rounded-lg border border-border p-3 text-left transition-colors sm:min-w-36 sm:p-4 ${active ? "bg-primary/10 text-primary" : "bg-card hover:bg-muted"}`}>
      <div className="flex items-center justify-between gap-2">
        <Icon className="h-5 w-5 shrink-0" />
        <span className="shrink-0 text-xl font-semibold">{count}</span>
      </div>
      <p className="mt-2 text-sm font-medium leading-tight">{label}</p>
    </button>
  );
}

function viewTitle(filter: string, lists: any[]) {
  const smart: Record<string, string> = { overdue: "Overdue", today: "Today", tomorrow: "Tomorrow", scheduled: "Scheduled", all: "All", flagged: "Flagged", completed: "Completed" };
  return smart[filter] ?? lists.find((list) => list.id === filter)?.name ?? "Reminders";
}
