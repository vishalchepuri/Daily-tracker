"use client";

import { useEffect, useMemo, useState } from "react";
import { signIn } from "next-auth/react";
import { AlertCircle, Banknote, CalendarDays, CreditCard, Download, HandCoins, Landmark, Mail, Pencil, Plus, RefreshCw, Search, Sparkles, Target, Trash2, TrendingUp, WalletCards } from "lucide-react";
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
  bankAccountId: "none",
  creditCardId: "none",
};

const blankCardForm = {
  id: "",
  name: "",
  bankName: "",
  last4: "",
  currentDue: "",
  dueDay: "",
};

const blankBankForm = {
  id: "",
  name: "",
  bankName: "",
  accountType: "savings",
  last4: "",
  balance: "",
  currency: "INR",
};

const blankMoneyLinkForm = {
  person: "",
  type: "lend",
  amount: "",
  currency: "INR",
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
  const [targetEditing, setTargetEditing] = useState(false);
  const [targetSaving, setTargetSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [periodFilter, setPeriodFilter] = useState("custom");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [customStart, setCustomStart] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10));
  const [customEnd, setCustomEnd] = useState(() => new Date().toISOString().slice(0, 10));
  const [form, setForm] = useState(blankForm);
  const [financeProfile, setFinanceProfile] = useState<any>(null);
  const [bankAccounts, setBankAccounts] = useState<any[]>([]);
  const [creditCards, setCreditCards] = useState<any[]>([]);
  const [moneyLinks, setMoneyLinks] = useState<any[]>([]);
  const [financeForm, setFinanceForm] = useState({ currentBalance: "", totalAmount: "" });
  const [cardDialogOpen, setCardDialogOpen] = useState(false);
  const [cardForm, setCardForm] = useState(blankCardForm);
  const [bankDialogOpen, setBankDialogOpen] = useState(false);
  const [bankForm, setBankForm] = useState(blankBankForm);
  const [moneyLinkForm, setMoneyLinkForm] = useState(blankMoneyLinkForm);

  const loadData = async () => {
    try {
      const [spendsResult, settingsResult, financeResult, bankResult, cardsResult, moneyLinksResult] = await Promise.allSettled([
        fetch("/api/spends").then((res) => res.ok ? res.json() : { spends: [] }),
        fetch("/api/spends/settings").then((res) => res.ok ? res.json() : {}),
        fetch("/api/finance").then((res) => res.ok ? res.json() : { financeProfile: null }),
        fetch("/api/bank-accounts").then((res) => res.ok ? res.json() : { bankAccounts: [] }),
        fetch("/api/credit-cards").then((res) => res.ok ? res.json() : { creditCards: [] }),
        fetch("/api/money-links").then((res) => res.ok ? res.json() : { moneyLinks: [] }),
      ]);
      const spendsData = spendsResult.status === "fulfilled" ? spendsResult.value : { spends: [] };
      const settingsData: any = settingsResult.status === "fulfilled" ? settingsResult.value : {};
      const financeData = financeResult.status === "fulfilled" ? financeResult.value : { financeProfile: null };
      const bankData = bankResult.status === "fulfilled" ? bankResult.value : { bankAccounts: [] };
      const cardsData = cardsResult.status === "fulfilled" ? cardsResult.value : { creditCards: [] };
      const moneyLinksData = moneyLinksResult.status === "fulfilled" ? moneyLinksResult.value : { moneyLinks: [] };
      setSpends(spendsData?.spends ?? []);
      setTargetMonthlySpend(settingsData?.targetMonthlySpend ? String(settingsData.targetMonthlySpend) : "");
      setTargetEditing(!settingsData?.targetMonthlySpend);
      setFinanceProfile(financeData?.financeProfile ?? null);
      setFinanceForm({
        currentBalance: financeData?.financeProfile?.currentBalance != null ? String(financeData.financeProfile.currentBalance) : "",
        totalAmount: financeData?.financeProfile?.totalAmount != null ? String(financeData.financeProfile.totalAmount) : "",
      });
      setBankAccounts(bankData?.bankAccounts ?? []);
      setCreditCards(cardsData?.creditCards ?? []);
      setMoneyLinks(moneyLinksData?.moneyLinks ?? []);
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
    const creditCardSpend = monthSpends.filter((spend) => spend.creditCardId).reduce((sum, spend) => sum + (spend.amount ?? 0), 0);
    const target = Number(targetMonthlySpend) || 0;
    const remaining = target > 0 ? Math.max(0, target - total) : 0;
    const progress = target > 0 ? Math.min(100, Math.round((total / target) * 100)) : 0;
    const daysPassed = Math.max(1, now.getDate());
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const daysRemaining = Math.max(1, daysInMonth - now.getDate() + 1);
    const dailyAverage = total / daysPassed;
    const projected = dailyAverage * daysInMonth;
    const safeDailySpend = target > 0 ? remaining / daysRemaining : 0;
    const largest = [...monthSpends].sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0))[0];
    return { total, count: monthSpends.length, gmail, manual, creditCardSpend, target, remaining, progress, dailyAverage, projected, safeDailySpend, daysRemaining, largest };
  }, [spends, targetMonthlySpend]);

  const financeTotals = useMemo(() => {
    const openLinks = moneyLinks.filter((link) => !link.settled);
    const totalLend = openLinks.filter((link) => link.type === "lend").reduce((sum, link) => sum + (link.amount ?? 0), 0);
    const totalBorrow = openLinks.filter((link) => link.type === "borrow").reduce((sum, link) => sum + (link.amount ?? 0), 0);
    const currentCardDue = creditCards.reduce((sum, card) => sum + (card.currentDue ?? 0), 0);
    const totalBankBalance = bankAccounts.reduce((sum, account) => sum + (account.balance ?? 0), 0);
    return {
      currentBalance: totalBankBalance || financeProfile?.currentBalance || 0,
      totalAmount: financeProfile?.totalAmount ?? 0,
      totalBankBalance,
      totalLend,
      totalBorrow,
      currentCardDue,
      netBalance: (totalBankBalance || financeProfile?.currentBalance || 0) + totalLend - totalBorrow - currentCardDue,
    };
  }, [bankAccounts, creditCards, financeProfile, moneyLinks]);

  const cardDueAlerts = useMemo(() => {
    const today = new Date();
    const todayDay = today.getDate();
    return creditCards
      .filter((card) => card.dueDay && (card.currentDue ?? 0) > 0)
      .map((card) => {
        const daysUntilDue = card.dueDay >= todayDay
          ? card.dueDay - todayDay
          : new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate() - todayDay + card.dueDay;
        return { ...card, daysUntilDue };
      })
      .sort((a, b) => a.daysUntilDue - b.daysUntilDue)
      .slice(0, 3);
  }, [creditCards]);

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
    if (periodFilter === "custom") return customStart ? new Date(`${customStart}T00:00:00`) : null;
    return null;
  }, [customStart, periodFilter]);

  const filterEndDate = useMemo(() => {
    if (periodFilter !== "custom" || !customEnd) return null;
    const end = new Date(`${customEnd}T23:59:59`);
    return Number.isNaN(end.getTime()) ? null : end;
  }, [customEnd, periodFilter]);

  const filteredSpends = useMemo(() => {
    const query = search.trim().toLowerCase();
    return spends.filter((spend) => {
      const spendDate = new Date(spend.date);
      const matchesPeriod = !filterStartDate || spendDate >= filterStartDate;
      const matchesEnd = !filterEndDate || spendDate <= filterEndDate;
      const matchesCategory = categoryFilter === "all" || (spend.category || "Uncategorized") === categoryFilter;
      const matchesSource = sourceFilter === "all" || spend.source === sourceFilter;
      const matchesPayment =
        paymentFilter === "all" ||
        (paymentFilter === "none"
          ? !spend.bankAccountId && !spend.creditCardId
          : paymentFilter.startsWith("bank:")
            ? spend.bankAccountId === paymentFilter.replace("bank:", "")
            : paymentFilter.startsWith("card:")
              ? spend.creditCardId === paymentFilter.replace("card:", "")
              : true);
      const matchesSearch =
        !query ||
        [spend.merchant, spend.category, spend.notes, spend.emailSubject, spend.bankAccount?.name, spend.creditCard?.name]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(query));
      return matchesPeriod && matchesEnd && matchesCategory && matchesSource && matchesPayment && matchesSearch;
    });
  }, [categoryFilter, filterEndDate, filterStartDate, paymentFilter, search, sourceFilter, spends]);

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

  const filteredReport = useMemo(() => {
    const groupedDays = filteredSpends.reduce((acc: Record<string, any>, spend) => {
      const key = dateKey(new Date(spend.date));
      if (!acc[key]) {
        acc[key] = { key, label: formatPeriodLabel(key, "daily"), amount: 0, count: 0 };
      }
      acc[key].amount += spend.amount ?? 0;
      acc[key].count += 1;
      return acc;
    }, {});
    const dayRows = Object.values(groupedDays).sort((a: any, b: any) => a.key.localeCompare(b.key));
    const total = filteredSpends.reduce((sum, spend) => sum + (spend.amount ?? 0), 0);
    const topDay = [...dayRows].sort((a: any, b: any) => b.amount - a.amount)[0];
    const merchants = filteredSpends.reduce((acc: Record<string, number>, spend) => {
      acc[spend.merchant] = (acc[spend.merchant] ?? 0) + (spend.amount ?? 0);
      return acc;
    }, {});
    const topMerchant = Object.entries(merchants).map(([merchant, amount]) => ({ merchant, amount })).sort((a, b) => b.amount - a.amount)[0];
    const averagePerDay = dayRows.length ? total / dayRows.length : 0;
    return { dayRows, total, topDay, topMerchant, averagePerDay };
  }, [filteredSpends]);

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
      bankAccountId: spend.bankAccountId ?? "none",
      creditCardId: spend.creditCardId ?? "none",
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
      setTargetEditing(false);
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

  const exportFilteredSpends = () => {
    if (filteredSpends.length === 0) {
      toast.error("No spends to export");
      return;
    }
    const headers = ["Date", "Merchant", "Amount", "Currency", "Category", "Source", "Credit Card", "Notes"];
    const rows = filteredSpends.map((spend) => [
      new Date(spend.date).toISOString().slice(0, 10),
      spend.merchant ?? "",
      Number(spend.amount ?? 0).toFixed(2),
      spend.currency ?? "INR",
      spend.category ?? "",
      spend.source ?? "",
      spend.creditCard?.name ?? "",
      spend.notes ?? "",
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `dayza-spends-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast.success("Spend CSV exported");
  };

  const clearFilters = () => {
    setSearch("");
    setPeriodFilter("custom");
    setCategoryFilter("all");
    setSourceFilter("all");
    setPaymentFilter("all");
    setCustomStart(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10));
    setCustomEnd(new Date().toISOString().slice(0, 10));
  };

  const saveFinance = async () => {
    try {
      const res = await fetch("/api/finance", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...financeForm, currency: "INR" }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? "Failed to save balances");
        return;
      }
      toast.success("Balances saved");
      loadData();
    } catch {
      toast.error("Failed to save balances");
    }
  };

  const openAddBank = () => {
    setBankForm(blankBankForm);
    setBankDialogOpen(true);
  };

  const openEditBank = (account: any) => {
    setBankForm({
      id: account.id,
      name: account.name ?? "",
      bankName: account.bankName ?? "",
      accountType: account.accountType ?? "savings",
      last4: account.last4 ?? "",
      balance: account.balance != null ? String(account.balance) : "",
      currency: account.currency ?? "INR",
    });
    setBankDialogOpen(true);
  };

  const saveBank = async () => {
    if (!bankForm.name) {
      toast.error("Account name is required");
      return;
    }
    try {
      const res = await fetch("/api/bank-accounts", {
        method: bankForm.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bankForm),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? "Failed to save bank account");
        return;
      }
      toast.success(bankForm.id ? "Bank account updated" : "Bank account added");
      setBankDialogOpen(false);
      loadData();
    } catch {
      toast.error("Failed to save bank account");
    }
  };

  const deleteBank = async (id: string) => {
    try {
      await fetch(`/api/bank-accounts?id=${id}`, { method: "DELETE" });
      toast.success("Bank account removed");
      loadData();
    } catch {
      toast.error("Failed to remove bank account");
    }
  };

  const openAddCard = () => {
    setCardForm(blankCardForm);
    setCardDialogOpen(true);
  };

  const openEditCard = (card: any) => {
    setCardForm({
      id: card.id,
      name: card.name ?? "",
      bankName: card.bankName ?? "",
      last4: card.last4 ?? "",
      currentDue: card.currentDue != null ? String(card.currentDue) : "",
      dueDay: card.dueDay != null ? String(card.dueDay) : "",
    });
    setCardDialogOpen(true);
  };

  const saveCard = async () => {
    if (!cardForm.name) {
      toast.error("Card name is required");
      return;
    }
    try {
      const res = await fetch("/api/credit-cards", {
        method: cardForm.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cardForm),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? "Failed to save card");
        return;
      }
      toast.success(cardForm.id ? "Card updated" : "Card added");
      setCardDialogOpen(false);
      loadData();
    } catch {
      toast.error("Failed to save card");
    }
  };

  const deleteCard = async (id: string) => {
    try {
      await fetch(`/api/credit-cards?id=${id}`, { method: "DELETE" });
      toast.success("Card removed");
      loadData();
    } catch {
      toast.error("Failed to remove card");
    }
  };

  const saveMoneyLink = async () => {
    if (!moneyLinkForm.person || !moneyLinkForm.amount) {
      toast.error("Person and amount are required");
      return;
    }
    try {
      const res = await fetch("/api/money-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(moneyLinkForm),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? "Failed to save lend/borrow");
        return;
      }
      toast.success(moneyLinkForm.type === "lend" ? "Lend entry added" : "Borrow entry added");
      setMoneyLinkForm(blankMoneyLinkForm);
      loadData();
    } catch {
      toast.error("Failed to save lend/borrow");
    }
  };

  const updateMoneyLink = async (id: string, data: any) => {
    try {
      await fetch("/api/money-links", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...data }),
      });
      loadData();
    } catch {
      toast.error("Failed to update lend/borrow");
    }
  };

  const deleteMoneyLink = async (id: string) => {
    try {
      await fetch(`/api/money-links?id=${id}`, { method: "DELETE" });
      toast.success("Entry removed");
      loadData();
    } catch {
      toast.error("Failed to remove entry");
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
            <Button
              variant="outline"
              onClick={() =>
                signIn(
                  "google",
                  { callbackUrl: "/spends" },
                  {
                    scope: "openid email profile https://www.googleapis.com/auth/gmail.readonly",
                    access_type: "offline",
                    prompt: "consent",
                  }
                )
              }
              className="px-3"
            >
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
                  <div>
                    <Label>Payment Source</Label>
                    <Select
                      value={form.bankAccountId !== "none" ? `bank:${form.bankAccountId}` : form.creditCardId !== "none" ? `card:${form.creditCardId}` : "none"}
                      onValueChange={(value) => {
                        if (value.startsWith("bank:")) setForm({ ...form, bankAccountId: value.replace("bank:", ""), creditCardId: "none" });
                        else if (value.startsWith("card:")) setForm({ ...form, bankAccountId: "none", creditCardId: value.replace("card:", "") });
                        else setForm({ ...form, bankAccountId: "none", creditCardId: "none" });
                      }}
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder="Optional bank/card" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No bank/card / cash / UPI</SelectItem>
                        {bankAccounts.map((account) => (
                          <SelectItem key={account.id} value={`bank:${account.id}`}>
                            {account.name}{account.last4 ? ` - ${account.last4}` : ""}
                          </SelectItem>
                        ))}
                        {creditCards.map((card) => (
                          <SelectItem key={card.id} value={`card:${card.id}`}>
                            {card.name}{card.last4 ? ` - ${card.last4}` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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

      <Card className="overflow-hidden border-primary/30">
        <CardHeader>
          <div className="grid gap-3 sm:flex sm:items-center sm:justify-between">
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Smart Spend Capture
            </CardTitle>
            <div className="grid grid-cols-2 gap-2 sm:flex">
              <Dialog open={bankDialogOpen} onOpenChange={setBankDialogOpen}>
                <DialogTrigger asChild>
                  <Button onClick={openAddBank} size="sm" variant="outline"><Plus className="mr-2 h-4 w-4" />Add Bank</Button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader><DialogTitle>{bankForm.id ? "Edit Bank Account" : "Add Bank Account"}</DialogTitle></DialogHeader>
                  <div className="space-y-4">
                    <div><Label>Account Name</Label><Input value={bankForm.name} onChange={(e) => setBankForm({ ...bankForm, name: e.target.value })} className="mt-1" placeholder="Salary account, Savings..." /></div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><Label>Bank</Label><Input value={bankForm.bankName} onChange={(e) => setBankForm({ ...bankForm, bankName: e.target.value })} className="mt-1" /></div>
                      <div><Label>Last 4</Label><Input value={bankForm.last4} onChange={(e) => setBankForm({ ...bankForm, last4: e.target.value.slice(0, 4) })} className="mt-1" /></div>
                      <div>
                        <Label>Type</Label>
                        <Select value={bankForm.accountType} onValueChange={(accountType) => setBankForm({ ...bankForm, accountType })}>
                          <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="savings">Savings</SelectItem>
                            <SelectItem value="current">Current</SelectItem>
                            <SelectItem value="salary">Salary</SelectItem>
                            <SelectItem value="wallet">Wallet</SelectItem>
                            <SelectItem value="other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div><Label>Balance</Label><Input type="number" value={bankForm.balance} onChange={(e) => setBankForm({ ...bankForm, balance: e.target.value })} className="mt-1" /></div>
                    </div>
                    <Button onClick={saveBank} className="w-full">{bankForm.id ? "Update Bank" : "Save Bank"}</Button>
                  </div>
                </DialogContent>
              </Dialog>
              <Dialog open={cardDialogOpen} onOpenChange={setCardDialogOpen}>
                <DialogTrigger asChild>
                  <Button onClick={openAddCard} size="sm"><Plus className="mr-2 h-4 w-4" />Add Credit Card</Button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader><DialogTitle>{cardForm.id ? "Edit Credit Card" : "Add Credit Card"}</DialogTitle></DialogHeader>
                  <div className="space-y-4">
                    <div><Label>Card Name</Label><Input value={cardForm.name} onChange={(e) => setCardForm({ ...cardForm, name: e.target.value })} className="mt-1" placeholder="HDFC Regalia, SBI Cashback..." /></div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><Label>Bank</Label><Input value={cardForm.bankName} onChange={(e) => setCardForm({ ...cardForm, bankName: e.target.value })} className="mt-1" /></div>
                      <div><Label>Last 4</Label><Input value={cardForm.last4} onChange={(e) => setCardForm({ ...cardForm, last4: e.target.value.slice(0, 4) })} className="mt-1" /></div>
                      <div><Label>Current Due</Label><Input type="number" value={cardForm.currentDue} onChange={(e) => setCardForm({ ...cardForm, currentDue: e.target.value })} className="mt-1" /></div>
                      <div><Label>Due Day</Label><Input type="number" min="1" max="31" value={cardForm.dueDay} onChange={(e) => setCardForm({ ...cardForm, dueDay: e.target.value })} className="mt-1" placeholder="5" /></div>
                    </div>
                    <Button onClick={saveCard} className="w-full">{cardForm.id ? "Update Card" : "Save Card"}</Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <h3 className="font-semibold">Paste or upload a bank SMS, receipt, or payment screenshot</h3>
                <p className="text-sm text-muted-foreground">
                  Dayza will detect the merchant, amount, bank account or credit card, then save the spend automatically.
                </p>
              </div>
              <Button type="button" onClick={() => window.location.assign("/chat")} className="shrink-0">
                <Sparkles className="mr-2 h-4 w-4" />
                Open Dayza Agent
              </Button>
            </div>
          </div>

          <div className="grid gap-3 xl:grid-cols-[1.15fr_1fr]">
            <div className={`rounded-xl border p-4 sm:p-5 ${financeTotals.netBalance < 0 ? "border-destructive/40 bg-destructive/5" : "border-primary/30 bg-primary/5"}`}>
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Net Position</p>
                  <p className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">{formatInr(financeTotals.netBalance)}</p>
                  <p className="mt-2 text-sm text-muted-foreground">bank balance + lent money - borrowed money - card due</p>
                </div>
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/15">
                  <WalletCards className="h-6 w-6 text-primary" />
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-3">
                <MoneyMetric label="Bank balance" value={formatInr(financeTotals.totalBankBalance)} detail={`${bankAccounts.length} accounts`} />
                <MoneyMetric label="Card payable" value={formatInr(financeTotals.currentCardDue)} detail={`${creditCards.length} cards`} />
                <MoneyMetric
                  label="Safe daily"
                  value={totals.target ? formatInr(totals.safeDailySpend) : "Set target"}
                  detail={totals.target ? `${totals.daysRemaining} days left` : "monthly target"}
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <MoneyMetric icon={HandCoins} label="Total Lend" value={formatInr(financeTotals.totalLend)} detail="money to receive" featured />
              <MoneyMetric icon={CreditCard} label="Total Borrow" value={formatInr(financeTotals.totalBorrow)} detail="money to return" featured />
              <MoneyMetric icon={WalletCards} label="Saved Total" value={formatInr(financeTotals.totalAmount)} detail="manual total" featured />
              <MoneyMetric icon={CreditCard} label="Card Spend" value={formatInr(totals.creditCardSpend)} detail="this month" featured />
            </div>
          </div>

          {cardDueAlerts.length > 0 && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                <AlertCircle className="h-4 w-4 text-amber-400" />
                Upcoming Card Dues
              </div>
              <div className="grid gap-2 md:grid-cols-3">
                {cardDueAlerts.map((card) => (
                  <div key={card.id} className="rounded-md bg-background/60 px-3 py-2 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium">{card.name}</span>
                      <span className="font-mono">{formatInr(card.currentDue ?? 0)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {card.daysUntilDue === 0 ? "Due today" : `Due in ${card.daysUntilDue} days`}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-xl border bg-muted/20 p-3">
            <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
              <div>
                <Label>Total Amount</Label>
                <p className="mb-2 text-xs text-muted-foreground">Optional manual total for cash or assets you do not want to add as bank accounts.</p>
                <Input type="number" value={financeForm.totalAmount} onChange={(e) => setFinanceForm({ ...financeForm, totalAmount: e.target.value })} />
              </div>
              <Button onClick={saveFinance}>Save Total</Button>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-semibold">Bank Accounts</h3>
                <p className="text-xs text-muted-foreground">Total: {formatInr(financeTotals.totalBankBalance)}</p>
              </div>
              {bankAccounts.length === 0 ? (
                <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No bank accounts added yet.</div>
              ) : (
                <div className="grid gap-2">
                  {bankAccounts.map((account) => (
                    <div key={account.id} className="rounded-lg bg-muted/40 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-medium">{account.name}</p>
                          <p className="text-xs capitalize text-muted-foreground">{[account.bankName, account.accountType, account.last4 ? `Account ending ${account.last4}` : null].filter(Boolean).join(" - ")}</p>
                        </div>
                        <div className="flex shrink-0 gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEditBank(account)} title="Edit bank account"><Pencil className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => deleteBank(account.id)} title="Delete bank account"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        </div>
                      </div>
                      <div className="mt-3 text-sm">
                        <span className="text-muted-foreground">Balance</span>
                        <p className="font-mono">{formatInr(account.balance ?? 0)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-semibold">Credit Cards</h3>
                <p className="text-xs text-muted-foreground">Current due: {formatInr(financeTotals.currentCardDue)}</p>
              </div>
              {creditCards.length === 0 ? (
                <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No credit cards added yet.</div>
              ) : (
                <div className="grid gap-2">
                  {creditCards.map((card) => {
                    const monthSpend = spends.filter((spend) => spend.creditCardId === card.id).reduce((sum, spend) => {
                      const date = new Date(spend.date);
                      const now = new Date();
                      return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear() ? sum + (spend.amount ?? 0) : sum;
                    }, 0);
                    return (
                      <div key={card.id} className="rounded-lg bg-muted/40 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate font-medium">{card.name}</p>
                            <p className="text-xs text-muted-foreground">{[card.bankName, card.last4 ? `Card ending ${card.last4}` : null, card.dueDay ? `Due ${card.dueDay}` : null].filter(Boolean).join(" - ")}</p>
                          </div>
                          <div className="flex shrink-0 gap-1">
                            <Button variant="ghost" size="icon" onClick={() => openEditCard(card)} title="Edit card"><Pencil className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="icon" onClick={() => deleteCard(card.id)} title="Delete card"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                          </div>
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                          <div><span className="text-muted-foreground">Current due</span><p className="font-mono">{formatInr(card.currentDue ?? 0)}</p></div>
                          <div><span className="text-muted-foreground">This month</span><p className="font-mono">{formatInr(monthSpend)}</p></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="space-y-3">
              <h3 className="font-semibold">Lend / Borrow</h3>
              <div className="grid gap-2 rounded-lg bg-muted/30 p-3 sm:grid-cols-2">
                <Input placeholder="Person" value={moneyLinkForm.person} onChange={(e) => setMoneyLinkForm({ ...moneyLinkForm, person: e.target.value })} />
                <Input type="number" placeholder="Amount" value={moneyLinkForm.amount} onChange={(e) => setMoneyLinkForm({ ...moneyLinkForm, amount: e.target.value })} />
                <Select value={moneyLinkForm.type} onValueChange={(type) => setMoneyLinkForm({ ...moneyLinkForm, type })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="lend">I lent money</SelectItem>
                    <SelectItem value="borrow">I borrowed money</SelectItem>
                  </SelectContent>
                </Select>
                <Input type="date" value={moneyLinkForm.date} onChange={(e) => setMoneyLinkForm({ ...moneyLinkForm, date: e.target.value })} />
                <Input className="sm:col-span-2" placeholder="Notes" value={moneyLinkForm.notes} onChange={(e) => setMoneyLinkForm({ ...moneyLinkForm, notes: e.target.value })} />
                <Button className="sm:col-span-2" onClick={saveMoneyLink}><Plus className="mr-2 h-4 w-4" />Add Entry</Button>
              </div>
              <div className="grid max-h-80 gap-2 overflow-y-auto pr-1">
                {moneyLinks.length === 0 ? (
                  <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No lend or borrow entries yet.</div>
                ) : moneyLinks.map((link) => (
                  <div key={link.id} className={`grid gap-2 rounded-lg bg-muted/40 p-3 sm:grid-cols-[1fr_auto] sm:items-center ${link.settled ? "opacity-60" : ""}`}>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{link.person}</p>
                        <Badge variant={link.type === "lend" ? "secondary" : "outline"}>{link.type === "lend" ? "Lent" : "Borrowed"}</Badge>
                        {link.settled && <Badge variant="outline">Settled</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground">{new Date(link.date).toLocaleDateString()} {link.notes ? `- ${link.notes}` : ""}</p>
                    </div>
                    <div className="flex items-center justify-between gap-1 sm:justify-end">
                      <span className="font-mono text-sm">{formatInr(link.amount ?? 0)}</span>
                      <Button variant="ghost" size="sm" onClick={() => updateMoneyLink(link.id, { settled: !link.settled })}>{link.settled ? "Open" : "Settle"}</Button>
                      <Button variant="ghost" size="icon" onClick={() => deleteMoneyLink(link.id)} title="Delete entry"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

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
            {targetEditing ? (
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <Input type="number" value={targetMonthlySpend} onChange={(e) => setTargetMonthlySpend(e.target.value)} placeholder="Monthly target" />
                <Button onClick={saveTarget} disabled={targetSaving}>{targetSaving ? "Saving" : "Save"}</Button>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3 rounded-lg bg-background/60 px-3 py-2 sm:min-w-72">
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Saved target</p>
                  <p className="truncate font-mono font-semibold">{formatInr(totals.target)}</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => setTargetEditing(true)}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </Button>
              </div>
            )}
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
        <InsightCard title="Top Category" value={topCategory ? topCategory.category : "None"} detail={topCategory ? formatInr(topCategory.amount) : "no category data"} />
      </div>

      <Card className="border-primary/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Custom Spend Report
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[1fr_1fr_160px_160px_220px]">
            <div>
              <Label>From</Label>
              <Input type="date" value={customStart} onChange={(e) => { setCustomStart(e.target.value); setPeriodFilter("custom"); }} className="mt-1" />
            </div>
            <div>
              <Label>To</Label>
              <Input type="date" value={customEnd} onChange={(e) => { setCustomEnd(e.target.value); setPeriodFilter("custom"); }} className="mt-1" />
            </div>
            <div>
              <Label>Category</Label>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {availableCategories.map((category) => (
                    <SelectItem key={category} value={category}>{category === "all" ? "All categories" : category}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Source</Label>
              <Select value={sourceFilter} onValueChange={setSourceFilter}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All sources</SelectItem>
                  <SelectItem value="manual">Manual</SelectItem>
                  <SelectItem value="gmail">Gmail</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Bank / Card</Label>
              <Select value={paymentFilter} onValueChange={setPaymentFilter}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All banks/cards</SelectItem>
                  <SelectItem value="none">No bank/card</SelectItem>
                  {bankAccounts.map((account) => (
                    <SelectItem key={account.id} value={`bank:${account.id}`}>{account.name}</SelectItem>
                  ))}
                  {creditCards.map((card) => (
                    <SelectItem key={card.id} value={`card:${card.id}`}>{card.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-4">
            <InsightCard title="Range Total" value={formatInr(filteredReport.total)} detail={`${filteredSpends.length} spends`} />
            <InsightCard title="Avg Active Day" value={formatInr(filteredReport.averagePerDay)} detail="days with spending" />
            <InsightCard title="Highest Day" value={filteredReport.topDay ? formatInr(filteredReport.topDay.amount) : "None"} detail={filteredReport.topDay?.label ?? "no spends"} />
            <InsightCard title="Top Merchant" value={filteredReport.topMerchant?.merchant ?? "None"} detail={filteredReport.topMerchant ? formatInr(filteredReport.topMerchant.amount) : "no spends"} />
          </div>
          <HistoryPanel data={filteredReport.dayRows} emptyLabel="No spends in this custom range." />
        </CardContent>
      </Card>

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
          <div className="mb-4 grid gap-3 md:grid-cols-[1fr_160px_180px_160px_220px]">
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
                <SelectItem value="custom">Custom range</SelectItem>
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
            <Select value={sourceFilter} onValueChange={setSourceFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Source" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sources</SelectItem>
                <SelectItem value="manual">Manual</SelectItem>
                <SelectItem value="gmail">Gmail</SelectItem>
              </SelectContent>
            </Select>
            <Select value={paymentFilter} onValueChange={setPaymentFilter}>
              <SelectTrigger>
                <CreditCard className="mr-2 h-4 w-4" />
                <SelectValue placeholder="Bank / Card" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All banks/cards</SelectItem>
                <SelectItem value="none">No bank/card</SelectItem>
                {bankAccounts.map((account) => (
                  <SelectItem key={account.id} value={`bank:${account.id}`}>{account.name}</SelectItem>
                ))}
                {creditCards.map((card) => (
                  <SelectItem key={card.id} value={`card:${card.id}`}>{card.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2 text-sm">
            <span className="text-muted-foreground">{filteredSpends.length} matching spends</span>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={clearFilters}>Clear</Button>
              <Button variant="outline" size="sm" onClick={exportFilteredSpends}>
                <Download className="mr-2 h-4 w-4" />
                Export
              </Button>
              <span className="font-mono font-semibold">{formatInr(filteredTotal)}</span>
            </div>
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
                      {new Date(spend.date).toLocaleDateString()} {spend.emailSubject ? `- ${spend.emailSubject}` : ""}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant={spend.source === "gmail" ? "secondary" : "outline"}>{spend.source}</Badge>
                      {spend.category && <Badge variant="outline">{spend.category}</Badge>}
                      {spend.bankAccount && <Badge variant="secondary">{spend.bankAccount.name}</Badge>}
                      {spend.creditCard && <Badge variant="secondary">{spend.creditCard.name}</Badge>}
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

function MoneyMetric({ label, value, detail, icon: Icon, featured }: any) {
  return (
    <div className={`rounded-lg border border-border/80 bg-background/55 p-3 ${featured ? "min-h-28" : ""}`}>
      <div className="flex items-start gap-3">
        {Icon && (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Icon className="h-5 w-5 text-primary" />
          </div>
        )}
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="mt-1 break-words font-display text-xl font-bold tracking-tight">{value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
        </div>
      </div>
    </div>
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

