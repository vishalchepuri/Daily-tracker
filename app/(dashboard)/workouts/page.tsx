"use client";
import { useEffect, useMemo, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dumbbell, Plus, Clock, Info, ChevronDown, ChevronUp, Pencil, Trash2, CheckCircle2, X, Eye, Trophy, BarChart3, RotateCcw, CalendarDays, Shuffle, SlidersHorizontal } from "lucide-react";
import { FadeIn } from "@/components/ui/animate";
import { toast } from "sonner";

type RoutineItem = {
  name: string;
  duration?: string;
  notes?: string;
};

const blankExerciseForm = {
  id: "",
  name: "",
  muscleGroup: "chest",
  equipment: "",
  category: "compound",
  description: "",
  formTips: "",
};

const blankTemplateForm = {
  id: "",
  name: "",
  description: "",
  dayOfWeek: "Monday",
  muscleGroups: "",
  difficulty: "intermediate",
  warmups: [
    { name: "Light cardio", duration: "5 min", notes: "Bike, treadmill, or brisk walk" },
    { name: "Dynamic mobility", duration: "3-5 min", notes: "Move the joints used in today's workout" },
  ] as RoutineItem[],
  stretches: [
    { name: "Easy cooldown walk", duration: "3-5 min", notes: "Bring heart rate down gradually" },
    { name: "Target muscle stretch", duration: "30-45 sec each", notes: "Pain-free stretch for trained muscles" },
  ] as RoutineItem[],
  exercises: [] as any[],
};

function parseRoutineItems(value?: string | null): RoutineItem[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => ({
        name: String(item?.name ?? "").trim(),
        duration: String(item?.duration ?? "").trim(),
        notes: String(item?.notes ?? "").trim(),
      }))
      .filter((item) => item.name);
  } catch {
    return [];
  }
}

