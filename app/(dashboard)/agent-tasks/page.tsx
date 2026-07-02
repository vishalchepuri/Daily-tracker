"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Bot, CalendarClock, CheckCircle2, Clipboard, ExternalLink, History, Pause, Play, Plus, RefreshCw, Save, Send, Share2, Sparkles, Trash2, XCircle } from "lucide-react";
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
import { DayzaLiveAgent } from "@/components/live/dayza-live-agent";

const blankForm = {
  name: "",
  prompt: "",
  trainingNotes: "",
  outputFormat: "",
  templateId: "",
  url: "",
  scheduleType: "daily",
  timeOfDay: "09:00",
  daysOfWeek: "mon,tue,wed,thu,fri",
  active: "true",
  notifyOnRun: "true",
  previewSummary: "",
};

const blankTrainerDraft = {
  taskId: "",
  templateId: "",
  name: "",
  description: "",
  url: "",
  prompt: "",
  trainingNotes: "",
  outputFormat: "Return a short summary with: new items, changed items, important dates or amounts, and the action I should take.",
  previewSummary: "",
  category: "general",
  scheduleType: "daily",
  timeOfDay: "09:00",
  daysOfWeek: "mon,tue,wed,thu,fri",
  active: "true",
  notifyOnRun: "true",
};

const dayOptions = [
  ["sun", "Sun"],
  ["mon", "Mon"],
  ["tue", "Tue"],
  ["wed", "Wed"],
  ["thu", "Thu"],
  ["fri", "Fri"],
  ["sat", "Sat"],
];

const taskTemplates = [
  {
    name: "Daily IPO check",
    prompt: "Check this IPO page for newly added or changed IPO listings. Summarize only new, changed, or important items.",
    url: "",
    scheduleType: "daily",
    timeOfDay: "09:00",
    daysOfWeek: "mon,tue,wed,thu,fri",
  },
  {
    name: "Price drop monitor",
    prompt: "Check this product or listing page and tell me if the visible price changed or if there is a meaningful discount.",
    url: "",
    scheduleType: "daily",
    timeOfDay: "08:30",
    daysOfWeek: "mon,tue,wed,thu,fri,sat,sun",
  },
  {
    name: "Bill due check",
    prompt: "Check this account or bill page and summarize any due date, amount due, or payment status shown.",
    url: "",
    scheduleType: "weekly",
    timeOfDay: "10:00",
    daysOfWeek: "mon",
  },
  {
    name: "Morning link summary",
    prompt: "Read this link and summarize the important updates, deadlines, and actions I should take.",
    url: "",
    scheduleType: "daily",
    timeOfDay: "07:30",
    daysOfWeek: "mon,tue,wed,thu,fri",
  },
];

function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function scheduleLabel(task: any) {
  if (task.scheduleType === "manual") return "Manual only";
  if (task.scheduleType === "weekly") {
    const days = String(task.daysOfWeek ?? "")
      .split(",")
      .filter(Boolean)
      .map((day) => day.charAt(0).toUpperCase() + day.slice(1))
      .join(", ");
    return `Weekly${days ? ` on ${days}` : ""} at ${task.timeOfDay || "-"}`;
  }
  return `Daily at ${task.timeOfDay || "-"}`;
}

function parseJsonValue<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string" || !value.trim()) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function humanizeKey(value: string) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (char) => char.toUpperCase());
}

function formatStructuredItem(item: unknown): string {
  if (item == null) return "";
  if (typeof item === "string" || typeof item === "number" || typeof item === "boolean") return String(item).trim();
  if (Array.isArray(item)) return item.map(formatStructuredItem).filter(Boolean).join(", ");
  if (typeof item === "object") {
    const entries = Object.entries(item as Record<string, unknown>)
      .filter(([, value]) => value !== null && value !== undefined && String(value).trim() !== "")
      .slice(0, 8);
    if (entries.length === 0) return "";
    const nameEntry = entries.find(([key]) => /name|company|ipo|title/i.test(key));
    const otherEntries = entries.filter(([key]) => key !== nameEntry?.[0]);
    const head = nameEntry ? formatStructuredItem(nameEntry[1]) : "";
    const detail = otherEntries
      .map(([key, value]) => `${humanizeKey(key)}: ${formatStructuredItem(value)}`)
      .filter(Boolean)
      .join(" | ");
    return [head, detail].filter(Boolean).join(" - ");
  }
  return String(item).trim();
}

function cleanList(value: unknown) {
  return Array.isArray(value) ? value.map(formatStructuredItem).filter(Boolean) : [];
}

function structuredRun(run: any) {
  const summaryData = parseJsonValue<any>(run?.structuredSummaryJson, {});
  return {
    summary: String(summaryData?.summary ?? "").trim(),
    actionItems: cleanList(summaryData?.actionItems),
    changes: cleanList(parseJsonValue<any[]>(run?.changesJson, [])),
    importantItems: cleanList(parseJsonValue<any[]>(run?.importantItemsJson, [])),
  };
}

function taskAnswer(task: any) {
  const latestRun = task?.runs?.[0];
  const structured = structuredRun(latestRun);
  return structured.summary || task?.lastSummary || latestRun?.summary || "";
}

function taskStatusTone(task: any) {
  if (task?.lastStatus === "failed") return { label: "Needs attention", variant: "destructive" as const, icon: AlertCircle };
  if (!task?.active) return { label: "Paused", variant: "outline" as const, icon: Pause };
  if (task?.lastStatus === "completed") return { label: "Healthy", variant: "secondary" as const, icon: CheckCircle2 };
  return { label: "Ready", variant: "secondary" as const, icon: CheckCircle2 };
}

function trainerMissingFields(draft: typeof blankTrainerDraft) {
  return [
    !draft.name.trim() ? "Name" : "",
    !draft.url.trim() ? "Link" : "",
    !draft.prompt.trim() ? "Instruction" : "",
    !draft.outputFormat.trim() ? "Output" : "",
  ].filter(Boolean);
}

