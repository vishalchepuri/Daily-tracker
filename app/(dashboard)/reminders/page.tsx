"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, CheckCircle2, Circle, Flag, Inbox, ListPlus, ListTodo, Pencil, Plus, Repeat, Send, Trash2 } from "lucide-react";
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

export default function RemindersPage() {
  const [reminders, setReminders] = useState<any[]>([]);
  const [lists, setLists] = useState<any[]>([]);
  const [filter, setFilter] = useState("today");
  const [loading, setLoading] = useState(true);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [telegramOpen, setTelegramOpen] = useState(false);
  const [reminderForm, setReminderForm] = useState(blankReminder);
  const [listForm, setListForm] = useState({ name: "", color: "#22c55e" });
  const [telegramForm, setTelegramForm] = useState({ telegramChatId: "", telegramEnabled: false, botConfigured: false });

  const loadData = async () => {
    try {
      const [reminderRes, listRes, telegramRes] = await Promise.all([
        fetch("/api/reminders"),
        fetch("/api/reminder-lists"),
        fetch("/api/telegram-settings"),
      ]);
      const reminderData = await reminderRes.json();
      const listData = await listRes.json();
      const telegramData = await telegramRes.json();
      setReminders(reminderData?.reminders ?? []);
      setLists(listData?.lists ?? []);
      setTelegramForm({
        telegramChatId: telegramData?.telegramChatId ?? "",
        telegramEnabled: Boolean(telegramData?.telegramEnabled),
        botConfigured: Boolean(telegramData?.botConfigured),
      });
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const smartCounts = useMemo(() => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(todayStart);
    todayEnd.setHours(23, 59, 59, 999);
    return {
      all: reminders.filter((item) => !item.completed).length,
      today: reminders.filter((item) => !item.completed && item.dueDate && new Date(item.dueDate) >= todayStart && new Date(item.dueDate) <= todayEnd).length,
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
    return reminders.filter((item) => {
      if (filter === "all") return !item.completed;
      if (filter === "today") return !item.completed && item.dueDate && new Date(item.dueDate) >= todayStart && new Date(item.dueDate) <= todayEnd;
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

  if (loading) return <div className="space-y-4">{[1,2,3].map((i) => <div key={i} className="h-28 bg-muted animate-pulse rounded-lg" />)}</div>;

  return (
    <div className="space-y-6">
      <FadeIn>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-display font-bold tracking-tight">Reminders</h2>
            <p className="text-muted-foreground text-sm mt-1">Apple Reminders-style local lists, smart views, due dates, flags, and priorities</p>
          </div>
          <div className="flex gap-2">
            <Dialog open={listOpen} onOpenChange={setListOpen}>
              <DialogTrigger asChild>
                <Button variant="outline"><ListPlus className="w-4 h-4 mr-2" />New List</Button>
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
                <Button variant="outline"><Send className="w-4 h-4 mr-2" />Telegram</Button>
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
            <Button onClick={openAddReminder}><Plus className="w-4 h-4 mr-2" />New Reminder</Button>
          </div>
        </div>
      </FadeIn>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <SmartButton active={filter === "today"} icon={CalendarDays} label="Today" count={smartCounts.today} onClick={() => setFilter("today")} />
        <SmartButton active={filter === "scheduled"} icon={CalendarDays} label="Scheduled" count={smartCounts.scheduled} onClick={() => setFilter("scheduled")} />
        <SmartButton active={filter === "all"} icon={Inbox} label="All" count={smartCounts.all} onClick={() => setFilter("all")} />
        <SmartButton active={filter === "flagged"} icon={Flag} label="Flagged" count={smartCounts.flagged} onClick={() => setFilter("flagged")} />
        <SmartButton active={filter === "completed"} icon={CheckCircle2} label="Completed" count={smartCounts.completed} onClick={() => setFilter("completed")} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><ListTodo className="w-5 h-5 text-primary" />Lists</CardTitle></CardHeader>
          <CardContent className="space-y-2">
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
              <div className="space-y-2">
                {filteredReminders.map((item) => (
                  <div key={item.id} className={`flex items-start gap-3 rounded-lg bg-muted/40 p-3 ${item.completed ? "opacity-60" : ""}`}>
                    <button onClick={() => toggleComplete(item)} className="mt-1">
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
                    <Button variant="ghost" size="icon" onClick={() => openEditReminder(item)}><Pencil className="w-4 h-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => deleteReminder(item.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                  </div>
                ))}
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
    <button onClick={onClick} className={`rounded-lg border border-border p-4 text-left transition-colors ${active ? "bg-primary/10 text-primary" : "bg-card hover:bg-muted"}`}>
      <div className="flex items-center justify-between">
        <Icon className="w-5 h-5" />
        <span className="text-xl font-semibold">{count}</span>
      </div>
      <p className="mt-2 text-sm font-medium">{label}</p>
    </button>
  );
}

function viewTitle(filter: string, lists: any[]) {
  const smart: Record<string, string> = { today: "Today", scheduled: "Scheduled", all: "All", flagged: "Flagged", completed: "Completed" };
  return smart[filter] ?? lists.find((list) => list.id === filter)?.name ?? "Reminders";
}
