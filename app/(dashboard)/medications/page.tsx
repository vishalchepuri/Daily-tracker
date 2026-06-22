"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Bell,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock,
  Loader2,
  Package,
  PauseCircle,
  Pill,
  PlayCircle,
  Plus,
  Search,
  SkipForward,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { FadeIn } from "@/components/ui/animate";
import { dateTimeInputToIso, formatAppDate, formatAppDateTime, formatLocalDateInput, getZonedDateParts } from "@/lib/local-dates";

const blankForm = {
  id: "",
  name: "",
  dosage: "",
  instructions: "",
  timeOfDay: "08:00",
  recurrence: "daily",
  recurrenceCustom: "",
  daysOfWeek: "",
  dayOfMonth: "",
  startDate: "",
  endDate: "",
  stockCount: "",
  doseUnits: "1",
  refillAt: "",
  refillNotes: "",
  active: true,
};

const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const recurrenceOptions = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "custom", label: "Custom" },
];

const statusOptions = [
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "all", label: "All" },
];

function atDateTime(timeOfDay: string, baseDate = new Date()) {
  return new Date(dateTimeInputToIso(formatLocalDateInput(baseDate), timeOfDay));
}

function todayAt(timeOfDay: string) {
  return atDateTime(timeOfDay);
}

function dateInputValue(date: Date) {
  return formatLocalDateInput(date);
}

function dateLabel(date: Date) {
  return formatAppDate(date, { weekday: "short", month: "short", day: "numeric" });
}

function formatRepeat(med: any) {
  if (med.recurrence === "weekly") return `Weekly${med.daysOfWeek ? `: ${med.daysOfWeek}` : ""}`;
  if (med.recurrence === "monthly") return `Monthly${med.dayOfMonth ? ` on day ${med.dayOfMonth}` : ""}`;
  if (med.recurrence === "custom") return med.recurrenceCustom || "Custom";
  return "Daily";
}

function isSameDay(a: Date, b: Date) {
  return formatLocalDateInput(a) === formatLocalDateInput(b);
}

function isMedicationDueOn(med: any, date = new Date()) {
  if (!med.active) return false;
  const zoned = getZonedDateParts(date);
  const dayStart = new Date(dateTimeInputToIso(zoned.dateKey, "00:00"));
  const dayEnd = new Date(dateTimeInputToIso(zoned.dateKey, "23:59"));
  const startDate = med.startDate ? new Date(med.startDate) : null;
  const endDate = med.endDate ? new Date(med.endDate) : null;
  if (startDate) {
    const startKey = formatLocalDateInput(startDate);
    startDate.setTime(new Date(dateTimeInputToIso(startKey, "00:00")).getTime());
    if (dayStart < startDate) return false;
  }
  if (endDate) {
    const endKey = formatLocalDateInput(endDate);
    endDate.setTime(new Date(dateTimeInputToIso(endKey, "23:59")).getTime());
    if (dayEnd > endDate) return false;
  }

  if (med.recurrence === "weekly") {
    const selectedDays = String(med.daysOfWeek ?? "").split(",").filter(Boolean);
    return selectedDays.length === 0 || selectedDays.includes(zoned.weekday);
  }
  if (med.recurrence === "monthly") {
    return !med.dayOfMonth || Number(med.dayOfMonth) === Number(zoned.day);
  }
  return true;
}

