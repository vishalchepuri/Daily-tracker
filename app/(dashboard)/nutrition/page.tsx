"use client";
import { useEffect, useMemo, useState, useCallback } from "react";
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
import { Plus, Trash2, Utensils, Flame, Target, Zap, Apple, Pencil, Droplets, Wheat, TrendingUp, CalendarCheck, Sparkles, Filter, Leaf } from "lucide-react";
import { FadeIn } from "@/components/ui/animate";
import { toast } from "sonner";
import { MICRONUTRIENTS, mergeWithDefaultMicronutrientTargets, parseMicronutrientMap, sumMicronutrients } from "@/lib/micronutrients";
import { dateTimeInputToIso, formatAppDate, formatLocalDateInput } from "@/lib/local-dates";

const mealSuggestions = [
  { name: "Chicken Breast", category: "protein", calories: 165, protein: 31, carbs: 0, fat: 3.6, fiber: 0, serving: "100 g", micronutrients: { vitaminB12: 0.3, potassium: 256, magnesium: 29, zinc: 1 } },
  { name: "Paneer", category: "protein", calories: 265, protein: 18, carbs: 3, fat: 20, fiber: 0, serving: "100 g", micronutrients: { calcium: 480, vitaminB12: 0.8, magnesium: 20, zinc: 2.6 } },
  { name: "Greek Yogurt", category: "protein", calories: 100, protein: 17, carbs: 6, fat: 0.7, fiber: 0, serving: "170 g", micronutrients: { calcium: 180, vitaminB12: 0.9, potassium: 240 } },
  { name: "Eggs", category: "protein", calories: 143, protein: 13, carbs: 1, fat: 10, fiber: 0, serving: "100 g", micronutrients: { vitaminD: 2, vitaminB12: 1.1, vitaminA: 160, iron: 1.8, zinc: 1.3 } },
  { name: "Fish", category: "protein", calories: 208, protein: 22, carbs: 0, fat: 13, fiber: 0, serving: "100 g", micronutrients: { vitaminD: 10, vitaminB12: 3, potassium: 360, magnesium: 30 } },
  { name: "Moong Dal", category: "protein", calories: 105, protein: 7, carbs: 19, fat: 0.4, fiber: 7, serving: "100 g cooked", micronutrients: { folate: 90, iron: 1.4, magnesium: 36, potassium: 266 } },
  { name: "Chana / Chickpeas", category: "protein", calories: 164, protein: 9, carbs: 27, fat: 2.6, fiber: 7.6, serving: "100 g cooked", micronutrients: { folate: 170, iron: 2.9, magnesium: 48, zinc: 1.5 } },
  { name: "Oats", category: "carbs", calories: 228, protein: 8, carbs: 39, fat: 4, fiber: 6, serving: "60 g dry", micronutrients: { magnesium: 106, iron: 2.8, zinc: 2.4, folate: 34 } },
  { name: "Cooked Rice", category: "carbs", calories: 234, protein: 4.8, carbs: 51, fat: 0.5, fiber: 0.7, serving: "180 g cooked", micronutrients: { magnesium: 18, potassium: 46, iron: 0.4 } },
  { name: "Chapati / Roti", category: "carbs", calories: 180, protein: 6, carbs: 32, fat: 3, fiber: 5, serving: "80 g", micronutrients: { magnesium: 66, iron: 2.9, zinc: 2.1, folate: 35 } },
  { name: "Sweet Potato", category: "carbs", calories: 155, protein: 3, carbs: 36, fat: 0.2, fiber: 4.5, serving: "150 g", micronutrients: { vitaminA: 1064, vitaminC: 3.6, potassium: 506, magnesium: 38 } },
  { name: "Banana", category: "fruit", calories: 89, protein: 1.1, carbs: 23, fat: 0.3, fiber: 2.6, serving: "100 g", micronutrients: { vitaminC: 9, potassium: 358, magnesium: 27 } },
  { name: "Orange", category: "fruit", calories: 62, protein: 1.2, carbs: 15, fat: 0.2, fiber: 3.1, serving: "130 g", micronutrients: { vitaminC: 70, potassium: 237, folate: 40, calcium: 52 } },
  { name: "Mango", category: "fruit", calories: 90, protein: 1.2, carbs: 23, fat: 0.6, fiber: 2.4, serving: "150 g", micronutrients: { vitaminC: 54, vitaminA: 81, folate: 65, potassium: 252 } },
  { name: "Palak / Spinach", category: "micros", calories: 23, protein: 2.9, carbs: 3.6, fat: 0.4, fiber: 2.2, serving: "100 g", micronutrients: { vitaminK: 483, vitaminA: 469, folate: 194, iron: 2.7, magnesium: 79, vitaminC: 28 } },
  { name: "Carrot", category: "micros", calories: 41, protein: 0.9, carbs: 10, fat: 0.2, fiber: 2.8, serving: "100 g", micronutrients: { vitaminA: 835, vitaminK: 13, potassium: 320, vitaminC: 6 } },
  { name: "Almonds", category: "healthy_fats", calories: 174, protein: 6.4, carbs: 6.5, fat: 15, fiber: 3.8, serving: "30 g", micronutrients: { vitaminE: 7.7, magnesium: 80, calcium: 81, zinc: 0.9, iron: 1.1 } },
  { name: "Peanuts", category: "healthy_fats", calories: 170, protein: 7.7, carbs: 4.8, fat: 14, fiber: 2.6, serving: "30 g", micronutrients: { vitaminE: 2.5, magnesium: 50, zinc: 1, folate: 72 } },
];

