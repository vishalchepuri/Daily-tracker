"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Bell, CalendarDays, CheckCircle2, Clock, Edit, Package, PauseCircle, Pill, PlayCircle, Plus, Search, SkipForward, Trash2, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [doseNotes, setDoseNotes] = useState<Record<string, string>>({});
  const [selectedDate, setSelectedDate] = useState(dateInputValue(new Date()));
  const [form, setForm] = useState(blankForm);
  const saveMedicationLock = useRef(false);

  const loadData = async () => {
    setLoading(true);
    fetch("/api/medications")
      .then((res) => res.ok ? res.json() : { medications: [] })
      .then((data) => setMedications(data?.medications ?? []))
      .catch(console.error)
      .finally(() => setLoading(false));

    fetch("/api/medications/logs?limit=50")
      .then((res) => res.ok ? res.json() : { logs: [] })
      .then((data) => setLogs(data?.logs ?? []))
      .catch(console.error);
  };

  useEffect(() => { loadData(); }, []);

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
  const takenToday = todayLogs.filter((log) => log.status === "taken").length;
  const skippedToday = todayLogs.filter((log) => log.status === "skipped").length;
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
      const data = await res.json();
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

  const deleteMedication = async (med: any) => {
    if (!window.confirm(`Delete ${med.name}?`)) return;
    try {
      await fetch(`/api/medications?id=${med.id}`, { method: "DELETE" });
      toast.success("Medication deleted");
      loadData();
    } catch {
      toast.error("Failed to delete medication");
    }
  };

  const logDose = async (med: any, status: "taken" | "skipped", date = new Date()) => {
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
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? "Failed to log dose");
        return;
      }
      toast.success(status === "taken" ? "Dose marked taken" : "Dose skipped");
      setDoseNotes((prev) => ({ ...prev, [med.id]: "" }));
      loadData();
    } catch {
      toast.error("Failed to log dose");
    }
  };

  const markSelectedScheduleTaken = async () => {
    const pending = dueSelectedMeds.filter((med) => !logByMedicationSelectedDate.has(med.id));
    if (pending.length === 0) {
      toast.info("No pending doses for this date");
      return;
    }
    try {
      await Promise.all(
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
      toast.success(`Marked ${pending.length} dose${pending.length === 1 ? "" : "s"} taken`);
      loadData();
    } catch {
      toast.error("Failed to mark doses");
    }
  };

  const toggleMedicationActive = async (med: any) => {
    try {
      const res = await fetch("/api/medications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: med.id, active: !med.active }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? "Failed to update medication");
        return;
      }
      toast.success(!med.active ? "Medication resumed" : "Medication paused");
      loadData();
    } catch {
      toast.error("Failed to update medication");
    }
  };

  const deleteLog = async (log: any) => {
    if (!window.confirm("Delete this medication log?")) return;
    try {
      const res = await fetch(`/api/medications/logs?id=${log.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? "Failed to delete log");
        return;
      }
      toast.success("Log deleted");
      loadData();
    } catch {
      toast.error("Failed to delete log");
    }
  };

  return (
    <div className="space-y-5 sm:space-y-6">
      <FadeIn>
        <div className="grid gap-2 sm:flex sm:items-center sm:justify-between sm:gap-3">
          <div className="hidden min-w-0 sm:block">
            <h2 className="font-display text-2xl font-bold leading-tight tracking-tight">Medications</h2>
            <p className="mt-1 text-sm text-muted-foreground">Track medicine timings, repeats, and daily dose status</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={(open) => { if (!savingMedication) setDialogOpen(open); }}>
            <DialogTrigger asChild>
              <Button onClick={openAdd} className="h-11 w-full rounded-xl sm:h-10 sm:w-auto">
                <Plus className="mr-2 h-4 w-4" />
                Add Medication
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg gap-3 border-border/80 bg-card/95 p-3 sm:max-w-lg sm:p-5">
              <DialogHeader className="pr-8 text-left">
                <DialogTitle>{form.id ? "Edit Medication" : "Add Medication"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="grid gap-3 min-[420px]:grid-cols-2">
                  <div>
                    <Label>Name</Label>
                    <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1" placeholder="Vitamin D" />
                  </div>
                  <div>
                    <Label>Dosage</Label>
                    <Input value={form.dosage} onChange={(e) => setForm({ ...form, dosage: e.target.value })} className="mt-1" placeholder="1 tablet / 500mg" />
                  </div>
                  <div>
                    <Label>Time</Label>
                    <Input type="time" value={form.timeOfDay} onChange={(e) => setForm({ ...form, timeOfDay: e.target.value })} className="mt-1" />
                  </div>
                  <div>
                    <Label>Repeat</Label>
                    <Select value={form.recurrence} onValueChange={(value) => setForm({ ...form, recurrence: value })}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="daily">Daily</SelectItem>
                        <SelectItem value="weekly">Weekly</SelectItem>
                        <SelectItem value="monthly">Monthly</SelectItem>
                        <SelectItem value="custom">Custom</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {form.recurrence === "weekly" && (
                  <div>
                    <Label>Days of week</Label>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {weekDays.map((day) => {
                        const selected = form.daysOfWeek.split(",").filter(Boolean).includes(day);
                        return (
                          <Button
                            key={day}
                            type="button"
                            size="sm"
                            variant={selected ? "default" : "outline"}
                            onClick={() => {
                              const values = new Set(form.daysOfWeek.split(",").filter(Boolean));
                              if (selected) values.delete(day);
                              else values.add(day);
                              setForm({ ...form, daysOfWeek: Array.from(values).join(",") });
                            }}
                          >
                            {day}
                          </Button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {form.recurrence === "monthly" && (
                  <div>
                    <Label>Day of month</Label>
                    <Input type="number" min={1} max={31} value={form.dayOfMonth} onChange={(e) => setForm({ ...form, dayOfMonth: e.target.value })} className="mt-1" placeholder="1-31" />
                  </div>
                )}

                {form.recurrence === "custom" && (
                  <div>
                    <Label>Custom repeat</Label>
                    <Input value={form.recurrenceCustom} onChange={(e) => setForm({ ...form, recurrenceCustom: e.target.value })} className="mt-1" placeholder="Every 2 days, after breakfast..." />
                  </div>
                )}

                <div className="grid gap-3 min-[420px]:grid-cols-2">
                  <div>
                    <Label>Start Date</Label>
                    <Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} className="mt-1" />
                  </div>
                  <div>
                    <Label>End Date</Label>
                    <Input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} className="mt-1" />
                  </div>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-between bg-background/50"
                  onClick={() => setShowRefillFields((current) => !current)}
                >
                  Refill tracking
                  <span className="text-xs text-muted-foreground">{showRefillFields ? "Hide" : "Optional"}</span>
                </Button>

                {showRefillFields && (
                <div className="rounded-lg border border-border/60 bg-background/45 p-3">
                  <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                    <Package className="h-4 w-4 text-primary" />
                    <span>Refill Tracking</span>
                  </div>
                  <div className="grid gap-3 min-[420px]:grid-cols-3">
                    <div>
                      <Label>Remaining pills</Label>
                      <Input type="number" min="0" value={form.stockCount} onChange={(e) => setForm({ ...form, stockCount: e.target.value })} className="mt-1" placeholder="30" />
                    </div>
                    <div>
                      <Label>Used per dose</Label>
                      <Input type="number" min="1" value={form.doseUnits} onChange={(e) => setForm({ ...form, doseUnits: e.target.value })} className="mt-1" placeholder="1" />
                    </div>
                    <div>
                      <Label>Alert at</Label>
                      <Input type="number" min="0" value={form.refillAt} onChange={(e) => setForm({ ...form, refillAt: e.target.value })} className="mt-1" placeholder="5" />
                    </div>
                  </div>
                  <Input value={form.refillNotes} onChange={(e) => setForm({ ...form, refillNotes: e.target.value })} className="mt-3" placeholder="Refill note, pharmacy, prescription..." />
                </div>
                )}

                <div>
                  <Label>Instructions</Label>
                  <Textarea value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} className="mt-1 min-h-20" placeholder="After food, before bed, avoid with milk..." />
                </div>

                <div className="sticky bottom-0 -mx-3 -mb-3 border-t border-border/70 bg-card/95 p-3 backdrop-blur sm:-mx-5 sm:-mb-5 sm:p-4">
                  <Button
                    onClick={saveMedication}
                    loading={savingMedication}
                    disabled={savingMedication || !form.name.trim() || !form.timeOfDay}
                    className="w-full"
                  >
                    {savingMedication ? "Saving..." : form.id ? "Update Medication" : "Save Medication"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </FadeIn>

      <div className="grid grid-cols-2 gap-2 rounded-xl border border-border/80 bg-muted/10 p-2 text-sm sm:grid-cols-4 sm:gap-3 sm:p-3">
        <div className="rounded-lg bg-card/70 p-3"><span className="text-muted-foreground">Active</span><p className="font-mono font-semibold">{activeMeds.length}</p></div>
        <div className="rounded-lg bg-card/70 p-3"><span className="text-muted-foreground">Due today</span><p className="font-mono font-semibold">{dueTodayMeds.length}</p></div>
        <div className="rounded-lg bg-card/70 p-3"><span className="text-muted-foreground">Missed</span><p className="font-mono font-semibold">{missedToday}</p></div>
        <div className="rounded-lg bg-card/70 p-3"><span className="text-muted-foreground">Adherence</span><p className="font-mono font-semibold">{logs.length ? `${adherenceRate}%` : "0%"}</p></div>
      </div>

      {refillAlerts.length > 0 && (
        <Card className="border-amber-500/35 bg-amber-500/5">
          <CardContent className="p-3 sm:p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                <h3 className="font-semibold">Refill needed</h3>
                <Badge variant="outline">{refillAlerts.length}</Badge>
              </div>
              <div className="text-xs text-muted-foreground">{refillAlerts.map((med) => med.name).slice(0, 2).join(", ")}{refillAlerts.length > 2 ? "..." : ""}</div>
            </div>
            <div className="mt-3 grid max-h-40 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
              {refillAlerts.map((med) => (
                <div key={med.id} className="rounded-lg bg-background/60 p-3">
                  <p className="font-medium">{med.name}</p>
                  <p className="text-sm text-muted-foreground">{med.stockCount} left, alert at {med.refillAt}</p>
                  {med.refillNotes && <p className="mt-1 text-xs text-muted-foreground">{med.refillNotes}</p>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {nextDose && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="grid gap-3 p-3 sm:grid-cols-[1fr_auto] sm:items-center sm:p-4">
            <div>
              <p className="text-sm text-muted-foreground">Next dose today</p>
              <h3 className="mt-1 font-semibold">{nextDose.name} {nextDose.dosage ? `- ${nextDose.dosage}` : ""}</h3>
              <p className="text-sm text-muted-foreground">{nextDose.timeOfDay} - {nextDose.instructions || "No instructions"}</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" onClick={() => logDose(nextDose, "taken")}>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Taken
              </Button>
              <Button type="button" variant="outline" onClick={() => logDose(nextDose, "skipped")}>
                <SkipForward className="mr-2 h-4 w-4" />
                Skip
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto] lg:items-center">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5 text-primary" />
                Schedule
              </CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">{dateLabel(scheduleDate)} - {dueSelectedMeds.length} dose{dueSelectedMeds.length === 1 ? "" : "s"} planned</p>
            </div>
            <Input
              type="date"
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
              className="w-full lg:w-44"
            />
            <Button type="button" variant="outline" onClick={markSelectedScheduleTaken} className="w-full lg:w-auto">
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Mark all taken
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {dueSelectedMeds.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">No medications scheduled for this date.</div>
          ) : (
            <div className="grid max-h-[34rem] gap-3 overflow-y-auto pr-1 md:grid-cols-2 lg:max-h-none lg:overflow-visible lg:pr-0">
              {dueSelectedMeds.map((med) => {
                const todaysLog = logByMedicationSelectedDate.get(med.id);
                const scheduled = atDateTime(med.timeOfDay, scheduleDate);
                const isOverdue = isSameDay(scheduleDate, new Date()) && !todaysLog && scheduled.getTime() < Date.now();
                return (
                <div key={med.id} className={`rounded-xl border p-4 shadow-sm shadow-black/5 ${isOverdue ? "border-destructive/40 bg-destructive/5" : "border-border/60 bg-card/80"}`}>
                  <div className="space-y-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="break-words font-semibold">{med.name}</h3>
                        <p className="mt-1 text-sm text-muted-foreground">{med.dosage || "No dosage set"}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <Badge variant="secondary"><Clock className="mr-1 h-3 w-3" />{med.timeOfDay}</Badge>
                        {todaysLog ? <Badge variant="outline">{todaysLog.status}</Badge> : isOverdue ? <Badge variant="destructive">Overdue</Badge> : <Badge variant="outline">Upcoming</Badge>}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline">{formatRepeat(med)}</Badge>
                      {med.instructions && <Badge variant="outline">Instructions</Badge>}
                    </div>
                    {med.instructions && <p className="text-sm text-muted-foreground">{med.instructions}</p>}
                    <Input
                      value={doseNotes[med.id] ?? ""}
                      onChange={(e) => setDoseNotes({ ...doseNotes, [med.id]: e.target.value })}
                      placeholder="Optional note, e.g. after lunch"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <Button type="button" onClick={() => logDose(med, "taken", scheduleDate)} disabled={Boolean(todaysLog)}>
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                        Taken
                      </Button>
                      <Button type="button" variant="outline" onClick={() => logDose(med, "skipped", scheduleDate)} disabled={Boolean(todaysLog)}>
                        <SkipForward className="mr-2 h-4 w-4" />
                        Skip
                      </Button>
                    </div>
                  </div>
                </div>
              )})}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-primary" />
            Next 7 Days
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2 ios-scroll lg:grid lg:grid-cols-7 lg:overflow-visible lg:px-0 lg:pb-0">
            {upcomingWeek.map((day) => (
              <div key={day.date.toISOString()} className="min-w-[9rem] rounded-xl border border-border/70 bg-card/80 p-3 shadow-sm shadow-black/5 lg:min-w-0">
                <p className="text-sm font-semibold">{dateLabel(day.date)}</p>
                <p className="mt-2 text-2xl font-bold">{day.due.length}</p>
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto] lg:items-center">
            <CardTitle className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-primary" />
              Medication List
            </CardTitle>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 lg:w-64" placeholder="Search medicines" />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="lg:w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="paused">Paused</SelectItem>
                <SelectItem value="all">All</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {filteredMedications.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">Add your first medication schedule.</div>
          ) : (
            <div className="space-y-2">
              {filteredMedications.map((med) => (
                <div key={med.id} className="grid gap-3 rounded-xl border border-border/60 bg-card/80 px-3 py-3 shadow-sm shadow-black/5 sm:grid-cols-[1fr_auto] sm:items-center">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{med.name}</p>
                    <p className="text-xs text-muted-foreground">{med.timeOfDay} - {formatRepeat(med)} {med.dosage ? `- ${med.dosage}` : ""}</p>
                    {med.stockCount != null && (
                      <p className={`mt-1 text-xs ${med.refillAt != null && med.stockCount <= med.refillAt ? "text-amber-500" : "text-muted-foreground"}`}>
                        Stock: {med.stockCount} left{med.refillAt != null ? `, refill at ${med.refillAt}` : ""}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2 sm:justify-end">
                    <Badge variant={med.active ? "secondary" : "outline"}>{med.active ? "Active" : "Paused"}</Badge>
                    <Button variant="ghost" size="icon" onClick={() => toggleMedicationActive(med)} title={med.active ? "Pause medication" : "Resume medication"}>
                      {med.active ? <PauseCircle className="h-4 w-4" /> : <PlayCircle className="h-4 w-4 text-primary" />}
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => openEdit(med)} title="Edit medication">
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => deleteMedication(med)} title="Delete medication">
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Recent Dose History</CardTitle></CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">No medication logs yet.</div>
          ) : (
            <div className="space-y-2">
              {logs.slice(0, 10).map((log) => (
                <div key={log.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 rounded-xl border border-border/60 bg-card/80 px-3 py-3 text-sm shadow-sm shadow-black/5">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{log.medication?.name}</p>
                    <p className="text-xs text-muted-foreground">{formatAppDateTime(log.scheduledFor)}{log.notes ? ` - ${log.notes}` : ""}</p>
                  </div>
                  <Badge variant={log.status === "taken" ? "secondary" : "outline"}>{log.status}</Badge>
                  <Button variant="ghost" size="icon" onClick={() => deleteLog(log)} title="Delete log">
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({ title, value, icon: Icon }: any) {
  return (
    <Card>
      <CardContent className="min-h-[7.25rem] p-4 sm:p-5">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10">
            <Icon className="h-5 w-5 text-primary" />
          </div>
          <span className="min-w-0 text-sm font-medium leading-snug">{title}</span>
        </div>
        <p className="font-mono text-2xl font-semibold leading-none">{value}</p>
      </CardContent>
    </Card>
  );
}