export default function MedicationsPage() {
  const [medications, setMedications] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [savingMedication, setSavingMedication] = useState(false);
  const [showRefillFields, setShowRefillFields] = useState(false);
  const [showMedicationExtras, setShowMedicationExtras] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [doseNotes, setDoseNotes] = useState<Record<string, string>>({});
  const [selectedDate, setSelectedDate] = useState(dateInputValue(new Date()));
  const [form, setForm] = useState(blankForm);
  const [pendingDoseActions, setPendingDoseActions] = useState<Record<string, "taken" | "skipped">>({});
  const [pendingMedicationActions, setPendingMedicationActions] = useState<Record<string, "toggle" | "delete">>({});
  const [pendingLogActions, setPendingLogActions] = useState<Record<string, "delete">>({});
  const [markingAll, setMarkingAll] = useState(false);
  const [expandedMedicationIds, setExpandedMedicationIds] = useState<Record<string, boolean>>({});
  const saveMedicationLock = useRef(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [medicationRes, logRes] = await Promise.all([
        fetch("/api/medications"),
        fetch("/api/medications/logs?limit=50"),
      ]);
      if (medicationRes.ok) {
        const data = await medicationRes.json();
        setMedications(data?.medications ?? []);
      }
      if (logRes.ok) {
        const data = await logRes.json();
        setLogs(data?.logs ?? []);
      }
    } catch (error) {
      console.error(error);
      toast.error("Failed to load medications");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const activeMeds = medications.filter((med) => med.active);
  const scheduleDate = useMemo(() => {
    const date = new Date(dateTimeInputToIso(selectedDate, "00:00"));
    return Number.isNaN(date.getTime()) ? new Date() : date;
  }, [selectedDate]);
  const dueTodayMeds = activeMeds
    .filter((med) => isMedicationDueOn(med))
    .sort((a, b) => todayAt(a.timeOfDay).getTime() - todayAt(b.timeOfDay).getTime());
  const dueSelectedMeds = activeMeds
    .filter((med) => isMedicationDueOn(med, scheduleDate))
    .sort((a, b) => atDateTime(a.timeOfDay, scheduleDate).getTime() - atDateTime(b.timeOfDay, scheduleDate).getTime());
  const todayLogs = useMemo(() => {
    const todayKey = dateInputValue(new Date());
    const start = new Date(dateTimeInputToIso(todayKey, "00:00"));
    const end = new Date(dateTimeInputToIso(todayKey, "23:59"));
    return logs.filter((log) => {
      const date = new Date(log.scheduledFor);
      return date >= start && date <= end;
    });
  }, [logs]);
  const selectedDateLogs = useMemo(() => {
    return logs.filter((log) => isSameDay(new Date(log.scheduledFor), scheduleDate));
  }, [logs, scheduleDate]);
  const missedToday = dueTodayMeds.filter((med) => {
    const scheduled = todayAt(med.timeOfDay);
    return scheduled.getTime() < Date.now() && !todayLogs.some((log) => log.medicationId === med.id);
  }).length;
  const adherenceLogs = logs.slice(0, 30);
  const adherenceRate = adherenceLogs.length
    ? Math.round((adherenceLogs.filter((log) => log.status === "taken").length / adherenceLogs.length) * 100)
    : 0;
  const refillAlerts = medications.filter((med) => {
    if (med.stockCount == null || med.refillAt == null) return false;
    return Number(med.stockCount) <= Number(med.refillAt);
  });
  const nextDose = dueTodayMeds.find((med) => !todayLogs.some((log) => log.medicationId === med.id));
  const upcomingWeek = useMemo(() => {
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date();
      date.setDate(date.getDate() + index);
      const due = activeMeds.filter((med) => isMedicationDueOn(med, date));
      const dateLogs = logs.filter((log) => isSameDay(new Date(log.scheduledFor), date));
      const taken = dateLogs.filter((log) => log.status === "taken").length;
      return { date, due, taken };
    });
  }, [activeMeds, logs]);
  const filteredMedications = medications.filter((med) => {
    const matchesSearch = !search.trim() || `${med.name} ${med.dosage ?? ""} ${med.instructions ?? ""}`.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || (statusFilter === "active" ? med.active : !med.active);
    return matchesSearch && matchesStatus;
  });

  const logByMedicationToday = useMemo(() => {
    const map = new Map<string, any>();
    for (const log of todayLogs) map.set(log.medicationId, log);
    return map;
  }, [todayLogs]);
  const logByMedicationSelectedDate = useMemo(() => {
    const map = new Map<string, any>();
    for (const log of selectedDateLogs) map.set(log.medicationId, log);
    return map;
  }, [selectedDateLogs]);

  const openAdd = () => {
    setForm(blankForm);
    setShowRefillFields(false);
    setDialogOpen(true);
  };

  const openEdit = (med: any) => {
    setForm({
      id: med.id,
      name: med.name ?? "",
      dosage: med.dosage ?? "",
      instructions: med.instructions ?? "",
      timeOfDay: med.timeOfDay ?? "08:00",
      recurrence: med.recurrence ?? "daily",
      recurrenceCustom: med.recurrenceCustom ?? "",
      daysOfWeek: med.daysOfWeek ?? "",
      dayOfMonth: med.dayOfMonth ? String(med.dayOfMonth) : "",
      startDate: med.startDate ? formatLocalDateInput(new Date(med.startDate)) : "",
      endDate: med.endDate ? formatLocalDateInput(new Date(med.endDate)) : "",
      stockCount: med.stockCount == null ? "" : String(med.stockCount),
      doseUnits: med.doseUnits == null ? "1" : String(med.doseUnits),
      refillAt: med.refillAt == null ? "" : String(med.refillAt),
      refillNotes: med.refillNotes ?? "",
      active: Boolean(med.active),
    });
    setShowRefillFields(med.stockCount != null || med.refillAt != null || Boolean(med.refillNotes));
    setDialogOpen(true);
  };

  const saveMedication = async () => {
    if (savingMedication || saveMedicationLock.current) return;
    if (!form.name || !form.timeOfDay) {
      toast.error("Medication name and time are required");
      return;
    }
    saveMedicationLock.current = true;
    setSavingMedication(true);
    try {
      const res = await fetch("/api/medications", {
        method: form.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.error ?? "Failed to save medication");
        return;
      }
      toast.success(form.id ? "Medication updated" : "Medication added");
      setDialogOpen(false);
      loadData();
    } catch {
      toast.error("Failed to save medication");
    } finally {
      saveMedicationLock.current = false;
      setSavingMedication(false);
    }
  };

  const setMedicationAction = (id: string, action: "toggle" | "delete" | null) => {
    setPendingMedicationActions((current) => {
      const next = { ...current };
      if (action) next[id] = action;
      else delete next[id];
      return next;
    });
  };

  const deleteMedication = async (med: any) => {
    if (pendingMedicationActions[med.id]) return;
    const previousMedications = medications;
    setMedicationAction(med.id, "delete");
    setMedications((current) => current.filter((item) => item.id !== med.id));
    try {
      const res = await fetch(`/api/medications?id=${med.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMedications(previousMedications);
        toast.error(data?.error ?? "Failed to delete medication");
        return;
      }
      toast.success("Medication deleted");
      if (dialogOpen && form.id === med.id) setDialogOpen(false);
      loadData();
    } catch {
      setMedications(previousMedications);
      toast.error("Failed to delete medication");
    } finally {
      setMedicationAction(med.id, null);
    }
  };

  const deleteMedicationFromSheet = async () => {
    if (!form.id) return;
    const med = medications.find((item) => item.id === form.id);
    if (med) await deleteMedication(med);
  };

  const setDoseAction = (key: string, action: "taken" | "skipped" | null) => {
    setPendingDoseActions((current) => {
      const next = { ...current };
      if (action) next[key] = action;
      else delete next[key];
      return next;
    });
  };

  const logDose = async (med: any, status: "taken" | "skipped", date = new Date()) => {
    const actionKey = `${med.id}:${formatLocalDateInput(date)}`;
    if (pendingDoseActions[actionKey]) return;
    setDoseAction(actionKey, status);
    try {
      const res = await fetch("/api/medications/logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          medicationId: med.id,
          status,
          scheduledFor: atDateTime(med.timeOfDay, date).toISOString(),
          notes: doseNotes[med.id] || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.error ?? "Failed to log dose");
        return;
      }
      toast.success(status === "taken" ? "Dose marked taken" : "Dose skipped");
      setDoseNotes((prev) => ({ ...prev, [med.id]: "" }));
      loadData();
    } catch {
      toast.error("Failed to log dose");
    } finally {
      setDoseAction(actionKey, null);
    }
  };

  const markSelectedScheduleTaken = async () => {
    const pending = dueSelectedMeds.filter((med) => !logByMedicationSelectedDate.has(med.id));
    if (pending.length === 0) {
      toast.info("No pending doses for this date");
      return;
    }
    setMarkingAll(true);
    try {
      const responses = await Promise.all(
        pending.map((med) =>
          fetch("/api/medications/logs", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              medicationId: med.id,
              status: "taken",
              scheduledFor: atDateTime(med.timeOfDay, scheduleDate).toISOString(),
            }),
          })
        )
      );
      const failed = responses.filter((res) => !res.ok).length;
      if (failed) toast.error(`Could not mark ${failed} dose${failed === 1 ? "" : "s"}`);
      else toast.success(`Marked ${pending.length} dose${pending.length === 1 ? "" : "s"} taken`);
      loadData();
    } catch {
      toast.error("Failed to mark doses");
    } finally {
      setMarkingAll(false);
    }
  };

  const toggleMedicationActive = async (med: any) => {
    if (pendingMedicationActions[med.id]) return;
    const previousMedications = medications;
    setMedicationAction(med.id, "toggle");
    setMedications((current) => current.map((item) => item.id === med.id ? { ...item, active: !item.active } : item));
    try {
      const res = await fetch("/api/medications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: med.id, active: !med.active }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMedications(previousMedications);
        toast.error(data?.error ?? "Failed to update medication");
        return;
      }
      toast.success(!med.active ? "Medication resumed" : "Medication paused");
      loadData();
    } catch {
      setMedications(previousMedications);
      toast.error("Failed to update medication");
    } finally {
      setMedicationAction(med.id, null);
    }
  };

  const deleteLog = async (log: any) => {
    if (pendingLogActions[log.id]) return;
    setPendingLogActions((current) => ({ ...current, [log.id]: "delete" }));
    const previousLogs = logs;
    setLogs((current) => current.filter((item) => item.id !== log.id));
    try {
      const res = await fetch(`/api/medications/logs?id=${log.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLogs(previousLogs);
        toast.error(data?.error ?? "Failed to delete log");
        return;
      }
      toast.success("Log deleted");
      loadData();
    } catch {
      setLogs(previousLogs);
      toast.error("Failed to delete log");
    } finally {
      setPendingLogActions((current) => {
        const next = { ...current };
        delete next[log.id];
        return next;
      });
    }
  };

  const summaryTiles = [
    { label: "Active", value: activeMeds.length, icon: Pill, color: "text-emerald-300", tile: "bg-emerald-500/12 border-emerald-500/20" },
    { label: "Due Today", value: dueTodayMeds.length, icon: Bell, color: "text-blue-300", tile: "bg-blue-500/12 border-blue-500/20" },
    { label: "Missed", value: missedToday, icon: AlertTriangle, color: "text-red-300", tile: "bg-red-500/12 border-red-500/20" },
    { label: "Adherence", value: logs.length ? `${adherenceRate}%` : "0%", icon: CheckCircle2, color: "text-purple-300", tile: "bg-purple-500/12 border-purple-500/20" },
  ];

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 overflow-x-hidden pb-6 sm:space-y-6">
      <FadeIn>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-primary/80">Dayza</p>
            <h2 className="mt-1 text-3xl font-bold leading-none tracking-tight sm:text-4xl">Medications</h2>
          </div>
          <Dialog open={dialogOpen} onOpenChange={(open) => { if (!savingMedication) setDialogOpen(open); }}>
            <DialogTrigger asChild>
              <Button onClick={openAdd} className="h-12 rounded-2xl px-4 text-base shadow-lg shadow-primary/20 active:scale-95 sm:h-11 sm:text-sm">
                <Plus className="h-5 w-5" />
                New
              </Button>
            </DialogTrigger>
            <MedicationSheet
              form={form}
              setForm={setForm}
              savingMedication={savingMedication}
              saveMedication={saveMedication}
              showRefillFields={showRefillFields}
              setShowRefillFields={setShowRefillFields}
              deleteMedicationFromSheet={deleteMedicationFromSheet}
              deleting={Boolean(form.id && pendingMedicationActions[form.id] === "delete")}
            />
          </Dialog>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {summaryTiles.map((tile) => <SummaryTile key={tile.label} {...tile} />)}
        </div>
      </FadeIn>

      {refillAlerts.length > 0 && (
        <FadeIn delay={0.04}>
          <section className="overflow-hidden rounded-[26px] border border-amber-500/35 bg-amber-500/5 shadow-sm shadow-black/10">
            <div className="flex items-center justify-between gap-3 px-4 py-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-300">
                  <Package className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <h3 className="font-bold">Refill Needed</h3>
                  <p className="truncate text-sm text-muted-foreground">{refillAlerts.map((med) => med.name).slice(0, 3).join(", ")}</p>
                </div>
              </div>
              <Badge variant="outline" className="border-amber-500/40 text-amber-300">{refillAlerts.length}</Badge>
            </div>
          </section>
        </FadeIn>
      )}

      {nextDose && (
        <FadeIn delay={0.06}>
          <section className="overflow-hidden rounded-[26px] border border-primary/30 bg-primary/5 shadow-sm shadow-black/10">
            <div className="grid gap-3 p-4 sm:grid-cols-[1fr_auto] sm:items-center">
              <div className="min-w-0">
                <p className="text-sm font-medium text-muted-foreground">Next dose today</p>
                <h3 className="mt-1 truncate text-xl font-bold">{nextDose.name} {nextDose.dosage ? `- ${nextDose.dosage}` : ""}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{nextDose.timeOfDay} - {nextDose.instructions || "No instructions"}</p>
              </div>
              <DoseActions med={nextDose} date={new Date()} existingLog={logByMedicationToday.get(nextDose.id)} pendingDoseActions={pendingDoseActions} onLog={logDose} />
            </div>
          </section>
        </FadeIn>
      )}

      <FadeIn delay={0.08}>
        <section className="overflow-hidden rounded-[26px] border border-border/70 bg-card/90 shadow-sm shadow-black/10">
          <div className="grid gap-3 border-b border-border/70 px-4 py-4 sm:grid-cols-[1fr_auto] sm:items-center sm:px-5">
            <div className="min-w-0">
              <h3 className="flex items-center gap-2 text-xl font-bold tracking-tight">
                <CalendarDays className="h-5 w-5 text-primary" />
                Schedule
              </h3>
              <p className="mt-0.5 text-sm text-muted-foreground">{dateLabel(scheduleDate)} - {dueSelectedMeds.length} planned</p>
            </div>
            <div className="grid grid-cols-1 gap-2 min-[440px]:grid-cols-[1fr_auto]">
              <Input
                type="date"
                value={selectedDate}
                onChange={(event) => setSelectedDate(event.target.value)}
                className="h-12 min-w-0 rounded-2xl bg-background/70 text-base"
              />
              <Button type="button" variant="outline" onClick={markSelectedScheduleTaken} loading={markingAll} disabled={markingAll} className="h-12 rounded-2xl active:scale-95">
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Mark All
              </Button>
            </div>
          </div>
          <div className="p-2 sm:p-3">
            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((item) => <div key={item} className="h-20 animate-pulse rounded-[22px] bg-muted/50" />)}
              </div>
            ) : dueSelectedMeds.length === 0 ? (
              <div className="rounded-[22px] border border-dashed border-border/70 bg-background/40 px-6 py-14 text-center">
                <Pill className="mx-auto h-10 w-10 text-muted-foreground/40" />
                <p className="mt-3 font-semibold">No medications scheduled</p>
                <p className="mt-1 text-sm text-muted-foreground">Tap New to add a medication.</p>
              </div>
            ) : (
              <div className="divide-y divide-border/55 overflow-hidden rounded-[22px] bg-background/45">
                {dueSelectedMeds.map((med) => {
                  const existingLog = logByMedicationSelectedDate.get(med.id);
                  const scheduled = atDateTime(med.timeOfDay, scheduleDate);
                  const isOverdue = isSameDay(scheduleDate, new Date()) && !existingLog && scheduled.getTime() < Date.now();
                  return (
                    <div key={med.id} className={`grid gap-3 p-4 transition ${isOverdue ? "bg-destructive/10" : ""}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h4 className={`truncate font-semibold ${isOverdue ? "text-destructive" : ""}`}>{med.name}</h4>
                          <p className="mt-1 text-sm text-muted-foreground">{med.dosage || "No dosage set"}</p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <Badge variant="secondary"><Clock className="mr-1 h-3 w-3" />{med.timeOfDay}</Badge>
                          {existingLog ? <Badge variant="outline">{existingLog.status}</Badge> : isOverdue ? <Badge variant="destructive">Overdue</Badge> : <Badge variant="outline">Upcoming</Badge>}
                        </div>
                      </div>
                      {med.instructions && <p className="text-sm text-muted-foreground">{med.instructions}</p>}
                      {!existingLog && (
                        <Input
                          value={doseNotes[med.id] ?? ""}
                          onChange={(event) => setDoseNotes({ ...doseNotes, [med.id]: event.target.value })}
                          className="h-12 rounded-2xl bg-card/80"
                          placeholder="Optional note"
                        />
                      )}
                      <DoseActions med={med} date={scheduleDate} existingLog={existingLog} pendingDoseActions={pendingDoseActions} onLog={logDose} />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </FadeIn>

      <FadeIn delay={0.1}>
        <section className="overflow-hidden rounded-[26px] border border-border/70 bg-card/90 shadow-sm shadow-black/10">
          <div className="grid gap-3 border-b border-border/70 px-4 py-4 sm:grid-cols-[1fr_auto] sm:items-center sm:px-5">
            <div className="min-w-0">
              <h3 className="text-xl font-bold tracking-tight">Medication List</h3>
              <p className="mt-0.5 text-sm text-muted-foreground">{filteredMedications.length} item{filteredMedications.length === 1 ? "" : "s"}</p>
            </div>
            <div className="grid gap-2 sm:w-[22rem]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={search} onChange={(event) => setSearch(event.target.value)} className="h-12 rounded-2xl bg-background/70 pl-9" placeholder="Search medicines" />
              </div>
              <MiniSegmentedPicker value={statusFilter} options={statusOptions} onChange={setStatusFilter} />
            </div>
          </div>
          <div className="p-2 sm:p-3">
            {filteredMedications.length === 0 ? (
              <div className="rounded-[22px] border border-dashed border-border/70 bg-background/40 px-6 py-14 text-center">
                <Pill className="mx-auto h-10 w-10 text-muted-foreground/40" />
                <p className="mt-3 font-semibold">No medications here</p>
              </div>
            ) : (
              <div className="divide-y divide-border/55 overflow-hidden rounded-[22px] bg-background/45">
                {filteredMedications.map((med) => {
                  const pending = pendingMedicationActions[med.id];
                  const isExpanded = Boolean(expandedMedicationIds[med.id]);
                  const refillLow = med.stockCount != null && med.refillAt != null && med.stockCount <= med.refillAt;
                  return (
                    <div key={med.id} className={`${med.active ? "" : "opacity-70"}`}>
                      <button
                        type="button"
                        onClick={() => setExpandedMedicationIds((current) => ({ ...current, [med.id]: !current[med.id] }))}
                        className="grid min-h-[4.75rem] w-full touch-manipulation grid-cols-[1fr_auto] items-center gap-3 px-4 py-3 text-left transition active:scale-[0.995] active:bg-muted/80"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-[1rem] font-semibold leading-tight">{med.name}</span>
                          <span className="mt-1 block truncate text-xs text-muted-foreground">{med.timeOfDay} - {formatRepeat(med)}{med.dosage ? ` - ${med.dosage}` : ""}</span>
                          {refillLow && <span className="mt-1 block text-xs text-amber-400">Stock low: {med.stockCount} left</span>}
                        </span>
                        <span className="flex items-center gap-2">
                          <Badge variant={med.active ? "secondary" : "outline"}>{med.active ? "Active" : "Paused"}</Badge>
                          <ChevronRight className={`h-5 w-5 text-muted-foreground transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                        </span>
                      </button>
                      {isExpanded && (
                        <div className="space-y-3 px-4 pb-4">
                          {med.instructions && <p className="text-sm text-muted-foreground">{med.instructions}</p>}
                          <div className="flex flex-wrap gap-2">
                            <Badge variant="outline">{formatRepeat(med)}</Badge>
                            {med.stockCount != null && <Badge variant={refillLow ? "destructive" : "outline"}>{med.stockCount} left</Badge>}
                          </div>
                          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                            <Button variant="outline" size="sm" onClick={() => toggleMedicationActive(med)} loading={pending === "toggle"} disabled={Boolean(pending)} className="rounded-full active:scale-95">
                              {med.active ? <PauseCircle className="mr-1 h-3 w-3" /> : <PlayCircle className="mr-1 h-3 w-3" />}
                              {med.active ? "Pause" : "Resume"}
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => openEdit(med)} disabled={Boolean(pending)} className="rounded-full active:scale-95">
                              Edit
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => deleteMedication(med)} loading={pending === "delete"} disabled={Boolean(pending) && pending !== "delete"} className="rounded-full border-destructive/40 text-destructive hover:bg-destructive/10 active:scale-95">
                              <Trash2 className="mr-1 h-3 w-3" />
                              Delete
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </FadeIn>

      <div className="rounded-[24px] border border-border/70 bg-card/85 p-2 shadow-sm shadow-black/10 sm:hidden">
        <Button type="button" variant="ghost" className="h-12 w-full justify-between rounded-2xl active:scale-[0.99]" onClick={() => setShowMedicationExtras((current) => !current)}>
          {showMedicationExtras ? "Hide weekly view and history" : "Show weekly view and history"}
          <ChevronRight className={`h-5 w-5 transition-transform ${showMedicationExtras ? "rotate-90" : ""}`} />
        </Button>
      </div>

      <section className={`overflow-hidden rounded-[26px] border border-border/70 bg-card/90 shadow-sm shadow-black/10 ${showMedicationExtras ? "" : "hidden sm:block"}`}>
        <div className="border-b border-border/70 px-4 py-4 sm:px-5">
          <h3 className="flex items-center gap-2 text-xl font-bold tracking-tight">
            <CalendarDays className="h-5 w-5 text-primary" />
            Next 7 Days
          </h3>
        </div>
        <div className="grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-7">
          {upcomingWeek.map((day) => (
            <div key={day.date.toISOString()} className="rounded-[20px] border border-border/60 bg-background/45 p-3">
              <p className="text-sm font-semibold">{dateLabel(day.date)}</p>
              <p className="mt-2 font-mono text-2xl font-bold">{day.due.length}</p>
              <p className="text-xs text-muted-foreground">{day.taken}/{day.due.length} taken</p>
              <div className="mt-3 space-y-1">
                {day.due.slice(0, 3).map((med) => (
                  <p key={med.id} className="truncate text-xs text-muted-foreground">{med.timeOfDay} {med.name}</p>
                ))}
                {day.due.length > 3 && <p className="text-xs text-muted-foreground">+{day.due.length - 3} more</p>}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className={`overflow-hidden rounded-[26px] border border-border/70 bg-card/90 shadow-sm shadow-black/10 ${showMedicationExtras ? "" : "hidden sm:block"}`}>
        <div className="border-b border-border/70 px-4 py-4 sm:px-5">
          <h3 className="text-xl font-bold tracking-tight">Recent Dose History</h3>
        </div>
        <div className="p-2 sm:p-3">
          {logs.length === 0 ? (
            <div className="rounded-[22px] border border-dashed border-border/70 bg-background/40 px-6 py-10 text-center text-sm text-muted-foreground">No medication logs yet.</div>
          ) : (
            <div className="divide-y divide-border/55 overflow-hidden rounded-[22px] bg-background/45">
              {logs.slice(0, 10).map((log) => (
                <div key={log.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 px-4 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{log.medication?.name}</p>
                    <p className="text-xs text-muted-foreground">{formatAppDateTime(log.scheduledFor)}{log.notes ? ` - ${log.notes}` : ""}</p>
                  </div>
                  <Badge variant={log.status === "taken" ? "secondary" : "outline"}>{log.status}</Badge>
                  <Button variant="ghost" size="icon" onClick={() => deleteLog(log)} loading={pendingLogActions[log.id] === "delete"} disabled={Boolean(pendingLogActions[log.id])} className="active:scale-90">
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function MedicationSheet({
  form,
  setForm,
  savingMedication,
  saveMedication,
  showRefillFields,
  setShowRefillFields,
  deleteMedicationFromSheet,
  deleting,
}: {
  form: typeof blankForm;
  setForm: (form: typeof blankForm) => void;
  savingMedication: boolean;
  saveMedication: () => void;
  showRefillFields: boolean;
  setShowRefillFields: (value: boolean | ((current: boolean) => boolean)) => void;
  deleteMedicationFromSheet: () => void;
  deleting: boolean;
}) {
  return (
    <DialogContent className="inset-x-0 bottom-0 max-h-[92svh] max-w-none gap-0 rounded-b-none rounded-t-[28px] border-border/80 bg-card/95 p-0 shadow-2xl sm:max-w-lg sm:rounded-2xl sm:p-0">
      <div className="sticky top-0 z-10 border-b border-border/70 bg-card/95 px-4 pb-3 pt-3 backdrop-blur sm:px-5">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-muted-foreground/30 sm:hidden" />
        <DialogHeader className="pr-8 text-left">
          <DialogTitle className="text-xl">{form.id ? "Edit Medication" : "New Medication"}</DialogTitle>
        </DialogHeader>
      </div>

      <div className="space-y-4 px-4 py-4 sm:px-5">
        <div className="overflow-hidden rounded-[22px] border border-border/70 bg-background/55">
          <Input
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            className="h-14 border-0 bg-transparent px-4 text-base font-semibold shadow-none focus-visible:ring-0"
            placeholder="Medication name"
          />
          <div className="border-t border-border/60">
            <Input
              value={form.dosage}
              onChange={(event) => setForm({ ...form, dosage: event.target.value })}
              className="h-12 border-0 bg-transparent px-4 text-base shadow-none focus-visible:ring-0"
              placeholder="Dosage, e.g. 1 tablet / 500mg"
            />
          </div>
        </div>

        <div className="rounded-[22px] border border-border/70 bg-background/55 p-3">
          <Label className="text-xs font-semibold text-muted-foreground">Time</Label>
          <div className="mt-2 rounded-2xl border border-border/60 bg-card/80 px-3 py-2">
            <Input
              type="time"
              value={form.timeOfDay}
              onChange={(event) => setForm({ ...form, timeOfDay: event.target.value })}
              className="h-10 min-w-0 border-0 bg-transparent p-0 text-base shadow-none focus-visible:ring-0"
            />
          </div>
        </div>

        <SegmentedPicker
          label="Repeat"
          value={form.recurrence}
          options={recurrenceOptions}
          onChange={(recurrence) => setForm({ ...form, recurrence })}
        />

        {form.recurrence === "weekly" && (
          <div className="rounded-[22px] border border-border/70 bg-background/55 p-3">
            <Label className="text-xs font-semibold text-muted-foreground">Days</Label>
            <div className="mt-2 grid grid-cols-4 gap-2">
              {weekDays.map((day) => {
                const selected = form.daysOfWeek.split(",").filter(Boolean).includes(day);
                return (
                  <button
                    key={day}
                    type="button"
                    data-active={selected}
                    onClick={() => {
                      const values = new Set(form.daysOfWeek.split(",").filter(Boolean));
                      if (selected) values.delete(day);
                      else values.add(day);
                      setForm({ ...form, daysOfWeek: Array.from(values).join(",") });
                    }}
                    className="h-11 touch-manipulation rounded-2xl border border-border/60 bg-card/70 text-sm font-semibold text-muted-foreground transition active:scale-95 active:bg-muted data-[active=true]:border-primary/40 data-[active=true]:bg-primary/15 data-[active=true]:text-primary"
                  >
                    {day}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {form.recurrence === "monthly" && (
          <div className="rounded-[22px] border border-border/70 bg-background/55 p-3">
            <Label className="text-xs font-semibold text-muted-foreground">Day of month</Label>
            <Input type="number" min={1} max={31} value={form.dayOfMonth} onChange={(event) => setForm({ ...form, dayOfMonth: event.target.value })} className="mt-2 h-12 rounded-2xl bg-card/80 text-base" placeholder="1-31" />
          </div>
        )}

        {form.recurrence === "custom" && (
          <Input value={form.recurrenceCustom} onChange={(event) => setForm({ ...form, recurrenceCustom: event.target.value })} className="h-12 rounded-2xl bg-card/80" placeholder="Every 2 days, after breakfast..." />
        )}

        <div className="rounded-[22px] border border-border/70 bg-background/55 p-3">
          <Label className="text-xs font-semibold text-muted-foreground">Start & End</Label>
          <div className="mt-2 grid grid-cols-1 gap-2 min-[440px]:grid-cols-2">
            <div className="min-w-0 rounded-2xl border border-border/60 bg-card/80 px-3 py-2">
              <span className="block text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground">Start</span>
              <Input type="date" value={form.startDate} onChange={(event) => setForm({ ...form, startDate: event.target.value })} className="mt-1 h-9 min-w-0 border-0 bg-transparent p-0 text-base shadow-none focus-visible:ring-0" />
            </div>
            <div className="min-w-0 rounded-2xl border border-border/60 bg-card/80 px-3 py-2">
              <span className="block text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground">End</span>
              <Input type="date" value={form.endDate} onChange={(event) => setForm({ ...form, endDate: event.target.value })} className="mt-1 h-9 min-w-0 border-0 bg-transparent p-0 text-base shadow-none focus-visible:ring-0" />
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowRefillFields((current) => !current)}
          className="flex min-h-12 w-full touch-manipulation items-center justify-between rounded-[22px] border border-border/70 bg-background/55 px-4 text-left transition active:scale-[0.99] active:bg-muted"
        >
          <span className="font-semibold">Refill tracking</span>
          <ChevronRight className={`h-5 w-5 text-muted-foreground transition-transform ${showRefillFields ? "rotate-90" : ""}`} />
        </button>

        {showRefillFields && (
          <div className="space-y-3 rounded-[22px] border border-border/70 bg-background/45 p-3">
            <div className="grid grid-cols-1 gap-3 min-[440px]:grid-cols-3">
              <Input type="number" min="0" value={form.stockCount} onChange={(event) => setForm({ ...form, stockCount: event.target.value })} className="h-12 rounded-2xl bg-card/80" placeholder="Remaining" />
              <Input type="number" min="1" value={form.doseUnits} onChange={(event) => setForm({ ...form, doseUnits: event.target.value })} className="h-12 rounded-2xl bg-card/80" placeholder="Per dose" />
              <Input type="number" min="0" value={form.refillAt} onChange={(event) => setForm({ ...form, refillAt: event.target.value })} className="h-12 rounded-2xl bg-card/80" placeholder="Alert at" />
            </div>
            <Input value={form.refillNotes} onChange={(event) => setForm({ ...form, refillNotes: event.target.value })} className="h-12 rounded-2xl bg-card/80" placeholder="Refill note" />
          </div>
        )}

        <Textarea value={form.instructions} onChange={(event) => setForm({ ...form, instructions: event.target.value })} className="min-h-20 rounded-2xl bg-card/80 text-base" placeholder="Instructions, e.g. after food" />
      </div>

      <div className="sticky bottom-0 grid gap-2 border-t border-border/70 bg-card/95 p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] backdrop-blur sm:px-5">
        <Button
          onClick={saveMedication}
          loading={savingMedication}
          disabled={savingMedication || !form.name.trim() || !form.timeOfDay}
          className="h-12 w-full rounded-2xl text-base shadow-lg shadow-primary/20 active:scale-95"
        >
          {savingMedication ? "Saving..." : form.id ? "Update Medication" : "Save Medication"}
        </Button>
        {form.id && (
          <Button
            type="button"
            variant="outline"
            onClick={deleteMedicationFromSheet}
            disabled={savingMedication || deleting}
            className="h-11 w-full rounded-2xl border-destructive/40 text-destructive active:scale-95"
          >
            {deleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
            Delete Medication
          </Button>
        )}
      </div>
    </DialogContent>
  );
}

function DoseActions({ med, date, existingLog, pendingDoseActions, onLog }: any) {
  const actionKey = `${med.id}:${formatLocalDateInput(date)}`;
  const pending = pendingDoseActions[actionKey];
  const disabled = Boolean(existingLog || pending);
  return (
    <div className="grid grid-cols-2 gap-2">
      <Button type="button" onClick={() => onLog(med, "taken", date)} loading={pending === "taken"} disabled={disabled} className="h-11 rounded-2xl active:scale-95">
        <CheckCircle2 className="mr-2 h-4 w-4" />
        Taken
      </Button>
      <Button type="button" variant="outline" onClick={() => onLog(med, "skipped", date)} loading={pending === "skipped"} disabled={disabled} className="h-11 rounded-2xl active:scale-95">
        <SkipForward className="mr-2 h-4 w-4" />
        Skip
      </Button>
    </div>
  );
}

function SummaryTile({ label, value, icon: Icon, color, tile }: any) {
  return (
    <div className={`min-h-[6.4rem] rounded-[24px] border p-4 shadow-sm shadow-black/10 ${tile}`}>
      <div className="flex items-start justify-between gap-3">
        <span className={`flex h-10 w-10 items-center justify-center rounded-full bg-background/70 ${color}`}>
          <Icon className="h-5 w-5" />
        </span>
        <span className="font-mono text-2xl font-bold leading-none">{value}</span>
      </div>
      <p className="mt-3 text-sm font-semibold text-muted-foreground">{label}</p>
    </div>
  );
}

function SegmentedPicker({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <div className="rounded-[22px] border border-border/70 bg-background/55 p-3">
      <Label className="text-xs font-semibold text-muted-foreground">{label}</Label>
      <div className="mt-2 grid grid-cols-2 gap-2 min-[440px]:grid-cols-4">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            data-active={value === option.value}
            onClick={() => onChange(option.value)}
            className="min-h-11 touch-manipulation rounded-2xl border border-border/60 bg-card/70 px-3 text-sm font-semibold text-muted-foreground transition active:scale-95 active:bg-muted data-[active=true]:border-primary/40 data-[active=true]:bg-primary/15 data-[active=true]:text-primary"
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function MiniSegmentedPicker({
  value,
  options,
  onChange,
}: {
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-1 rounded-2xl border border-border/70 bg-background/55 p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          data-active={value === option.value}
          onClick={() => onChange(option.value)}
          className="h-10 touch-manipulation rounded-xl text-sm font-semibold text-muted-foreground transition active:scale-95 data-[active=true]:bg-primary/15 data-[active=true]:text-primary"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
