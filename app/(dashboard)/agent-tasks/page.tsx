"use client";

import { useEffect, useMemo, useState } from "react";
import { Bot, CalendarClock, CheckCircle2, Clipboard, ExternalLink, History, Play, Plus, RefreshCw, Share2, Sparkles, Trash2, XCircle } from "lucide-react";
import Link from "next/link";
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

const blankForm = {
  name: "",
  prompt: "",
  outputFormat: "",
  templateId: "",
  url: "",
  scheduleType: "daily",
  timeOfDay: "09:00",
  daysOfWeek: "mon,tue,wed,thu,fri",
  active: "true",
  notifyOnRun: "true",
};

const blankTemplateForm = {
  name: "",
  description: "",
  prompt: "",
  outputFormat: "Return a short summary with: new items, changed items, important dates or amounts, and the action I should take.",
  category: "general",
  defaultScheduleType: "daily",
  defaultTimeOfDay: "09:00",
  defaultDaysOfWeek: "mon,tue,wed,thu,fri",
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

function improveTaskHref(task: any) {
  const prompt = `Help me improve this scheduled agent task so it extracts the right data without site-specific hardcoding.\n\nTask: ${task.name}\nInstruction: ${task.prompt}\nURL: ${task.url || "-"}\nSchedule: ${scheduleLabel(task)}\n\nAsk me any needed questions, then suggest a clearer task instruction.`;
  return `/chat?from=/agent-tasks&prompt=${encodeURIComponent(prompt)}`;
}

export default function AgentTasksPage() {
  const [tasks, setTasks] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [cronInfo, setCronInfo] = useState<any>(null);
  const [vectorMemoryInfo, setVectorMemoryInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState<string | null>(null);
  const [runningTaskId, setRunningTaskId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [logTask, setLogTask] = useState<any>(null);
  const [form, setForm] = useState(blankForm);
  const [templateForm, setTemplateForm] = useState(blankTemplateForm);

  const activeCount = useMemo(() => tasks.filter((task) => task.active).length, [tasks]);
  const upcomingTasks = useMemo(() => (
    tasks
      .filter((task) => task.active && task.nextRunAt)
      .sort((a, b) => new Date(a.nextRunAt).getTime() - new Date(b.nextRunAt).getTime())
      .slice(0, 5)
  ), [tasks]);
  const approvedTemplates = useMemo(() => templates.filter((template) => template.status === "approved" || template.status === "private"), [templates]);

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

  const saveTemplate = async (share: boolean) => {
    if (!templateForm.name.trim() || !templateForm.prompt.trim()) {
      toast.error("Template name and training details are required");
      return;
    }
    setSavingTemplate(share ? "share" : "private");
    try {
      const res = await fetch("/api/agent-task-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...templateForm,
          shared: share,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? "Failed to save template");
        return;
      }
      toast.success(share ? "Template sent for admin approval" : "Template saved");
      setTemplateForm(blankTemplateForm);
      setTemplateDialogOpen(false);
      loadTemplates();
    } catch {
      toast.error("Failed to save template");
    } finally {
      setSavingTemplate(null);
    }
  };

  const useTemplate = (template: any) => {
    setForm({
      ...blankForm,
      name: template.name ?? "",
      prompt: template.prompt ?? "",
      outputFormat: template.outputFormat ?? "",
      templateId: template.id ?? "",
      scheduleType: template.defaultScheduleType ?? "daily",
      timeOfDay: template.defaultTimeOfDay ?? "09:00",
      daysOfWeek: template.defaultDaysOfWeek ?? "mon,tue,wed,thu,fri",
      active: "true",
      notifyOnRun: "true",
    });
    setDialogOpen(true);
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

  const toggleDay = (day: string) => {
    const selected = new Set(form.daysOfWeek.split(",").filter(Boolean));
    if (selected.has(day)) selected.delete(day);
    else selected.add(day);
    setForm({ ...form, daysOfWeek: Array.from(selected).join(",") });
  };

  const applyTemplate = (template: typeof taskTemplates[number]) => {
    setForm({
      ...blankForm,
      ...template,
      outputFormat: "Return new, changed, or important items only. Include names, dates, amounts, and action needed.",
      active: "true",
      notifyOnRun: "true",
    });
    setDialogOpen(true);
  };

  const copyText = async (value: string, label: string) => {
    await navigator.clipboard.writeText(value);
    toast.success(`${label} copied`);
  };

  return (
    <div className="space-y-5 sm:space-y-6">
      <FadeIn>
        <div className="grid gap-3 sm:flex sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h2 className="font-display text-2xl font-bold leading-tight tracking-tight">Agent Tasks</h2>
            <p className="mt-1 text-sm text-muted-foreground">Schedule Dayza Agent to check links and run recurring tasks.</p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <Button type="button" variant="outline" onClick={loadTasks} disabled={loading}>
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
              <DialogTrigger asChild>
                <Button type="button" variant="outline"><Sparkles className="mr-2 h-4 w-4" />Train</Button>
              </DialogTrigger>
              <DialogContent className="max-h-[90svh] max-w-xl overflow-y-auto">
                <DialogHeader><DialogTitle>Train Agent Task Template</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>Template name</Label>
                    <Input value={templateForm.name} onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })} className="mt-1" placeholder="Daily IPO change check" />
                  </div>
                  <div>
                    <Label>What should the agent do?</Label>
                    <Textarea value={templateForm.prompt} onChange={(e) => setTemplateForm({ ...templateForm, prompt: e.target.value })} className="mt-1 min-h-28" placeholder="Check the page and identify newly listed IPOs, GMP changes, subscription changes, dates, and anything important." />
                  </div>
                  <div>
                    <Label>Expected output</Label>
                    <Textarea value={templateForm.outputFormat} onChange={(e) => setTemplateForm({ ...templateForm, outputFormat: e.target.value })} className="mt-1 min-h-24" placeholder="Return bullet points grouped as New, Changed, Important, Action needed." />
                  </div>
                  <div>
                    <Label>Description</Label>
                    <Input value={templateForm.description} onChange={(e) => setTemplateForm({ ...templateForm, description: e.target.value })} className="mt-1" placeholder="Reusable IPO monitor template" />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div>
                      <Label>Default schedule</Label>
                      <Select value={templateForm.defaultScheduleType} onValueChange={(value) => setTemplateForm({ ...templateForm, defaultScheduleType: value })}>
                        <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="daily">Daily</SelectItem>
                          <SelectItem value="weekly">Weekly</SelectItem>
                          <SelectItem value="manual">Manual only</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Default time</Label>
                      <Input type="time" value={templateForm.defaultTimeOfDay} onChange={(e) => setTemplateForm({ ...templateForm, defaultTimeOfDay: e.target.value })} className="mt-1" disabled={templateForm.defaultScheduleType === "manual"} />
                    </div>
                    <div>
                      <Label>Category</Label>
                      <Input value={templateForm.category} onChange={(e) => setTemplateForm({ ...templateForm, category: e.target.value })} className="mt-1" placeholder="ipo" />
                    </div>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Button type="button" onClick={() => saveTemplate(false)} loading={savingTemplate === "private"} disabled={Boolean(savingTemplate)}>
                      Save Private Template
                    </Button>
                    <Button type="button" variant="outline" onClick={() => saveTemplate(true)} loading={savingTemplate === "share"} disabled={Boolean(savingTemplate)}>
                      <Share2 className="mr-2 h-4 w-4" />
                      Share for Approval
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button type="button"><Plus className="mr-2 h-4 w-4" />Task</Button>
              </DialogTrigger>
              <DialogContent className="max-h-[90svh] max-w-xl overflow-y-auto">
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
      </FadeIn>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Total tasks</p><p className="font-mono text-2xl font-bold">{tasks.length}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Active</p><p className="font-mono text-2xl font-bold">{activeCount}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Next run</p><p className="truncate text-sm font-semibold">{formatDate(upcomingTasks[0]?.nextRunAt)}</p></CardContent></Card>
      </div>

      <FadeIn delay={0.04}>
        <Card className="border-primary/25">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <CalendarClock className="h-5 w-5 text-primary" />
              Cron Setup
            </CardTitle>
            <p className="text-sm text-muted-foreground">Use this in cron-job.org. Vercel cron is not needed.</p>
          </CardHeader>
          <CardContent className="space-y-3">
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
          </CardContent>
        </Card>
      </FadeIn>

      <FadeIn delay={0.06}>
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

      <FadeIn delay={0.08}>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Sparkles className="h-5 w-5 text-primary" />
              Trained Templates
            </CardTitle>
            <p className="text-sm text-muted-foreground">Save your task instruction and expected output once, then reuse it for new links.</p>
          </CardHeader>
          <CardContent>
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
        </Card>
      </FadeIn>

      <FadeIn delay={0.1}>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Quick Templates</CardTitle>
            <p className="text-sm text-muted-foreground">Start from a common recurring task, then add the link.</p>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
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
        </Card>
      </FadeIn>

      <div className="grid gap-3">
        {loading ? (
          <Card><CardContent className="p-6 text-sm text-muted-foreground">Loading tasks...</CardContent></Card>
        ) : tasks.length === 0 ? (
          <Card><CardContent className="flex flex-col items-center py-12 text-center text-muted-foreground"><Bot className="mb-3 h-10 w-10 text-primary/40" /><p className="font-semibold text-foreground">No scheduled agent tasks yet</p><p className="mt-1 text-sm">Create one for daily IPO checks, price checks, or link monitoring.</p></CardContent></Card>
        ) : tasks.map((task) => (
          <Card key={task.id}>
            <CardContent className="space-y-4 p-4">
              <div className="grid gap-3 sm:flex sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold">{task.name}</h3>
                    <Badge variant={task.active ? "secondary" : "outline"}>{task.active ? "Active" : "Paused"}</Badge>
                    <Badge variant="outline">{task.scheduleType}</Badge>
                    {task.lastStatus && <Badge variant={task.lastStatus === "failed" ? "destructive" : "outline"}>{task.lastStatus}</Badge>}
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
                  <Button type="button" variant="outline" size="sm" onClick={() => runNow(task)} loading={runningTaskId === task.id} disabled={Boolean(runningTaskId)}>
                    <Play className="mr-1 h-4 w-4" />Run
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => toggleTask(task)}>
                    {task.active ? "Pause" : "Resume"}
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => setLogTask(task)}>
                    <History className="h-4 w-4" />
                  </Button>
                  <Button asChild type="button" variant="outline" size="sm">
                    <Link href={improveTaskHref(task)}>
                      <Bot className="h-4 w-4" />
                    </Link>
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => deleteTask(task)} className="hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="grid gap-2 rounded-lg bg-muted/35 p-3 text-sm sm:grid-cols-3">
                <div><span className="text-muted-foreground">Next run</span><p>{formatDate(task.nextRunAt)}</p></div>
                <div><span className="text-muted-foreground">Last</span><p>{formatDate(task.lastRunAt)}</p></div>
                <div><span className="text-muted-foreground">Schedule</span><p>{scheduleLabel(task)}</p></div>
              </div>
              {task.lastSummary && (
                <div className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-lg bg-muted/35 p-3 text-xs text-muted-foreground [overflow-wrap:anywhere]">
                  {task.lastSummary}
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
        ))}
      </div>

      <Dialog open={Boolean(logTask)} onOpenChange={(open) => !open && setLogTask(null)}>
        <DialogContent className="max-h-[90svh] max-w-3xl overflow-y-auto">
          <DialogHeader><DialogTitle>{logTask?.name ?? "Task"} Run Logs</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {(logTask?.runs ?? []).length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">No runs yet.</div>
            ) : (logTask?.runs ?? []).map((run: any) => {
              const failed = run.status === "failed";
              const StatusIcon = failed ? XCircle : CheckCircle2;
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
                      </div>
                      {run.error && <p className="mt-2 text-sm text-destructive">{run.error}</p>}
                      {run.summary && <pre className="mt-2 max-h-44 overflow-y-auto whitespace-pre-wrap rounded-xl bg-background/70 p-3 text-xs text-muted-foreground [overflow-wrap:anywhere]">{run.summary}</pre>}
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
