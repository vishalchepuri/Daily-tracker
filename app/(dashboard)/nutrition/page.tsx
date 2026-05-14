"use client";
import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Trash2, Utensils, Flame, Target, Zap, Apple, Pencil, Droplets, Wheat } from "lucide-react";
import { FadeIn } from "@/components/ui/animate";
import { toast } from "sonner";

const mealSuggestions = [
  { name: "Grilled Chicken Breast", calories: 165, protein: 31, carbs: 0, fat: 3.6, serving: "100g" },
  { name: "Brown Rice", calories: 216, protein: 5, carbs: 45, fat: 1.8, serving: "1 cup" },
  { name: "Salmon Fillet", calories: 208, protein: 20, carbs: 0, fat: 13, serving: "100g" },
  { name: "Sweet Potato", calories: 103, protein: 2.3, carbs: 24, fat: 0.1, serving: "1 medium" },
  { name: "Greek Yogurt", calories: 100, protein: 17, carbs: 6, fat: 0.7, serving: "170g" },
  { name: "Eggs (2 whole)", calories: 143, protein: 13, carbs: 1, fat: 10, serving: "2 large" },
  { name: "Oatmeal", calories: 154, protein: 5, carbs: 27, fat: 2.6, serving: "1 cup" },
  { name: "Banana", calories: 105, protein: 1.3, carbs: 27, fat: 0.4, serving: "1 medium" },
  { name: "Whey Protein Shake", calories: 120, protein: 24, carbs: 3, fat: 1.5, serving: "1 scoop" },
  { name: "Quinoa", calories: 222, protein: 8, carbs: 39, fat: 3.5, serving: "1 cup" },
  { name: "Cottage Cheese", calories: 163, protein: 28, carbs: 6, fat: 2.3, serving: "1 cup" },
  { name: "Lean Ground Turkey", calories: 170, protein: 21, carbs: 0, fat: 9, serving: "100g" },
];

