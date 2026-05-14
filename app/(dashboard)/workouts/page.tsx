"use client";
import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dumbbell, Plus, Clock, Info, ChevronDown, ChevronUp, Pencil, Trash2 } from "lucide-react";
import { FadeIn } from "@/components/ui/animate";
import { toast } from "sonner";

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
  exercises: [] as any[],
};

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
  const [muscleFilter, setMuscleFilter] = useState("all");
  const [expandedExercise, setExpandedExercise] = useState<string | null>(null);
  const [exerciseDialogOpen, setExerciseDialogOpen] = useState(false);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [exerciseForm, setExerciseForm] = useState(blankExerciseForm);
  const [templateForm, setTemplateForm] = useState(blankTemplateForm);

  const loadData = useCallback(async () => {
    try {
      const [tRes, eRes, lRes] = await Promise.all([
        fetch("/api/workout-templates"),
        fetch("/api/exercises"),
        fetch("/api/workout-logs?limit=20"),
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

  const startWorkout = (template: any) => {
    setSelectedTemplate(template);
    const entries = (template?.exercises ?? []).flatMap((we: any) =>
      Array.from({ length: we?.sets ?? 3 }, (_: any, i: number) => ({
        exerciseId: we?.exercise?.id ?? "",
        exerciseName: we?.exercise?.name ?? "",
        setNumber: i + 1,
        reps: parseInt((we?.reps ?? "10").split("-")?.[0] ?? "10"),
        weight: 0,
      }))
    );
    setLogEntries(entries);
    setLogDialogOpen(true);
  };

  const updateEntry = (idx: number, field: string, value: number) => {
    setLogEntries((prev: any[]) =>
      (prev ?? []).map((e: any, i: number) => (i === idx ? { ...(e ?? {}), [field]: value } : e))
    );
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
      toast.success(exerciseForm.id ? "Exercise updated" : "Exercise added");
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

  const muscleGroups = ["all", "chest", "back", "shoulders", "legs", "arms", "core"];
  const editableMuscleGroups = muscleGroups.filter((item) => item !== "all");
  const daysOfWeek = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const filteredExercises = muscleFilter === "all"
    ? exercises
    : (exercises ?? []).filter((e: any) => e?.muscleGroup === muscleFilter);

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

      <Tabs defaultValue="programs" className="space-y-4">
        <TabsList className="grid h-auto w-full grid-cols-3 gap-1 overflow-visible sm:inline-flex sm:h-10 sm:w-auto">
          <TabsTrigger value="programs" className="w-full">Programs</TabsTrigger>
          <TabsTrigger value="exercises" className="w-full">Library</TabsTrigger>
          <TabsTrigger value="history" className="w-full">History</TabsTrigger>
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
                    <div className="space-y-1 mb-4">
                      {(t?.exercises ?? []).map((we: any) => (
                        <div key={we?.id} className="grid grid-cols-[1fr_auto] gap-3 py-1 text-sm">
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
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-2 flex-wrap">
              {muscleGroups.map((mg: string) => (
                <Button
                  key={mg}
                  size="sm"
                  variant={muscleFilter === mg ? "default" : "outline"}
                  onClick={() => setMuscleFilter(mg)}
                  className="capitalize"
                >
                  {mg}
                </Button>
              ))}
            </div>
            <Button size="sm" onClick={() => openExerciseDialog()}>
              <Plus className="w-4 h-4 mr-2" />Add Exercise
            </Button>
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
          {(workoutLogs ?? [])?.length === 0 ? (
            <div className="text-center py-12">
              <Dumbbell className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground">No workouts logged yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {(workoutLogs ?? []).map((log: any) => (
                <Card key={log?.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <h4 className="font-medium">{log?.templateName ?? "Workout"}</h4>
                        <p className="text-xs text-muted-foreground">
                          {new Date(log?.date ?? Date.now()).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {log?.duration && (
                          <Badge variant="secondary"><Clock className="w-3 h-3 mr-1" />{log.duration} min</Badge>
                        )}
                      </div>
                    </div>
                    <div className="space-y-1">
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
                <Input value={templateForm.muscleGroups} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTemplateForm({ ...templateForm, muscleGroups: e.target.value })} className="mt-1" placeholder="legs,core" />
              </div>
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={templateForm.description} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setTemplateForm({ ...templateForm, description: e.target.value })} className="mt-1" placeholder="Training focus for this day" />
            </div>

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
