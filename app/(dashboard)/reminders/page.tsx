"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Circle,
  Clock3,
  Flag,
  Inbox,
  ListPlus,
  ListTodo,
  Loader2,
  Pencil,
  Plus,
  Repeat,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { FadeIn } from "@/components/ui/animate";
import { dateTimeInputToIso, formatAppDateTime, formatLocalDateInput, getZonedDateParts } from "@/lib/local-dates";

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
  { value: "shopping", label: "Shopping" },
  { value: "billing", label: "Bills" },
  { value: "bring", label: "Bring" },
  { value: "follow_up", label: "Follow Up" },
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

function addDaysToDateKey(dateKey: string, days: number) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function appDayRange(dateKey = formatLocalDateInput(new Date())) {
  return {
    dateKey,
    start: new Date(dateTimeInputToIso(dateKey, "00:00")),
    end: new Date(dateTimeInputToIso(dateKey, "23:59")),
  };
}

function contextLabel(value?: string | null) {
  return contextOptions.find((item) => item.value === value)?.label || "General";
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
  const [savingReminder, setSavingReminder] = useState(false);
  const [savingList, setSavingList] = useState(false);
  const [showReminderAdvanced, setShowReminderAdvanced] = useState(false);
  const [pendingReminderActions, setPendingReminderActions] = useState<Record<string, "complete" | "snooze" | "delete">>({});
  const [expandedReminderIds, setExpandedReminderIds] = useState<Record<string, boolean>>({});
  const [reminderForm, setReminderForm] = useState(blankReminder);
  const [listForm, setListForm] = useState({ name: "", color: "#22c55e" });
  const saveReminderLock = useRef(false);
  const saveListLock = useRef(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [reminderRes, listRes] = await Promise.all([
        fetch("/api/reminders?offset=0&limit=30"),
        fetch("/api/reminder-lists"),
      ]);

      if (reminderRes.ok) {
        const data = await reminderRes.json();
        setReminders(data?.reminders ?? []);
        setRemindersNextOffset(data?.nextOffset ?? (data?.reminders ?? []).length);
        setRemindersHasMore(Boolean(data?.hasMore));
      }

      if (listRes.ok) {
        const data = await listRes.json();
        setLists(data?.lists ?? []);
      }
    } catch (error) {
      console.error(error);
      toast.error("Failed to load reminders");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
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
    const now = new Date();
    return {
      all: reminders.filter((item) => !item.completed).length,
      overdue: reminders.filter((item) => !item.completed && item.dueDate && new Date(item.dueDate) < now).length,
      today: reminders.filter((item) => !item.completed && item.dueDate && new Date(item.dueDate) >= today.start && new Date(item.dueDate) <= today.end).length,
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
      if (filter === "scheduled") return !item.completed && item.dueDate;
      if (filter === "flagged") return !item.completed && item.flagged;
      if (filter === "completed") return item.completed;
      if (filter === "tomorrow") return !item.completed && item.dueDate && new Date(item.dueDate) >= tomorrow.start && new Date(item.dueDate) <= tomorrow.end;
      return item.listId === filter && !item.completed;
    });
    return sortRemindersByImportance(nextItems);
  }, [filter, reminders]);

  const openAddReminder = () => {
    setReminderForm({ ...blankReminder, listId: lists[0]?.id ?? "" });
    setShowReminderAdvanced(false);
    setReminderOpen(true);
  };

  const openEditReminder = (item: any) => {
    const due = splitDateTime(item.dueDate);
    setReminderForm({
      id: item.id,
      title: item.title ?? "",
      notes: item.notes ?? "",
      contextTag: contextOptions.some((option) => option.value === item.contextTag) ? item.contextTag : "general",
      sourceLabel: item.sourceLabel ?? "",
      dueDate: due.dueDate,
      dueTime: due.dueTime,
      recurrence: item.recurrence ?? "none",
      recurrenceCustom: item.recurrenceCustom ?? "",
      priority: item.priority ?? "none",
      flagged: Boolean(item.flagged),
      listId: item.listId ?? "",
    });
    setShowReminderAdvanced(Boolean(item.notes || item.recurrence !== "none" || item.sourceLabel || item.listId));
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
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
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
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.error ?? "Failed to add list");
        return;
      }
      toast.success("List added");
      setListOpen(false);
      setListForm({ name: "", color: "#22c55e" });
      loadData();
    } catch {
      toast.error("Failed to add list");
    } finally {
      saveListLock.current = false;
      setSavingList(false);
    }
  };

  const smartViewItems = [
    { key: "today", label: "Today", count: smartCounts.today, icon: CalendarDays, color: "text-blue-300", tile: "bg-blue-500/12 border-blue-500/20" },
    { key: "scheduled", label: "Scheduled", count: smartCounts.scheduled, icon: CalendarDays, color: "text-rose-300", tile: "bg-rose-500/12 border-rose-500/20" },
    { key: "all", label: "All", count: smartCounts.all, icon: Inbox, color: "text-slate-200", tile: "bg-slate-500/12 border-slate-500/20" },
    { key: "flagged", label: "Flagged", count: smartCounts.flagged, icon: Flag, color: "text-orange-300", tile: "bg-orange-500/12 border-orange-500/20" },
    { key: "overdue", label: "Overdue", count: smartCounts.overdue, icon: AlertTriangle, color: "text-red-300", tile: "bg-red-500/12 border-red-500/20" },
    { key: "completed", label: "Completed", count: smartCounts.completed, icon: CheckCircle2, color: "text-emerald-300", tile: "bg-emerald-500/12 border-emerald-500/20" },
  ];

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 overflow-x-hidden pb-6 sm:space-y-6">
      <FadeIn>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-primary/80">Dayza</p>
            <h2 className="mt-1 text-3xl font-bold leading-none tracking-tight sm:text-4xl">Reminders</h2>
          </div>
          <Button onClick={openAddReminder} className="h-12 rounded-2xl px-4 text-base shadow-lg shadow-primary/20 active:scale-95 sm:h-11 sm:text-sm">
            <Plus className="h-5 w-5" />
            New
          </Button>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {smartViewItems.map((item) => (
            <SmartTile
              key={item.key}
              active={filter === item.key}
              icon={item.icon}
              label={item.label}
              count={item.count}
              color={item.color}
              tile={item.tile}
              onClick={() => setFilter(item.key)}
            />
          ))}
        </div>
      </FadeIn>

      <div className="grid gap-5 lg:grid-cols-[17rem_1fr]">
        <FadeIn delay={0.06}>
          <section className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <h3 className="text-sm font-semibold text-muted-foreground">My Lists</h3>
              <Dialog open={listOpen} onOpenChange={setListOpen}>
                <DialogTrigger asChild>
                  <button
                    type="button"
                    className="rounded-full px-2 py-1 text-sm font-semibold text-primary transition active:scale-95 active:bg-primary/10"
                  >
                    Add List
                  </button>
                </DialogTrigger>
                <DialogContent className="rounded-t-[28px] sm:max-w-sm">
                  <DialogHeader><DialogTitle>New List</DialogTitle></DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label>Name</Label>
                      <Input value={listForm.name} onChange={(e) => setListForm({ ...listForm, name: e.target.value })} className="mt-1 h-12 rounded-2xl text-base" />
                    </div>
                    <div className="flex gap-2">
                      {listColors.map((color) => (
                        <button key={color} type="button" onClick={() => setListForm({ ...listForm, color })} className="h-9 w-9 rounded-full border-2 active:scale-90" style={{ backgroundColor: color, borderColor: listForm.color === color ? "white" : "transparent" }} />
                      ))}
                    </div>
                    <Button onClick={saveList} loading={savingList} disabled={savingList || !listForm.name.trim()} className="h-12 w-full rounded-2xl">
                      {savingList ? "Creating..." : "Create List"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
            <div className="overflow-hidden rounded-[24px] border border-border/70 bg-card/85 shadow-sm shadow-black/10">
              {lists.length === 0 ? (
                <button
                  type="button"
                  onClick={() => setListOpen(true)}
                  className="flex min-h-14 w-full items-center justify-between px-4 py-3 text-left transition active:scale-[0.99] active:bg-muted"
                >
                  <span className="font-semibold">Create your first list</span>
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </button>
              ) : (
                <div className="divide-y divide-border/55">
                  {lists.map((list) => (
                    <button
                      key={list.id}
                      type="button"
                      onClick={() => setFilter(list.id)}
                      className={`flex min-h-14 w-full touch-manipulation items-center justify-between gap-3 px-4 py-3 text-left transition active:scale-[0.99] active:bg-muted ${filter === list.id ? "bg-primary/10 text-primary" : "hover:bg-muted/60"}`}
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        <span className="h-3.5 w-3.5 shrink-0 rounded-full shadow-sm" style={{ backgroundColor: list.color }} />
                        <span className="truncate font-semibold">{list.name}</span>
                      </span>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                        {list._count?.reminders ?? 0}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </section>
        </FadeIn>

        <FadeIn delay={0.1}>
          <section className="overflow-hidden rounded-[26px] border border-border/70 bg-card/90 shadow-sm shadow-black/10">
            <div className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-4 sm:px-5">
              <div className="min-w-0">
                <h3 className="truncate text-xl font-bold tracking-tight">{viewTitle(filter, lists)}</h3>
                <p className="mt-0.5 text-sm text-muted-foreground">{filteredReminders.length} item{filteredReminders.length === 1 ? "" : "s"}</p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={openAddReminder} className="rounded-full active:scale-95">
                <Plus className="h-4 w-4" />
                Add
              </Button>
            </div>
            <div className="p-2 sm:p-3">
              {loading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((item) => <div key={item} className="h-16 animate-pulse rounded-[22px] bg-muted/50" />)}
                </div>
              ) : filteredReminders.length === 0 ? (
                <div className="rounded-[22px] border border-dashed border-border/70 bg-background/40 px-6 py-14 text-center">
                  <ListTodo className="mx-auto h-10 w-10 text-muted-foreground/40" />
                  <p className="mt-3 font-semibold">No reminders here</p>
                  <p className="mt-1 text-sm text-muted-foreground">Tap Add to create one.</p>
                </div>
              ) : (
                <div className="divide-y divide-border/55 overflow-hidden rounded-[22px] bg-background/45">
                  {filteredReminders.map((item) => {
                    const pendingAction = pendingReminderActions[item.id];
                    const isCompleting = pendingAction === "complete";
                    const isSnoozing = pendingAction === "snooze";
                    const isDeleting = pendingAction === "delete";
                    const isBusy = Boolean(pendingAction);
                    const isExpanded = Boolean(expandedReminderIds[item.id]);
                    const isOverdue = !item.completed && item.dueDate && new Date(item.dueDate).getTime() < Date.now();
                    return (
                      <div key={item.id} className={`transition ${isOverdue ? "bg-destructive/10" : "bg-transparent"} ${item.completed ? "opacity-60" : ""} ${isBusy ? "opacity-80" : ""}`}>
                        <div className="grid grid-cols-[3rem_1fr] items-stretch">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              toggleComplete(item);
                            }}
                            disabled={isBusy}
                            aria-label={item.completed ? "Reopen reminder" : "Complete reminder"}
                            className={`flex min-h-[4.25rem] w-12 touch-manipulation items-center justify-center transition active:scale-90 disabled:cursor-not-allowed disabled:opacity-70 ${isOverdue ? "text-destructive" : "text-muted-foreground"}`}
                          >
                            {isCompleting ? (
                              <Loader2 className="h-4 w-4 animate-spin text-primary" />
                            ) : item.completed ? (
                              <CheckCircle2 className="h-5 w-5 text-primary" />
                            ) : (
                              <Circle className="h-5 w-5" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => setExpandedReminderIds((current) => ({ ...current, [item.id]: !current[item.id] }))}
                            className="grid min-h-[4.25rem] w-full touch-manipulation grid-cols-[1fr_auto] items-center gap-3 py-3 pr-3 text-left transition active:scale-[0.995] active:bg-muted/80"
                            aria-label={isExpanded ? "Hide reminder details" : "Show reminder details"}
                          >
                            <span className="min-w-0">
                              <span className={`block truncate text-[1rem] font-semibold leading-tight ${isOverdue ? "text-destructive" : ""} ${item.completed ? "line-through" : ""}`}>{item.title}</span>
                              {item.dueDate && (
                                <span className={`mt-1 block text-xs ${isOverdue ? "text-destructive/90" : "text-muted-foreground"}`}>
                                  {isOverdue ? "Overdue - " : ""}{formatAppDateTime(item.dueDate)}
                                </span>
                              )}
                            </span>
                            <ChevronRight className={`h-5 w-5 text-muted-foreground transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                          </button>
                        </div>
                        {isExpanded && (
                          <div className="space-y-3 px-4 pb-4 pl-12">
                            <div className="flex flex-wrap items-center gap-2">
                              {item.flagged && <Badge variant="outline" className="border-orange-500/40 text-orange-400"><Flag className="mr-1 h-3 w-3" />Flagged</Badge>}
                              {item.priority !== "none" && <Badge variant={isOverdue ? "destructive" : "outline"}>{item.priority}</Badge>}
                              {item.recurrence !== "none" && <Badge variant="outline"><Repeat className="mr-1 h-3 w-3" />{item.recurrence === "custom" ? item.recurrenceCustom || "custom" : item.recurrence}</Badge>}
                              {item.list && <Badge variant="secondary">{item.list.name}</Badge>}
                              {item.contextTag && <Badge variant="secondary">{contextLabel(item.contextTag)}</Badge>}
                              {item.sourceLabel && <Badge variant="outline">from {item.sourceLabel}</Badge>}
                            </div>
                            {item.notes && <p className="text-sm text-muted-foreground">{item.notes}</p>}
                            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                              {!item.completed && (
                                <>
                                  <Button variant="outline" size="sm" onClick={() => snoozeReminder(item, 15)} loading={isSnoozing} disabled={isBusy} className="rounded-full active:scale-95">
                                    <Clock3 className="mr-1 h-3 w-3" />15m
                                  </Button>
                                  <Button variant="outline" size="sm" onClick={() => snoozeReminder(item, 60)} loading={isSnoozing} disabled={isBusy} className="rounded-full active:scale-95">
                                    <Clock3 className="mr-1 h-3 w-3" />1h
                                  </Button>
                                </>
                              )}
                              <Button variant="outline" size="sm" onClick={() => openEditReminder(item)} disabled={isBusy} className="rounded-full active:scale-95"><Pencil className="mr-1 h-3 w-3" />Edit</Button>
                              <Button variant="outline" size="sm" onClick={() => deleteReminder(item.id)} loading={isDeleting} disabled={isBusy && !isDeleting} className="rounded-full border-destructive/40 text-destructive hover:bg-destructive/10 active:scale-95"><Trash2 className="mr-1 h-3 w-3" />Delete</Button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {remindersHasMore && (
                    <div className="p-3">
                      <Button type="button" variant="outline" className="w-full rounded-2xl" onClick={loadMoreReminders} loading={loadingMoreReminders} disabled={loadingMoreReminders}>
                        Load more reminders
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>
        </FadeIn>
      </div>

      <Dialog open={reminderOpen} onOpenChange={(open) => { if (!savingReminder) setReminderOpen(open); }}>
        <DialogContent className="inset-x-0 bottom-0 max-h-[92svh] max-w-none gap-0 rounded-b-none rounded-t-[28px] border-border/80 bg-card/95 p-0 shadow-2xl sm:max-w-lg sm:rounded-2xl sm:p-0">
          <div className="sticky top-0 z-10 border-b border-border/70 bg-card/95 px-4 pb-3 pt-3 backdrop-blur sm:px-5">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-muted-foreground/30 sm:hidden" />
            <DialogHeader className="pr-8 text-left">
              <DialogTitle className="text-xl">{reminderForm.id ? "Edit Reminder" : "New Reminder"}</DialogTitle>
            </DialogHeader>
          </div>

          <div className="space-y-4 px-4 py-4 sm:px-5">
            <div className="overflow-hidden rounded-[22px] border border-border/70 bg-background/55">
              <Input
                value={reminderForm.title}
                onChange={(e) => setReminderForm({ ...reminderForm, title: e.target.value })}
                className="h-14 border-0 bg-transparent px-4 text-base font-semibold shadow-none focus-visible:ring-0"
                placeholder="Reminder title"
              />
            </div>

            <div className="rounded-[22px] border border-border/70 bg-background/55 p-3">
              <Label className="text-xs font-semibold text-muted-foreground">Date & Time</Label>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Input
                  type="date"
                  value={reminderForm.dueDate}
                  onChange={(event) => setReminderForm({ ...reminderForm, dueDate: event.target.value })}
                  className="h-12 rounded-2xl bg-card/80 text-base"
                />
                <Input
                  type="time"
                  value={reminderForm.dueTime || "09:00"}
                  onChange={(event) => setReminderForm({ ...reminderForm, dueTime: event.target.value })}
                  className="h-12 rounded-2xl bg-card/80 text-base"
                />
              </div>
            </div>

            <PriorityPicker value={reminderForm.priority} onChange={(priority) => setReminderForm({ ...reminderForm, priority })} />

            <button
              type="button"
              onClick={() => setShowReminderAdvanced((current) => !current)}
              className="flex min-h-12 w-full touch-manipulation items-center justify-between rounded-[22px] border border-border/70 bg-background/55 px-4 text-left transition active:scale-[0.99] active:bg-muted"
            >
              <span className="font-semibold">Details</span>
              <ChevronRight className={`h-5 w-5 text-muted-foreground transition-transform ${showReminderAdvanced ? "rotate-90" : ""}`} />
            </button>

            {showReminderAdvanced && (
              <div className="space-y-3 rounded-[22px] border border-border/70 bg-background/45 p-3">
                <Textarea
                  value={reminderForm.notes}
                  onChange={(e) => setReminderForm({ ...reminderForm, notes: e.target.value })}
                  className="min-h-20 rounded-2xl bg-card/80 text-base"
                  placeholder="Notes"
                />
                <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
                  <div>
                    <Label>Repeat</Label>
                    <Select value={reminderForm.recurrence} onValueChange={(value) => setReminderForm({ ...reminderForm, recurrence: value })}>
                      <SelectTrigger className="mt-1 h-12 rounded-2xl bg-card/80"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Never</SelectItem>
                        <SelectItem value="daily">Daily</SelectItem>
                        <SelectItem value="weekly">Weekly</SelectItem>
                        <SelectItem value="monthly">Monthly</SelectItem>
                        <SelectItem value="custom">Custom</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>List</Label>
                    <Select value={reminderForm.listId || "none"} onValueChange={(value) => setReminderForm({ ...reminderForm, listId: value === "none" ? "" : value })}>
                      <SelectTrigger className="mt-1 h-12 rounded-2xl bg-card/80"><SelectValue placeholder="List" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No List</SelectItem>
                        {lists.map((list) => <SelectItem key={list.id} value={list.id}>{list.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {reminderForm.recurrence === "custom" && (
                  <Input value={reminderForm.recurrenceCustom} onChange={(e) => setReminderForm({ ...reminderForm, recurrenceCustom: e.target.value })} className="h-12 rounded-2xl bg-card/80" placeholder="Every 2 weeks" />
                )}
                <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
                  <div>
                    <Label>Context</Label>
                    <Select value={contextOptions.some((option) => option.value === reminderForm.contextTag) ? reminderForm.contextTag : "general"} onValueChange={(value) => setReminderForm({ ...reminderForm, contextTag: value })}>
                      <SelectTrigger className="mt-1 h-12 rounded-2xl bg-card/80"><SelectValue placeholder="Context" /></SelectTrigger>
                      <SelectContent>
                        {contextOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Source</Label>
                    <Input
                      value={reminderForm.sourceLabel}
                      onChange={(e) => setReminderForm({ ...reminderForm, sourceLabel: e.target.value })}
                      className="mt-1 h-12 rounded-2xl bg-card/80"
                      placeholder="Self, Dad, friend"
                    />
                  </div>
                </div>
                <Button type="button" variant={reminderForm.flagged ? "default" : "outline"} className="h-12 w-full rounded-2xl" onClick={() => setReminderForm({ ...reminderForm, flagged: !reminderForm.flagged })}>
                  <Flag className="w-4 h-4 mr-2" />{reminderForm.flagged ? "Flagged" : "Flag"}
                </Button>
              </div>
            )}
          </div>

          <div className="sticky bottom-0 border-t border-border/70 bg-card/95 p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] backdrop-blur sm:px-5">
            <Button
              onClick={saveReminder}
              loading={savingReminder}
              disabled={savingReminder || !reminderForm.title.trim()}
              className="h-12 w-full rounded-2xl text-base shadow-lg shadow-primary/20 active:scale-95"
            >
              {savingReminder ? "Saving..." : reminderForm.id ? "Update Reminder" : "Add Reminder"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SmartTile({ active, icon: Icon, label, count, color, tile, onClick }: any) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-[6.4rem] touch-manipulation rounded-[24px] border p-4 text-left shadow-sm shadow-black/10 transition active:scale-[0.97] active:brightness-110 ${tile} ${active ? "ring-2 ring-primary/45" : "hover:border-primary/30"}`}
    >
      <div className="flex items-start justify-between gap-3">
        <span className={`flex h-10 w-10 items-center justify-center rounded-full bg-background/70 ${color}`}>
          <Icon className="h-5 w-5" />
        </span>
        <span className="font-mono text-3xl font-bold leading-none">{count}</span>
      </div>
      <p className="mt-3 text-sm font-semibold text-muted-foreground">{label}</p>
    </button>
  );
}

function PriorityPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const items = [
    { value: "none", label: "None", className: "data-[active=true]:bg-muted data-[active=true]:text-foreground" },
    { value: "low", label: "Low", className: "data-[active=true]:bg-blue-500/15 data-[active=true]:text-blue-300" },
    { value: "medium", label: "Med", className: "data-[active=true]:bg-amber-500/15 data-[active=true]:text-amber-300" },
    { value: "high", label: "High", className: "data-[active=true]:bg-destructive/15 data-[active=true]:text-destructive" },
  ];

  return (
    <div className="rounded-[22px] border border-border/70 bg-background/55 p-3">
      <Label className="text-xs font-semibold text-muted-foreground">Priority</Label>
      <div className="mt-2 grid grid-cols-4 gap-2">
        {items.map((item) => (
          <button
            key={item.value}
            type="button"
            data-active={value === item.value}
            onClick={() => onChange(item.value)}
            className={`h-11 touch-manipulation rounded-2xl text-sm font-semibold text-muted-foreground transition active:scale-95 active:bg-muted ${item.className}`}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function viewTitle(filter: string, lists: any[]) {
  const smart: Record<string, string> = {
    overdue: "Overdue",
    today: "Today",
    scheduled: "Scheduled",
    all: "All",
    flagged: "Flagged",
    completed: "Completed",
  };
  return smart[filter] ?? lists.find((list) => list.id === filter)?.name ?? "Reminders";
}