const foodIdeaCategories = [
  { value: "all", label: "All ideas" },
  { value: "protein", label: "Protein" },
  { value: "carbs", label: "Carbs" },
  { value: "fruit", label: "Fruit" },
  { value: "micros", label: "Vitamins" },
  { value: "healthy_fats", label: "Healthy fats" },
];

function numericMicronutrientPayload(values: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(values)
      .map(([key, value]) => [key, parseFloat(value) || 0] as const)
      .filter((entry) => entry[1] > 0)
  );
}

export default function NutritionPage() {
  const [foodLogs, setFoodLogs] = useState<any[]>([]);
  const [weeklyFoodLogs, setWeeklyFoodLogs] = useState<any[]>([]);
  const [dietPlans, setDietPlans] = useState<any[]>([]);
  const [dietNextOffset, setDietNextOffset] = useState(0);
  const [dietHasMore, setDietHasMore] = useState(false);
  const [loadingMoreDietPlans, setLoadingMoreDietPlans] = useState(false);
  const [waterLogs, setWaterLogs] = useState<any[]>([]);
  const [profile, setProfile] = useState<any>(null);
  const [savingFood, setSavingFood] = useState(false);
  const [savingDiet, setSavingDiet] = useState(false);
  const [savingWater, setSavingWater] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [targetsDialogOpen, setTargetsDialogOpen] = useState(false);
  const [dietDialogOpen, setDietDialogOpen] = useState(false);
  const [editingFoodId, setEditingFoodId] = useState<string | null>(null);
  const [editingDietId, setEditingDietId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(() => formatLocalDateInput(new Date()));
  const [waterAmount, setWaterAmount] = useState("250");
  const [form, setForm] = useState({
    foodName: "", mealType: "breakfast", calories: "", protein: "", carbs: "", fat: "", fiber: "", servingSize: "",
    micronutrients: {} as Record<string, string>,
  });
  const [targetForm, setTargetForm] = useState({
    targetCalories: "",
    targetProtein: "",
    targetCarbs: "",
    targetFat: "",
    targetFiber: "",
    targetWaterMl: "",
    micronutrients: {} as Record<string, string>,
  });
  const [searchTerm, setSearchTerm] = useState("");
  const [foodIdeaFilter, setFoodIdeaFilter] = useState("all");
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
    fetch(`/api/food-logs?date=${encodeURIComponent(selectedDate)}`)
      .then((res) => res.ok ? res.json() : { logs: [] })
      .then((data) => setFoodLogs(data?.logs ?? []))
      .catch(console.error);

    fetch(`/api/food-logs?date=${encodeURIComponent(selectedDate)}&rangeDays=7`)
      .then((res) => res.ok ? res.json() : { logs: [] })
      .then((data) => setWeeklyFoodLogs(data?.logs ?? []))
      .catch(console.error);

    fetch("/api/profile")
      .then((res) => res.ok ? res.json() : { profile: null })
      .then((profileData: any) => {
        setProfile(profileData?.profile);
        setTargetForm({
          targetCalories: String(profileData?.profile?.targetCalories ?? 2500),
          targetProtein: String(profileData?.profile?.targetProtein ?? 150),
          targetCarbs: String(profileData?.profile?.targetCarbs ?? 300),
          targetFat: String(profileData?.profile?.targetFat ?? 70),
          targetFiber: String(profileData?.profile?.targetFiber ?? 30),
          targetWaterMl: String(profileData?.profile?.targetWaterMl ?? 3000),
          micronutrients: Object.fromEntries(
            Object.entries(mergeWithDefaultMicronutrientTargets(profileData?.profile?.micronutrientTargetsJson)).map(([key, value]) => [key, String(value ?? "")])
          ),
        });
      })
      .catch(console.error);

    fetch("/api/water-logs")
      .then((res) => res.ok ? res.json() : { logs: [] })
      .then((data) => setWaterLogs(data?.logs ?? []))
      .catch(console.error);

    fetch("/api/diet-plans?offset=0&limit=10")
      .then((res) => res.ok ? res.json() : { plans: [] })
      .then((data) => {
        setDietPlans(data?.plans ?? []);
        setDietNextOffset(data?.nextOffset ?? (data?.plans ?? []).length);
        setDietHasMore(Boolean(data?.hasMore));
      })
      .catch(console.error);
  }, [selectedDate]);

  useEffect(() => { loadData(); }, [loadData]);

  const resetFoodForm = () => {
    setForm({ foodName: "", mealType: "breakfast", calories: "", protein: "", carbs: "", fat: "", fiber: "", servingSize: "", micronutrients: {} });
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

  const loadMoreDietPlans = async () => {
    if (loadingMoreDietPlans || !dietHasMore) return;
    setLoadingMoreDietPlans(true);
    try {
      const res = await fetch(`/api/diet-plans?offset=${dietNextOffset}&limit=10`);
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? "Failed to load more diet plans");
        return;
      }
      setDietPlans((prev) => [...prev, ...(data?.plans ?? [])]);
      setDietNextOffset(data?.nextOffset ?? dietNextOffset + (data?.plans ?? []).length);
      setDietHasMore(Boolean(data?.hasMore));
    } catch {
      toast.error("Failed to load more diet plans");
    } finally {
      setLoadingMoreDietPlans(false);
    }
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
      micronutrients: Object.fromEntries(Object.entries(parseMicronutrientMap(log?.micronutrients)).map(([key, value]) => [key, String(value ?? "")])),
    });
    setSearchTerm("");
    setDialogOpen(true);
  };

  const handleSaveFood = async () => {
    if (!form.foodName) { toast.error("Enter a food name"); return; }
    if (savingFood) return;
    setSavingFood(true);
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
          micronutrients: numericMicronutrientPayload(form.micronutrients),
          date: selectedDate,
        }),
      });
      if (res.ok) {
        toast.success(editingFoodId ? "Food updated!" : "Food logged!");
        resetFoodForm();
        setDialogOpen(false);
        loadData();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data?.error ?? "Failed to log food");
      }
    } catch { toast.error("Failed to log food"); }
    finally { setSavingFood(false); }
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
    if (savingDiet) return;
    setSavingDiet(true);
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
    } finally {
      setSavingDiet(false);
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

  const handleApplyDiet = async (plan: any) => {
    try {
      const res = await fetch("/api/diet-plans/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: plan.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? "Failed to apply diet");
        return;
      }
      toast.success(`Applied ${data.count} food entries for today!`);
      loadData();
    } catch {
      toast.error("Failed to apply diet");
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
          micronutrientTargets: numericMicronutrientPayload(targetForm.micronutrients),
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

  const handleDelete = async (id: string, foodName?: string) => {
    if (!window.confirm(`Delete ${foodName ? `"${foodName}"` : "this food log"}? This cannot be undone.`)) return;
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
    if (savingWater) return;
    setSavingWater(true);
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
    } finally {
      setSavingWater(false);
    }
  };

  const handleDeleteWater = async (id: string) => {
    if (!window.confirm("Delete this water log? This cannot be undone.")) return;
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
      micronutrients: Object.fromEntries(Object.entries(parseMicronutrientMap(s?.micronutrients)).map(([key, value]) => [key, String(value ?? "")])),
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
  const micronutrientTrackingEnabled = Boolean(profile?.micronutrientTrackingEnabled);
  const micronutrientTargets = mergeWithDefaultMicronutrientTargets(profile?.micronutrientTargetsJson);
  const micronutrientTotals = sumMicronutrients((foodLogs ?? []).map((log: any) => log?.micronutrients));
  const weeklyMicronutrientTotals = sumMicronutrients((weeklyFoodLogs ?? []).map((log: any) => log?.micronutrients));
  const weeklyMicronutrientTargets = Object.fromEntries(
    Object.entries(micronutrientTargets).map(([key, value]) => [key, Number(value ?? 0) * 7])
  );
  const micronutrientProgress = MICRONUTRIENTS
    .map((item) => {
      const target = micronutrientTargets[item.key] ?? item.target;
      const value = micronutrientTotals[item.key] ?? 0;
      const weeklyValue = weeklyMicronutrientTotals[item.key] ?? 0;
      const weeklyTarget = Number(weeklyMicronutrientTargets[item.key] ?? target * 7);
      return {
        ...item,
        value,
        target,
        weeklyValue,
        weeklyTarget,
        left: Math.max(0, target - value),
        pct: target > 0 ? Math.min(100, Math.round((value / target) * 100)) : 0,
        weeklyPct: weeklyTarget > 0 ? Math.min(100, Math.round((weeklyValue / weeklyTarget) * 100)) : 0,
      };
    })
    .sort((a, b) => b.left / Math.max(1, b.target) - a.left / Math.max(1, a.target));
  const remaining = {
    calories: Math.max(0, targetCal - totals.calories),
    protein: Math.max(0, targetProtein - totals.protein),
    carbs: Math.max(0, targetCarbs - totals.carbs),
    fat: Math.max(0, targetFat - totals.fat),
    fiber: Math.max(0, targetFiber - totals.fiber),
    water: Math.max(0, targetWater - waterTotal),
  };
  const mealBreakdown = ["breakfast", "lunch", "dinner", "snack"].map((mealType) => {
    const meals = (foodLogs ?? []).filter((log: any) => log?.mealType === mealType);
    const calories = meals.reduce((sum: number, meal: any) => sum + (meal?.calories ?? 0), 0);
    const protein = meals.reduce((sum: number, meal: any) => sum + (meal?.protein ?? 0), 0);
    return { mealType, count: meals.length, calories, protein };
  });
  const targetDateLabel = selectedDate === formatLocalDateInput(new Date())
    ? "Today"
    : formatAppDate(new Date(dateTimeInputToIso(selectedDate, "00:00")), { month: "short", day: "numeric", year: "numeric" });

  const filteredSuggestions = (allMealSuggestions ?? []).filter((s: any) =>
    s?.name?.toLowerCase?.()?.includes?.(searchTerm?.toLowerCase?.() ?? "") ?? false
  );
  const filteredFoodIdeas = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return mealSuggestions.filter((item) => {
      const matchesCategory = foodIdeaFilter === "all" || item.category === foodIdeaFilter;
      const matchesSearch = !query || item.name.toLowerCase().includes(query);
      return matchesCategory && matchesSearch;
    });
  }, [foodIdeaFilter, searchTerm]);

  const parseDietMeals = (plan: any) => {
    try {
      return JSON.parse(plan?.mealsJson ?? "[]");
    } catch {
      return [];
    }
  };

  return (
    <div className="w-full max-w-full space-y-5 overflow-x-hidden sm:space-y-6">
      <FadeIn>
        <div className="grid gap-2 sm:flex sm:items-center sm:justify-between sm:gap-3">
          <div className="hidden min-w-0 sm:block">
            <h2 className="font-display text-2xl font-bold leading-tight tracking-tight">Nutrition Tracker</h2>
            <p className="mt-1 max-w-[18rem] text-sm text-muted-foreground sm:max-w-none">Log meals and track daily macros for muscle gain</p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center sm:justify-end">
          <div className="col-span-2 sm:col-span-1">
            <Input
              type="date"
              aria-label="Nutrition date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="h-10 min-w-0 sm:w-44"
            />
          </div>
          <Dialog open={targetsDialogOpen} onOpenChange={setTargetsDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="h-11 w-full rounded-2xl px-3 sm:w-auto sm:px-4"><Pencil className="w-4 h-4 sm:mr-2" /><span className="hidden sm:inline">Edit </span>Targets</Button>
            </DialogTrigger>
            <DialogContent className="max-w-md rounded-t-[28px] sm:rounded-2xl">
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
              {micronutrientTrackingEnabled && (
                <div className="mt-4 space-y-3">
                  <div>
                    <p className="text-sm font-medium">Vitamin & mineral targets</p>
                    <p className="text-xs text-muted-foreground">These detailed targets are used for daily remaining amounts and agent food-photo estimates.</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {MICRONUTRIENTS.map((item) => (
                      <div key={item.key}>
                        <Label>{item.label} ({item.unit})</Label>
                        <Input
                          type="number"
                          value={targetForm.micronutrients[item.key] ?? ""}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTargetForm({
                            ...targetForm,
                            micronutrients: { ...targetForm.micronutrients, [item.key]: e.target.value },
                          })}
                          className="mt-1"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <Button onClick={handleSaveTargets} className="mt-4 h-12 w-full rounded-2xl">Save Targets</Button>
            </DialogContent>
          </Dialog>
          <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetFoodForm(); }}>
            <DialogTrigger asChild>
              <Button onClick={openAddDialog} className="h-11 w-full rounded-2xl px-3 sm:w-auto sm:px-4"><Plus className="w-4 h-4 sm:mr-2" />Log Meal</Button>
            </DialogTrigger>
            <DialogContent className="max-h-[92svh] max-w-md rounded-t-[28px] sm:rounded-2xl">
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
                  <Input value={form.servingSize} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, servingSize: e.target.value })} placeholder="e.g., 150 g cooked rice" className="mt-1" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Calories</Label><Input type="number" value={form.calories} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, calories: e.target.value })} className="mt-1" /></div>
                  <div><Label>Protein (g)</Label><Input type="number" value={form.protein} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, protein: e.target.value })} className="mt-1" /></div>
                  <div><Label>Carbs (g)</Label><Input type="number" value={form.carbs} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, carbs: e.target.value })} className="mt-1" /></div>
                  <div><Label>Fat (g)</Label><Input type="number" value={form.fat} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, fat: e.target.value })} className="mt-1" /></div>
                  <div><Label>Fiber (g)</Label><Input type="number" value={form.fiber} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, fiber: e.target.value })} className="mt-1" /></div>
                </div>
                {micronutrientTrackingEnabled && (
                  <div className="space-y-3 rounded-lg border border-orange-500/20 bg-orange-500/5 p-3">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-orange-400" />
                      <p className="text-sm font-medium">Vitamins & minerals</p>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      {MICRONUTRIENTS.slice(0, 8).map((item) => (
                        <div key={item.key}>
                          <Label>{item.label} ({item.unit})</Label>
                          <Input
                            type="number"
                            value={form.micronutrients[item.key] ?? ""}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({
                              ...form,
                              micronutrients: { ...form.micronutrients, [item.key]: e.target.value },
                            })}
                            className="mt-1"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <Button onClick={handleSaveFood} className="h-12 w-full rounded-2xl" loading={savingFood} disabled={savingFood}>{editingFoodId ? "Update Food" : "Add Food"}</Button>
              </div>
            </DialogContent>
          </Dialog>
          </div>
        </div>
      </FadeIn>

      <Tabs defaultValue="tracker" className="min-w-0 space-y-4 overflow-x-hidden">
        <TabsList className="grid h-auto w-full grid-cols-2 gap-2 rounded-2xl bg-muted/30 p-1 sm:inline-grid sm:w-auto">
          <TabsTrigger value="tracker" className="h-11 rounded-xl data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Tracker</TabsTrigger>
          <TabsTrigger value="diet" className="h-11 rounded-xl data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Diet</TabsTrigger>
        </TabsList>

        <TabsContent value="tracker" className="space-y-6">
      <FadeIn delay={0.05}>
        <div className="grid gap-3 lg:grid-cols-[1.1fr_0.9fr]">
          <Card className="rounded-[26px] border-primary/30 bg-primary/5">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">{targetDateLabel} Remaining</p>
                  <p className="mt-2 font-display text-3xl font-bold">{Math.round(remaining.calories)} kcal</p>
                  <p className="mt-1 text-sm text-muted-foreground">left from {Math.round(targetCal)} kcal target</p>
                </div>
                <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10">
                  <Target className="h-5 w-5 text-primary" />
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
                <MacroPill label="Protein" value={`${Math.round(remaining.protein)}g left`} />
                <MacroPill label="Carbs" value={`${Math.round(remaining.carbs)}g left`} />
                <MacroPill label="Fat" value={`${Math.round(remaining.fat)}g left`} />
                <MacroPill label="Fiber" value={`${Math.round(remaining.fiber)}g left`} />
                <MacroPill label="Water" value={`${Math.round(remaining.water)}ml left`} />
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-[26px]">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <TrendingUp className="h-5 w-5 text-primary" />
                Meal Split
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2">
              {mealBreakdown.map((meal) => {
                const pct = totals.calories > 0 ? Math.round((meal.calories / totals.calories) * 100) : 0;
                return (
                  <div key={meal.mealType} className="rounded-2xl bg-muted/35 p-3">
                    <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                      <span className="capitalize">{meal.mealType}</span>
                      <span className="font-mono text-xs text-muted-foreground">{Math.round(meal.calories)} kcal | P {Math.round(meal.protein)}g</span>
                    </div>
                    <Progress value={pct} className="h-1.5" />
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>
      </FadeIn>

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
              <Card key={m?.label} className="rounded-[22px]">
                <CardContent className="space-y-2 p-3 sm:p-4">
                  <div className="flex items-center gap-2">
                    <div className={`w-8 h-8 shrink-0 rounded-xl ${m?.bg} flex items-center justify-center`}>
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

      {micronutrientTrackingEnabled && (
        <FadeIn delay={0.12}>
          <Card className="max-w-full overflow-hidden rounded-[26px] border-orange-500/20 bg-orange-500/5">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Sparkles className="h-5 w-5 text-orange-400" />
                    Vitamins & Minerals
                  </CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">Daily gaps and weekly progress from logged foods.</p>
                </div>
                <Badge variant="secondary" className="shrink-0">7 days</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {micronutrientProgress.map((item) => {
                  return (
                    <div key={item.key} className="min-w-0 rounded-[20px] bg-background/70 p-3">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate text-sm font-medium">{item.label}</span>
                        <span className="shrink-0 font-mono text-xs text-muted-foreground">{Math.round(item.left * 10) / 10} {item.unit} left</span>
                      </div>
                      <Progress value={item.pct} className="h-2" />
                      <div className="mt-2 flex min-w-0 items-center justify-between gap-2 font-mono text-xs text-muted-foreground">
                        <span className="min-w-0 truncate">{Math.round(item.value * 10) / 10} / {item.target} {item.unit}</span>
                        <span className="shrink-0">Week {item.weeklyPct}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </FadeIn>
      )}

      <FadeIn delay={0.15}>
        <Card className="rounded-[26px]">
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
              <Button onClick={() => handleAddWater()} className="h-11 rounded-2xl" loading={savingWater} disabled={savingWater}>
                <Plus className="w-4 h-4 mr-2" />Log Water
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {[250, 500, 750, 1000].map((amount) => (
                <Button key={amount} type="button" variant="outline" size="sm" onClick={() => handleAddWater(amount)} disabled={savingWater} className="rounded-full">
                  +{amount} ml
                </Button>
              ))}
            </div>
            {(waterLogs ?? []).length > 0 && (
              <div className="space-y-2">
                {(waterLogs ?? []).map((log: any) => (
                  <div key={log?.id} className="flex items-center justify-between rounded-2xl bg-muted/40 px-3 py-2 text-sm">
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
        <Card className="rounded-[26px]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Utensils className="w-5 h-5 text-primary" />
              {targetDateLabel}&apos;s Food Log
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
                        <div key={log?.id} className="group rounded-[22px] bg-muted/30 p-3 transition active:scale-[0.995] hover:bg-muted/50">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="break-words text-sm font-medium">{log?.foodName}</p>
                              {log?.servingSize && <p className="mt-1 break-words text-xs text-muted-foreground">{log.servingSize}</p>}
                            </div>
                            <div className="flex shrink-0 gap-1">
                              <button onClick={() => openEditDialog(log)} className="rounded-md p-1 text-primary hover:bg-background" aria-label="Edit food">
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button onClick={() => handleDelete(log?.id, log?.foodName)} className="rounded-md p-1 text-destructive hover:bg-background" aria-label="Delete food">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                          <div className="mt-3 grid grid-cols-2 gap-2 text-xs font-mono text-muted-foreground min-[390px]:grid-cols-5">
                            <span className="rounded-xl bg-background/70 px-2 py-1">{Math.round(log?.calories ?? 0)} kcal</span>
                            <span className="rounded-xl bg-background/70 px-2 py-1">P {Math.round(log?.protein ?? 0)}g</span>
                            <span className="rounded-xl bg-background/70 px-2 py-1">C {Math.round(log?.carbs ?? 0)}g</span>
                            <span className="rounded-xl bg-background/70 px-2 py-1">F {Math.round(log?.fat ?? 0)}g</span>
                            <span className="rounded-xl bg-background/70 px-2 py-1">Fi {Math.round(log?.fiber ?? 0)}g</span>
                          </div>
                          {micronutrientTrackingEnabled && Object.keys(parseMicronutrientMap(log?.micronutrients)).length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {MICRONUTRIENTS.filter((item) => (parseMicronutrientMap(log?.micronutrients)[item.key] ?? 0) > 0).slice(0, 6).map((item) => (
                                <span key={item.key} className="rounded-md bg-orange-500/10 px-2 py-1 text-xs text-orange-200">
                                  {item.label} {Math.round((parseMicronutrientMap(log?.micronutrients)[item.key] ?? 0) * 10) / 10}{item.unit}
                                </span>
                              ))}
                            </div>
                          )}
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
        <Card className="rounded-[26px]">
          <CardHeader>
            <div className="grid gap-3 sm:flex sm:items-center sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Apple className="w-5 h-5 text-primary" />
                  Muscle-Building Food Ideas
                </CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">All portions are grams-based so your logs stay consistent.</p>
              </div>
              <Select value={foodIdeaFilter} onValueChange={setFoodIdeaFilter}>
                <SelectTrigger className="h-11 rounded-2xl sm:w-44">
                  <Filter className="mr-2 h-4 w-4" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {foodIdeaCategories.map((item) => (
                    <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filteredFoodIdeas.map((s: any) => (
                <button
                  key={s?.name}
                  onClick={() => {
                    selectSuggestion(s);
                    setDialogOpen(true);
                  }}
                  className="rounded-[22px] border border-border bg-background/45 p-4 text-left transition active:scale-[0.99] hover:border-primary/50 hover:bg-primary/5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{s?.name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{s?.serving}</p>
                    </div>
                    <Badge variant="secondary" className="capitalize">{String(s?.category ?? "").replace(/_/g, " ")}</Badge>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs font-mono">
                    <span className="text-orange-500">{s?.calories} kcal</span>
                    <span className="text-blue-500">P: {s?.protein}g</span>
                    <span className="text-green-500">C: {s?.carbs}g</span>
                    <span className="text-purple-500">F: {s?.fat}g</span>
                  </div>
                  {micronutrientTrackingEnabled && (
                    <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                      <Leaf className="h-3.5 w-3.5 text-orange-400" />
                      <span className="truncate">
                        {Object.keys(parseMicronutrientMap(s?.micronutrients)).slice(0, 3).map((key) => MICRONUTRIENTS.find((item) => item.key === key)?.label ?? key).join(", ")}
                      </span>
                    </div>
                  )}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      </FadeIn>
        </TabsContent>

        <TabsContent value="diet" className="space-y-4">
          <div className="grid min-w-0 gap-3 sm:flex sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h3 className="text-lg font-semibold">Diet Plans</h3>
              <p className="text-sm text-muted-foreground">Create meal plans for breakfast, snacks, lunch, and dinner.</p>
            </div>
            <Button onClick={() => openDietDialog()} className="h-11 w-full rounded-2xl sm:w-auto">
              <Plus className="w-4 h-4 mr-2" />Add Diet
            </Button>
          </div>
          {(dietPlans ?? []).length === 0 ? (
            <Card className="rounded-[26px]">
              <CardContent className="py-12 text-center">
                <Apple className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-muted-foreground">No diet plans yet. Ask Dayza Agent to create one or add it manually.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-4 lg:grid-cols-2">
                {dietPlans.map((plan) => {
                  const meals = parseDietMeals(plan);
                  return (
                    <Card key={plan.id} className="max-w-full overflow-hidden rounded-[26px]">
                    <CardHeader>
                      <div className="grid min-w-0 gap-3 sm:flex sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <CardTitle className="text-lg">{plan.name}</CardTitle>
                          {plan.goal && <p className="text-sm text-muted-foreground capitalize">{plan.goal.replace(/_/g, " ")}</p>}
                        </div>
                        <div className="flex flex-wrap gap-1">
                          <Button variant="outline" size="sm" onClick={() => handleApplyDiet(plan)} className="gap-1 rounded-full text-xs">
                            <CalendarCheck className="w-3.5 h-3.5" />
                            Apply Today
                          </Button>
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
                        <div key={`${meal.mealType}-${index}`} className="rounded-[20px] bg-muted/40 p-3">
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
              {dietHasMore && (
                <Button type="button" variant="outline" className="w-full" onClick={loadMoreDietPlans} loading={loadingMoreDietPlans} disabled={loadingMoreDietPlans}>
                  Load more diet plans
                </Button>
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={dietDialogOpen} onOpenChange={(open) => { setDietDialogOpen(open); if (!open) resetDietForm(); }}>
        <DialogContent className="max-h-[92svh] max-w-3xl rounded-t-[28px] sm:rounded-2xl">
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
                <Button type="button" size="sm" variant="outline" onClick={addDietMeal} className="rounded-full"><Plus className="w-4 h-4 mr-2" />Add Meal</Button>
              </div>
              {dietForm.meals.map((meal, index) => (
                <div key={index} className="grid gap-2 rounded-[22px] bg-muted/40 p-3 md:grid-cols-[130px_1fr_1fr_80px_80px_80px_80px_36px] md:items-end">
                  <div><Label className="text-xs">Meal</Label><Input value={meal.mealType} onChange={(e) => updateDietMeal(index, "mealType", e.target.value)} className="mt-1" /></div>
                  <div><Label className="text-xs">Title</Label><Input value={meal.title} onChange={(e) => updateDietMeal(index, "title", e.target.value)} className="mt-1" /></div>
                  <div><Label className="text-xs">Foods</Label><Input value={meal.foods} onChange={(e) => updateDietMeal(index, "foods", e.target.value)} className="mt-1" placeholder="Oats 60 g, eggs 100 g" /></div>
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
            <Button onClick={handleSaveDiet} className="h-12 w-full rounded-2xl" loading={savingDiet} disabled={savingDiet}>{editingDietId ? "Update Diet" : "Create Diet"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MacroPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-primary/20 bg-background/60 px-3 py-2">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold">{value}</p>
    </div>
  );
}
