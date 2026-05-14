"use client";

import { useEffect, useMemo, useState } from "react";
import { signIn } from "next-auth/react";
import { CalendarDays, CreditCard, Mail, Pencil, Plus, RefreshCw, Search, Target, Trash2, TrendingUp, WalletCards } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FadeIn } from "@/components/ui/animate";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const blankForm = {
  id: "",
  merchant: "",
  amount: "",
  currency: "INR",
  category: "",
  date: new Date().toISOString().slice(0, 10),
  notes: "",
};

const spendCategories = ["Food", "Groceries", "Travel", "Shopping", "Health", "Fitness", "Bills", "Subscriptions", "Entertainment", "Other"];

function formatInr(value: number) {
  return `INR ${Number(value || 0).toFixed(2)}`;
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function weekKey(date: Date) {
  const start = new Date(date);
  start.setDate(date.getDate() - date.getDay());
  start.setHours(0, 0, 0, 0);
  return dateKey(start);
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function formatPeriodLabel(key: string, mode: "daily" | "weekly" | "monthly") {
  if (mode === "monthly") {
    const [year, month] = key.split("-").map(Number);
    return new Date(year, month - 1, 1).toLocaleDateString(undefined, { month: "short", year: "numeric" });
  }
  const date = new Date(`${key}T00:00:00`);
  if (mode === "weekly") return `Week of ${date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function SpendsPage() {
  const [spends, setSpends] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [targetMonthlySpend, setTargetMonthlySpend] = useState("");
  const [targetSaving, setTargetSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [periodFilter, setPeriodFilter] = useState("month");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [form, setForm] = useState(blankForm);

  const loadData = async () => {
    try {
      const [spendsRes, settingsRes] = await Promise.all([
        fetch("/api/spends"),
        fetch("/api/spends/settings"),
      ]);
      const spendsData = await spendsRes.json();
      const settingsData = await settingsRes.json();
      setSpends(spendsData?.spends ?? []);
      setTargetMonthlySpend(settingsData?.targetMonthlySpend ? String(settingsData.targetMonthlySpend) : "");
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const totals = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthSpends = spends.filter((spend) => new Date(spend.date) >= monthStart);
    const total = monthSpends.reduce((sum, spend) => sum + (spend.amount ?? 0), 0);
    const gmail = monthSpends.filter((spend) => spend.source === "gmail").length;
    const manual = monthSpends.filter((spend) => spend.source === "manual").length;
    const target = Number(targetMonthlySpend) || 0;
    const remaining = target > 0 ? Math.max(0, target - total) : 0;
    const progress = target > 0 ? Math.min(100, Math.round((total / target) * 100)) : 0;
    const daysPassed = Math.max(1, now.getDate());
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const dailyAverage = total / daysPassed;
    const projected = dailyAverage * daysInMonth;
    const largest = [...monthSpends].sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0))[0];
    return { total, count: monthSpends.length, gmail, manual, target, remaining, progress, dailyAverage, projected, largest };
  }, [spends, targetMonthlySpend]);

  const categoryTotals = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const grouped = spends
      .filter((spend) => new Date(spend.date) >= monthStart)
      .reduce((acc: Record<string, number>, spend) => {
        const category = spend.category || "Uncategorized";
        acc[category] = (acc[category] ?? 0) + (spend.amount ?? 0);
        return acc;
      }, {});
    return Object.entries(grouped)
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 6);
  }, [spends]);

  const filterStartDate = useMemo(() => {
    const now = new Date();
    if (periodFilter === "week") {
      const start = new Date(now);
      start.setDate(now.getDate() - now.getDay());
      start.setHours(0, 0, 0, 0);
      return start;
    }
    if (periodFilter === "month") return new Date(now.getFullYear(), now.getMonth(), 1);
    if (periodFilter === "year") return new Date(now.getFullYear(), 0, 1);
    return null;
  }, [periodFilter]);

  const filteredSpends = useMemo(() => {
    const query = search.trim().toLowerCase();
    return spends.filter((spend) => {
      const spendDate = new Date(spend.date);
      const matchesPeriod = !filterStartDate || spendDate >= filterStartDate;
      const matchesCategory = categoryFilter === "all" || (spend.category || "Uncategorized") === categoryFilter;
      const matchesSearch =
        !query ||
        [spend.merchant, spend.category, spend.notes, spend.emailSubject]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(query));
      return matchesPeriod && matchesCategory && matchesSearch;
    });
  }, [categoryFilter, filterStartDate, search, spends]);

  const filteredTotal = useMemo(
    () => filteredSpends.reduce((sum, spend) => sum + (spend.amount ?? 0), 0),
    [filteredSpends]
  );

  const availableCategories = useMemo(() => {
    const categories = new Set<string>();
    spends.forEach((spend) => categories.add(spend.category || "Uncategorized"));
    return ["all", ...Array.from(categories).sort()];
  }, [spends]);

  const topCategory = categoryTotals[0];

  const buildHistory = (mode: "daily" | "weekly" | "monthly") => {
    const grouped = spends.reduce((acc: Record<string, any>, spend) => {
      const date = new Date(spend.date);
      const key = mode === "daily" ? dateKey(date) : mode === "weekly" ? weekKey(date) : monthKey(date);
      if (!acc[key]) {
        acc[key] = {
          key,
          label: formatPeriodLabel(key, mode),
          amount: 0,
          count: 0,
          imported: 0,
          manual: 0,
        };
      }
      acc[key].amount += spend.amount ?? 0;
      acc[key].count += 1;
      if (spend.source === "gmail") acc[key].imported += 1;
      else acc[key].manual += 1;
      return acc;
    }, {});

    return Object.values(grouped)
      .sort((a: any, b: any) => a.key.localeCompare(b.key))
      .slice(mode === "daily" ? -14 : mode === "weekly" ? -12 : -12);
  };

  const dailyHistory = useMemo(() => buildHistory("daily"), [spends]);
  const weeklyHistory = useMemo(() => buildHistory("weekly"), [spends]);
  const monthlyHistory = useMemo(() => buildHistory("monthly"), [spends]);

  const openAdd = () => {
    setForm(blankForm);
    setDialogOpen(true);
  };

  const openEdit = (spend: any) => {
    setForm({
      id: spend.id,
      merchant: spend.merchant ?? "",
      amount: String(spend.amount ?? ""),
      currency: spend.currency ?? "INR",
      category: spend.category ?? "",
      date: new Date(spend.date ?? Date.now()).toISOString().slice(0, 10),
      notes: spend.notes ?? "",
    });
    setDialogOpen(true);
  };

  const saveSpend = async () => {
    if (!form.merchant || !form.amount) {
      toast.error("Merchant and amount are required");
      return;
    }
    try {
      const res = await fetch("/api/spends", {
        method: form.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data?.error ?? "Failed to save spend");
        return;
      }
      toast.success(form.id ? "Spend updated" : "Spend added");
      setDialogOpen(false);
      loadData();
    } catch {
      toast.error("Failed to save spend");
    }
  };

  const saveTarget = async () => {
    setTargetSaving(true);
    try {
      const res = await fetch("/api/spends/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetMonthlySpend }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? "Failed to save target");
        return;
      }
      setTargetMonthlySpend(String(data.targetMonthlySpend ?? ""));
      toast.success("Monthly target saved");
    } catch {
      toast.error("Failed to save target");
    } finally {
      setTargetSaving(false);
    }
  };

  const deleteSpend = async (id: string) => {
    try {
      await fetch(`/api/spends?id=${id}`, { method: "DELETE" });
      toast.success("Spend removed");
      loadData();
    } catch {
      toast.error("Failed to remove spend");
    }
  };

  const importGmail = async () => {
    setImporting(true);
    try {
      const res = await fetch("/api/spends/gmail-import", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        if (data?.needsConnection) {
          toast.error("Connect Gmail first");
          return;
        }
        toast.error(data?.error ?? "Gmail import failed");
        return;
      }
      toast.success(`Imported ${data.summary.imported} spends from ${data.summary.scanned} emails`);
      loadData();
    } catch {
      toast.error("Gmail import failed");
    } finally {
      setImporting(false);
    }
  };

  if (loading) return <div className="space-y-4">{[1,2,3].map((i) => <div key={i} className="h-28 bg-muted animate-pulse rounded-lg" />)}</div>;

  return (
    <div className="space-y-5 sm:space-y-6">
      <FadeIn>
        <div className="grid gap-3 sm:flex sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h2 className="font-display text-2xl font-bold leading-tight tracking-tight">Spends</h2>
            <p className="text-muted-foreground text-sm mt-1">Track purchases manually or import receipt-like emails from Gmail</p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <Button variant="outline" onClick={() => signIn("google", { callbackUrl: "/spends" })} className="px-3">
              <Mail className="w-4 h-4 mr-2" />Connect Gmail
            </Button>
            <Button variant="outline" onClick={importGmail} disabled={importing} className="px-3">
              <RefreshCw className={`w-4 h-4 mr-2 ${importing ? "animate-spin" : ""}`} />Import Gmail
            </Button>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={openAdd} className="col-span-2 px-3 sm:col-span-1"><Plus className="w-4 h-4 mr-2" />Add Spend</Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader><DialogTitle>{form.id ? "Edit Spend" : "Add Spend"}</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <div><Label>Merchant</Label><Input value={form.merchant} onChange={(e) => setForm({ ...form, merchant: e.target.value })} className="mt-1" /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Amount</Label><Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="mt-1" /></div>
                    <div><Label>Currency</Label><Input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })} className="mt-1" /></div>
                    <div><Label>Category</Label><Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="mt-1" placeholder="Food, travel, shopping" /></div>
                    <div><Label>Date</Label><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="mt-1" /></div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {spendCategories.map((category) => (
                      <Button key={category} type="button" variant={form.category === category ? "default" : "outline"} size="sm" onClick={() => setForm({ ...form, category })}>
                        {category}
                      </Button>
                    ))}
                  </div>
                  <div><Label>Notes</Label><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="mt-1" /></div>
                  <Button onClick={saveSpend} className="w-full">{form.id ? "Update Spend" : "Save Spend"}</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </FadeIn>

      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="space-y-4 p-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <div>
              <div className="mb-2 flex items-center gap-2">
                <Target className="h-5 w-5 text-primary" />
                <h3 className="font-semibold">Monthly Target</h3>
              </div>
              <p className="text-sm text-muted-foreground">
                {totals.target > 0
                  ? `${formatInr(totals.remaining)} remaining from ${formatInr(totals.target)}`
                  : "Set a monthly spend target to track budget progress."}
              </p>
            </div>
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <Input type="number" value={targetMonthlySpend} onChange={(e) => setTargetMonthlySpend(e.target.value)} placeholder="Monthly target" />
              <Button onClick={saveTarget} disabled={targetSaving}>{targetSaving ? "Saving" : "Save"}</Button>
            </div>
          </div>
          <div>
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="font-medium">{formatInr(totals.total)} spent this month</span>
              <span className="text-muted-foreground">{totals.progress}%</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-muted">
              <div className={`h-full rounded-full ${totals.progress >= 100 ? "bg-destructive" : "bg-primary"}`} style={{ width: `${totals.progress}%` }} />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <SummaryCard title="This Month" value={formatInr(totals.total)} detail={`${totals.count} spends`} icon={WalletCards} />
        <SummaryCard title="Remaining" value={totals.target ? formatInr(totals.remaining) : "Set"} detail="monthly budget" icon={Target} />
        <SummaryCard title="Imported" value={`${totals.gmail}`} detail="Gmail receipts" icon={Mail} />
        <SummaryCard title="Manual" value={`${totals.manual}`} detail="this month" icon={CreditCard} />
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <InsightCard
          title="Daily Average"
          value={formatInr(totals.dailyAverage)}
          detail="average spend per day this month"
        />
        <InsightCard
          title="Month Projection"
          value={formatInr(totals.projected)}
          detail={totals.target && totals.projected > totals.target ? "likely to cross target" : "based on current pace"}
          warning={Boolean(totals.target && totals.projected > totals.target)}
        />
        <InsightCard
          title="Largest Spend"
          value={totals.largest ? formatInr(totals.largest.amount ?? 0) : "None"}
          detail={totals.largest ? totals.largest.merchant : "no spends this month"}
        />
        <InsightCard
          title="Top Category"
          value={topCategory ? topCategory.category : "None"}
          detail={topCategory ? formatInr(topCategory.amount) : "no category data"}
        />
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><TrendingUp className="w-5 h-5 text-primary" />Category Breakdown</CardTitle></CardHeader>
        <CardContent>
          {categoryTotals.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">No category data this month.</div>
          ) : (
            <div className="space-y-3">
              {categoryTotals.map((item) => {
                const width = totals.total > 0 ? Math.max(6, Math.round((item.amount / totals.total) * 100)) : 0;
                return (
                  <div key={item.category} className="space-y-1">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="min-w-0 truncate font-medium">{item.category}</span>
                      <span className="font-mono text-muted-foreground">{formatInr(item.amount)}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${width}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-primary" />
            Spend History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="monthly" className="space-y-4">
            <TabsList className="grid h-auto w-full grid-cols-3 gap-2 overflow-visible bg-transparent p-0 sm:inline-flex sm:h-10 sm:w-auto sm:gap-1">
              <TabsTrigger value="daily" className="h-11 rounded-lg border border-border bg-transparent text-muted-foreground shadow-none data-[state=active]:!border-primary/30 data-[state=active]:!bg-primary/15 data-[state=active]:!text-primary sm:h-10">Daily</TabsTrigger>
              <TabsTrigger value="weekly" className="h-11 rounded-lg border border-border bg-transparent text-muted-foreground shadow-none data-[state=active]:!border-primary/30 data-[state=active]:!bg-primary/15 data-[state=active]:!text-primary sm:h-10">Weekly</TabsTrigger>
              <TabsTrigger value="monthly" className="h-11 rounded-lg border border-border bg-transparent text-muted-foreground shadow-none data-[state=active]:!border-primary/30 data-[state=active]:!bg-primary/15 data-[state=active]:!text-primary sm:h-10">Monthly</TabsTrigger>
            </TabsList>
            <TabsContent value="daily">
              <HistoryPanel data={dailyHistory} emptyLabel="No daily spend history yet." />
            </TabsContent>
            <TabsContent value="weekly">
              <HistoryPanel data={weeklyHistory} emptyLabel="No weekly spend history yet." />
            </TabsContent>
            <TabsContent value="monthly">
              <HistoryPanel data={monthlyHistory} emptyLabel="No monthly spend history yet." />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><WalletCards className="w-5 h-5 text-primary" />Recent Spends</CardTitle></CardHeader>
        <CardContent>
          <div className="mb-4 grid gap-3 md:grid-cols-[1fr_160px_180px]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" placeholder="Search merchant, category, notes..." />
            </div>
            <Select value={periodFilter} onValueChange={setPeriodFilter}>
              <SelectTrigger>
                <CalendarDays className="mr-2 h-4 w-4" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="week">This week</SelectItem>
                <SelectItem value="month">This month</SelectItem>
                <SelectItem value="year">This year</SelectItem>
                <SelectItem value="all">All time</SelectItem>
              </SelectContent>
            </Select>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                {availableCategories.map((category) => (
                  <SelectItem key={category} value={category}>{category === "all" ? "All categories" : category}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2 text-sm">
            <span className="text-muted-foreground">{filteredSpends.length} matching spends</span>
            <span className="font-mono font-semibold">{formatInr(filteredTotal)}</span>
          </div>

          {spends.length === 0 ? (
            <div className="text-center py-10 text-sm text-muted-foreground">No spends yet. Add one manually or connect Gmail.</div>
          ) : filteredSpends.length === 0 ? (
            <div className="text-center py-10 text-sm text-muted-foreground">No spends match these filters.</div>
          ) : (
            <div className="space-y-2">
              {filteredSpends.map((spend) => (
                <div key={spend.id} className="grid gap-3 rounded-lg bg-muted/40 px-3 py-3 sm:grid-cols-[1fr_auto] sm:items-center">
                  <div className="min-w-0 space-y-1">
                    <p className="font-medium truncate">{spend.merchant}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {new Date(spend.date).toLocaleDateString()} {spend.emailSubject ? `• ${spend.emailSubject}` : ""}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant={spend.source === "gmail" ? "secondary" : "outline"}>{spend.source}</Badge>
                      {spend.category && <Badge variant="outline">{spend.category}</Badge>}
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2 sm:justify-end">
                    <span className="font-mono text-sm">{spend.currency} {Number(spend.amount ?? 0).toFixed(2)}</span>
                    <Button variant="ghost" size="icon" onClick={() => openEdit(spend)} title="Edit spend">
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => deleteSpend(spend.id)} title="Delete spend">
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({ title, value, detail, icon: Icon }: any) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center">
            <Icon className="w-5 h-5 text-primary" />
          </div>
          <span className="text-sm font-medium">{title}</span>
        </div>
        <p className="text-2xl font-semibold">{value}</p>
        <p className="text-xs text-muted-foreground mt-1">{detail}</p>
      </CardContent>
    </Card>
  );
}

function InsightCard({ title, value, detail, warning }: any) {
  return (
    <Card className={warning ? "border-destructive/40 bg-destructive/5" : ""}>
      <CardContent className="p-4">
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        <p className="mt-2 text-xl font-semibold">{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}

function HistoryPanel({ data, emptyLabel }: { data: any[]; emptyLabel: string }) {
  if (data.length === 0) {
    return <div className="py-10 text-center text-sm text-muted-foreground">{emptyLabel}</div>;
  }

  const latest = [...data].slice(-5).reverse();

  return (
    <div className="space-y-4">
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="label" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} tickLine={false} axisLine={false} width={44} />
            <Tooltip
              cursor={{ fill: "hsl(var(--muted) / 0.35)" }}
              contentStyle={{
                background: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 8,
                color: "hsl(var(--foreground))",
              }}
              formatter={(value: any) => [formatInr(Number(value)), "Spent"]}
            />
            <Bar dataKey="amount" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="grid gap-2">
        {latest.map((item) => (
          <div key={item.key} className="grid grid-cols-[1fr_auto] gap-3 rounded-lg bg-muted/40 px-3 py-3">
            <div className="min-w-0">
              <p className="truncate font-medium">{item.label}</p>
              <p className="text-xs text-muted-foreground">
                {item.count} spends - {item.manual} manual - {item.imported} imported
              </p>
            </div>
            <span className="font-mono text-sm">{formatInr(item.amount)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