export default function WorkoutsPage() {
  const [templates, setTemplates] = useState<any[]>([]);
  const [exercises, setExercises] = useState<any[]>([]);
  const [workoutLogs, setWorkoutLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [logDialogOpen, setLogDialogOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);
  const [logEntries, setLogEntries] = useState<any[]>([]);
  const [duration, setDuration] = useState("");
  const [notes, setNotes] = useState("");
  const [activeWorkout, setActiveWorkout] = useState<any>(null);
  const [activeStartedAt, setActiveStartedAt] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [activeExerciseIndex, setActiveExerciseIndex] = useState(0);
  const [activeSet, setActiveSet] = useState({ weight: "", reps: "" });
  const [activeEntries, setActiveEntries] = useState<any[]>([]);
  const [selectedMuscleGroups, setSelectedMuscleGroups] = useState<string[]>([]);
  const [historyRange, setHistoryRange] = useState("30");
  const [expandedExercise, setExpandedExercise] = useState<string | null>(null);
  const [exerciseDialogOpen, setExerciseDialogOpen] = useState(false);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [selectedHistoryLog, setSelectedHistoryLog] = useState<any>(null);
  const [exerciseForm, setExerciseForm] = useState(blankExerciseForm);
  const [templateForm, setTemplateForm] = useState(blankTemplateForm);

  const loadData = useCallback(async () => {
    try {
      const [tRes, eRes, lRes] = await Promise.all([
        fetch("/api/workout-templates"),
        fetch("/api/exercises"),
        fetch("/api/workout-logs?limit=100"),
      ]);
      const tData = await tRes.json();
      const eData = await eRes.json();
      const lData = await lRes.json();
      setTemplates(tData?.templates ?? []);
      setExercises(eData?.exercises ?? []);
      setWorkoutLogs(lData?.logs ?? []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (!activeStartedAt) return;
    const interval = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - activeStartedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(interval);
  }, [activeStartedAt]);

  const activeExercises = useMemo(() => activeWorkout?.exercises ?? [], [activeWorkout]);
  const currentExercise = activeExercises[activeExerciseIndex];
  const currentExerciseSets = activeEntries.filter((entry) => entry.exerciseId === currentExercise?.exercise?.id);
  const lastExerciseLog = useMemo(() => {
    const exerciseId = currentExercise?.exercise?.id;
    if (!exerciseId) return null;

    for (const log of workoutLogs ?? []) {
      const matchingSets = (log?.exerciseLogs ?? [])
        .filter((entry: any) => entry?.exerciseId === exerciseId)
        .sort((a: any, b: any) => (a?.setNumber ?? 0) - (b?.setNumber ?? 0));

      if (matchingSets.length > 0) {
        return {
          date: log?.date,
          templateName: log?.templateName,
          sets: matchingSets,
        };
      }
    }

    return null;
  }, [currentExercise?.exercise?.id, workoutLogs]);
  const elapsedMinutes = Math.max(1, Math.round(elapsedSeconds / 60));
  const elapsedLabel = `${Math.floor(elapsedSeconds / 60)}:${String(elapsedSeconds % 60).padStart(2, "0")}`;
  const lastExerciseLogDate = lastExerciseLog?.date
    ? new Date(lastExerciseLog.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })
    : null;

  const startWorkout = (template: any) => {
    setActiveWorkout(template);
    setSelectedTemplate(template);
    setActiveStartedAt(Date.now());
    setElapsedSeconds(0);
    setActiveExerciseIndex(0);
    setActiveEntries([]);
    setDuration("");
    setNotes("");
    setActiveSet({
      reps: String(parseInt((template?.exercises?.[0]?.reps ?? "10").split("-")?.[0] ?? "10")),
      weight: "",
    });
    const page = document.querySelector("main");
    page?.scrollTo?.({ top: 0, behavior: "smooth" });
  };

  const updateEntry = (idx: number, field: string, value: number) => {
    setLogEntries((prev: any[]) =>
      (prev ?? []).map((e: any, i: number) => (i === idx ? { ...(e ?? {}), [field]: value } : e))
    );
  };

  const pickAlternativeExercise = (exercise: any, usedIds: string[] = []) => {
    const currentId = exercise?.id;
    const muscleGroup = exercise?.muscleGroup;
    const candidates = (exercises ?? []).filter((item: any) =>
      item?.id &&
      item.id !== currentId &&
      item.muscleGroup === muscleGroup &&
      !usedIds.includes(item.id)
    );
    const fallbackCandidates = (exercises ?? []).filter((item: any) =>
      item?.id &&
      item.id !== currentId &&
      item.muscleGroup === muscleGroup
    );
    const pool = candidates.length > 0 ? candidates : fallbackCandidates;
    if (pool.length === 0) return null;
    return pool[Math.floor(Math.random() * pool.length)];
  };

  const shuffleProgramExercise = async (template: any, workoutExercise: any) => {
    const usedIds = (template?.exercises ?? [])
      .map((item: any) => item?.exercise?.id ?? item?.exerciseId)
      .filter(Boolean);
    const replacement = pickAlternativeExercise(workoutExercise?.exercise, usedIds);
    if (!replacement) {
      toast.error(`No alternate ${workoutExercise?.exercise?.muscleGroup ?? ""} exercise found`);
      return;
    }

    const nextExercises = (template?.exercises ?? []).map((item: any) => ({
      exerciseId: item?.id === workoutExercise?.id ? replacement.id : item?.exercise?.id ?? item?.exerciseId,
      sets: item?.sets ?? 3,
      reps: item?.reps ?? "8-12",
      restSeconds: item?.restSeconds ?? 90,
    }));

    try {
      const res = await fetch("/api/workout-templates", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: template.id,
          name: template.name,
          description: template.description,
          dayOfWeek: template.dayOfWeek,
          muscleGroups: template.muscleGroups,
          difficulty: template.difficulty,
          exercises: nextExercises,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? "Failed to shuffle exercise");
        return;
      }
      toast.success(`Replaced with ${replacement.name}`);
      loadData();
    } catch {
      toast.error("Failed to shuffle exercise");
    }
  };

  const shuffleActiveExercise = () => {
    if (!currentExercise?.exercise) return;
    if (currentExerciseSets.length > 0 && !window.confirm("You already logged sets for this exercise. Swap only the next sets to a different exercise?")) return;

    const usedIds = (activeExercises ?? [])
      .map((item: any) => item?.exercise?.id ?? item?.exerciseId)
      .filter(Boolean);
    const replacement = pickAlternativeExercise(currentExercise.exercise, usedIds);
    if (!replacement) {
      toast.error(`No alternate ${currentExercise.exercise.muscleGroup} exercise found`);
      return;
    }

    setActiveWorkout((prev: any) => ({
      ...prev,
      exercises: (prev?.exercises ?? []).map((item: any, index: number) => (
        index === activeExerciseIndex
          ? { ...item, exerciseId: replacement.id, exercise: replacement }
          : item
      )),
    }));
    setActiveSet({
      reps: String(parseInt((currentExercise?.reps ?? "10").split("-")?.[0] ?? "10")),
      weight: "",
    });
    toast.success(`Swapped to ${replacement.name}`);
  };

  const handleLogWorkout = async () => {
    try {
      const res = await fetch("/api/workout-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateName: selectedTemplate?.name ?? "Custom Workout",
          duration: duration || null,
          notes: notes || null,
          exercises: logEntries,
        }),
      });
      if (res.ok) {
        toast.success("Workout logged!");
        setLogDialogOpen(false);
        setLogEntries([]);
        setDuration("");
        setNotes("");
        loadData();
      }
    } catch { toast.error("Failed to log workout"); }
  };

  const updateActiveExercise = (nextIndex: number) => {
    const boundedIndex = Math.max(0, Math.min(nextIndex, activeExercises.length - 1));
    setActiveExerciseIndex(boundedIndex);
    setActiveSet({
      reps: String(parseInt((activeExercises?.[boundedIndex]?.reps ?? "10").split("-")?.[0] ?? "10")),
      weight: "",
    });
  };

  const addActiveSet = () => {
    if (!currentExercise?.exercise?.id) return;
    const reps = parseInt(activeSet.reps) || 0;
    if (reps <= 0) {
      toast.error("Enter reps for this set");
      return;
    }
    const nextSetNumber = Math.max(0, ...currentExerciseSets.map((set: any) => set.setNumber ?? 0)) + 1;
    setActiveEntries((prev) => [
      ...prev,
      {
        exerciseId: currentExercise.exercise.id,
        exerciseName: currentExercise.exercise.name,
        setNumber: nextSetNumber,
        reps,
        weight: parseFloat(activeSet.weight) || 0,
      },
    ]);
    setActiveSet((prev) => ({ ...prev, weight: "" }));
  };

  const removeActiveSet = (entryIndex: number) => {
    setActiveEntries((prev) => prev.filter((_, index) => index !== entryIndex));
  };

  const cancelActiveWorkout = () => {
    if (activeEntries.length > 0 && !window.confirm("Discard this active workout?")) return;
    setActiveWorkout(null);
    setActiveStartedAt(null);
    setActiveEntries([]);
    setActiveExerciseIndex(0);
    setNotes("");
    setDuration("");
  };

  const finishActiveWorkout = async () => {
    if (!activeWorkout || activeEntries.length === 0) {
      toast.error("Log at least one set before finishing");
      return;
    }
    try {
      const res = await fetch("/api/workout-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateName: activeWorkout?.name ?? "Workout",
          duration: duration ? parseInt(duration) : elapsedMinutes,
          notes: notes || null,
          exercises: activeEntries,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? "Failed to finish workout");
        return;
      }
      toast.success("Workout finished!");
      setActiveWorkout(null);
      setActiveStartedAt(null);
      setActiveEntries([]);
      setActiveExerciseIndex(0);
      setNotes("");
      setDuration("");
      loadData();
    } catch {
      toast.error("Failed to finish workout");
    }
  };

  const openExerciseDialog = (exercise?: any) => {
    setExerciseForm(exercise ? {
      id: exercise.id ?? "",
      name: exercise.name ?? "",
      muscleGroup: exercise.muscleGroup ?? "chest",
      equipment: exercise.equipment ?? "",
      category: exercise.category ?? "compound",
      description: exercise.description ?? "",
      formTips: exercise.formTips ?? "",
    } : blankExerciseForm);
    setExerciseDialogOpen(true);
  };

  const handleSaveExercise = async () => {
    if (!exerciseForm.name.trim()) {
      toast.error("Exercise name is required");
      return;
    }
    try {
      const res = await fetch("/api/exercises", {
        method: exerciseForm.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(exerciseForm),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? "Failed to save exercise");
        return;
      }
      toast.success(exerciseForm.id ? "Exercise updated" : data?.pending ? "Exercise sent to admin for approval" : "Exercise added");
      setExerciseDialogOpen(false);
      loadData();
    } catch {
      toast.error("Failed to save exercise");
    }
  };

  const handleDeleteExercise = async (exercise: any) => {
    if (!exercise?.id) return;
    const confirmed = window.confirm(`Delete ${exercise.name}? This may also remove it from workout days that use it.`);
    if (!confirmed) return;

    try {
      const res = await fetch("/api/exercises", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: exercise.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? "Failed to delete exercise");
        return;
      }
      toast.success("Exercise deleted");
      loadData();
    } catch {
      toast.error("Failed to delete exercise");
    }
  };


  const openTemplateDialog = (template?: any) => {
    setTemplateForm(template ? {
      id: template.id ?? "",
      name: template.name ?? "",
      description: template.description ?? "",
      dayOfWeek: template.dayOfWeek ?? "Monday",
      muscleGroups: template.muscleGroups ?? "",
      difficulty: template.difficulty ?? "intermediate",
      warmups: parseRoutineItems(template.warmupJson),
      stretches: parseRoutineItems(template.stretchesJson),
      exercises: (template.exercises ?? []).map((item: any) => ({
        exerciseId: item.exerciseId ?? item.exercise?.id ?? "",
        sets: item.sets ?? 3,
        reps: item.reps ?? "8-12",
        restSeconds: item.restSeconds ?? 90,
      })),
    } : blankTemplateForm);
    setTemplateDialogOpen(true);
  };

  const addTemplateExercise = () => {
    setTemplateForm((prev: any) => ({
      ...prev,
      exercises: [...(prev.exercises ?? []), { exerciseId: exercises?.[0]?.id ?? "", sets: 3, reps: "8-12", restSeconds: 90 }],
    }));
  };

  const updateTemplateExercise = (index: number, field: string, value: any) => {
    setTemplateForm((prev: any) => ({
      ...prev,
      exercises: (prev.exercises ?? []).map((item: any, i: number) => i === index ? { ...item, [field]: value } : item),
    }));
  };

  const removeTemplateExercise = (index: number) => {
    setTemplateForm((prev: any) => ({
      ...prev,
      exercises: (prev.exercises ?? []).filter((_: any, i: number) => i !== index),
    }));
  };

  const addRoutineItem = (field: "warmups" | "stretches") => {
    setTemplateForm((prev: any) => ({
      ...prev,
      [field]: [...(prev[field] ?? []), { name: "", duration: "", notes: "" }],
    }));
  };

  const updateRoutineItem = (field: "warmups" | "stretches", index: number, key: keyof RoutineItem, value: string) => {
    setTemplateForm((prev: any) => ({
      ...prev,
      [field]: (prev[field] ?? []).map((item: RoutineItem, i: number) => i === index ? { ...item, [key]: value } : item),
    }));
  };

  const removeRoutineItem = (field: "warmups" | "stretches", index: number) => {
    setTemplateForm((prev: any) => ({
      ...prev,
      [field]: (prev[field] ?? []).filter((_: RoutineItem, i: number) => i !== index),
    }));
  };

  const handleSaveTemplate = async () => {
    if (!templateForm.name.trim()) {
      toast.error("Workout day name is required");
      return;
    }
    try {
      const res = await fetch("/api/workout-templates", {
        method: templateForm.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(templateForm),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? "Failed to save workout day");
        return;
      }
      toast.success(templateForm.id ? "Workout day updated" : "Workout day added");
      setTemplateDialogOpen(false);
      loadData();
    } catch {
      toast.error("Failed to save workout day");
    }
  };

  const handleDeleteTemplate = async (template: any) => {
    if (!template?.id) return;
    const confirmed = window.confirm(`Delete ${template.name}? This will remove the workout day from your programs.`);
    if (!confirmed) return;

    try {
      const res = await fetch("/api/workout-templates", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: template.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? "Failed to delete workout day");
        return;
      }
      toast.success("Workout day deleted");
      loadData();
    } catch {
      toast.error("Failed to delete workout day");
    }
  };

  const deleteWorkoutLog = async (log: any) => {
    if (!log?.id) return;
    const confirmed = window.confirm(`Delete ${log.templateName ?? "this workout"} from history?`);
    if (!confirmed) return;

    try {
      const res = await fetch(`/api/workout-logs?id=${log.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? "Failed to delete workout");
        return;
      }
      toast.success("Workout deleted");
      if (selectedHistoryLog?.id === log.id) setSelectedHistoryLog(null);
      loadData();
    } catch {
      toast.error("Failed to delete workout");
    }
  };

  const muscleGroups = ["all", "chest", "back", "shoulders", "legs", "arms", "core"];
  const editableMuscleGroups = muscleGroups.filter((item) => item !== "all");
  const daysOfWeek = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const filteredExercises = selectedMuscleGroups.length === 0
    ? exercises
    : (exercises ?? []).filter((e: any) => selectedMuscleGroups.includes(e?.muscleGroup));
  const selectedMuscleLabel = selectedMuscleGroups.length === 0
    ? "All muscles"
    : selectedMuscleGroups.length === 1
      ? selectedMuscleGroups[0]
      : `${selectedMuscleGroups.length} muscles`;
  const templateMuscleGroups = String(templateForm.muscleGroups ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter((item) => editableMuscleGroups.includes(item));
  const templateMuscleLabel = templateMuscleGroups.length === 0
    ? "Select muscles"
    : templateMuscleGroups.length === 1
      ? templateMuscleGroups[0]
      : `${templateMuscleGroups.length} muscles selected`;
  const toggleMuscleGroup = (group: string) => {
    setSelectedMuscleGroups((current) =>
      current.includes(group) ? current.filter((item) => item !== group) : [...current, group]
    );
  };
  const toggleTemplateMuscleGroup = (group: string) => {
    const nextGroups = templateMuscleGroups.includes(group)
      ? templateMuscleGroups.filter((item) => item !== group)
      : [...templateMuscleGroups, group];
    setTemplateForm((prev: any) => ({ ...prev, muscleGroups: nextGroups.join(",") }));
  };
  const groupExerciseLogs = (exerciseLogs: any[] = []) => {
    return exerciseLogs.reduce((groups: any[], entry: any) => {
      const exerciseId = entry?.exerciseId ?? entry?.exercise?.id ?? "unknown";
      const existing = groups.find((group) => group.exerciseId === exerciseId);
      if (existing) {
        existing.sets.push(entry);
        existing.sets.sort((a: any, b: any) => (a?.setNumber ?? 0) - (b?.setNumber ?? 0));
        return groups;
      }
      groups.push({
        exerciseId,
        exerciseName: entry?.exercise?.name ?? "Exercise",
        sets: [entry],
      });
      return groups;
    }, []);
  };
  const selectedHistoryGroups = groupExerciseLogs(selectedHistoryLog?.exerciseLogs ?? []);
  const filteredWorkoutLogs = useMemo(() => {
    if (historyRange === "all") return workoutLogs ?? [];
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - Number(historyRange));
    return (workoutLogs ?? []).filter((log: any) => new Date(log?.date ?? Date.now()) >= cutoff);
  }, [historyRange, workoutLogs]);
  const workoutStats = useMemo(() => {
    const logs = filteredWorkoutLogs ?? [];
    const totalSets = logs.reduce((sum: number, log: any) => sum + (log?.exerciseLogs ?? []).length, 0);
    const totalVolume = logs.reduce((sum: number, log: any) => (
      sum + (log?.exerciseLogs ?? []).reduce((inner: number, entry: any) => inner + ((entry?.weight ?? 0) * (entry?.reps ?? 0)), 0)
    ), 0);
    const totalMinutes = logs.reduce((sum: number, log: any) => sum + (log?.duration ?? 0), 0);
    const prMap = new Map<string, any>();
    for (const log of logs) {
      for (const entry of log?.exerciseLogs ?? []) {
        const current = prMap.get(entry.exerciseId);
        const volume = (entry?.weight ?? 0) * (entry?.reps ?? 0);
        if (!current || (entry?.weight ?? 0) > current.weight || ((entry?.weight ?? 0) === current.weight && volume > current.volume)) {
          prMap.set(entry.exerciseId, {
            exerciseName: entry?.exercise?.name ?? "Exercise",
            weight: entry?.weight ?? 0,
            reps: entry?.reps ?? 0,
            volume,
            date: log?.date,
          });
        }
      }
    }
    const topPrs = Array.from(prMap.values()).sort((a, b) => b.weight - a.weight).slice(0, 4);
    return { totalWorkouts: logs.length, totalSets, totalVolume, totalMinutes, topPrs };
  }, [filteredWorkoutLogs]);

  const repeatWorkout = (log: any) => {
    const entries = (log?.exerciseLogs ?? []).map((entry: any) => ({
      exerciseId: entry.exerciseId,
      exerciseName: entry?.exercise?.name ?? "Exercise",
      setNumber: entry.setNumber,
      reps: entry.reps,
      weight: entry.weight,
    }));
    setSelectedTemplate({ name: `${log?.templateName ?? "Workout"} repeat` });
    setLogEntries(entries);
    setDuration(log?.duration ? String(log.duration) : "");
    setNotes("");
    setLogDialogOpen(true);
  };

  if (loading) return <div className="space-y-4">{[1,2,3].map(i => <div key={i} className="h-32 bg-muted animate-pulse rounded-lg" />)}</div>;

  return (
    <div className="space-y-5 sm:space-y-6">
      <FadeIn>
        <div className="grid gap-3 sm:flex sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h2 className="font-display text-2xl font-bold leading-tight tracking-tight">Workouts</h2>
            <p className="mt-1 text-sm text-muted-foreground">Strength training programs and exercise tracking</p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <Button variant="outline" onClick={() => openExerciseDialog()} className="w-full px-3 sm:w-auto sm:px-4">
              <Plus className="w-4 h-4 mr-2" />Add Exercise
            </Button>
            <Button onClick={() => openTemplateDialog()} className="w-full px-3 sm:w-auto sm:px-4">
              <Plus className="w-4 h-4 sm:mr-2" /><span className="hidden min-[390px]:inline">Add </span>Workout
            </Button>
          </div>
        </div>
      </FadeIn>

      {activeWorkout && (
        <FadeIn>
          <Card className="border-primary/40 bg-primary/5">
            <CardHeader className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Badge className="mb-2">Workout In Progress</Badge>
                  <CardTitle className="break-words text-xl">{activeWorkout.name}</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {activeExerciseIndex + 1} of {activeExercises.length} exercises
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant="outline" className="font-mono">
                    <Clock className="mr-1 h-3 w-3" />
                    {elapsedLabel}
                  </Badge>
                  <Button variant="ghost" size="icon" onClick={cancelActiveWorkout} title="Cancel workout">
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <RoutineChecklist
                title="Warm up first"
                items={parseRoutineItems(activeWorkout.warmupJson)}
                empty="Start with 5-10 minutes of light cardio and dynamic mobility."
              />

              <div className="rounded-lg border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">Current exercise</p>
                    <h3 className="mt-1 break-words text-lg font-semibold">{currentExercise?.exercise?.name ?? "Exercise"}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Target: {currentExercise?.sets ?? 3} sets x {currentExercise?.reps ?? "8-12"} reps
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button type="button" variant="outline" size="icon" onClick={shuffleActiveExercise} title="Shuffle this exercise">
                      <Shuffle className="h-4 w-4" />
                    </Button>
                    <Badge variant="secondary">{currentExerciseSets.length} logged</Badge>
                  </div>
                </div>

                <div className="mt-4 rounded-md border border-border bg-muted/30 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold">Last time</p>
                    {lastExerciseLogDate && <Badge variant="outline">{lastExerciseLogDate}</Badge>}
                  </div>
                  {lastExerciseLog ? (
                    <div className="mt-3 grid gap-2">
                      {lastExerciseLog.sets.map((set: any) => (
                        <div key={set.id} className="flex items-center justify-between rounded-md bg-background/60 px-3 py-2 text-sm">
                          <span className="font-medium">Set {set.setNumber}</span>
                          <span className="font-mono text-muted-foreground">{set.weight}kg x {set.reps}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-muted-foreground">No previous sets for this exercise yet.</p>
                  )}
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div>
                    <Label>Weight (kg)</Label>
                    <Input
                      type="number"
                      value={activeSet.weight}
                      onChange={(e) => setActiveSet({ ...activeSet, weight: e.target.value })}
                      className="mt-1"
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <Label>Reps</Label>
                    <Input
                      type="number"
                      value={activeSet.reps}
                      onChange={(e) => setActiveSet({ ...activeSet, reps: e.target.value })}
                      className="mt-1"
                    />
                  </div>
                </div>
                <Button type="button" onClick={addActiveSet} className="mt-3 w-full">
                  <Plus className="mr-2 h-4 w-4" />
                  Log This Set
                </Button>

                {currentExerciseSets.length > 0 && (
                  <div className="mt-4 space-y-2">
                    {currentExerciseSets.map((set: any) => {
                      const entryIndex = activeEntries.findIndex((entry) => entry === set);
                      return (
                        <div key={`${set.exerciseId}-${set.setNumber}-${entryIndex}`} className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2 text-sm">
                          <span className="font-medium">Set {set.setNumber}</span>
                          <span className="font-mono text-muted-foreground">{set.weight}kg x {set.reps}</span>
                          <button className="text-destructive" onClick={() => removeActiveSet(entryIndex)} aria-label="Remove set">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Button type="button" variant="outline" onClick={() => updateActiveExercise(activeExerciseIndex - 1)} disabled={activeExerciseIndex === 0}>
                  Previous
                </Button>
                <Button type="button" variant="outline" onClick={() => updateActiveExercise(activeExerciseIndex + 1)} disabled={activeExerciseIndex >= activeExercises.length - 1}>
                  Next Exercise
                </Button>
              </div>

              <div>
                <Label>Workout Notes</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1" placeholder="How did it feel?" />
              </div>

              <div>
                <Label>Total Time (min)</Label>
                <Input
                  type="number"
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  className="mt-1"
                  placeholder={String(elapsedMinutes)}
                />
              </div>

              <RoutineChecklist
                title="Finish with stretches"
                items={parseRoutineItems(activeWorkout.stretchesJson)}
                empty="Cool down, then stretch the trained muscles pain-free for 30-45 seconds each."
              />

              <Button type="button" onClick={finishActiveWorkout} className="w-full" disabled={activeEntries.length === 0}>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Finish Workout ({duration || elapsedMinutes} min)
              </Button>
            </CardContent>
          </Card>
        </FadeIn>
      )}

      <FadeIn delay={0.05}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <WorkoutStatCard icon={Dumbbell} title="Workouts" value={workoutStats.totalWorkouts} detail={historyRange === "all" ? "all time" : `last ${historyRange} days`} />
          <WorkoutStatCard icon={CheckCircle2} title="Sets" value={workoutStats.totalSets} detail="logged sets" />
          <WorkoutStatCard icon={BarChart3} title="Volume" value={`${Math.round(workoutStats.totalVolume)} kg`} detail="weight x reps" />
          <WorkoutStatCard icon={Clock} title="Time" value={`${workoutStats.totalMinutes} min`} detail="training time" />
        </div>
      </FadeIn>

      {workoutStats.topPrs.length > 0 && (
        <FadeIn delay={0.08}>
          <Card className="border-primary/30 bg-primary/5">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Trophy className="h-5 w-5 text-primary" />
                Personal Records
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {workoutStats.topPrs.map((record: any) => (
                <div key={record.exerciseName} className="rounded-lg border border-primary/20 bg-background/70 p-3">
                  <p className="truncate text-sm font-semibold">{record.exerciseName}</p>
                  <p className="mt-1 font-mono text-lg font-bold">{record.weight}kg x {record.reps}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(record.date ?? Date.now()).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        </FadeIn>
      )}

      <Tabs defaultValue="programs" className="space-y-4">
        <TabsList className="grid h-auto w-full grid-cols-3 gap-2 overflow-visible bg-transparent p-0 sm:inline-flex sm:h-10 sm:w-auto sm:gap-1">
          <TabsTrigger value="programs" className="h-12 w-full rounded-lg border border-border bg-transparent text-muted-foreground shadow-none data-[state=active]:!border-primary/30 data-[state=active]:!bg-primary/15 data-[state=active]:!text-primary sm:h-10">Programs</TabsTrigger>
          <TabsTrigger value="exercises" className="h-12 w-full rounded-lg border border-border bg-transparent text-muted-foreground shadow-none data-[state=active]:!border-primary/30 data-[state=active]:!bg-primary/15 data-[state=active]:!text-primary sm:h-10">Library</TabsTrigger>
          <TabsTrigger value="history" className="h-12 w-full rounded-lg border border-border bg-transparent text-muted-foreground shadow-none data-[state=active]:!border-primary/30 data-[state=active]:!bg-primary/15 data-[state=active]:!text-primary sm:h-10">History</TabsTrigger>
        </TabsList>

        <TabsContent value="programs" className="space-y-4">
          <FadeIn>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(templates ?? []).map((t: any) => (
                <Card key={t?.id} className="hover:shadow-lg transition-shadow">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">{t?.name}</CardTitle>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">{t?.difficulty ?? "Intermediate"}</Badge>
                        <Button variant="ghost" size="icon" onClick={() => openTemplateDialog(t)} title="Edit workout day">
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDeleteTemplate(t)} title="Delete workout day" className="hover:text-destructive">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground">{t?.description}</p>
                    {t?.dayOfWeek && <Badge variant="outline" className="w-fit">{t.dayOfWeek}</Badge>}
                  </CardHeader>
                  <CardContent>
                    <div className="mb-4 grid gap-2 sm:grid-cols-2">
                      <RoutinePreview title="Warm-up" items={parseRoutineItems(t?.warmupJson)} fallback="5-10 min light cardio + mobility" />
                      <RoutinePreview title="Stretches" items={parseRoutineItems(t?.stretchesJson)} fallback="Cooldown + target muscle stretches" />
                    </div>
                    <div className="space-y-1 mb-4">
                      {(t?.exercises ?? []).map((we: any) => (
                        <div key={we?.id} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 py-1 text-sm">
                          <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => shuffleProgramExercise(t, we)} title="Shuffle exercise">
                            <Shuffle className="h-3.5 w-3.5" />
                          </Button>
                          <span className="min-w-0 break-words">{we?.exercise?.name}</span>
                          <span className="text-muted-foreground font-mono">{we?.sets} × {we?.reps}</span>
                        </div>
                      ))}
                    </div>
                    <Button onClick={() => startWorkout(t)} className="w-full" size="sm">
                      <Dumbbell className="w-4 h-4 mr-2" />Start Workout
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </FadeIn>
        </TabsContent>

        <TabsContent value="exercises" className="space-y-4">
          <div className="grid gap-3 sm:flex sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-medium">Exercise Library</p>
              <p className="text-xs text-muted-foreground">{filteredExercises.length} exercises shown</p>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="w-full justify-between sm:w-56">
                  <span className="flex min-w-0 items-center gap-2">
                    <SlidersHorizontal className="h-4 w-4 shrink-0" />
                    <span className="truncate capitalize">{selectedMuscleLabel}</span>
                  </span>
                  <ChevronDown className="h-4 w-4 shrink-0 opacity-70" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Filter Muscles</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuCheckboxItem
                  checked={selectedMuscleGroups.length === 0}
                  onCheckedChange={() => setSelectedMuscleGroups([])}
                  onSelect={(event) => event.preventDefault()}
                >
                  All muscles
                </DropdownMenuCheckboxItem>
                {editableMuscleGroups.map((group) => (
                  <DropdownMenuCheckboxItem
                    key={group}
                    checked={selectedMuscleGroups.includes(group)}
                    onCheckedChange={() => toggleMuscleGroup(group)}
                    onSelect={(event) => event.preventDefault()}
                    className="capitalize"
                  >
                    {group}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {(filteredExercises ?? []).map((ex: any) => (
              <Card key={ex?.id} className="overflow-hidden">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-medium">{ex?.name}</h4>
                      <div className="flex gap-2 mt-1">
                        <Badge variant="outline" className="text-xs capitalize">{ex?.muscleGroup}</Badge>
                        {ex?.equipment && <Badge variant="secondary" className="text-xs capitalize">{ex.equipment}</Badge>}
                        {ex?.category && <Badge variant="secondary" className="text-xs capitalize">{ex.category}</Badge>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openExerciseDialog(ex)} title="Edit exercise">
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDeleteExercise(ex)} title="Delete exercise" className="hover:text-destructive">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                      <button onClick={() => setExpandedExercise(expandedExercise === ex?.id ? null : ex?.id)}>
                        {expandedExercise === ex?.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  {expandedExercise === ex?.id && (
                    <div className="mt-3 space-y-2 text-sm text-muted-foreground">
                      {ex?.description && <p>{ex.description}</p>}
                      {ex?.formTips && (
                        <div className="bg-primary/5 p-3 rounded-lg">
                          <p className="flex items-center gap-1 font-medium text-foreground mb-1">
                            <Info className="w-3 h-3" /> Form Tips
                          </p>
                          <p>{ex.formTips}</p>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          <div className="grid gap-3 sm:flex sm:items-center sm:justify-between">
            <div>
              <h3 className="text-lg font-semibold">Workout History</h3>
              <p className="text-sm text-muted-foreground">Filter, review, repeat, or delete completed sessions.</p>
            </div>
            <Select value={historyRange} onValueChange={setHistoryRange}>
              <SelectTrigger className="w-full sm:w-44">
                <CalendarDays className="mr-2 h-4 w-4" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
                <SelectItem value="all">All time</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {(filteredWorkoutLogs ?? [])?.length === 0 ? (
            <div className="text-center py-12">
              <Dumbbell className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground">No workouts logged yet</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {(filteredWorkoutLogs ?? []).map((log: any) => (
                <Card key={log?.id} className="overflow-hidden">
                  <CardContent className="space-y-4 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h4 className="break-words font-semibold">{log?.templateName ?? "Workout"}</h4>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {new Date(log?.date ?? Date.now()).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
                        </p>
                      </div>
                      {log?.duration && (
                        <Badge variant="secondary" className="shrink-0"><Clock className="w-3 h-3 mr-1" />{log.duration} min</Badge>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-2 rounded-lg bg-muted/40 p-3 text-center text-sm">
                      <div>
                        <p className="font-semibold">{groupExerciseLogs(log?.exerciseLogs ?? []).length}</p>
                        <p className="text-xs text-muted-foreground">Exercises</p>
                      </div>
                      <div>
                        <p className="font-semibold">{(log?.exerciseLogs ?? []).length}</p>
                        <p className="text-xs text-muted-foreground">Sets</p>
                      </div>
                      <div>
                        <p className="font-semibold">
                          {(log?.exerciseLogs ?? []).reduce((sum: number, entry: any) => sum + ((entry?.weight ?? 0) * (entry?.reps ?? 0)), 0)}
                        </p>
                        <p className="text-xs text-muted-foreground">Volume</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-[1fr_auto_auto] gap-2">
                      <Button type="button" variant="outline" className="w-full" onClick={() => setSelectedHistoryLog(log)}>
                        <Eye className="mr-2 h-4 w-4" />
                        View Workout
                      </Button>
                      <Button type="button" variant="outline" size="icon" onClick={() => repeatWorkout(log)} title="Repeat workout">
                        <RotateCcw className="h-4 w-4" />
                      </Button>
                      <Button type="button" variant="outline" size="icon" onClick={() => deleteWorkoutLog(log)} title="Delete workout history">
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                    <div className="hidden">
                      {(log?.exerciseLogs ?? []).map((el: any) => (
                        <div key={el?.id} className="flex items-center justify-between text-sm py-0.5">
                          <span className="text-muted-foreground">{el?.exercise?.name ?? "Exercise"} (Set {el?.setNumber})</span>
                          <span className="font-mono">{el?.weight ?? 0}kg × {el?.reps ?? 0}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={!!selectedHistoryLog} onOpenChange={(open) => !open && setSelectedHistoryLog(null)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedHistoryLog?.templateName ?? "Workout History"}</DialogTitle>
          </DialogHeader>
          {selectedHistoryLog && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">
                  {new Date(selectedHistoryLog?.date ?? Date.now()).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", year: "numeric" })}
                </Badge>
                {selectedHistoryLog?.duration && (
                  <Badge variant="secondary"><Clock className="mr-1 h-3 w-3" />{selectedHistoryLog.duration} min</Badge>
                )}
                <Badge variant="secondary">{selectedHistoryGroups.length} exercises</Badge>
                <Badge variant="secondary">{(selectedHistoryLog?.exerciseLogs ?? []).length} sets</Badge>
              </div>

              <div className="space-y-3">
                {selectedHistoryGroups.map((group: any) => (
                  <div key={group.exerciseId} className="rounded-lg border border-border p-3">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <h4 className="min-w-0 break-words font-semibold">{group.exerciseName}</h4>
                      <Badge variant="outline" className="shrink-0">{group.sets.length} sets</Badge>
                    </div>
                    <div className="grid gap-2">
                      {group.sets.map((set: any) => (
                        <div key={set.id} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-md bg-muted/40 px-3 py-2 text-sm">
                          <span className="font-medium">Set {set.setNumber}</span>
                          <span className="font-mono text-muted-foreground">{set.weight ?? 0}kg x {set.reps ?? 0}</span>
                          <span className="font-mono text-xs text-muted-foreground">{((set.weight ?? 0) * (set.reps ?? 0)).toFixed(0)}kg</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {selectedHistoryLog?.notes && (
                <div className="rounded-lg bg-muted/40 p-3">
                  <p className="text-sm font-semibold">Notes</p>
                  <p className="mt-1 text-sm text-muted-foreground">{selectedHistoryLog.notes}</p>
                </div>
              )}

              <Button type="button" variant="outline" className="w-full hover:text-destructive" onClick={() => deleteWorkoutLog(selectedHistoryLog)}>
                <Trash2 className="mr-2 h-4 w-4" />
                Delete This Workout
              </Button>
              <Button type="button" className="w-full" onClick={() => repeatWorkout(selectedHistoryLog)}>
                <RotateCcw className="mr-2 h-4 w-4" />
                Repeat This Workout
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={exerciseDialogOpen} onOpenChange={setExerciseDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{exerciseForm.id ? "Edit Exercise" : "Add Exercise"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Name</Label>
              <Input value={exerciseForm.name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setExerciseForm({ ...exerciseForm, name: e.target.value })} className="mt-1" placeholder="Hack squat" />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <Label>Muscle</Label>
                <Select value={exerciseForm.muscleGroup} onValueChange={(value: string) => setExerciseForm({ ...exerciseForm, muscleGroup: value })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {editableMuscleGroups.map((group) => <SelectItem key={group} value={group} className="capitalize">{group}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Equipment</Label>
                <Input value={exerciseForm.equipment} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setExerciseForm({ ...exerciseForm, equipment: e.target.value })} className="mt-1" placeholder="machine" />
              </div>
              <div>
                <Label>Category</Label>
                <Select value={exerciseForm.category} onValueChange={(value: string) => setExerciseForm({ ...exerciseForm, category: value })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="compound">Compound</SelectItem>
                    <SelectItem value="isolation">Isolation</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={exerciseForm.description} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setExerciseForm({ ...exerciseForm, description: e.target.value })} className="mt-1" placeholder="What this exercise is for" />
            </div>
            <div>
              <Label>Form Tips</Label>
              <Textarea value={exerciseForm.formTips} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setExerciseForm({ ...exerciseForm, formTips: e.target.value })} className="mt-1" placeholder="Coaching cues" />
            </div>
            <Button onClick={handleSaveExercise} className="w-full">
              {exerciseForm.id ? "Update Exercise" : "Add Exercise"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{templateForm.id ? "Edit Workout Day" : "Add Workout Day"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label>Name</Label>
                <Input value={templateForm.name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTemplateForm({ ...templateForm, name: e.target.value })} className="mt-1" placeholder="Leg Day" />
              </div>
              <div>
                <Label>Day</Label>
                <Select value={templateForm.dayOfWeek} onValueChange={(value: string) => setTemplateForm({ ...templateForm, dayOfWeek: value })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {daysOfWeek.map((day) => <SelectItem key={day} value={day}>{day}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Difficulty</Label>
                <Select value={templateForm.difficulty} onValueChange={(value: string) => setTemplateForm({ ...templateForm, difficulty: value })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="beginner">Beginner</SelectItem>
                    <SelectItem value="intermediate">Intermediate</SelectItem>
                    <SelectItem value="advanced">Advanced</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Muscle Groups</Label>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="mt-1 w-full justify-between">
                      <span className="flex min-w-0 items-center gap-2">
                        <SlidersHorizontal className="h-4 w-4 shrink-0" />
                        <span className="truncate capitalize">{templateMuscleLabel}</span>
                      </span>
                      <ChevronDown className="h-4 w-4 shrink-0 opacity-70" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuLabel>Workout Muscles</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {editableMuscleGroups.map((group) => (
                      <DropdownMenuCheckboxItem
                        key={group}
                        checked={templateMuscleGroups.includes(group)}
                        onCheckedChange={() => toggleTemplateMuscleGroup(group)}
                        onSelect={(event) => event.preventDefault()}
                        className="capitalize"
                      >
                        {group}
                      </DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={templateForm.description} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setTemplateForm({ ...templateForm, description: e.target.value })} className="mt-1" placeholder="Training focus for this day" />
            </div>

            <RoutineEditor
              title="Warm-up"
              description="Add 1-3 prep items before lifting."
              items={templateForm.warmups ?? []}
              onAdd={() => addRoutineItem("warmups")}
              onUpdate={(index, key, value) => updateRoutineItem("warmups", index, key, value)}
              onRemove={(index) => removeRoutineItem("warmups", index)}
            />

            <RoutineEditor
              title="Stretches / Cooldown"
              description="Add recovery work after the workout."
              items={templateForm.stretches ?? []}
              onAdd={() => addRoutineItem("stretches")}
              onUpdate={(index, key, value) => updateRoutineItem("stretches", index, key, value)}
              onRemove={(index) => removeRoutineItem("stretches", index)}
            />

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Exercises</Label>
                <Button type="button" size="sm" variant="outline" onClick={addTemplateExercise}>
                  <Plus className="w-4 h-4 mr-2" />Add Row
                </Button>
              </div>
              {(templateForm.exercises ?? []).length === 0 && (
                <div className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
                  Add exercises for this workout day.
                </div>
              )}
              {(templateForm.exercises ?? []).map((item: any, index: number) => (
                <div key={index} className="grid grid-cols-1 gap-2 rounded-lg bg-muted/40 p-3 md:grid-cols-[1fr_80px_100px_90px_36px] md:items-end">
                  <div>
                    <Label className="text-xs">Exercise</Label>
                    <Select value={item.exerciseId} onValueChange={(value: string) => updateTemplateExercise(index, "exerciseId", value)}>
                      <SelectTrigger className="mt-1"><SelectValue placeholder="Choose exercise" /></SelectTrigger>
                      <SelectContent>
                        {(exercises ?? []).map((exercise: any) => (
                          <SelectItem key={exercise.id} value={exercise.id}>{exercise.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Sets</Label>
                    <Input type="number" value={item.sets} onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateTemplateExercise(index, "sets", e.target.value)} className="mt-1" />
                  </div>
                  <div>
                    <Label className="text-xs">Reps</Label>
                    <Input value={item.reps} onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateTemplateExercise(index, "reps", e.target.value)} className="mt-1" />
                  </div>
                  <div>
                    <Label className="text-xs">Rest</Label>
                    <Input type="number" value={item.restSeconds} onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateTemplateExercise(index, "restSeconds", e.target.value)} className="mt-1" />
                  </div>
                  <Button type="button" variant="ghost" size="icon" onClick={() => removeTemplateExercise(index)} title="Remove exercise">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>

            <Button onClick={handleSaveTemplate} className="w-full">
              {templateForm.id ? "Update Workout Day" : "Add Workout Day"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Log Workout Dialog */}
      <Dialog open={logDialogOpen} onOpenChange={setLogDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Log: {selectedTemplate?.name ?? "Workout"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Duration (min)</Label>
                <Input type="number" value={duration} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDuration(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label>Notes</Label>
                <Input value={notes} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNotes(e.target.value)} className="mt-1" placeholder="How was it?" />
              </div>
            </div>
            <div className="space-y-3">
              {(logEntries ?? []).map((entry: any, idx: number) => (
                <div key={idx} className="flex items-center gap-3 p-2 rounded-lg bg-muted/50">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{entry?.exerciseName}</p>
                    <p className="text-xs text-muted-foreground">Set {entry?.setNumber}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div>
                      <Label className="text-xs">Weight</Label>
                      <Input
                        type="number"
                        value={entry?.weight ?? 0}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateEntry(idx, "weight", parseFloat(e.target.value) || 0)}
                        className="w-20 h-8 text-sm"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Reps</Label>
                      <Input
                        type="number"
                        value={entry?.reps ?? 0}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateEntry(idx, "reps", parseInt(e.target.value) || 0)}
                        className="w-20 h-8 text-sm"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <Button onClick={handleLogWorkout} className="w-full">Save Workout</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RoutinePreview({ title, items, fallback }: { title: string; items: RoutineItem[]; fallback: string }) {
  const displayItems = items.length ? items.slice(0, 2) : [{ name: fallback, duration: "", notes: "" }];
  return (
    <div className="rounded-lg border border-border bg-muted/20 p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      <div className="space-y-1">
        {displayItems.map((item, index) => (
          <p key={`${item.name}-${index}`} className="truncate text-xs">
            {item.name}{item.duration ? <span className="text-muted-foreground"> - {item.duration}</span> : null}
          </p>
        ))}
      </div>
    </div>
  );
}

function RoutineChecklist({ title, items, empty }: { title: string; items: RoutineItem[]; empty: string }) {
  const displayItems = items.length ? items : [{ name: empty, duration: "", notes: "" }];
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="mb-3 flex items-center gap-2 font-semibold">
        <CheckCircle2 className="h-4 w-4 text-primary" />
        {title}
      </p>
      <div className="space-y-2">
        {displayItems.map((item, index) => (
          <div key={`${item.name}-${index}`} className="rounded-md bg-muted/40 px-3 py-2 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">{item.name}</span>
              {item.duration && <Badge variant="outline">{item.duration}</Badge>}
            </div>
            {item.notes && <p className="mt-1 text-xs text-muted-foreground">{item.notes}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

function RoutineEditor({
  title,
  description,
  items,
  onAdd,
  onUpdate,
  onRemove,
}: {
  title: string;
  description: string;
  items: RoutineItem[];
  onAdd: () => void;
  onUpdate: (index: number, key: keyof RoutineItem, value: string) => void;
  onRemove: (index: number) => void;
}) {
  return (
    <div className="space-y-3 rounded-lg border border-border p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <Label>{title}</Label>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={onAdd}>
          <Plus className="mr-2 h-4 w-4" />
          Add
        </Button>
      </div>
      {(items ?? []).length === 0 && (
        <div className="rounded-lg border border-dashed border-border p-3 text-center text-sm text-muted-foreground">No items added.</div>
      )}
      {(items ?? []).map((item, index) => (
        <div key={index} className="grid gap-2 rounded-lg bg-muted/40 p-3 sm:grid-cols-[1fr_8rem_2rem] sm:items-end">
          <div>
            <Label className="text-xs">Name</Label>
            <Input value={item.name} onChange={(event) => onUpdate(index, "name", event.target.value)} className="mt-1" placeholder="Light cardio" />
          </div>
          <div>
            <Label className="text-xs">Time</Label>
            <Input value={item.duration ?? ""} onChange={(event) => onUpdate(index, "duration", event.target.value)} className="mt-1" placeholder="5 min" />
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={() => onRemove(index)} title="Remove item">
            <Trash2 className="h-4 w-4" />
          </Button>
          <div className="sm:col-span-3">
            <Label className="text-xs">Notes</Label>
            <Input value={item.notes ?? ""} onChange={(event) => onUpdate(index, "notes", event.target.value)} className="mt-1" placeholder="Optional cue or instruction" />
          </div>
        </div>
      ))}
    </div>
  );
}

function WorkoutStatCard({ icon: Icon, title, value, detail }: any) {
  return (
    <Card>
      <CardContent className="p-3 sm:p-4">
        <div className="mb-3 flex items-center gap-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Icon className="h-5 w-5 text-primary" />
          </div>
          <p className="text-sm font-medium">{title}</p>
        </div>
        <p className="break-words font-display text-2xl font-bold">{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}