export default function AgentTasksPage() {
  const [tasks, setTasks] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [cronInfo, setCronInfo] = useState<any>(null);
  const [vectorMemoryInfo, setVectorMemoryInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [trainerBusy, setTrainerBusy] = useState<string | null>(null);
  const [runningTaskId, setRunningTaskId] = useState<string | null>(null);
  const [memoryBusyId, setMemoryBusyId] = useState<string | null>(null);
  const [versionBusyId, setVersionBusyId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [trainerOpen, setTrainerOpen] = useState(false);
  const [logTask, setLogTask] = useState<any>(null);
  const [form, setForm] = useState(blankForm);
  const [trainerDraft, setTrainerDraft] = useState(blankTrainerDraft);
  const [trainerInput, setTrainerInput] = useState("");
  const [trainerReady, setTrainerReady] = useState(false);
  const [trainerMessages, setTrainerMessages] = useState<Array<{ role: "user" | "assistant" | "system"; text: string }>>([]);

  const activeCount = useMemo(() => tasks.filter((task) => task.active).length, [tasks]);
  const failingCount = useMemo(() => tasks.filter((task) => task.lastStatus === "failed").length, [tasks]);
  const completedTodayCount = useMemo(() => {
    const todayKey = new Date().toDateString();
    return tasks.filter((task) => task.lastStatus === "completed" && task.lastRunAt && new Date(task.lastRunAt).toDateString() === todayKey).length;
  }, [tasks]);
  const upcomingTasks = useMemo(() => (
    tasks
      .filter((task) => task.active && task.nextRunAt)
      .sort((a, b) => new Date(a.nextRunAt).getTime() - new Date(b.nextRunAt).getTime())
      .slice(0, 5)
  ), [tasks]);
  const latestAnswers = useMemo(() => tasks.filter((task) => taskAnswer(task)).slice(0, 3), [tasks]);
  const missingTrainerFields = useMemo(() => trainerMissingFields(trainerDraft), [trainerDraft]);
  const trainerLivePayload = useMemo(() => ({
    mode: "agent-task-training",
    taskContext: {
      name: trainerDraft.name,
      url: trainerDraft.url,
      prompt: trainerDraft.prompt,
      trainingNotes: trainerDraft.trainingNotes,
      outputFormat: trainerDraft.outputFormat,
      scheduleType: trainerDraft.scheduleType,
      timeOfDay: trainerDraft.timeOfDay,
    },
  }), [trainerDraft]);

  const loadTasks = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/agent-tasks");
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? "Failed to load agent tasks");
        return;
      }
      setTasks(data?.tasks ?? []);
      setCronInfo(data?.cron ?? null);
      setVectorMemoryInfo(data?.vectorMemory ?? null);
    } catch {
      toast.error("Failed to load agent tasks");
    } finally {
      setLoading(false);
    }
  };

  const loadTemplates = async () => {
    try {
      const res = await fetch("/api/agent-task-templates");
      const data = await res.json();
      if (!res.ok) return;
      setTemplates(data?.templates ?? []);
    } catch {
      // Templates are helpful, but tasks should still load without them.
    }
  };

  useEffect(() => { loadTasks(); loadTemplates(); }, []);

  const saveTask = async () => {
    if (!form.name.trim() || !form.prompt.trim()) {
      toast.error("Task name and details are required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/agent-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          active: form.active === "true",
          notifyOnRun: form.notifyOnRun === "true",
          versionSource: "manual",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? "Failed to save task");
        return;
      }
      toast.success("Agent task scheduled");
      setForm(blankForm);
      setDialogOpen(false);
      loadTasks();
    } catch {
      toast.error("Failed to save task");
    } finally {
      setSaving(false);
    }
  };

  const openTrainer = (seed?: any) => {
    const fromTemplate = Boolean(seed && !seed.runs && (seed.defaultScheduleType || seed.status));
    const draft = {
      ...blankTrainerDraft,
      taskId: seed?.runs ? seed.id ?? "" : "",
      templateId: seed && !seed.runs ? seed.id ?? "" : seed?.templateId ?? "",
      name: seed?.name ?? "",
      description: seed?.description ?? "",
      url: seed?.url ?? "",
      prompt: seed?.prompt ?? "",
      trainingNotes: seed?.trainingNotes ?? "",
      outputFormat: seed?.outputFormat ?? blankTrainerDraft.outputFormat,
      category: seed?.category ?? "general",
      scheduleType: seed?.scheduleType ?? seed?.defaultScheduleType ?? "daily",
      timeOfDay: seed?.timeOfDay ?? seed?.defaultTimeOfDay ?? "09:00",
      daysOfWeek: seed?.daysOfWeek ?? seed?.defaultDaysOfWeek ?? "mon,tue,wed,thu,fri",
      active: String(seed?.active ?? true),
      notifyOnRun: String(seed?.notifyOnRun ?? true),
      previewSummary: seed?.previewSummary ?? seed?.lastSummary ?? "",
    };
    setTrainerDraft(draft);
    setTrainerReady(Boolean(draft.name && draft.url && draft.prompt && draft.outputFormat));
    setTrainerMessages([
      {
        role: "assistant",
        text: fromTemplate
          ? "I loaded this trained template. Add the link, run a preview, then save it as a scheduled task."
          : seed?.runs
            ? "I loaded this saved task. We can refine it, preview the response, then update the schedule."
            : "Tell me what this agent task should check, what a good response looks like, and what it should ignore.",
      },
    ]);
    setTrainerInput("");
    setTrainerOpen(true);
  };

  const useTemplate = (template: any) => {
    openTrainer(template);
  };

  const sendTrainerMessage = async () => {
    const message = trainerInput.trim();
    if (!message) return;
    const nextMessages = [...trainerMessages, { role: "user" as const, text: message }];
    setTrainerMessages(nextMessages);
    setTrainerInput("");
    setTrainerBusy("chat");
    try {
      const res = await fetch("/api/agent-task-training", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "chat", draft: trainerDraft, messages: nextMessages, message }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? "Trainer failed");
        return;
      }
      if (data?.draft) setTrainerDraft({ ...trainerDraft, ...data.draft });
      setTrainerReady(Boolean(data?.readyToSave));
      setTrainerMessages((items) => [...items, { role: "assistant", text: data?.assistantMessage ?? "I updated the task draft." }]);
    } catch {
      toast.error("Trainer failed");
    } finally {
      setTrainerBusy(null);
    }
  };

  const runTrainerPreview = async () => {
    if (!trainerDraft.url.trim() || !trainerDraft.prompt.trim()) {
      toast.error("Add a link and task instruction first");
      return;
    }
    setTrainerBusy("run");
    try {
      const res = await fetch("/api/agent-task-training", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "run", draft: trainerDraft, messages: trainerMessages }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? "Preview failed");
        return;
      }
      if (data?.preview?.summary) {
        setTrainerDraft((current) => ({ ...current, previewSummary: String(data.preview.summary).slice(0, 2000) }));
      }
      setTrainerReady(Boolean(data?.readyToSave));
      setTrainerMessages((items) => [...items, { role: "assistant", text: data?.assistantMessage ?? "Preview finished." }]);
    } catch {
      toast.error("Preview failed");
    } finally {
      setTrainerBusy(null);
    }
  };

  const saveTrainerTask = async () => {
    if (!trainerDraft.name.trim() || !trainerDraft.prompt.trim() || !trainerDraft.url.trim()) {
      toast.error("Name, instruction, and link are required");
      return;
    }
    setTrainerBusy("task");
    try {
      const payload = {
        id: trainerDraft.taskId || undefined,
        name: trainerDraft.name,
        prompt: trainerDraft.prompt,
        trainingNotes: trainerDraft.trainingNotes,
        outputFormat: trainerDraft.outputFormat,
        templateId: trainerDraft.templateId || undefined,
        url: trainerDraft.url,
        scheduleType: trainerDraft.scheduleType,
        timeOfDay: trainerDraft.timeOfDay,
        daysOfWeek: trainerDraft.daysOfWeek,
        active: trainerDraft.active === "true",
        notifyOnRun: trainerDraft.notifyOnRun === "true",
        previewSummary: trainerDraft.previewSummary,
        versionSource: trainerDraft.taskId ? "train" : "create",
      };
      const res = await fetch("/api/agent-tasks", {
        method: trainerDraft.taskId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? "Failed to save task");
        return;
      }
      toast.success(trainerDraft.taskId ? "Agent task updated" : "Agent task saved and scheduled");
      setTrainerOpen(false);
      setTrainerDraft(blankTrainerDraft);
      loadTasks();
    } catch {
      toast.error("Failed to save task");
    } finally {
      setTrainerBusy(null);
    }
  };

  const saveTrainerTemplate = async (share: boolean) => {
    if (!trainerDraft.name.trim() || !trainerDraft.prompt.trim()) {
      toast.error("Template name and instruction are required");
      return;
    }
    setTrainerBusy(share ? "share" : "template");
    try {
      const res = await fetch("/api/agent-task-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trainerDraft.name,
          description: trainerDraft.description,
          prompt: trainerDraft.prompt,
          trainingNotes: trainerDraft.trainingNotes,
          outputFormat: trainerDraft.outputFormat,
          category: trainerDraft.category,
          defaultScheduleType: trainerDraft.scheduleType,
          defaultTimeOfDay: trainerDraft.timeOfDay,
          defaultDaysOfWeek: trainerDraft.daysOfWeek,
          shared: share,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? "Failed to save template");
        return;
      }
      toast.success(share ? "Template sent for admin approval" : "Template saved");
      setTrainerDraft({ ...trainerDraft, templateId: data?.template?.id ?? trainerDraft.templateId });
      loadTemplates();
    } catch {
      toast.error("Failed to save template");
    } finally {
      setTrainerBusy(null);
    }
  };

  const toggleTask = async (task: any) => {
    const res = await fetch("/api/agent-tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: task.id, active: !task.active }),
    });
    if (!res.ok) {
      toast.error("Failed to update task");
      return;
    }
    loadTasks();
  };

  const runNow = async (task: any) => {
    setRunningTaskId(task.id);
    try {
      const res = await fetch(`/api/agent-tasks/dispatch?taskId=${encodeURIComponent(task.id)}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? "Task run failed");
        return;
      }
      toast.success(data?.runs?.[0]?.status === "failed" ? "Task finished with an error" : "Task completed");
      loadTasks();
    } catch {
      toast.error("Task run failed");
    } finally {
      setRunningTaskId(null);
    }
  };

  const deleteTask = async (task: any) => {
    if (!window.confirm(`Delete "${task.name}" and its run history?`)) return;
    const res = await fetch(`/api/agent-tasks?id=${encodeURIComponent(task.id)}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Failed to delete task");
      return;
    }
    toast.success("Task deleted");
    loadTasks();
  };

  const clearMemory = async (task?: any) => {
    const label = task?.name ? `"${task.name}"` : "all agent tasks";
    if (!window.confirm(`Clear vector memory for ${label}? This keeps tasks and run logs.`)) return;
    const busyId = task?.id ?? "all";
    setMemoryBusyId(busyId);
    try {
      const res = await fetch("/api/agent-task-memory", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(task?.id ? { taskId: task.id } : {}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.error ?? "Failed to clear memory");
        return;
      }
      toast.success(task?.id ? "Task memory cleared" : "All agent memory cleared");
      loadTasks();
    } catch {
      toast.error("Failed to clear memory");
    } finally {
      setMemoryBusyId(null);
    }
  };

  const rollbackVersion = async (task: any, version: any) => {
    if (!window.confirm(`Restore "${task.name}" to v${version.version}?`)) return;
    setVersionBusyId(version.id);
    try {
      const res = await fetch("/api/agent-tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: task.id, rollbackVersionId: version.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.error ?? "Failed to restore version");
        return;
      }
      toast.success(`Restored v${version.version}`);
      loadTasks();
    } catch {
      toast.error("Failed to restore version");
    } finally {
      setVersionBusyId(null);
    }
  };

  const toggleDay = (day: string) => {
    const selected = new Set(form.daysOfWeek.split(",").filter(Boolean));
    if (selected.has(day)) selected.delete(day);
    else selected.add(day);
    setForm({ ...form, daysOfWeek: Array.from(selected).join(",") });
  };

  const applyTemplate = (template: typeof taskTemplates[number]) => {
    openTrainer({
      ...template,
      outputFormat: "Return new, changed, or important items only. Include names, dates, amounts, and action needed.",
    });
  };

  const copyText = async (value: string, label: string) => {
    await navigator.clipboard.writeText(value);
    toast.success(`${label} copied`);
  };

  return (
    <div className="space-y-3 sm:space-y-6">
      <FadeIn>
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-display text-2xl font-bold leading-tight tracking-tight sm:text-3xl">Agent Tasks</h2>
                {failingCount > 0 ? (
                  <Badge variant="destructive">{failingCount} need attention</Badge>
                ) : (
                  <Badge variant="secondary">All clear</Badge>
                )}
              </div>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                Train Dayza to check links, compare new runs with memory, and bring back only the changes that matter.
              </p>
              <div className="mt-4 grid gap-2 sm:grid-cols-4">
                <div className="rounded-lg border border-border bg-muted/25 p-3">
                  <p className="text-[0.68rem] uppercase text-muted-foreground">Tasks</p>
                  <p className="mt-1 font-mono text-2xl font-bold">{tasks.length}</p>
                </div>
                <div className="rounded-lg border border-border bg-muted/25 p-3">
                  <p className="text-[0.68rem] uppercase text-muted-foreground">Active</p>
                  <p className="mt-1 font-mono text-2xl font-bold">{activeCount}</p>
                </div>
                <div className="rounded-lg border border-border bg-muted/25 p-3">
                  <p className="text-[0.68rem] uppercase text-muted-foreground">Ran today</p>
                  <p className="mt-1 font-mono text-2xl font-bold">{completedTodayCount}</p>
                </div>
                <div className="rounded-lg border border-border bg-muted/25 p-3">
                  <p className="text-[0.68rem] uppercase text-muted-foreground">Next</p>
                  <p className="mt-1 truncate text-sm font-semibold">{formatDate(upcomingTasks[0]?.nextRunAt)}</p>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:flex lg:justify-end">
            <Button type="button" variant="outline" onClick={loadTasks} disabled={loading} className="px-2 sm:px-3">
              <RefreshCw className={`h-4 w-4 min-[370px]:mr-2 ${loading ? "animate-spin" : ""}`} />
              <span className="hidden min-[370px]:inline">Refresh</span>
            </Button>
            <Button type="button" variant="outline" onClick={() => openTrainer()} className="px-2 sm:px-3">
              <Sparkles className="h-4 w-4 min-[370px]:mr-2" />
              <span className="hidden min-[370px]:inline">Train</span>
            </Button>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button type="button" className="px-2 sm:px-3"><Plus className="h-4 w-4 min-[370px]:mr-2" /><span className="hidden min-[370px]:inline">Task</span></Button>
              </DialogTrigger>
              <DialogContent className="inset-0 bottom-0 top-0 h-dvh max-h-dvh max-w-none translate-x-0 translate-y-0 overflow-y-auto rounded-none p-4 sm:bottom-auto sm:left-[50%] sm:top-[50%] sm:h-auto sm:max-h-[90svh] sm:max-w-xl sm:translate-x-[-50%] sm:translate-y-[-50%] sm:rounded-lg sm:p-6">
                <DialogHeader><DialogTitle>Schedule Agent Task</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>Name</Label>
                    <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1" placeholder="Daily IPO check" />
                  </div>
                  <div>
                    <Label>Task details</Label>
                    <Textarea value={form.prompt} onChange={(e) => setForm({ ...form, prompt: e.target.value })} className="mt-1" placeholder="Check this page for new IPO listings and tell me what changed." />
                  </div>
                  <div>
                    <Label>Training notes</Label>
                    <Textarea value={form.trainingNotes} onChange={(e) => setForm({ ...form, trainingNotes: e.target.value })} className="mt-1" placeholder="Fields to focus on, things to ignore, and examples of a good response." />
                  </div>
                  <div>
                    <Label>Expected output</Label>
                    <Textarea value={form.outputFormat} onChange={(e) => setForm({ ...form, outputFormat: e.target.value })} className="mt-1" placeholder="Return new, changed, or important items only." />
                  </div>
                  <div>
                    <Label>Link to check</Label>
                    <Input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} className="mt-1" placeholder="https://example.com/ipos" />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div>
                      <Label>Schedule</Label>
                      <Select value={form.scheduleType} onValueChange={(value) => setForm({ ...form, scheduleType: value })}>
                        <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="daily">Daily</SelectItem>
                          <SelectItem value="weekly">Weekly</SelectItem>
                          <SelectItem value="manual">Manual only</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Time</Label>
                      <Input type="time" value={form.timeOfDay} onChange={(e) => setForm({ ...form, timeOfDay: e.target.value })} className="mt-1" disabled={form.scheduleType === "manual"} />
                    </div>
                    <div>
                      <Label>Status</Label>
                      <Select value={form.active} onValueChange={(value) => setForm({ ...form, active: value })}>
                        <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="true">Active</SelectItem>
                          <SelectItem value="false">Paused</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {form.scheduleType === "weekly" && (
                    <div>
                      <Label>Days</Label>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {dayOptions.map(([value, label]) => (
                          <Button key={value} type="button" size="sm" variant={form.daysOfWeek.split(",").includes(value) ? "default" : "outline"} onClick={() => toggleDay(value)}>
                            {label}
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div>
                    <Label>Notify after run</Label>
                    <Select value={form.notifyOnRun} onValueChange={(value) => setForm({ ...form, notifyOnRun: value })}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="true">Yes</SelectItem>
                        <SelectItem value="false">No</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button type="button" className="w-full" onClick={saveTask} loading={saving} disabled={saving}>Save Task</Button>
                </div>
              </DialogContent>
            </Dialog>
            </div>
          </div>
        </div>
      </FadeIn>

      {latestAnswers.length > 0 && (
        <FadeIn delay={0.03}>
          <div className="grid gap-2 sm:grid-cols-3">
            {latestAnswers.map((task) => {
              const tone = taskStatusTone(task);
              const StatusIcon = tone.icon;
              return (
                <button
                  key={task.id}
                  type="button"
                  onClick={() => setLogTask(task)}
                  className="rounded-xl border border-border bg-card p-3 text-left transition hover:border-primary/40 hover:bg-muted/30 active:scale-[0.99]"
                >
                  <div className="flex items-center gap-2">
                    <StatusIcon className="h-4 w-4 text-primary" />
                    <p className="min-w-0 flex-1 truncate text-sm font-semibold">{task.name}</p>
                    <Badge variant={tone.variant}>{tone.label}</Badge>
                  </div>
                  <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-muted-foreground">{taskAnswer(task)}</p>
                </button>
              );
            })}
          </div>
        </FadeIn>
      )}

      <FadeIn delay={0.04} className="hidden sm:block">
        <Card className="border-primary/25">
          <details>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
            <span className="min-w-0">
              <span className="flex items-center gap-2 font-semibold">
                <CalendarClock className="h-5 w-5 text-primary" />
                Setup & Memory
              </span>
              <span className="mt-1 block truncate text-xs text-muted-foreground">
                {cronInfo?.secretConfigured ? "Cron ready" : "Cron secret missing"} / {vectorMemoryInfo?.configured ? `${vectorMemoryInfo.namespaceVectorCount ?? 0} memory chunks` : "Memory missing"}
              </span>
            </span>
            <Badge variant="outline">Open</Badge>
          </summary>
          <CardContent className="space-y-3 pt-0">
            <div className="grid gap-2 lg:grid-cols-[1fr_auto] lg:items-center">
              <div className="min-w-0 rounded-2xl border border-border bg-muted/25 p-3">
                <p className="text-xs text-muted-foreground">Endpoint</p>
                <p className="mt-1 truncate font-mono text-sm">{cronInfo?.endpoint ?? "/api/agent-tasks/dispatch"}</p>
              </div>
              <Button type="button" variant="outline" onClick={() => copyText(cronInfo?.endpoint ?? `${window.location.origin}/api/agent-tasks/dispatch`, "Endpoint")}>
                <Clipboard className="mr-2 h-4 w-4" />
                Copy URL
              </Button>
            </div>
            <div className="grid gap-2 lg:grid-cols-[1fr_auto] lg:items-center">
              <div className="min-w-0 rounded-2xl border border-border bg-muted/25 p-3">
                <p className="text-xs text-muted-foreground">Header</p>
                <p className="mt-1 truncate font-mono text-sm">Authorization: Bearer YOUR_CRON_SECRET</p>
              </div>
              <Button type="button" variant="outline" onClick={() => copyText("Authorization: Bearer YOUR_CRON_SECRET", "Header")}>
                <Clipboard className="mr-2 h-4 w-4" />
                Copy Header
              </Button>
            </div>
            <div className="grid gap-2 text-sm sm:grid-cols-4">
              <div className="rounded-2xl border border-border bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">Secret</p>
                <p className="mt-1 font-semibold">{cronInfo?.secretConfigured ? "Configured" : "Missing"}</p>
              </div>
              <div className="rounded-2xl border border-border bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">Vector memory</p>
                <p className="mt-1 font-semibold">{vectorMemoryInfo?.configured ? "Configured" : "Missing"}</p>
              </div>
              <div className="rounded-2xl border border-border bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">Last cron hit</p>
                <p className="mt-1 font-semibold">{formatDate(cronInfo?.lastHit?.createdAt)}</p>
              </div>
              <div className="rounded-2xl border border-border bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">Last result</p>
                <p className="mt-1 font-semibold">{cronInfo?.lastHit ? `${cronInfo.lastHit.ran} ran / ${cronInfo.lastHit.checked} checked` : "-"}</p>
              </div>
            </div>
            <div className="rounded-2xl border border-border bg-muted/20 p-3">
              <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">Agent Memory</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {vectorMemoryInfo?.configured
                      ? `${vectorMemoryInfo.namespaceVectorCount ?? 0} saved chunks in ${vectorMemoryInfo.namespace ?? "default"}`
                      : "Pinecone is not configured for this environment."}
                  </p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => clearMemory()} loading={memoryBusyId === "all"} disabled={!vectorMemoryInfo?.configured || Boolean(memoryBusyId)}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Clear All
                </Button>
              </div>
              <div className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
                <div className="rounded-xl bg-background/50 p-2">
                  <p className="text-muted-foreground">Total vectors</p>
                  <p className="font-mono font-semibold">{vectorMemoryInfo?.totalVectorCount ?? 0}</p>
                </div>
                <div className="rounded-xl bg-background/50 p-2">
                  <p className="text-muted-foreground">Namespace vectors</p>
                  <p className="font-mono font-semibold">{vectorMemoryInfo?.namespaceVectorCount ?? 0}</p>
                </div>
                <div className="rounded-xl bg-background/50 p-2">
                  <p className="text-muted-foreground">Dimension</p>
                  <p className="font-mono font-semibold">{vectorMemoryInfo?.dimension ?? "-"}</p>
                </div>
              </div>
            </div>
          </CardContent>
          </details>
        </Card>
      </FadeIn>

      <FadeIn delay={0.06} className="hidden sm:block">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <CalendarClock className="h-5 w-5 text-primary" />
              Upcoming Runs
            </CardTitle>
            <p className="text-sm text-muted-foreground">These are the scheduled agent tasks that will run automatically.</p>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">Loading schedule...</div>
            ) : upcomingTasks.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                No upcoming automatic runs. Create an active daily or weekly task to see it here.
              </div>
            ) : (
              <div className="space-y-2">
                {upcomingTasks.map((task) => (
                  <div key={task.id} className="grid gap-2 rounded-2xl border border-border bg-muted/20 p-3 sm:grid-cols-[1fr_auto] sm:items-center">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{task.name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{scheduleLabel(task)}</p>
                    </div>
                    <Badge variant="secondary" className="justify-center">{formatDate(task.nextRunAt)}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </FadeIn>

      <FadeIn delay={0.08} className="hidden sm:block">
        <Card>
          <details>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
            <span className="min-w-0">
              <span className="flex items-center gap-2 font-semibold">
                <Sparkles className="h-5 w-5 text-primary" />
                Trained Templates
              </span>
              <span className="mt-1 block text-xs text-muted-foreground">{templates.length} saved templates</span>
            </span>
            <Badge variant="outline">Open</Badge>
          </summary>
          <CardContent className="pt-0">
            {templates.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                No trained templates yet. Use Train to create one before scheduling a task.
              </div>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {templates.map((template) => (
                    <div key={template.id} className="rounded-2xl border border-border bg-muted/20 p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="min-w-0 flex-1 truncate font-semibold">{template.name}</p>
                        <Badge variant={template.status === "approved" ? "secondary" : template.status === "pending" ? "outline" : "default"}>{template.status}</Badge>
                      </div>
                      {template.description && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{template.description}</p>}
                      <p className="mt-2 line-clamp-3 text-xs text-muted-foreground">{template.prompt}</p>
                      <div className="mt-3 flex items-center justify-between gap-2">
                        <Badge variant="outline">{template.category || "general"}</Badge>
                        <Button type="button" size="sm" onClick={() => useTemplate(template)} disabled={template.status === "pending" || template.status === "rejected"}>
                          Use
                        </Button>
                      </div>
                      {template.status === "pending" && <p className="mt-2 text-xs text-amber-400">Waiting for admin approval before others can use it.</p>}
                    </div>
                ))}
              </div>
            )}
          </CardContent>
          </details>
        </Card>
      </FadeIn>

      <FadeIn delay={0.1} className="hidden sm:block">
        <Card>
          <details>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
            <span className="min-w-0">
              <span className="font-semibold">Quick Templates</span>
              <span className="mt-1 block text-xs text-muted-foreground">Use a starter only when you need it</span>
            </span>
            <Badge variant="outline">Open</Badge>
          </summary>
          <CardContent className="grid gap-2 pt-0 sm:grid-cols-2 lg:grid-cols-4">
            {taskTemplates.map((template) => (
              <button
                key={template.name}
                type="button"
                onClick={() => applyTemplate(template)}
                className="rounded-2xl border border-border bg-muted/20 p-3 text-left transition hover:border-primary/40 hover:bg-primary/5 active:scale-[0.99]"
              >
                <p className="font-semibold">{template.name}</p>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{template.prompt}</p>
              </button>
            ))}
          </CardContent>
          </details>
        </Card>
      </FadeIn>

      <div className="grid gap-3">
        {loading ? (
          <Card><CardContent className="p-6 text-sm text-muted-foreground">Loading tasks...</CardContent></Card>
        ) : tasks.length === 0 ? (
          <Card><CardContent className="flex flex-col items-center py-12 text-center text-muted-foreground"><Bot className="mb-3 h-10 w-10 text-primary/40" /><p className="font-semibold text-foreground">No scheduled agent tasks yet</p><p className="mt-1 text-sm">Create one for daily IPO checks, price checks, or link monitoring.</p></CardContent></Card>
        ) : tasks.map((task) => {
          const tone = taskStatusTone(task);
          const StatusIcon = tone.icon;
          const answer = taskAnswer(task);
          return (
          <Card key={task.id} className={task.lastStatus === "failed" ? "border-destructive/40" : ""}>
            <CardContent className="space-y-3 p-3 sm:hidden">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate font-semibold">{task.name}</h3>
                    <Badge variant={tone.variant} className="shrink-0">{tone.label}</Badge>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{task.prompt}</p>
                </div>
                <StatusIcon className={`h-5 w-5 shrink-0 ${task.lastStatus === "failed" ? "text-destructive" : "text-primary"}`} />
              </div>

              <div className="grid grid-cols-2 gap-2 rounded-xl bg-muted/35 p-2 text-xs">
                <div><span className="text-muted-foreground">Next</span><p className="truncate font-semibold">{formatDate(task.nextRunAt)}</p></div>
                <div><span className="text-muted-foreground">Schedule</span><p className="truncate font-semibold">{scheduleLabel(task)}</p></div>
              </div>

              <div className="grid grid-cols-5 gap-2">
                <Button type="button" variant="outline" size="icon" onClick={() => runNow(task)} loading={runningTaskId === task.id} disabled={Boolean(runningTaskId)} title="Run now" aria-label="Run now">
                  <Play className="h-4 w-4" />
                </Button>
                <Button type="button" variant="outline" size="icon" onClick={() => toggleTask(task)} title={task.active ? "Pause" : "Resume"} aria-label={task.active ? "Pause" : "Resume"}>
                  {task.active ? <Pause className="h-4 w-4" /> : <RefreshCw className="h-4 w-4" />}
                </Button>
                <Button type="button" variant="outline" size="icon" onClick={() => setLogTask(task)} title="Run logs" aria-label="Run logs">
                  <History className="h-4 w-4" />
                </Button>
                <Button type="button" variant="outline" size="icon" onClick={() => openTrainer(task)} title="Train task" aria-label="Train task">
                  <Bot className="h-4 w-4" />
                </Button>
                <Button type="button" variant="outline" size="icon" onClick={() => deleteTask(task)} className="hover:text-destructive" title="Delete task" aria-label="Delete task">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>

              {answer && (
                <button type="button" onClick={() => setLogTask(task)} className="w-full rounded-xl border border-border bg-muted/25 p-3 text-left">
                  <p className="text-[0.68rem] font-semibold uppercase text-muted-foreground">Latest answer</p>
                  <p className="mt-1 line-clamp-4 text-xs leading-relaxed text-foreground">{answer}</p>
                </button>
              )}

              <details className="rounded-xl border border-border bg-muted/20 p-2">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-xs font-semibold [&::-webkit-details-marker]:hidden">
                  <span>Details</span>
                  <span className="flex items-center gap-1">
                    <Badge variant={task.lastMemorySearchUsed ? "secondary" : "outline"}>{task.lastMemorySearchUsed ? "Memory" : "No memory"}</Badge>
                    <Badge variant="outline">v{task.versions?.[0]?.version ?? 1}</Badge>
                  </span>
                </summary>
                <div className="mt-2 space-y-2 text-xs text-muted-foreground">
                  {task.url && (
                    <a href={task.url} target="_blank" rel="noreferrer" className="block truncate text-primary hover:underline">{task.url}</a>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <span>Last: {formatDate(task.lastRunAt)}</span>
                    <span>Chunks: {task.lastMemoryVectorCount ?? 0}</span>
                  </div>
                  {task.runs?.length > 0 && (
                    <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => setLogTask(task)}>
                      <History className="mr-2 h-4 w-4" />
                      View runs
                    </Button>
                  )}
                </div>
              </details>
            </CardContent>
            <CardContent className="hidden space-y-4 p-4 sm:block">
              <div className="grid gap-3 sm:flex sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusIcon className={`h-4 w-4 ${task.lastStatus === "failed" ? "text-destructive" : "text-primary"}`} />
                    <h3 className="font-semibold">{task.name}</h3>
                    <Badge variant={tone.variant}>{tone.label}</Badge>
                    <Badge variant="outline">{task.scheduleType}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{task.prompt}</p>
                  {task.url && (
                    <a href={task.url} target="_blank" rel="noreferrer" className="mt-2 inline-flex min-w-0 items-center gap-1 text-xs text-primary hover:underline">
                      <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{task.url}</span>
                    </a>
                  )}
                </div>
                <div className="grid grid-cols-5 gap-2 sm:flex">
                  <Button type="button" variant="outline" size="sm" className="min-w-0 px-2 sm:px-3" onClick={() => runNow(task)} loading={runningTaskId === task.id} disabled={Boolean(runningTaskId)} title="Run now" aria-label="Run now">
                    <Play className="h-4 w-4 sm:mr-1" /><span className="hidden sm:inline">Run</span>
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="min-w-0 px-2 sm:px-3" onClick={() => toggleTask(task)} title={task.active ? "Pause" : "Resume"} aria-label={task.active ? "Pause" : "Resume"}>
                    {task.active ? <Pause className="h-4 w-4 sm:mr-1" /> : <RefreshCw className="h-4 w-4 sm:mr-1" />}
                    <span className="hidden sm:inline">{task.active ? "Pause" : "Resume"}</span>
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="min-w-0 px-2 sm:px-3" onClick={() => setLogTask(task)} title="Run logs" aria-label="Run logs">
                    <History className="h-4 w-4" />
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="min-w-0 px-2 sm:px-3" onClick={() => openTrainer(task)} title="Train task" aria-label="Train task">
                    <Bot className="h-4 w-4" />
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => deleteTask(task)} className="min-w-0 px-2 hover:text-destructive sm:px-3" title="Delete task" aria-label="Delete task">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="grid gap-2 rounded-lg bg-muted/35 p-3 text-sm sm:grid-cols-3">
                <div><span className="text-muted-foreground">Next run</span><p>{formatDate(task.nextRunAt)}</p></div>
                <div><span className="text-muted-foreground">Last</span><p>{formatDate(task.lastRunAt)}</p></div>
                <div><span className="text-muted-foreground">Schedule</span><p>{scheduleLabel(task)}</p></div>
              </div>
              <details className="rounded-lg border border-border bg-muted/20 p-3">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
                  <span>Memory & versions</span>
                  <span className="flex shrink-0 items-center gap-2">
                    <Badge variant={task.lastMemorySearchUsed ? "secondary" : "outline"}>{task.lastMemorySearchUsed ? "Memory used" : "No memory"}</Badge>
                    <Badge variant="outline">v{task.versions?.[0]?.version ?? 1}</Badge>
                  </span>
                </summary>
                <div className="mt-3 space-y-3">
              <div className="grid gap-3 rounded-lg bg-background/45 p-3 text-sm sm:grid-cols-[1fr_auto] sm:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">Memory</p>
                    <Badge variant={task.lastMemorySearchUsed ? "secondary" : "outline"}>{task.lastMemorySearchUsed ? "Used" : "No match"}</Badge>
                    <Badge variant="outline">{task.lastMemoryVectorCount ?? 0} chunks</Badge>
                  </div>
                  <div className="mt-2 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                    <span>Last search: {formatDate(task.lastMemorySearchAt)}</span>
                    <span>Last write: {formatDate(task.lastMemoryWriteAt)}</span>
                  </div>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => clearMemory(task)} loading={memoryBusyId === task.id} disabled={!vectorMemoryInfo?.configured || Boolean(memoryBusyId)}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Clear
                </Button>
              </div>
              {task.versions?.length > 0 && (
                <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold">Versions</p>
                    <Badge variant="outline">{task.versions.length} saved</Badge>
                  </div>
                  <div className="grid gap-2">
                    {task.versions.map((version: any) => {
                      const activeVersion = task.activeVersionId === version.id;
                      return (
                        <div key={version.id} className="grid gap-2 rounded-md bg-background/55 p-2 text-xs sm:grid-cols-[1fr_auto] sm:items-center">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant={activeVersion ? "secondary" : "outline"}>v{version.version}</Badge>
                              <span className="font-medium">{version.source || "manual"}</span>
                              <span className="text-muted-foreground">{formatDate(version.createdAt)}</span>
                            </div>
                            {version.previewSummary && (
                              <p className="mt-1 line-clamp-2 text-muted-foreground">{version.previewSummary}</p>
                            )}
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => rollbackVersion(task, version)}
                            loading={versionBusyId === version.id}
                            disabled={activeVersion || Boolean(versionBusyId)}
                          >
                            <RefreshCw className="mr-2 h-3.5 w-3.5" />
                            {activeVersion ? "Active" : "Restore"}
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
                </div>
              </details>
              {answer && (
                <div className="rounded-lg border border-border bg-muted/25 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase text-muted-foreground">Latest answer</p>
                    <Button type="button" variant="ghost" size="sm" className="h-7 px-2" onClick={() => setLogTask(task)}>
                      <History className="mr-1.5 h-3.5 w-3.5" />
                      Logs
                    </Button>
                  </div>
                  <p className="line-clamp-5 whitespace-pre-wrap text-sm leading-relaxed text-foreground [overflow-wrap:anywhere]">{answer}</p>
                </div>
              )}
              {task.runs?.length > 0 && (
                <div className="space-y-2">
                  <p className="flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground"><CalendarClock className="h-3.5 w-3.5" />Recent runs</p>
                  {task.runs.slice(0, 5).map((run: any) => (
                    <div key={run.id} className="grid gap-2 rounded-md bg-muted/25 px-3 py-2 text-xs sm:grid-cols-[auto_1fr]">
                      <Badge variant={run.status === "failed" ? "destructive" : "outline"}>{run.status}</Badge>
                      <span className="text-muted-foreground">{formatDate(run.finishedAt || run.startedAt)}{run.error ? ` - ${run.error}` : ""}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
          );
        })}
      </div>

      <Dialog open={trainerOpen} onOpenChange={setTrainerOpen}>
        <DialogContent className="inset-0 bottom-0 top-0 h-dvh max-h-dvh max-w-none translate-x-0 translate-y-0 overflow-hidden rounded-none p-0 sm:bottom-auto sm:left-[50%] sm:top-[50%] sm:h-[94svh] sm:max-h-[94svh] sm:max-w-[min(76rem,calc(100vw_-_1rem))] sm:translate-x-[-50%] sm:translate-y-[-50%] sm:rounded-xl">
          <DialogHeader className="border-b border-border bg-card/95 px-4 py-3 backdrop-blur">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <DialogTitle className="flex items-center gap-2">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                    <Sparkles className="h-4 w-4" />
                  </span>
                  Agent Studio
                </DialogTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  {trainerBusy === "chat"
                    ? "Dayza is refining the task draft..."
                    : trainerBusy === "run"
                      ? "Dayza is checking the link and preparing a preview..."
                      : missingTrainerFields.length > 0
                        ? `Missing: ${missingTrainerFields.join(", ")}`
                        : "Ready to preview and schedule."}
                </p>
              </div>
              <Badge variant={trainerReady ? "secondary" : "outline"}>{trainerReady ? "Ready" : "Draft"}</Badge>
            </div>
          </DialogHeader>

          <div className="grid h-[calc(100%-4.5rem)] min-h-0 xl:grid-cols-[minmax(24rem,0.95fr)_minmax(24rem,1.05fr)]">
            <div className="flex min-h-0 flex-col border-b border-border lg:border-b-0 lg:border-r">
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3 sm:p-4">
                <div className="rounded-lg border border-border bg-muted/20 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={trainerDraft.name.trim() ? "secondary" : "outline"}>Name</Badge>
                    <Badge variant={trainerDraft.url.trim() ? "secondary" : "outline"}>Link</Badge>
                    <Badge variant={trainerDraft.prompt.trim() ? "secondary" : "outline"}>Instruction</Badge>
                    <Badge variant={trainerDraft.outputFormat.trim() ? "secondary" : "outline"}>Output</Badge>
                  </div>
                </div>

                <div className="overflow-hidden rounded-lg border border-border bg-background">
                  <div className="flex items-center justify-between border-b border-border bg-muted/20 px-3 py-2">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <Bot className="h-4 w-4 text-primary" />
                      Trainer Chat
                    </div>
                    <Button type="button" size="sm" variant="outline" onClick={runTrainerPreview} loading={trainerBusy === "run"} disabled={Boolean(trainerBusy)}>
                      <Play className="mr-2 h-4 w-4" />
                      Preview
                    </Button>
                  </div>
                  <div className="max-h-[min(48svh,28rem)] min-h-[16rem] space-y-2 overflow-y-auto p-3">
                    {trainerMessages.map((message, index) => (
                      <div
                        key={`${message.role}-${index}`}
                        className={`whitespace-pre-wrap rounded-lg px-3 py-2 text-sm leading-relaxed ${
                          message.role === "user"
                            ? "ml-auto max-w-[88%] bg-primary text-primary-foreground"
                            : message.role === "assistant"
                              ? "max-w-[92%] bg-muted text-foreground"
                              : "max-w-[92%] border border-border text-muted-foreground"
                        }`}
                      >
                        {message.text}
                      </div>
                    ))}
                    {trainerBusy === "chat" && (
                      <div className="max-w-[92%] rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
                        Updating the draft...
                      </div>
                    )}
                    {trainerBusy === "run" && (
                      <div className="max-w-[92%] rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
                        Checking the page and building a preview...
                      </div>
                    )}
                  </div>
                  <form
                    className="grid grid-cols-[minmax(0,1fr)_2.75rem] gap-2 border-t border-border p-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      sendTrainerMessage();
                    }}
                  >
                    <Input
                      value={trainerInput}
                      onChange={(event) => setTrainerInput(event.target.value)}
                      placeholder="Tell the agent what to improve..."
                      className="h-11 rounded-lg"
                    />
                    <Button type="submit" className="h-11 rounded-lg px-0" disabled={!trainerInput.trim() || Boolean(trainerBusy)} loading={trainerBusy === "chat"}>
                      <Send className="h-4 w-4" />
                    </Button>
                  </form>
                </div>

                <details className="hidden rounded-lg border border-border bg-muted/15 p-3 sm:block">
                  <summary className="cursor-pointer list-none text-sm font-semibold [&::-webkit-details-marker]:hidden">Voice coach</summary>
                  <div className="mt-3">
                    <DayzaLiveAgent
                      compact
                      title="Task Voice Coach"
                      subtitle="Talk through this task, test a draft by voice, then save when the preview is right."
                      initialSystemMessage="Start Live and explain how this task should behave."
                      tokenPayload={trainerLivePayload}
                      className="mb-0"
                    />
                  </div>
                </details>
              </div>
            </div>

            <div className="min-h-0 overflow-y-auto p-3 sm:p-4">
              <div className="space-y-4">
                <div>
                  <Label>Task name</Label>
                  <Input value={trainerDraft.name} onChange={(e) => setTrainerDraft({ ...trainerDraft, name: e.target.value })} className="mt-1" placeholder="Daily IPO check" />
                </div>
                <div>
                  <Label>Link</Label>
                  <Input value={trainerDraft.url} onChange={(e) => setTrainerDraft({ ...trainerDraft, url: e.target.value })} className="mt-1" placeholder="https://example.com/page" />
                </div>
                <div>
                  <Label>Task instruction</Label>
                  <Textarea value={trainerDraft.prompt} onChange={(e) => setTrainerDraft({ ...trainerDraft, prompt: e.target.value })} className="mt-1 min-h-24" placeholder="What should the agent check every time?" />
                </div>
                <div>
                  <Label>Training notes</Label>
                  <Textarea value={trainerDraft.trainingNotes} onChange={(e) => setTrainerDraft({ ...trainerDraft, trainingNotes: e.target.value })} className="mt-1 min-h-28" placeholder="Rules, examples, things to ignore, and how to decide what changed." />
                </div>
                <div>
                  <Label>Expected output</Label>
                  <Textarea value={trainerDraft.outputFormat} onChange={(e) => setTrainerDraft({ ...trainerDraft, outputFormat: e.target.value })} className="mt-1 min-h-24" placeholder="How should the final response look?" />
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <Label>Schedule</Label>
                    <Select value={trainerDraft.scheduleType} onValueChange={(value) => setTrainerDraft({ ...trainerDraft, scheduleType: value })}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="daily">Daily</SelectItem>
                        <SelectItem value="weekly">Weekly</SelectItem>
                        <SelectItem value="manual">Manual only</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Time</Label>
                    <Input type="time" value={trainerDraft.timeOfDay} onChange={(e) => setTrainerDraft({ ...trainerDraft, timeOfDay: e.target.value })} className="mt-1" disabled={trainerDraft.scheduleType === "manual"} />
                  </div>
                  <div>
                    <Label>Category</Label>
                    <Input value={trainerDraft.category} onChange={(e) => setTrainerDraft({ ...trainerDraft, category: e.target.value })} className="mt-1" placeholder="ipo" />
                  </div>
                </div>
                {trainerDraft.scheduleType === "weekly" && (
                  <div>
                    <Label>Days</Label>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {dayOptions.map(([value, label]) => (
                        <Button key={value} type="button" size="sm" variant={trainerDraft.daysOfWeek.split(",").includes(value) ? "default" : "outline"} onClick={() => {
                          const selected = new Set(trainerDraft.daysOfWeek.split(",").filter(Boolean));
                          if (selected.has(value)) selected.delete(value);
                          else selected.add(value);
                          setTrainerDraft({ ...trainerDraft, daysOfWeek: Array.from(selected).join(",") });
                        }}>
                          {label}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="rounded-lg border border-border bg-muted/20 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-primary" />
                      <p className="text-sm font-semibold">Preview answer</p>
                    </div>
                    <Badge variant={trainerDraft.previewSummary ? "secondary" : "outline"}>
                      {trainerDraft.previewSummary ? "Tested" : "Not run"}
                    </Badge>
                  </div>
                  {trainerDraft.previewSummary ? (
                    <p className="mt-3 max-h-44 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-foreground [overflow-wrap:anywhere]">
                      {trainerDraft.previewSummary}
                    </p>
                  ) : (
                    <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                      Run a preview to see exactly what Dayza will answer before this becomes a scheduled task.
                    </p>
                  )}
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <Button type="button" onClick={runTrainerPreview} variant="outline" loading={trainerBusy === "run"} disabled={Boolean(trainerBusy)}>
                    <Play className="mr-2 h-4 w-4" />
                    Run Preview
                  </Button>
                  <Button type="button" onClick={saveTrainerTask} loading={trainerBusy === "task"} disabled={Boolean(trainerBusy)}>
                    <Save className="mr-2 h-4 w-4" />
                    Save & Schedule
                  </Button>
                  <Button type="button" variant="outline" onClick={() => saveTrainerTemplate(false)} loading={trainerBusy === "template"} disabled={Boolean(trainerBusy)}>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Save Template
                  </Button>
                  <Button type="button" variant="outline" onClick={() => saveTrainerTemplate(true)} loading={trainerBusy === "share"} disabled={Boolean(trainerBusy)}>
                    <Share2 className="mr-2 h-4 w-4" />
                    Share
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(logTask)} onOpenChange={(open) => !open && setLogTask(null)}>
        <DialogContent className="inset-0 bottom-0 top-0 h-dvh max-h-dvh max-w-none translate-x-0 translate-y-0 overflow-y-auto rounded-none p-4 sm:bottom-auto sm:left-[50%] sm:top-[50%] sm:h-auto sm:max-h-[90svh] sm:max-w-3xl sm:translate-x-[-50%] sm:translate-y-[-50%] sm:rounded-lg sm:p-6">
          <DialogHeader><DialogTitle>{logTask?.name ?? "Task"} Run Logs</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {(logTask?.runs ?? []).length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">No runs yet.</div>
            ) : (logTask?.runs ?? []).map((run: any) => {
              const failed = run.status === "failed";
              const StatusIcon = failed ? XCircle : CheckCircle2;
              const details = structuredRun(run);
              const hasDetails = Boolean(details.summary || details.changes.length || details.importantItems.length || details.actionItems.length);
              return (
                <div key={run.id} className="rounded-2xl border border-border bg-muted/20 p-3">
                  <div className="flex items-start gap-3">
                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl ${failed ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"}`}>
                      <StatusIcon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={failed ? "destructive" : "secondary"}>{run.status}</Badge>
                        <span className="text-xs text-muted-foreground">{formatDate(run.finishedAt || run.startedAt)}</span>
                        {run.memoryUsed && <Badge variant="outline">memory used</Badge>}
                        {typeof run.confidence === "number" && <Badge variant="outline">{Math.round(run.confidence * 100)}% confidence</Badge>}
                      </div>
                      {run.error && <p className="mt-2 text-sm text-destructive">{run.error}</p>}
                      {hasDetails ? (
                        <div className="mt-3 space-y-2 text-sm">
                          {details.summary && (
                            <div className="rounded-xl bg-background/70 p-3">
                              <p className="text-xs font-semibold uppercase text-muted-foreground">Summary</p>
                              <p className="mt-1 text-foreground">{details.summary}</p>
                            </div>
                          )}
                          {details.changes.length > 0 && (
                            <div className="rounded-xl bg-background/70 p-3">
                              <p className="text-xs font-semibold uppercase text-muted-foreground">Changes</p>
                              <ul className="mt-1 list-disc space-y-1 pl-4 text-muted-foreground">
                                {details.changes.map((item, index) => <li key={`change-${index}`}>{item}</li>)}
                              </ul>
                            </div>
                          )}
                          {details.importantItems.length > 0 && (
                            <div className="rounded-xl bg-background/70 p-3">
                              <p className="text-xs font-semibold uppercase text-muted-foreground">Important</p>
                              <ul className="mt-1 list-disc space-y-1 pl-4 text-muted-foreground">
                                {details.importantItems.map((item, index) => <li key={`important-${index}`}>{item}</li>)}
                              </ul>
                            </div>
                          )}
                          {details.actionItems.length > 0 && (
                            <div className="rounded-xl bg-background/70 p-3">
                              <p className="text-xs font-semibold uppercase text-muted-foreground">Action</p>
                              <ul className="mt-1 list-disc space-y-1 pl-4 text-muted-foreground">
                                {details.actionItems.map((item, index) => <li key={`action-${index}`}>{item}</li>)}
                              </ul>
                            </div>
                          )}
                        </div>
                      ) : run.summary ? (
                        <pre className="mt-2 max-h-44 overflow-y-auto whitespace-pre-wrap rounded-xl bg-background/70 p-3 text-xs text-muted-foreground [overflow-wrap:anywhere]">{run.summary}</pre>
                      ) : null}
                      {run.rawPreview && (
                        <details className="mt-2 rounded-xl bg-background/50 p-3 text-xs text-muted-foreground">
                          <summary className="cursor-pointer font-semibold text-foreground">Raw page preview</summary>
                          <pre className="mt-2 max-h-36 overflow-y-auto whitespace-pre-wrap [overflow-wrap:anywhere]">{run.rawPreview}</pre>
                        </details>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
