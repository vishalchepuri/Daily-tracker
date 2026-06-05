"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Banknote, CalendarDays, CreditCard, Download, HandCoins, Landmark, Mail, Pencil, Plus, RefreshCw, Search, SlidersHorizontal, Sparkles, Target, Trash2, TrendingUp, WalletCards } from "lucide-react";
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
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { connectGoogleFeature } from "@/lib/google-feature-client";
import { getBankThemeStyle } from "@/lib/bank-colors";

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
  bankAccountId: "none",
  toBankAccountId: "none",
  date: new Date().toISOString().slice(0, 10),
  purpose: "",
  notes: "",
};

const blankFriendSpendForm = {
  person: "",
  notes: "",
};

const spendCategories = ["Food", "Groceries", "Travel", "Shopping", "Health", "Fitness", "Bills", "Subscriptions", "Entertainment", "Other"];

function formatInr(value: number) {
  return `INR ${Number(value || 0).toFixed(2)}`;
}

function moneyLinkOutstanding(link: any) {
  return Math.max(0, (link?.amount ?? 0) - (link?.settledAmount ?? 0));
}

function normalizePersonName(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
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
  const [spendsNextOffset, setSpendsNextOffset] = useState(0);
  const [spendsHasMore, setSpendsHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [connectingGmail, setConnectingGmail] = useState(false);
  const [targetMonthlySpend, setTargetMonthlySpend] = useState("");
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
  const [bankTransfers, setBankTransfers] = useState<any[]>([]);
  const [creditCards, setCreditCards] = useState<any[]>([]);
  const [moneyLinks, setMoneyLinks] = useState<any[]>([]);
  const [moneyLinksNextOffset, setMoneyLinksNextOffset] = useState(0);
  const [moneyLinksHasMore, setMoneyLinksHasMore] = useState(false);
  const [financeForm, setFinanceForm] = useState({ currentBalance: "", totalAmount: "" });
  const [cardDialogOpen, setCardDialogOpen] = useState(false);
  const [cardForm, setCardForm] = useState(blankCardForm);
  const [bankDialogOpen, setBankDialogOpen] = useState(false);
  const [bankForm, setBankForm] = useState(blankBankForm);
  const [moneyLinkForm, setMoneyLinkForm] = useState(blankMoneyLinkForm);
  const [moneyLinkPersonFilter, setMoneyLinkPersonFilter] = useState("all");
  const [friendSpendDialogOpen, setFriendSpendDialogOpen] = useState(false);
  const [friendSpendForm, setFriendSpendForm] = useState(blankFriendSpendForm);
  const [pendingFriendSpend, setPendingFriendSpend] = useState<any>(null);
  const [cardOthersDialog, setCardOthersDialog] = useState<{ cardName: string; rows: Array<{ person: string; amount: number }> } | null>(null);
  const [importHealth, setImportHealth] = useState<any>(null);
  const [flippedBankId, setFlippedBankId] = useState<string | null>(null);
  const [flippedCardId, setFlippedCardId] = useState<string | null>(null);
  const [settleDialog, setSettleDialog] = useState<any>(null);
  const [settleForm, setSettleForm] = useState({ amount: "", bankAccountId: "none" });
  const [settlingMoneyLink, setSettlingMoneyLink] = useState(false);
  const [cardSettleDialog, setCardSettleDialog] = useState<any>(null);
  const [cardSettleForm, setCardSettleForm] = useState({ amount: "", bankAccountId: "none" });
  const [settlingCard, setSettlingCard] = useState(false);
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [insightsDialogOpen, setInsightsDialogOpen] = useState(false);
  const [moneyLinksDialogOpen, setMoneyLinksDialogOpen] = useState(false);
  const [bankAccountsDialogOpen, setBankAccountsDialogOpen] = useState(false);
  const [creditCardsDialogOpen, setCreditCardsDialogOpen] = useState(false);
  const [moneyEntryDialogOpen, setMoneyEntryDialogOpen] = useState(false);
  const [spendFiltersDialogOpen, setSpendFiltersDialogOpen] = useState(false);
  const [targetDialogOpen, setTargetDialogOpen] = useState(false);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [transferHistoryDialogOpen, setTransferHistoryDialogOpen] = useState(false);

  const loadData = async () => {
    setLoading(true);
    fetch("/api/spends?offset=0&limit=50")
      .then((res) => res.ok ? res.json() : { spends: [] })
      .then((spendsData) => {
        setSpends(spendsData?.spends ?? []);
        setSpendsNextOffset(spendsData?.nextOffset ?? (spendsData?.spends ?? []).length);
        setSpendsHasMore(Boolean(spendsData?.hasMore));
      })
      .catch(console.error)
      .finally(() => setLoading(false));

    fetch("/api/spends/settings")
      .then((res) => res.ok ? res.json() : {})
      .then((settingsData: any) => {
        setTargetMonthlySpend(settingsData?.targetMonthlySpend ? String(settingsData.targetMonthlySpend) : "");
      })
      .catch(console.error);

    fetch("/api/finance")
      .then((res) => res.ok ? res.json() : { financeProfile: null })
      .then((financeData: any) => {
        setFinanceProfile(financeData?.financeProfile ?? null);
        setFinanceForm({
          currentBalance: financeData?.financeProfile?.currentBalance != null ? String(financeData.financeProfile.currentBalance) : "",
          totalAmount: financeData?.financeProfile?.totalAmount != null ? String(financeData.financeProfile.totalAmount) : "",
        });
      })
      .catch(console.error);

    fetch("/api/bank-accounts")
      .then((res) => res.ok ? res.json() : { bankAccounts: [] })
      .then((data) => {
        setBankAccounts(data?.bankAccounts ?? []);
        setBankTransfers(data?.transfers ?? []);
      })
      .catch(console.error);

    fetch("/api/credit-cards")
      .then((res) => res.ok ? res.json() : { creditCards: [] })
      .then((data) => setCreditCards(data?.creditCards ?? []))
      .catch(console.error);

    fetch("/api/money-links?offset=0&limit=50")
      .then((res) => res.ok ? res.json() : { moneyLinks: [] })
      .then((moneyLinksData) => {
        setMoneyLinks(moneyLinksData?.moneyLinks ?? []);
        setMoneyLinksNextOffset(moneyLinksData?.nextOffset ?? (moneyLinksData?.moneyLinks ?? []).length);
        setMoneyLinksHasMore(Boolean(moneyLinksData?.hasMore));
      })
      .catch(console.error);
  };

  useEffect(() => { loadData(); }, []);
  useEffect(() => {
    fetch("/api/import-health")
      .then((res) => res.ok ? res.json() : null)
      .then(setImportHealth)
      .catch(() => setImportHealth(null));
  }, []);

  const loadMoreSpends = async () => {
    try {
      const res = await fetch(`/api/spends?offset=${spendsNextOffset}&limit=50`);
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? "Failed to load more spends");
        return;
      }
      setSpends((prev) => [...prev, ...(data?.spends ?? [])]);
      setSpendsNextOffset(data?.nextOffset ?? spendsNextOffset + (data?.spends ?? []).length);
      setSpendsHasMore(Boolean(data?.hasMore));
    } catch {
      toast.error("Failed to load more spends");
    }
  };

  const loadMoreMoneyLinks = async () => {
    try {
      const res = await fetch(`/api/money-links?offset=${moneyLinksNextOffset}&limit=50`);
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? "Failed to load more lend/borrow");
        return;
      }
      setMoneyLinks((prev) => [...prev, ...(data?.moneyLinks ?? [])]);
      setMoneyLinksNextOffset(data?.nextOffset ?? moneyLinksNextOffset + (data?.moneyLinks ?? []).length);
      setMoneyLinksHasMore(Boolean(data?.hasMore));
    } catch {
      toast.error("Failed to load more lend/borrow");
    }
  };

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
    const totalLend = openLinks.filter((link) => link.type === "lend").reduce((sum, link) => sum + moneyLinkOutstanding(link), 0);
    const totalBorrow = openLinks.filter((link) => link.type === "borrow").reduce((sum, link) => sum + moneyLinkOutstanding(link), 0);
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

  const friendSpendLinks = useMemo(() => {
    const links = new Map<string, any>();
    moneyLinks.forEach((link) => {
      const match = String(link.notes ?? "").match(/Spend ID:\s*([A-Za-z0-9_-]+)/);
      if (match?.[1]) links.set(match[1], link);
    });
    return links;
  }, [moneyLinks]);

  const creditCardOwnership = useMemo(() => {
    const now = new Date();
    const legacyAgentCardLinks = moneyLinks.filter((link) => {
      const notes = String(link.notes ?? "");
      return (
        !link.settled &&
        link.type === "lend" &&
        (link.amount ?? 0) >= 10000 &&
        notes.includes("Parsed from Dayza Agent message") &&
        !notes.includes("Card ID:") &&
        !/cash\s+lend/i.test(notes)
      );
    });
    const bestLegacyCardId = (link: any) => {
      const amount = link.amount ?? 0;
      const candidates = creditCards
        .filter((card) => (card.currentDue ?? 0) >= amount)
        .map((card) => ({ id: card.id, remainder: (card.currentDue ?? 0) - amount }))
        .sort((a, b) => a.remainder - b.remainder);
      return candidates[0]?.id ?? null;
    };
    return creditCards.reduce((acc: Record<string, { total: number; mine: number; friends: number; friendNames: string[]; friendBreakdown: Array<{ person: string; amount: number }> }>, card) => {
      const cardFriendLinks = moneyLinks.filter((link) => {
        const notes = String(link.notes ?? "");
        const normalizedNotes = notes.toLowerCase();
        const normalizedCardName = String(card.name ?? "").toLowerCase();
        return (
          !link.settled &&
          link.type === "lend" &&
          (notes.includes(`Card ID: ${card.id}`) ||
            notes.includes(`Card: ${card.name}`) ||
            (normalizedCardName && normalizedNotes.includes(normalizedCardName)))
        );
      });
      const legacyCardFriendLinks = legacyAgentCardLinks.filter((link) => bestLegacyCardId(link) === card.id);
      const cardSpends = spends.filter((spend) => {
        const date = new Date(spend.date);
        return spend.creditCardId === card.id && date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
      });
      const friendNames = new Set<string>();
      const friendAmounts = new Map<string, number>();
      const addFriendAmount = (person: string, amount: number) => {
        friendNames.add(person);
        friendAmounts.set(person, (friendAmounts.get(person) ?? 0) + amount);
      };
      const totals = cardSpends.reduce(
        (sum, spend) => {
          const link = friendSpendLinks.get(spend.id);
          if (link && !link.settled) {
            addFriendAmount(link.person, spend.amount ?? 0);
            return { ...sum, friends: sum.friends + (spend.amount ?? 0) };
          }
          return { ...sum, mine: sum.mine + (spend.amount ?? 0) };
        },
        { mine: 0, friends: 0 }
      );
      const cardLinkFriends = cardFriendLinks.reduce((sum, link) => {
        addFriendAmount(link.person, link.amount ?? 0);
        return sum + (link.amount ?? 0);
      }, 0);
      const legacyLinkFriends = legacyCardFriendLinks.reduce((sum, link) => {
        addFriendAmount(link.person, link.amount ?? 0);
        return sum + (link.amount ?? 0);
      }, 0);
      totals.friends += cardLinkFriends + legacyLinkFriends;
      totals.mine = Math.max(0, totals.mine - cardLinkFriends - legacyLinkFriends);
      const spendTotal = totals.mine + totals.friends;
      const billTotal = Math.max(spendTotal, card.currentDue ?? 0);
      acc[card.id] = {
        total: billTotal,
        mine: Math.max(0, billTotal - totals.friends),
        friends: totals.friends,
        friendNames: Array.from(friendNames),
        friendBreakdown: Array.from(friendAmounts.entries())
          .map(([person, amount]) => ({ person, amount }))
          .sort((a, b) => b.amount - a.amount),
      };
      return acc;
    }, {});
  }, [creditCards, friendSpendLinks, moneyLinks, spends]);

  const moneyLinkPeople = useMemo(() => {
    const people = new Map<string, string>();
    moneyLinks.forEach((link) => {
      const person = normalizePersonName(link.person);
      if (!person) return;
      const key = person.toLocaleLowerCase();
      if (!people.has(key)) people.set(key, person);
    });
    return Array.from(people.values()).sort((a, b) => a.localeCompare(b));
  }, [moneyLinks]);

  const filteredMoneyLinks = useMemo(() => {
    if (moneyLinkPersonFilter === "all") return moneyLinks;
    const selected = normalizePersonName(moneyLinkPersonFilter).toLocaleLowerCase();
    return moneyLinks.filter((link) => normalizePersonName(link.person).toLocaleLowerCase() === selected);
  }, [moneyLinkPersonFilter, moneyLinks]);

  const moneyLinkFilterTotals = useMemo(() => {
    const openLinks = filteredMoneyLinks.filter((link) => !link.settled);
    const totalLend = openLinks.filter((link) => link.type === "lend").reduce((sum, link) => sum + moneyLinkOutstanding(link), 0);
    const totalBorrow = openLinks.filter((link) => link.type === "borrow").reduce((sum, link) => sum + moneyLinkOutstanding(link), 0);
    const settled = filteredMoneyLinks.filter((link) => link.settled).length;
    return {
      totalLend,
      totalBorrow,
      net: totalLend - totalBorrow,
      openCount: openLinks.length,
      settledCount: settled,
    };
  }, [filteredMoneyLinks]);

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
      const data = await res.json();
      toast.success(form.id ? "Spend updated" : "Spend added");
      setDialogOpen(false);
      if (!form.id && form.creditCardId !== "none" && data?.spend) {
        setPendingFriendSpend(data.spend);
        setFriendSpendForm(blankFriendSpendForm);
        setFriendSpendDialogOpen(true);
      }
      loadData();
    } catch {
      toast.error("Failed to save spend");
    }
  };

  const saveFriendSpendLink = async () => {
    if (!pendingFriendSpend) {
      setFriendSpendDialogOpen(false);
      return;
    }
    if (!friendSpendForm.person.trim()) {
      setFriendSpendDialogOpen(false);
      setPendingFriendSpend(null);
      setFriendSpendForm(blankFriendSpendForm);
      return;
    }

    const cardName = pendingFriendSpend.creditCard?.name ? ` on ${pendingFriendSpend.creditCard.name}` : "";
    const baseNote = `${pendingFriendSpend.merchant}${cardName}. Spend ID: ${pendingFriendSpend.id}`;
    const notes = [baseNote, friendSpendForm.notes.trim()].filter(Boolean).join(" - ");

    try {
      const res = await fetch("/api/money-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          person: friendSpendForm.person.trim(),
          type: "lend",
          amount: pendingFriendSpend.amount,
          currency: pendingFriendSpend.currency || "INR",
          date: new Date(pendingFriendSpend.date ?? Date.now()).toISOString().slice(0, 10),
          notes,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? "Failed to add lend entry");
        return;
      }
      toast.success(`Added lend entry for ${friendSpendForm.person.trim()}`);
      setFriendSpendDialogOpen(false);
      setPendingFriendSpend(null);
      setFriendSpendForm(blankFriendSpendForm);
      loadData();
    } catch {
      toast.error("Failed to add lend entry");
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
      const res = await fetch(`/api/spends?id=${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? "Failed to remove spend");
        return;
      }
      toast.success("Spend removed", {
        action: {
          label: "Undo",
          onClick: async () => {
            const restoreRes = await fetch("/api/spends", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ restoreSpend: data.deletedSpend, restoreMoneyLinks: data.deletedMoneyLinks ?? [] }),
            });
            const restoreData = await restoreRes.json();
            if (!restoreRes.ok) {
              toast.error(restoreData?.error ?? "Could not restore spend");
              return;
            }
            toast.success("Spend restored");
            loadData();
          },
        },
      });
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

  const openSettleCard = (card: any, full = false) => {
    const due = Math.max(0, card?.currentDue ?? 0);
    setCardSettleDialog(card);
    setCardSettleForm({ amount: full ? String(due || "") : "", bankAccountId: "none" });
  };

  const settleCreditCard = async (full = false) => {
    if (!cardSettleDialog?.id) return;
    const amount = full ? Math.max(0, cardSettleDialog.currentDue ?? 0) : Number(cardSettleForm.amount);
    if (!amount || amount <= 0) {
      toast.error("Enter card payment amount");
      return;
    }
    if (!cardSettleForm.bankAccountId || cardSettleForm.bankAccountId === "none") {
      toast.error("Choose bank account for card payment");
      return;
    }
    setSettlingCard(true);
    try {
      const res = await fetch("/api/credit-cards", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: cardSettleDialog.id, settleAmount: amount, settleFull: full, bankAccountId: cardSettleForm.bankAccountId }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? "Failed to settle card");
        return;
      }
      setCreditCards((prev) => prev.map((card) => card.id === data.creditCard.id ? data.creditCard : card));
      setCardSettleDialog(null);
      setCardSettleForm({ amount: "", bankAccountId: "none" });
      loadData();
      toast.success(full ? "Credit card fully settled" : "Credit card payment recorded");
    } catch {
      toast.error("Failed to settle card");
    } finally {
      setSettlingCard(false);
    }
  };

  const saveMoneyLink = async () => {
    const person = normalizePersonName(moneyLinkForm.person);
    const isSpendEntry = moneyLinkForm.type === "spend";
    const isTransferEntry = moneyLinkForm.type === "transfer";
    const purpose = moneyLinkForm.purpose.trim();
    const notes = moneyLinkForm.notes.trim();
    if (!isTransferEntry && !isSpendEntry && !person) {
      toast.error("Person is required");
      return;
    }
    if (!moneyLinkForm.amount) {
      toast.error("Amount is required");
      return;
    }
    if (isSpendEntry && !purpose && !person) {
      toast.error("Enter what you spent on");
      return;
    }
    if (isTransferEntry && (!moneyLinkForm.bankAccountId || moneyLinkForm.bankAccountId === "none" || !moneyLinkForm.toBankAccountId || moneyLinkForm.toBankAccountId === "none")) {
      toast.error("Choose both bank accounts");
      return;
    }
    if (isTransferEntry && moneyLinkForm.bankAccountId === moneyLinkForm.toBankAccountId) {
      toast.error("Choose different bank accounts");
      return;
    }
    if (moneyLinkForm.type === "lend" && (!moneyLinkForm.bankAccountId || moneyLinkForm.bankAccountId === "none")) {
      toast.error("Choose the bank account used for this transaction");
      return;
    }
    try {
      const res = isTransferEntry
        ? await fetch("/api/bank-accounts", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              transfer: true,
              fromBankAccountId: moneyLinkForm.bankAccountId,
              toBankAccountId: moneyLinkForm.toBankAccountId,
              amount: moneyLinkForm.amount,
              notes: [moneyLinkForm.person.trim(), moneyLinkForm.purpose.trim(), notes].filter(Boolean).join(" - "),
              date: moneyLinkForm.date,
            }),
          })
        : isSpendEntry
        ? await fetch("/api/spends", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              merchant: purpose || person,
              amount: moneyLinkForm.amount,
              currency: moneyLinkForm.currency,
              category: "Other",
              date: moneyLinkForm.date,
              notes,
              bankAccountId: moneyLinkForm.bankAccountId,
              creditCardId: "none",
            }),
          })
        : await fetch("/api/money-links", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...moneyLinkForm,
              person,
              notes: [purpose ? `Spent for: ${purpose}` : "", notes].filter(Boolean).join(" - "),
              createSpendFromBorrow: moneyLinkForm.type === "borrow" && moneyLinkForm.bankAccountId === "none",
              spendMerchant: purpose || `Borrowed from ${person}`,
              spendCategory: "Other",
            }),
          });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? (isTransferEntry ? "Failed to transfer money" : isSpendEntry ? "Failed to save spend" : "Failed to save lend/borrow"));
        return;
      }
      toast.success(isTransferEntry ? "Transfer recorded" : isSpendEntry ? "Spend added" : moneyLinkForm.type === "lend" ? "Lend entry added" : "Borrow entry added");
      setMoneyLinkForm(blankMoneyLinkForm);
      setMoneyEntryDialogOpen(false);
      loadData();
    } catch {
      toast.error(isTransferEntry ? "Failed to transfer money" : isSpendEntry ? "Failed to save spend" : "Failed to save lend/borrow");
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

  const openSettleMoneyLink = (link: any) => {
    const remaining = moneyLinkOutstanding(link);
    setSettleDialog(link);
    setSettleForm({ amount: String(remaining || ""), bankAccountId: "none" });
  };

  const settleMoneyLink = async () => {
    if (!settleDialog?.id) return;
    if (!settleForm.amount || Number(settleForm.amount) <= 0) {
      toast.error("Enter settlement amount");
      return;
    }
    if (!settleForm.bankAccountId || settleForm.bankAccountId === "none") {
      toast.error("Choose bank account for settlement");
      return;
    }
    setSettlingMoneyLink(true);
    try {
      const res = await fetch("/api/money-links", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: settleDialog.id, settleAmount: settleForm.amount, bankAccountId: settleForm.bankAccountId }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? "Failed to settle");
        return;
      }
      setMoneyLinks((prev) => prev.map((item) => item.id === data.moneyLink.id ? data.moneyLink : item));
      setSettleDialog(null);
      setSettleForm({ amount: "", bankAccountId: "none" });
      loadData();
      toast.success("Settlement recorded");
    } catch {
      toast.error("Failed to settle");
    } finally {
      setSettlingMoneyLink(false);
    }
  };

  const importGmail = async () => {
    setImporting(true);
    try {
      const res = await fetch("/api/spends/gmail-import", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        if (data?.needsConnection) {
          toast.error(data?.error ?? "Connect Gmail first");
          return;
        }
        toast.error(data?.error ?? "Gmail import failed");
        return;
      }
      const reviewed = data.summary.filteredOut ?? 0;
      toast.success(`Imported ${data.summary.imported} spends. ${reviewed ? `${reviewed} skipped or sent to Review. ` : ""}Scanned ${data.summary.scanned} emails.`);
      loadData();
      fetch("/api/import-health").then((res) => res.ok ? res.json() : null).then(setImportHealth).catch(() => {});
    } catch {
      toast.error("Gmail import failed");
    } finally {
      setImporting(false);
    }
  };

  const connectGmail = async () => {
    setConnectingGmail(true);
    try {
      await connectGoogleFeature("https://www.googleapis.com/auth/gmail.readonly");
      toast.success("Gmail connected");
      await loadData();
    } catch (error: any) {
      toast.error(error?.message ?? "Could not connect Gmail");
    } finally {
      setConnectingGmail(false);
    }
  };

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
              onClick={connectGmail}
              loading={connectingGmail}
              disabled={connectingGmail}
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
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
            <Dialog open={Boolean(cardOthersDialog)} onOpenChange={(open) => !open && setCardOthersDialog(null)}>
              <DialogContent className="max-w-md">
                <DialogHeader><DialogTitle>Others on {cardOthersDialog?.cardName}</DialogTitle></DialogHeader>
                <div className="space-y-2">
                  {(cardOthersDialog?.rows ?? []).map((row) => (
                    <div key={row.person} className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2">
                      <span className="font-medium">{row.person}</span>
                      <span className="font-mono">{formatInr(row.amount)}</span>
                    </div>
                  ))}
                  {(cardOthersDialog?.rows ?? []).length === 0 && (
                    <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">No others for this card.</div>
                  )}
                </div>
              </DialogContent>
            </Dialog>
            <Dialog open={Boolean(cardSettleDialog)} onOpenChange={(open) => !open && setCardSettleDialog(null)}>
              <DialogContent className="max-w-md">
                <DialogHeader><DialogTitle>Settle {cardSettleDialog?.name}</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <div className="rounded-lg bg-muted/40 p-3 text-sm">
                    <p className="text-muted-foreground">Current due</p>
                    <p className="font-mono text-lg font-semibold">{formatInr(cardSettleDialog?.currentDue ?? 0)}</p>
                  </div>
                  <div>
                    <Label>Amount paid</Label>
                    <Input type="number" value={cardSettleForm.amount} onChange={(e) => setCardSettleForm({ ...cardSettleForm, amount: e.target.value })} className="mt-1" />
                  </div>
                  <div>
                    <Label>Paid from bank account</Label>
                    <Select value={cardSettleForm.bankAccountId} onValueChange={(bankAccountId) => setCardSettleForm({ ...cardSettleForm, bankAccountId })}>
                      <SelectTrigger className="mt-1"><SelectValue placeholder="Select account" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Select bank account</SelectItem>
                        {bankAccounts.map((account) => (
                          <SelectItem key={account.id} value={account.id}>
                            {account.name}{account.last4 ? ` - ${account.last4}` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="outline" onClick={() => settleCreditCard(false)} loading={settlingCard} disabled={settlingCard}>Settle amount</Button>
                    <Button onClick={() => settleCreditCard(true)} loading={settlingCard} disabled={settlingCard}>Settle full</Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
            <Dialog open={Boolean(settleDialog)} onOpenChange={(open) => !open && setSettleDialog(null)}>
              <DialogContent className="max-w-md">
                <DialogHeader><DialogTitle>Settle {settleDialog?.person}</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <div className="rounded-lg bg-muted/40 p-3 text-sm">
                    <p className="text-muted-foreground">Remaining</p>
                    <p className="font-mono text-lg font-semibold">{formatInr(moneyLinkOutstanding(settleDialog))}</p>
                  </div>
                  <div>
                    <Label>Amount received / paid</Label>
                    <Input type="number" value={settleForm.amount} onChange={(e) => setSettleForm({ ...settleForm, amount: e.target.value })} className="mt-1" />
                  </div>
                  <div>
                    <Label>Bank account</Label>
                    <Select value={settleForm.bankAccountId} onValueChange={(bankAccountId) => setSettleForm({ ...settleForm, bankAccountId })}>
                      <SelectTrigger className="mt-1"><SelectValue placeholder="Select account" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Select bank account</SelectItem>
                        {bankAccounts.map((account) => (
                          <SelectItem key={account.id} value={account.id}>
                            {account.name}{account.last4 ? ` - ${account.last4}` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button className="w-full" onClick={settleMoneyLink} loading={settlingMoneyLink} disabled={settlingMoneyLink}>Save settlement</Button>
                </div>
              </DialogContent>
            </Dialog>
            <Dialog
              open={friendSpendDialogOpen}
              onOpenChange={(open) => {
                setFriendSpendDialogOpen(open);
                if (!open) {
                  setPendingFriendSpend(null);
                  setFriendSpendForm(blankFriendSpendForm);
                }
              }}
            >
              <DialogContent className="max-w-md">
                <DialogHeader><DialogTitle>Who used this credit card?</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <div className="rounded-lg bg-muted/40 p-3 text-sm">
                    <p className="font-medium">{pendingFriendSpend?.merchant ?? "Card spend"}</p>
                    <p className="text-muted-foreground">
                      {pendingFriendSpend?.currency ?? "INR"} {Number(pendingFriendSpend?.amount ?? 0).toFixed(2)}
                      {pendingFriendSpend?.creditCard?.name ? ` on ${pendingFriendSpend.creditCard.name}` : ""}
                    </p>
                  </div>
                  <div>
                    <Label>Friend name</Label>
                    <Input
                      value={friendSpendForm.person}
                      onChange={(e) => setFriendSpendForm({ ...friendSpendForm, person: e.target.value })}
                      className="mt-1"
                      placeholder="Dayza, Rahul, Priya..."
                    />
                  </div>
                  <div>
                    <Label>Note</Label>
                    <Input
                      value={friendSpendForm.notes}
                      onChange={(e) => setFriendSpendForm({ ...friendSpendForm, notes: e.target.value })}
                      className="mt-1"
                      placeholder="Dinner, cab, shared order..."
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="outline" onClick={() => setFriendSpendDialogOpen(false)}>Ignore</Button>
                    <Button onClick={saveFriendSpendLink}>Add To Lend</Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </FadeIn>

      {importHealth?.gmail && (
        <div className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm ${importHealth.gmail.needsReconnect ? "border-amber-500/40 bg-amber-500/10" : "border-primary/20 bg-primary/5"}`}>
          <div className="flex min-w-0 items-center gap-2">
            {importHealth.gmail.needsReconnect ? <AlertCircle className="h-4 w-4 shrink-0 text-amber-400" /> : <Mail className="h-4 w-4 shrink-0 text-primary" />}
            <span className="truncate font-medium">Gmail: {importHealth.gmail.label}</span>
          </div>
            {importHealth.gmail.needsReconnect && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-2"
                onClick={connectGmail}
                loading={connectingGmail}
                disabled={connectingGmail}
              >
                Reconnect
              </Button>
            )}
        </div>
      )}

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
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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

          <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-[1fr_1fr]">
            <div className="space-y-3 rounded-xl border border-border/80 bg-muted/10 p-3 sm:p-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-semibold">Bank Accounts</h3>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={openAddBank}><Plus className="mr-2 h-4 w-4" />Add</Button>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-muted/30 p-3">
                <div>
                  <p className="text-xs text-muted-foreground">Total balance</p>
                  <p className="font-mono text-lg font-semibold">{formatInr(financeTotals.totalBankBalance)}</p>
                  <p className="text-xs text-muted-foreground">{bankAccounts.length} accounts</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Dialog open={bankAccountsDialogOpen} onOpenChange={setBankAccountsDialogOpen}>
                    <DialogTrigger asChild>
                      <Button type="button" size="sm" variant="outline"><Landmark className="mr-2 h-4 w-4" />Accounts</Button>
                    </DialogTrigger>
                    <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
                      <DialogHeader><DialogTitle>Bank Accounts</DialogTitle></DialogHeader>
                      {bankAccounts.length === 0 ? (
                        <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No bank accounts added yet.</div>
                      ) : (
                        <div className="grid gap-3">
                          {bankAccounts.map((account) => {
                            const institutionName = account.bankName || account.name;
                            return (
                              <div key={account.id} style={getBankThemeStyle(institutionName)} className="min-w-0 rounded-xl border p-4 text-left shadow-sm">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <p className="truncate font-semibold">{account.name}</p>
                                    <p className="text-xs capitalize text-muted-foreground">{account.bankName || "Bank account"}{account.last4 ? ` - ${account.last4}` : ""}</p>
                                  </div>
                                  <div className="flex shrink-0 gap-1">
                                    <Button variant="ghost" size="icon" onClick={() => openEditBank(account)} title="Edit bank account"><Pencil className="h-4 w-4" /></Button>
                                    <Button variant="ghost" size="icon" onClick={() => deleteBank(account.id)} title="Delete bank account"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                                  </div>
                                </div>
                                <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                                  <div><span className="text-muted-foreground">Balance</span><p className="font-mono">{formatInr(account.balance ?? 0)}</p></div>
                                  <div><span className="text-muted-foreground">Type</span><p className="capitalize">{account.accountType}</p></div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </DialogContent>
                  </Dialog>
                  <Dialog open={transferHistoryDialogOpen} onOpenChange={setTransferHistoryDialogOpen}>
                    <DialogTrigger asChild>
                      <Button type="button" size="sm" variant="outline"><RefreshCw className="mr-2 h-4 w-4" />Transfers</Button>
                    </DialogTrigger>
                    <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
                      <DialogHeader><DialogTitle>Transfer History</DialogTitle></DialogHeader>
                      <div className="space-y-3">
                        {bankTransfers.length === 0 ? (
                          <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No bank transfers recorded yet.</div>
                        ) : bankTransfers.map((transfer) => (
                          <div key={transfer.id} className="rounded-xl bg-muted/40 p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate font-medium">{transfer.fromAccount?.name ?? "From account"} to {transfer.toAccount?.name ?? "To account"}</p>
                                <p className="text-xs text-muted-foreground">{new Date(transfer.date).toLocaleDateString()} {transfer.notes ? `- ${transfer.notes}` : ""}</p>
                              </div>
                              <p className="shrink-0 font-mono text-sm">{formatInr(transfer.amount ?? 0)}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>
            </div>

            <div className="space-y-3 rounded-xl border border-border/80 bg-muted/10 p-3 sm:p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold">Credit Cards</h3>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={openAddCard}><Plus className="mr-2 h-4 w-4" />Add</Button>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-muted/30 p-3">
                <div>
                  <p className="text-xs text-muted-foreground">Current due</p>
                  <p className="font-mono text-lg font-semibold">{formatInr(financeTotals.currentCardDue)}</p>
                  <p className="text-xs text-muted-foreground">{creditCards.length} cards</p>
                </div>
                <Dialog open={creditCardsDialogOpen} onOpenChange={setCreditCardsDialogOpen}>
                  <DialogTrigger asChild>
                    <Button type="button" size="sm" variant="outline"><CreditCard className="mr-2 h-4 w-4" />Cards</Button>
                  </DialogTrigger>
                  <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
                    <DialogHeader><DialogTitle>Credit Cards</DialogTitle></DialogHeader>
                    {creditCards.length === 0 ? (
                      <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No credit cards added yet.</div>
                    ) : (
                      <div className="grid gap-3">
                        {creditCards.map((card) => {
                          const ownership = creditCardOwnership[card.id] ?? { total: 0, mine: 0, friends: 0, friendNames: [], friendBreakdown: [] };
                          const institutionName = card.bankName || card.name;
                          return (
                            <div key={card.id} style={getBankThemeStyle(institutionName)} className="min-w-0 rounded-xl border p-4 text-left shadow-sm">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="truncate font-semibold">{card.name}</p>
                                  <p className="text-xs text-muted-foreground">{card.bankName || "Credit card"}{card.last4 ? ` - ${card.last4}` : ""}</p>
                                </div>
                                <div className="flex shrink-0 gap-1">
                                  <Button variant="ghost" size="icon" onClick={() => openEditCard(card)} title="Edit card"><Pencil className="h-4 w-4" /></Button>
                                  <Button variant="ghost" size="icon" onClick={() => deleteCard(card.id)} title="Delete card"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                                </div>
                              </div>
                              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                                <div><span className="text-muted-foreground">Current due</span><p className="font-mono">{formatInr(card.currentDue ?? 0)}</p></div>
                                <div><span className="text-muted-foreground">Due day</span><p>{card.dueDay || "-"}</p></div>
                                <div><span className="text-muted-foreground">Mine</span><p className="font-mono">{formatInr(ownership.mine)}</p></div>
                                <div><span className="text-muted-foreground">Others</span><p className="font-mono">{formatInr(ownership.friends)}</p></div>
                              </div>
                              <div className="mt-3 flex flex-wrap gap-2">
                                {ownership.friendBreakdown.length > 0 && (
                                  <Button type="button" variant="outline" size="sm" onClick={() => setCardOthersDialog({ cardName: card.name, rows: ownership.friendBreakdown })}>View Others</Button>
                                )}
                                {(card.currentDue ?? 0) > 0 && (
                                  <Button type="button" variant="outline" size="sm" onClick={() => openSettleCard(card)}>Settle</Button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </DialogContent>
                </Dialog>
              </div>
            </div>

            <div className="space-y-4 rounded-xl border border-border/80 bg-muted/10 p-3 sm:p-4 lg:col-span-2 2xl:col-span-2">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/80 bg-background/30 p-3 sm:p-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium">Money Entry</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {moneyLinkFilterTotals.openCount} open · Net <span className="font-mono text-foreground">{formatInr(moneyLinkFilterTotals.net)}</span>
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Dialog open={moneyEntryDialogOpen} onOpenChange={setMoneyEntryDialogOpen}>
                    <DialogTrigger asChild>
                      <Button type="button" size="sm"><Plus className="mr-2 h-4 w-4" />Add Entry</Button>
                    </DialogTrigger>
                    <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
                      <DialogHeader><DialogTitle>Add Money Entry</DialogTitle></DialogHeader>
                      <div className="grid gap-3 md:grid-cols-2">
                        <div>
                          <Input list="money-link-people" placeholder={moneyLinkForm.type === "transfer" ? "Transfer note (optional)" : moneyLinkForm.type === "spend" ? "Merchant / place (optional)" : "Person"} value={moneyLinkForm.person} onChange={(e) => setMoneyLinkForm({ ...moneyLinkForm, person: e.target.value })} />
                          <datalist id="money-link-people">
                            {moneyLinkPeople.map((person) => (
                              <option key={person} value={person} />
                            ))}
                          </datalist>
                        </div>
                        <Input type="number" placeholder="Amount" value={moneyLinkForm.amount} onChange={(e) => setMoneyLinkForm({ ...moneyLinkForm, amount: e.target.value })} />
                        <Select value={moneyLinkForm.type} onValueChange={(type) => setMoneyLinkForm({ ...moneyLinkForm, type })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="lend">I lent money</SelectItem>
                            <SelectItem value="borrow">I borrowed money</SelectItem>
                            <SelectItem value="spend">I spent money</SelectItem>
                            <SelectItem value="transfer">Transfer between banks</SelectItem>
                          </SelectContent>
                        </Select>
                        <Select value={moneyLinkForm.bankAccountId} onValueChange={(bankAccountId) => setMoneyLinkForm({ ...moneyLinkForm, bankAccountId })}>
                          <SelectTrigger><SelectValue placeholder={moneyLinkForm.type === "transfer" ? "From account" : moneyLinkForm.type === "lend" ? "Bank account" : "Optional bank account"} /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">{moneyLinkForm.type === "transfer" ? "From account" : moneyLinkForm.type === "lend" ? "Select bank account" : "No bank account"}</SelectItem>
                            {bankAccounts.map((account) => (
                              <SelectItem key={account.id} value={account.id}>
                                {account.name}{account.last4 ? ` - ${account.last4}` : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {moneyLinkForm.type === "transfer" && (
                          <Select value={moneyLinkForm.toBankAccountId} onValueChange={(toBankAccountId) => setMoneyLinkForm({ ...moneyLinkForm, toBankAccountId })}>
                            <SelectTrigger><SelectValue placeholder="To account" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">To account</SelectItem>
                              {bankAccounts.map((account) => (
                                <SelectItem key={account.id} value={account.id}>
                                  {account.name}{account.last4 ? ` - ${account.last4}` : ""}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                        <Input type="date" value={moneyLinkForm.date} onChange={(e) => setMoneyLinkForm({ ...moneyLinkForm, date: e.target.value })} />
                        <Input className="md:col-span-2" placeholder={moneyLinkForm.type === "transfer" ? "Purpose (optional)" : moneyLinkForm.type === "spend" ? "Spent on" : moneyLinkForm.type === "borrow" ? "Spent for / borrowed for" : "Reason / spent for"} value={moneyLinkForm.purpose} onChange={(e) => setMoneyLinkForm({ ...moneyLinkForm, purpose: e.target.value })} />
                        <Input className="md:col-span-2" placeholder="Notes" value={moneyLinkForm.notes} onChange={(e) => setMoneyLinkForm({ ...moneyLinkForm, notes: e.target.value })} />
                        <Button className="md:col-span-2" onClick={saveMoneyLink}><Plus className="mr-2 h-4 w-4" />{moneyLinkForm.type === "transfer" ? "Record Transfer" : moneyLinkForm.type === "spend" ? "Add Spend" : "Add Entry"}</Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                  <Dialog open={moneyLinksDialogOpen} onOpenChange={setMoneyLinksDialogOpen}>
                    <DialogTrigger asChild>
                      <Button type="button" size="sm" variant="outline">
                        <HandCoins className="mr-2 h-4 w-4" />
                        Entries
                      </Button>
                    </DialogTrigger>
                  <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
                    <DialogHeader><DialogTitle>Lend / Borrow Entries</DialogTitle></DialogHeader>
                    <div className="space-y-4">
                      <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
                        <div>
                          <Label>Filter person</Label>
                          <Select value={moneyLinkPersonFilter} onValueChange={setMoneyLinkPersonFilter}>
                            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">All people</SelectItem>
                              {moneyLinkPeople.map((person) => (
                                <SelectItem key={person} value={person}>{person}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <Button type="button" variant="outline" onClick={() => setMoneyLinkPersonFilter("all")}>Clear</Button>
                      </div>
                      <div className="grid gap-3 text-sm sm:grid-cols-3">
                        <div className="rounded-lg bg-muted/40 p-3">
                          <span className="text-muted-foreground">Lent</span>
                          <p className="font-mono">{formatInr(moneyLinkFilterTotals.totalLend)}</p>
                        </div>
                        <div className="rounded-lg bg-muted/40 p-3">
                          <span className="text-muted-foreground">Borrowed</span>
                          <p className="font-mono">{formatInr(moneyLinkFilterTotals.totalBorrow)}</p>
                        </div>
                        <div className="rounded-lg bg-muted/40 p-3">
                          <span className="text-muted-foreground">Net</span>
                          <p className="font-mono">{formatInr(moneyLinkFilterTotals.net)}</p>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {moneyLinkFilterTotals.openCount} open, {moneyLinkFilterTotals.settledCount} settled
                      </p>
                      <div className="grid gap-3">
                        {moneyLinks.length === 0 ? (
                          <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No lend or borrow entries yet.</div>
                        ) : filteredMoneyLinks.length === 0 ? (
                          <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No entries match this person.</div>
                        ) : filteredMoneyLinks.map((link) => (
                          <div key={link.id} className={`grid gap-3 rounded-xl bg-muted/40 p-3 sm:grid-cols-[1fr_auto] sm:items-center sm:p-4 ${link.settled ? "opacity-60" : ""}`}>
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="font-medium">{link.person}</p>
                                <Badge variant={link.type === "lend" ? "secondary" : "outline"}>{link.type === "lend" ? "Lent" : "Borrowed"}</Badge>
                                {link.settled && <Badge variant="outline">Settled</Badge>}
                              </div>
                              <p className="text-xs text-muted-foreground">{new Date(link.date).toLocaleDateString()} {link.bankAccount?.name ? `- ${link.bankAccount.name}` : ""} {link.notes ? `- ${link.notes}` : ""}</p>
                              {(link.settledAmount ?? 0) > 0 && <p className="text-xs text-muted-foreground">Settled {formatInr(link.settledAmount)} / {formatInr(link.amount ?? 0)}</p>}
                            </div>
                            <div className="flex items-center justify-between gap-1 sm:justify-end">
                              <span className="font-mono text-sm">{formatInr(moneyLinkOutstanding(link))}</span>
                              {!link.settled && <Button variant="ghost" size="sm" onClick={() => openSettleMoneyLink(link)}>Settle</Button>}
                              <Button variant="ghost" size="icon" onClick={() => deleteMoneyLink(link.id)} title="Delete entry"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                            </div>
                          </div>
                        ))}
                        {moneyLinksHasMore && moneyLinkPersonFilter === "all" && (
                          <Button type="button" variant="outline" onClick={loadMoreMoneyLinks}>Load more lend / borrow</Button>
                        )}
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Target className="h-4 w-4 text-primary" />
                <h3 className="font-semibold">Monthly Target</h3>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {totals.target > 0
                  ? `${formatInr(totals.remaining)} remaining from ${formatInr(totals.target)}`
                  : "Set a monthly spend target to track budget progress."}
              </p>
            </div>
            <Dialog open={targetDialogOpen} onOpenChange={setTargetDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <Pencil className="mr-2 h-4 w-4" />
                  Target
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader><DialogTitle>Monthly Target</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <div className="rounded-lg bg-muted/40 p-3">
                    <p className="text-xs text-muted-foreground">Saved target</p>
                    <p className="font-mono text-lg font-semibold">{totals.target ? formatInr(totals.target) : "Not set"}</p>
                  </div>
                  <div>
                    <Label>Monthly target</Label>
                    <Input type="number" value={targetMonthlySpend} onChange={(e) => setTargetMonthlySpend(e.target.value)} placeholder="Monthly target" className="mt-1" />
                  </div>
                  <Button onClick={async () => { await saveTarget(); setTargetDialogOpen(false); }} disabled={targetSaving} className="w-full">{targetSaving ? "Saving" : "Save Target"}</Button>
                </div>
              </DialogContent>
            </Dialog>
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

      <div className="grid gap-3 rounded-xl border border-border/80 bg-muted/10 p-3 text-sm sm:grid-cols-4">
        <div><span className="text-muted-foreground">This month</span><p className="font-mono font-semibold">{formatInr(totals.total)}</p></div>
        <div><span className="text-muted-foreground">Remaining</span><p className="font-mono font-semibold">{totals.target ? formatInr(totals.remaining) : "Set"}</p></div>
        <div><span className="text-muted-foreground">Imported</span><p className="font-mono font-semibold">{totals.gmail}</p></div>
        <div><span className="text-muted-foreground">Manual</span><p className="font-mono font-semibold">{totals.manual}</p></div>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              <h3 className="font-semibold">Spend Insights</h3>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Daily {formatInr(totals.dailyAverage)} · Projected {formatInr(totals.projected)}
            </p>
          </div>
          <Dialog open={insightsDialogOpen} onOpenChange={setInsightsDialogOpen}>
            <DialogTrigger asChild>
              <Button type="button" size="sm" variant="outline">
                <TrendingUp className="mr-2 h-4 w-4" />
                Insights
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
              <DialogHeader><DialogTitle>Spend Insights</DialogTitle></DialogHeader>
              <div className="grid gap-3 md:grid-cols-2">
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
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>

      <Card className="border-primary/30">
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <h3 className="font-semibold">Custom Spend Report</h3>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {formatInr(filteredReport.total)} across {filteredSpends.length} spends
            </p>
          </div>
          <Dialog open={reportDialogOpen} onOpenChange={setReportDialogOpen}>
            <DialogTrigger asChild>
              <Button type="button" size="sm" variant="outline">
                <Sparkles className="mr-2 h-4 w-4" />
                Report
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[85vh] max-w-4xl overflow-y-auto">
              <DialogHeader><DialogTitle>Custom Spend Report</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-[1fr_1fr_160px_160px_220px]">
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
              </div>
            </DialogContent>
          </Dialog>
          </div>
          {categoryTotals.length > 0 && (
            <div className="grid gap-4 rounded-xl bg-muted/20 p-3 lg:grid-cols-[240px_1fr] lg:items-center">
              <div className="mx-auto h-[180px] w-[180px] shrink-0 sm:h-[220px] sm:w-[220px] lg:mx-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={categoryTotals} dataKey="amount" nameKey="category" cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={3} strokeWidth={0}>
                      {categoryTotals.map((_: any, i: number) => <Cell key={i} fill={["#10b981", "#3b82f6", "#f97316", "#8b5cf6", "#ec4899", "#f59e0b", "#14b8a6", "#ef4444"][i % 8]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 13 }} formatter={(v: any) => [formatInr(v), "Amount"]} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-2">
                <div className="mb-3 flex items-center gap-2">
                  <Banknote className="h-4 w-4 text-primary" />
                  <h4 className="font-semibold">Spending by Category</h4>
                </div>
                {categoryTotals.map((item: any, i: number) => (
                  <div key={item.category} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-sm" style={{ background: ["#10b981", "#3b82f6", "#f97316", "#8b5cf6", "#ec4899", "#f59e0b", "#14b8a6", "#ef4444"][i % 8] }} />
                      <span className="text-muted-foreground">{item.category}</span>
                    </div>
                    <span className="font-mono font-medium">{formatInr(item.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              <h3 className="font-semibold">Spend History</h3>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{monthlyHistory.length} monthly points tracked</p>
          </div>
          <Dialog open={historyDialogOpen} onOpenChange={setHistoryDialogOpen}>
            <DialogTrigger asChild>
              <Button type="button" size="sm" variant="outline">
                <TrendingUp className="mr-2 h-4 w-4" />
                History
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[85vh] max-w-4xl overflow-y-auto">
              <DialogHeader><DialogTitle>Spend History</DialogTitle></DialogHeader>
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
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="space-y-2">
          <CardTitle className="flex items-center gap-2"><WalletCards className="h-5 w-5 text-primary" />Recent Spends</CardTitle>
          <p className="text-sm text-muted-foreground">{filteredSpends.length} matching spends, totaling <span className="font-mono text-foreground">{formatInr(filteredTotal)}</span></p>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="rounded-xl border border-border/80 bg-muted/10 p-3 sm:p-4">
            <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:gap-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" placeholder="Search merchant, category, notes..." />
              </div>
              <Dialog open={spendFiltersDialogOpen} onOpenChange={setSpendFiltersDialogOpen}>
                <DialogTrigger asChild>
                  <Button type="button" variant="outline">
                    <SlidersHorizontal className="mr-2 h-4 w-4" />
                    Filters
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto">
                  <DialogHeader><DialogTitle>Spend Filters</DialogTitle></DialogHeader>
                  <div className="grid gap-3">
                    <div>
                      <Label>Period</Label>
                      <Select value={periodFilter} onValueChange={setPeriodFilter}>
                        <SelectTrigger className="mt-1">
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
                    </div>
                    {periodFilter === "custom" && (
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <Label>From</Label>
                          <Input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="mt-1" />
                        </div>
                        <div>
                          <Label>To</Label>
                          <Input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="mt-1" />
                        </div>
                      </div>
                    )}
                    <div>
                      <Label>Category</Label>
                      <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                        <SelectTrigger className="mt-1"><SelectValue placeholder="Category" /></SelectTrigger>
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
                        <SelectTrigger className="mt-1"><SelectValue placeholder="Source" /></SelectTrigger>
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
                        <SelectTrigger className="mt-1">
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
                    <div className="grid grid-cols-2 gap-2">
                      <Button type="button" variant="outline" onClick={clearFilters}>Clear</Button>
                      <Button type="button" onClick={() => setSpendFiltersDialogOpen(false)}>Done</Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-muted/30 px-3 py-3 text-sm sm:px-4">
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
            <div className="grid max-h-[32rem] gap-3 overflow-y-auto pr-1 sm:max-h-none sm:overflow-visible sm:pr-0">
              {filteredSpends.map((spend) => (
                <div key={spend.id} className="grid min-w-0 gap-3 rounded-xl bg-muted/40 p-3 sm:grid-cols-[1fr_auto] sm:items-center sm:gap-4 sm:p-4">
                  <div className="min-w-0 space-y-1">
                    <p className="font-medium truncate">{spend.merchant}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {new Date(spend.date).toLocaleDateString()} {spend.emailSubject ? `- ${spend.emailSubject}` : ""}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant={spend.source === "gmail" ? "secondary" : "outline"}>{spend.source}</Badge>
                      {spend.category && <Badge variant="outline">{spend.category}</Badge>}
                      {spend.transactionId && <Badge variant="outline">Txn {String(spend.transactionId).slice(-8)}</Badge>}
                      {spend.bankAccount && <Badge variant="secondary">{spend.bankAccount.name}</Badge>}
                      {spend.creditCard && <Badge variant="secondary">{spend.creditCard.name}</Badge>}
                      {friendSpendLinks.get(spend.id) && (
                        <Badge variant="outline">Friend: {friendSpendLinks.get(spend.id).person}</Badge>
                      )}
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
              {spendsHasMore && (
                <Button type="button" variant="outline" onClick={loadMoreSpends}>Load more spends</Button>
              )}
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
      <CardContent className="min-h-[7.5rem] p-4 sm:p-5">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10">
            <Icon className="w-5 h-5 text-primary" />
          </div>
          <span className="min-w-0 text-sm font-medium leading-snug">{title}</span>
        </div>
        <p className="font-mono text-xl font-semibold leading-tight sm:text-2xl">{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}

function InsightCard({ title, value, detail, warning }: any) {
  return (
    <Card className={warning ? "border-destructive/40 bg-destructive/5" : ""}>
      <CardContent className="p-4 sm:p-5">
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
      <div className="relative h-64 w-full min-w-0 overflow-hidden">
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