export default function NutritionPage() {
  const [foodLogs, setFoodLogs] = useState<any[]>([]);
  const [dietPlans, setDietPlans] = useState<any[]>([]);
  const [waterLogs, setWaterLogs] = useState<any[]>([]);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [targetsDialogOpen, setTargetsDialogOpen] = useState(false);
  const [dietDialogOpen, setDietDialogOpen] = useState(false);
  const [editingFoodId, setEditingFoodId] = useState<string | null>(null);
  const [editingDietId, setEditingDietId] = useState<string | null>(null);
  const [waterAmount, setWaterAmount] = useState("250");
  const [form, setForm] = useState({
    foodName: "", mealType: "breakfast", calories: "", protein: "", carbs: "", fat: "", fiber: "", servingSize: "",
  });
  const [targetForm, setTargetForm] = useState({
    targetCalories: "",
    targetProtein: "",
    targetCarbs: "",
    targetFat: "",
    targetFiber: "",
    targetWaterMl: "",
  });
  const [searchTerm, setSearchTerm] = useState("");
  const [dietForm, setDietForm] = useState({
    name: "",
    goal: "muscle_gain",
    notes: "",
    meals: [
      { mealType: "Breakfast", title: "", foods: "", calories: "", protein: "", carbs: "", fat: "" },
      { mealType: "Snack", title: "", foods: "", calories: "", protein: "", carbs: "", fat: "" },
      { mealType: "Lunch", title: "", foods: "", calories: "", protein: "", carbs: "", fat: "" },
      { mealType: "Evening Snack", title: "", foods: "", calories: "", protein: "", carbs: "", fat: "" },
      { mealType: "Dinner", title: "", foods: "", calories: "", protein: "", carbs: "", fat: "" },
    ],
  });

  const loadData = useCallback(async () => {
    try {
      const [logsRes, profileRes, waterRes, dietRes] = await Promise.all([
        fetch("/api/food-logs"),
        fetch("/api/profile"),
        fetch("/api/water-logs"),
        fetch("/api/diet-plans"),
      ]);
      const logsData = await logsRes.json();
      const profileData = await profileRes.json();
      const waterData = await waterRes.json();
      const dietData = await dietRes.json();
      setFoodLogs(logsData?.logs ?? []);
      setWaterLogs(waterData?.logs ?? []);
      setDietPlans(dietData?.plans ?? []);
      setProfile(profileData?.profile);
      setTargetForm({
        targetCalories: String(profileData?.profile?.targetCalories ?? 2500),
        targetProtein: String(profileData?.profile?.targetProtein ?? 150),
        targetCarbs: String(profileData?.profile?.targetCarbs ?? 300),
        targetFat: String(profileData?.profile?.targetFat ?? 70),
        targetFiber: String(profileData?.profile?.targetFiber ?? 30),
        targetWaterMl: String(profileData?.profile?.targetWaterMl ?? 3000),
      });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const resetFoodForm = () => {
    setForm({ foodName: "", mealType: "breakfast", calories: "", protein: "", carbs: "", fat: "", fiber: "", servingSize: "" });
    setEditingFoodId(null);
    setSearchTerm("");
  };

  const resetDietForm = () => {
    setEditingDietId(null);
    setDietForm({
      name: "",
      goal: "muscle_gain",
      notes: "",
      meals: [
        { mealType: "Breakfast", title: "", foods: "", calories: "", protein: "", carbs: "", fat: "" },
        { mealType: "Snack", title: "", foods: "", calories: "", protein: "", carbs: "", fat: "" },
        { mealType: "Lunch", title: "", foods: "", calories: "", protein: "", carbs: "", fat: "" },
        { mealType: "Evening Snack", title: "", foods: "", calories: "", protein: "", carbs: "", fat: "" },
        { mealType: "Dinner", title: "", foods: "", calories: "", protein: "", carbs: "", fat: "" },
      ],
    });
  };

  const openAddDialog = () => {
    resetFoodForm();
    setDialogOpen(true);
  };

  const openEditDialog = (log: any) => {
    setEditingFoodId(log?.id ?? null);
    setForm({
      foodName: log?.foodName ?? "",
      mealType: log?.mealType ?? "breakfast",
      calories: String(log?.calories ?? 0),
      protein: String(log?.protein ?? 0),
      carbs: String(log?.carbs ?? 0),
      fat: String(log?.fat ?? 0),
      fiber: String(log?.fiber ?? 0),
      servingSize: log?.servingSize ?? "",
    });
    setSearchTerm("");
    setDialogOpen(true);
  };

  const handleSaveFood = async () => {
    if (!form.foodName) { toast.error("Enter a food name"); return; }
    try {
      const res = await fetch("/api/food-logs", {
        method: editingFoodId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingFoodId,
          foodName: form.foodName,
          mealType: form.mealType,
          calories: parseFloat(form.calories) || 0,
          protein: parseFloat(form.protein) || 0,
          carbs: parseFloat(form.carbs) || 0,
          fat: parseFloat(form.fat) || 0,
          fiber: parseFloat(form.fiber) || 0,
          servingSize: form.servingSize || null,
        }),
      });
      if (res.ok) {
        toast.success(editingFoodId ? "Food updated!" : "Food logged!");
        resetFoodForm();
        setDialogOpen(false);
        loadData();
      }
    } catch { toast.error("Failed to log food"); }
  };

  const openDietDialog = (plan?: any) => {
    if (!plan) {
      resetDietForm();
      setDietDialogOpen(true);
      return;
    }
    let meals = [];
    try {
      meals = JSON.parse(plan.mealsJson ?? "[]");
    } catch {
      meals = [];
    }
    setEditingDietId(plan.id ?? null);
    setDietForm({
      name: plan.name ?? "",
      goal: plan.goal ?? "muscle_gain",
      notes: plan.notes ?? "",
      meals: (meals.length ? meals : [{ mealType: "Breakfast", title: "", foods: "", calories: "", protein: "", carbs: "", fat: "" }]).map((meal: any) => ({
        mealType: meal.mealType ?? "Meal",
        title: meal.title ?? "",
        foods: Array.isArray(meal.foods) ? meal.foods.join(", ") : meal.foods ?? "",
        calories: String(meal.calories ?? ""),
        protein: String(meal.protein ?? ""),
        carbs: String(meal.carbs ?? ""),
        fat: String(meal.fat ?? ""),
      })),
    });
    setDietDialogOpen(true);
  };

  const updateDietMeal = (index: number, field: string, value: string) => {
    setDietForm((prev) => ({
      ...prev,
      meals: prev.meals.map((meal, i) => i === index ? { ...meal, [field]: value } : meal),
    }));
  };

  const addDietMeal = () => {
    setDietForm((prev) => ({
      ...prev,
      meals: [...prev.meals, { mealType: "Meal", title: "", foods: "", calories: "", protein: "", carbs: "", fat: "" }],
    }));
  };

  const removeDietMeal = (index: number) => {
    setDietForm((prev) => ({ ...prev, meals: prev.meals.filter((_, i) => i !== index) }));
  };

  const handleSaveDiet = async () => {
    if (!dietForm.name.trim()) {
      toast.error("Diet name is required");
      return;
    }
    const meals = dietForm.meals
      .filter((meal) => meal.mealType || meal.title || meal.foods)
      .map((meal) => ({
        mealType: meal.mealType,
        title: meal.title,
        foods: meal.foods.split(",").map((food) => food.trim()).filter(Boolean),
        calories: parseFloat(meal.calories) || 0,
        protein: parseFloat(meal.protein) || 0,
        carbs: parseFloat(meal.carbs) || 0,
        fat: parseFloat(meal.fat) || 0,
      }));
    try {
      const res = await fetch("/api/diet-plans", {
        method: editingDietId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingDietId,
          name: dietForm.name,
          goal: dietForm.goal,
          notes: dietForm.notes,
          meals,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? "Failed to save diet");
        return;
      }
      toast.success(editingDietId ? "Diet updated" : "Diet created");
      setDietDialogOpen(false);
      resetDietForm();
      loadData();
    } catch {
      toast.error("Failed to save diet");
    }
  };

  const handleDeleteDiet = async (plan: any) => {
    if (!plan?.id) return;
    if (!window.confirm(`Delete ${plan.name}?`)) return;
    try {
      const res = await fetch("/api/diet-plans", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: plan.id }),
      });
      if (!res.ok) {
        toast.error("Failed to delete diet");
        return;
      }
      toast.success("Diet deleted");
      loadData();
    } catch {
      toast.error("Failed to delete diet");
    }
  };

  const handleSaveTargets = async () => {
    try {
      const res = await fetch("/api/nutrition-targets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetCalories: parseFloat(targetForm.targetCalories) || null,
          targetProtein: parseFloat(targetForm.targetProtein) || null,
          targetCarbs: parseFloat(targetForm.targetCarbs) || null,
          targetFat: parseFloat(targetForm.targetFat) || null,
          targetFiber: parseFloat(targetForm.targetFiber) || null,
          targetWaterMl: parseFloat(targetForm.targetWaterMl) || null,
        }),
      });
      if (!res.ok) {
        toast.error("Failed to save targets");
        return;
      }
      toast.success("Targets updated");
      setTargetsDialogOpen(false);
      loadData();
    } catch {
      toast.error("Failed to save targets");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await fetch(`/api/food-logs?id=${id}`, { method: "DELETE" });
      toast.success("Removed");
      loadData();
    } catch { toast.error("Failed"); }
  };

  const handleAddWater = async (amount?: number) => {
    const amountMl = amount ?? parseFloat(waterAmount);
    if (!amountMl || amountMl <= 0) {
      toast.error("Enter water amount");
      return;
    }
    try {
      const res = await fetch("/api/water-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountMl }),
      });
      if (!res.ok) {
        toast.error("Failed to log water");
        return;
      }
      toast.success("Water logged!");
      loadData();
    } catch {
      toast.error("Failed to log water");
    }
  };

  const handleDeleteWater = async (id: string) => {
    try {
      await fetch(`/api/water-logs?id=${id}`, { method: "DELETE" });
      toast.success("Water removed");
      loadData();
    } catch { toast.error("Failed"); }
  };

  const selectSuggestion = (s: any) => {
    setForm({
      foodName: s?.foodName ?? s?.name ?? "",
      mealType: s?.mealType ?? form.mealType,
      calories: String(s?.calories ?? 0),
      protein: String(s?.protein ?? 0),
      carbs: String(s?.carbs ?? 0),
      fat: String(s?.fat ?? 0),
      fiber: String(s?.fiber ?? 0),
      servingSize: s?.serving ?? "",
    });
    setSearchTerm("");
  };

  const dietMealSuggestions = (dietPlans ?? []).flatMap((plan: any) => {
    let meals: any[] = [];
    try {
      meals = JSON.parse(plan?.mealsJson ?? "[]");
    } catch {
      meals = [];
    }
    return meals.map((meal: any) => ({
      name: `${plan?.name ?? "Diet"} - ${meal?.mealType ?? "Meal"}${meal?.title ? `: ${meal.title}` : ""}`,
      foodName: meal?.title || meal?.mealType || "Diet meal",
      calories: meal?.calories ?? 0,
      protein: meal?.protein ?? 0,
      carbs: meal?.carbs ?? 0,
      fat: meal?.fat ?? 0,
      fiber: meal?.fiber ?? 0,
      serving: Array.isArray(meal?.foods) ? meal.foods.join(", ") : meal?.foods ?? "",
      mealType: String(meal?.mealType ?? form.mealType).toLowerCase().includes("breakfast")
        ? "breakfast"
        : String(meal?.mealType ?? "").toLowerCase().includes("lunch")
          ? "lunch"
          : String(meal?.mealType ?? "").toLowerCase().includes("dinner")
            ? "dinner"
            : "snack",
      source: "diet",
    }));
  });

  const allMealSuggestions = [...dietMealSuggestions, ...mealSuggestions];

  const totals = (foodLogs ?? []).reduce(
    (acc: any, log: any) => ({
      calories: acc.calories + (log?.calories ?? 0),
      protein: acc.protein + (log?.protein ?? 0),
      carbs: acc.carbs + (log?.carbs ?? 0),
      fat: acc.fat + (log?.fat ?? 0),
      fiber: acc.fiber + (log?.fiber ?? 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }
  );

  const targetCal = profile?.targetCalories ?? 2500;
  const targetProtein = profile?.targetProtein ?? 150;
  const targetCarbs = profile?.targetCarbs ?? 300;
  const targetFat = profile?.targetFat ?? 70;
  const targetFiber = profile?.targetFiber ?? 30;
  const waterTotal = (waterLogs ?? []).reduce((sum: number, log: any) => sum + (log?.amountMl ?? 0), 0);
  const targetWater = profile?.targetWaterMl ?? 3000;

  const filteredSuggestions = (allMealSuggestions ?? []).filter((s: any) =>
    s?.name?.toLowerCase?.()?.includes?.(searchTerm?.toLowerCase?.() ?? "") ?? false
  );

  const parseDietMeals = (plan: any) => {
    try {
      return JSON.parse(plan?.mealsJson ?? "[]");
    } catch {
      return [];
    }
  };

  if (loading) return <div className="space-y-4">{[1,2,3].map(i => <div key={i} className="h-24 bg-muted animate-pulse rounded-lg" />)}</div>;

  return (
    <div className="space-y-5 sm:space-y-6">
      <FadeIn>
        <div className="grid gap-3 sm:flex sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h2 className="font-display text-2xl font-bold leading-tight tracking-tight">Nutrition Tracker</h2>
            <p className="mt-1 max-w-[18rem] text-sm text-muted-foreground sm:max-w-none">Log meals and track daily macros for muscle gain</p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex">
          <Dialog open={targetsDialogOpen} onOpenChange={setTargetsDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="w-full px-3 sm:w-auto sm:px-4"><Pencil className="w-4 h-4 sm:mr-2" /><span className="hidden sm:inline">Edit </span>Targets</Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Edit Nutrition Targets</DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Calories</Label><Input type="number" value={targetForm.targetCalories} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTargetForm({ ...targetForm, targetCalories: e.target.value })} className="mt-1" /></div>
                <div><Label>Protein (g)</Label><Input type="number" value={targetForm.targetProtein} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTargetForm({ ...targetForm, targetProtein: e.target.value })} className="mt-1" /></div>
                <div><Label>Carbs (g)</Label><Input type="number" value={targetForm.targetCarbs} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTargetForm({ ...targetForm, targetCarbs: e.target.value })} className="mt-1" /></div>
                <div><Label>Fat (g)</Label><Input type="number" value={targetForm.targetFat} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTargetForm({ ...targetForm, targetFat: e.target.value })} className="mt-1" /></div>
                <div><Label>Fiber (g)</Label><Input type="number" value={targetForm.targetFiber} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTargetForm({ ...targetForm, targetFiber: e.target.value })} className="mt-1" /></div>
                <div><Label>Water (ml)</Label><Input type="number" value={targetForm.targetWaterMl} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTargetForm({ ...targetForm, targetWaterMl: e.target.value })} className="mt-1" /></div>
              </div>
              <Button onClick={handleSaveTargets} className="w-full mt-4">Save Targets</Button>
            </DialogContent>
          </Dialog>
          <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetFoodForm(); }}>
            <DialogTrigger asChild>
              <Button onClick={openAddDialog} className="w-full px-3 sm:w-auto sm:px-4"><Plus className="w-4 h-4 sm:mr-2" />Log Meal</Button>
            </DialogTrigger>
            <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingFoodId ? "Edit Food" : "Log Food"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Search & Select</Label>
                  <Input
                    placeholder="Search foods or diet meals..."
                    value={searchTerm}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchTerm(e.target.value)}
                    className="mt-1"
                  />
                  {searchTerm && (
                    <div className="mt-2 max-h-32 overflow-y-auto border rounded-lg">
                      {filteredSuggestions.map((s: any) => (
                        <button
                          key={s?.name}
                          onClick={() => selectSuggestion(s)}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex justify-between"
                        >
                          <span>
                            {s?.name}
                            {s?.source === "diet" && <Badge variant="secondary" className="ml-2">Diet</Badge>}
                          </span>
                          <span className="text-muted-foreground">{s?.calories} kcal</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {dietMealSuggestions.length > 0 && (
                  <div>
                    <Label>From Your Diet</Label>
                    <div className="mt-2 grid gap-2">
                      {dietMealSuggestions.slice(0, 6).map((s: any) => (
                        <button
                          key={s.name}
                          onClick={() => selectSuggestion(s)}
                          className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-left text-sm hover:bg-muted"
                        >
                          <span className="min-w-0 truncate">{s.name}</span>
                          <span className="ml-3 shrink-0 text-xs text-muted-foreground">{Math.round(s.calories)} kcal</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Food Name</Label>
                    <Input value={form.foodName} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, foodName: e.target.value })} className="mt-1" />
                  </div>
                  <div>
                    <Label>Meal Type</Label>
                    <Select value={form.mealType} onValueChange={(v: string) => setForm({ ...form, mealType: v })}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="breakfast">Breakfast</SelectItem>
                        <SelectItem value="lunch">Lunch</SelectItem>
                        <SelectItem value="dinner">Dinner</SelectItem>
                        <SelectItem value="snack">Snack</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label>Serving Size</Label>
                  <Input value={form.servingSize} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, servingSize: e.target.value })} placeholder="e.g., 1 cup, 100g" className="mt-1" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Calories</Label><Input type="number" value={form.calories} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, calories: e.target.value })} className="mt-1" /></div>
                  <div><Label>Protein (g)</Label><Input type="number" value={form.protein} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, protein: e.target.value })} className="mt-1" /></div>
                  <div><Label>Carbs (g)</Label><Input type="number" value={form.carbs} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, carbs: e.target.value })} className="mt-1" /></div>
                  <div><Label>Fat (g)</Label><Input type="number" value={form.fat} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, fat: e.target.value })} className="mt-1" /></div>
                  <div><Label>Fiber (g)</Label><Input type="number" value={form.fiber} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, fiber: e.target.value })} className="mt-1" /></div>
                </div>
                <Button onClick={handleSaveFood} className="w-full">{editingFoodId ? "Update Food" : "Add Food"}</Button>
              </div>
            </DialogContent>
          </Dialog>
          </div>
        </div>
      </FadeIn>

      <Tabs defaultValue="tracker" className="space-y-4">
        <TabsList>
          <TabsTrigger value="tracker">Tracker</TabsTrigger>
          <TabsTrigger value="diet">Diet</TabsTrigger>
        </TabsList>

        <TabsContent value="tracker" className="space-y-6">
      <FadeIn delay={0.1}>
        <div className="grid grid-cols-1 gap-3 min-[390px]:grid-cols-2 lg:grid-cols-6 lg:gap-4">
          {[
            { label: "Calories", value: Math.round(totals.calories), target: targetCal, unit: "kcal", icon: Flame, color: "text-orange-500", bg: "bg-orange-500/10" },
            { label: "Protein", value: Math.round(totals.protein), target: targetProtein, unit: "g", icon: Target, color: "text-blue-500", bg: "bg-blue-500/10" },
            { label: "Carbs", value: Math.round(totals.carbs), target: targetCarbs, unit: "g", icon: Zap, color: "text-green-500", bg: "bg-green-500/10" },
            { label: "Fat", value: Math.round(totals.fat), target: targetFat, unit: "g", icon: Apple, color: "text-purple-500", bg: "bg-purple-500/10" },
            { label: "Fiber", value: Math.round(totals.fiber), target: targetFiber, unit: "g", icon: Wheat, color: "text-amber-500", bg: "bg-amber-500/10" },
            { label: "Water", value: Math.round(waterTotal), target: targetWater, unit: "ml", icon: Droplets, color: "text-cyan-500", bg: "bg-cyan-500/10" },
          ].map((m: any) => {
            const pct = m?.target > 0 ? Math.min(100, Math.round((m?.value / m?.target) * 100)) : 0;
            return (
              <Card key={m?.label}>
                <CardContent className="space-y-2 p-3 sm:p-4">
                  <div className="flex items-center gap-2">
                    <div className={`w-8 h-8 shrink-0 rounded-md ${m?.bg} flex items-center justify-center`}>
                      <m.icon className={`w-4 h-4 ${m?.color}`} />
                    </div>
                    <span className="min-w-0 truncate text-sm font-medium">{m?.label}</span>
                  </div>
                  <Progress value={pct} className="h-2" />
                  <p className="break-words text-sm font-mono">
                    <span className="font-bold">{m?.value}</span> / {m?.target} {m?.unit}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </FadeIn>

      <FadeIn delay={0.15}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Droplets className="w-5 h-5 text-cyan-500" />
              Water Tracker
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
              <div>
                <Label>Amount (ml)</Label>
                <Input type="number" value={waterAmount} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setWaterAmount(e.target.value)} className="mt-1" />
              </div>
              <Button onClick={() => handleAddWater()}>
                <Plus className="w-4 h-4 mr-2" />Log Water
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {[250, 500, 750, 1000].map((amount) => (
                <Button key={amount} type="button" variant="outline" size="sm" onClick={() => handleAddWater(amount)}>
                  +{amount} ml
                </Button>
              ))}
            </div>
            {(waterLogs ?? []).length > 0 && (
              <div className="space-y-2">
                {(waterLogs ?? []).map((log: any) => (
                  <div key={log?.id} className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2 text-sm">
                    <span>{Math.round(log?.amountMl ?? 0)} ml</span>
                    <button onClick={() => handleDeleteWater(log?.id)} className="text-destructive">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </FadeIn>

      {/* Food Logs */}
      <FadeIn delay={0.2}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Utensils className="w-5 h-5 text-primary" />
              Today&apos;s Food Log
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(foodLogs ?? [])?.length === 0 ? (
              <div className="text-center py-12">
                <Utensils className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-muted-foreground">No meals logged today. Start tracking!</p>
              </div>
            ) : (
              <div className="space-y-2">
                {["breakfast", "lunch", "dinner", "snack"].map((mealType: string) => {
                  const meals = (foodLogs ?? []).filter((l: any) => l?.mealType === mealType);
                  if ((meals?.length ?? 0) === 0) return null;
                  return (
                    <div key={mealType} className="mb-4">
                      <h4 className="text-sm font-medium capitalize mb-2 flex items-center gap-2">
                        <Badge variant="outline">{mealType}</Badge>
                        <span className="text-muted-foreground font-mono text-xs">
                          {Math.round(meals.reduce((s: number, m: any) => s + (m?.calories ?? 0), 0))} kcal
                        </span>
                      </h4>
                      {meals.map((log: any) => (
                        <div key={log?.id} className="group rounded-lg bg-muted/30 p-3 hover:bg-muted/50">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="break-words text-sm font-medium">{log?.foodName}</p>
                              {log?.servingSize && <p className="mt-1 break-words text-xs text-muted-foreground">{log.servingSize}</p>}
                            </div>
                            <div className="flex shrink-0 gap-1">
                              <button onClick={() => openEditDialog(log)} className="rounded-md p-1 text-primary hover:bg-background" aria-label="Edit food">
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button onClick={() => handleDelete(log?.id)} className="rounded-md p-1 text-destructive hover:bg-background" aria-label="Delete food">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                          <div className="mt-3 grid grid-cols-2 gap-2 text-xs font-mono text-muted-foreground min-[390px]:grid-cols-5">
                            <span className="rounded-md bg-background/70 px-2 py-1">{Math.round(log?.calories ?? 0)} kcal</span>
                            <span className="rounded-md bg-background/70 px-2 py-1">P {Math.round(log?.protein ?? 0)}g</span>
                            <span className="rounded-md bg-background/70 px-2 py-1">C {Math.round(log?.carbs ?? 0)}g</span>
                            <span className="rounded-md bg-background/70 px-2 py-1">F {Math.round(log?.fat ?? 0)}g</span>
                            <span className="rounded-md bg-background/70 px-2 py-1">Fi {Math.round(log?.fiber ?? 0)}g</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </FadeIn>

      {/* Muscle Building Meal Ideas */}
      <FadeIn delay={0.3}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Apple className="w-5 h-5 text-primary" />
              Muscle-Building Food Ideas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {mealSuggestions.map((s: any) => (
                <button
                  key={s?.name}
                  onClick={() => {
                    selectSuggestion(s);
                    setDialogOpen(true);
                  }}
                  className="p-3 rounded-lg border border-border hover:border-primary/50 hover:bg-primary/5 transition-all text-left"
                >
                  <p className="font-medium text-sm">{s?.name}</p>
                  <p className="text-xs text-muted-foreground mt-1">{s?.serving}</p>
                  <div className="flex gap-3 mt-2 text-xs font-mono">
                    <span className="text-orange-500">{s?.calories} kcal</span>
                    <span className="text-blue-500">P: {s?.protein}g</span>
                    <span className="text-green-500">C: {s?.carbs}g</span>
                  </div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      </FadeIn>
        </TabsContent>

        <TabsContent value="diet" className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold">Diet Plans</h3>
              <p className="text-sm text-muted-foreground">Create meal plans for breakfast, snacks, lunch, and dinner.</p>
            </div>
            <Button onClick={() => openDietDialog()}>
              <Plus className="w-4 h-4 mr-2" />Add Diet
            </Button>
          </div>
          {(dietPlans ?? []).length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Apple className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-muted-foreground">No diet plans yet. Ask AI Coach to create one or add it manually.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {dietPlans.map((plan) => {
                const meals = parseDietMeals(plan);
                return (
                  <Card key={plan.id}>
                    <CardHeader>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <CardTitle className="text-lg">{plan.name}</CardTitle>
                          {plan.goal && <p className="text-sm text-muted-foreground capitalize">{plan.goal.replace(/_/g, " ")}</p>}
                        </div>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openDietDialog(plan)} title="Edit diet">
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDeleteDiet(plan)} title="Delete diet" className="hover:text-destructive">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                      {plan.notes && <p className="text-sm text-muted-foreground">{plan.notes}</p>}
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {meals.map((meal: any, index: number) => (
                        <div key={`${meal.mealType}-${index}`} className="rounded-lg bg-muted/40 p-3">
                          <div className="flex items-center justify-between gap-2">
                            <p className="font-medium">{meal.mealType}</p>
                            <Badge variant="outline">{Math.round(meal.calories ?? 0)} kcal</Badge>
                          </div>
                          {meal.title && <p className="mt-1 text-sm">{meal.title}</p>}
                          {(meal.foods ?? []).length > 0 && <p className="mt-1 text-xs text-muted-foreground">{meal.foods.join(", ")}</p>}
                          <p className="mt-2 text-xs font-mono text-muted-foreground">P {Math.round(meal.protein ?? 0)}g | C {Math.round(meal.carbs ?? 0)}g | F {Math.round(meal.fat ?? 0)}g</p>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={dietDialogOpen} onOpenChange={(open) => { setDietDialogOpen(open); if (!open) resetDietForm(); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingDietId ? "Edit Diet" : "Add Diet"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div><Label>Name</Label><Input value={dietForm.name} onChange={(e) => setDietForm({ ...dietForm, name: e.target.value })} className="mt-1" placeholder="Muscle Gain Diet" /></div>
              <div><Label>Goal</Label><Input value={dietForm.goal} onChange={(e) => setDietForm({ ...dietForm, goal: e.target.value })} className="mt-1" placeholder="muscle_gain" /></div>
            </div>
            <div><Label>Notes</Label><Textarea value={dietForm.notes} onChange={(e) => setDietForm({ ...dietForm, notes: e.target.value })} className="mt-1" placeholder="Allergy notes, timing, prep notes..." /></div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Meals</Label>
                <Button type="button" size="sm" variant="outline" onClick={addDietMeal}><Plus className="w-4 h-4 mr-2" />Add Meal</Button>
              </div>
              {dietForm.meals.map((meal, index) => (
                <div key={index} className="grid gap-2 rounded-lg bg-muted/40 p-3 md:grid-cols-[130px_1fr_1fr_80px_80px_80px_80px_36px] md:items-end">
                  <div><Label className="text-xs">Meal</Label><Input value={meal.mealType} onChange={(e) => updateDietMeal(index, "mealType", e.target.value)} className="mt-1" /></div>
                  <div><Label className="text-xs">Title</Label><Input value={meal.title} onChange={(e) => updateDietMeal(index, "title", e.target.value)} className="mt-1" /></div>
                  <div><Label className="text-xs">Foods</Label><Input value={meal.foods} onChange={(e) => updateDietMeal(index, "foods", e.target.value)} className="mt-1" placeholder="comma separated" /></div>
                  <div><Label className="text-xs">Kcal</Label><Input type="number" value={meal.calories} onChange={(e) => updateDietMeal(index, "calories", e.target.value)} className="mt-1" /></div>
                  <div><Label className="text-xs">Protein</Label><Input type="number" value={meal.protein} onChange={(e) => updateDietMeal(index, "protein", e.target.value)} className="mt-1" /></div>
                  <div><Label className="text-xs">Carbs</Label><Input type="number" value={meal.carbs} onChange={(e) => updateDietMeal(index, "carbs", e.target.value)} className="mt-1" /></div>
                  <div><Label className="text-xs">Fat</Label><Input type="number" value={meal.fat} onChange={(e) => updateDietMeal(index, "fat", e.target.value)} className="mt-1" /></div>
                  <Button type="button" variant="ghost" size="icon" onClick={() => removeDietMeal(index)} title="Remove meal">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
            <Button onClick={handleSaveDiet} className="w-full">{editingDietId ? "Update Diet" : "Create Diet"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
