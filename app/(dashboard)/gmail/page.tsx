"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertCircle,
  Bell,
  BriefcaseBusiness,
  CalendarClock,
  CheckCircle2,
  ExternalLink,
  HeartPulse,
  Inbox,
  Mail,
  Package,
  Plane,
  RefreshCw,
  Search,
  Shield,
  Tags,
  Trash2,
  WalletCards,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { completeGoogleFeatureRedirect, connectGoogleFeature } from "@/lib/google-feature-client";
import { cn } from "@/lib/utils";

const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

const categories = [
  { id: "all", label: "All", icon: Inbox },
  { id: "bills", label: "Bills", icon: Bell },
  { id: "finance", label: "Finance", icon: WalletCards },
  { id: "orders", label: "Orders", icon: Package },
  { id: "travel", label: "Travel", icon: Plane },
  { id: "health", label: "Health", icon: HeartPulse },
  { id: "work", label: "Work", icon: BriefcaseBusiness },
  { id: "security", label: "Security", icon: Shield },
  { id: "subscriptions", label: "Subscriptions", icon: CalendarClock },
  { id: "updates", label: "Updates", icon: Tags },
  { id: "other", label: "Other", icon: Mail },
] as const;

type GmailItem = {
  id: string;
  gmailMessageId: string;
  threadId?: string | null;
  from?: string;
  fromEmail?: string;
  subject?: string;
  snippet?: string;
  category?: string;
  importance?: string;
  labelIds?: string[];
  hasAttachments?: boolean;
  internalDate?: string | null;
  lastSyncedAt?: string | null;
};

function formatDate(value?: string | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));
}

function senderName(item: GmailItem) {
  return (item.from ?? item.fromEmail ?? "Unknown sender")
    .replace(/<[^>]+>/g, "")
    .replace(/"/g, "")
    .trim()
    .slice(0, 70);
}

function gmailUrl(item: GmailItem) {
  return `https://mail.google.com/mail/u/0/#inbox/${item.threadId || item.gmailMessageId || item.id}`;
}

function localDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function daysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return localDateKey(date);
}

export default function GmailTrackerPage() {
  const [items, setItems] = useState<GmailItem[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [query, setQuery] = useState("newer_than:45d -category:promotions");
  const [startDate, setStartDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [clearingCache, setClearingCache] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [needsConnection, setNeedsConnection] = useState(false);
  const [lastSummary, setLastSummary] = useState<any>(null);
  const maxStartDate = useMemo(() => localDateKey(new Date()), []);
  const minStartDate = useMemo(() => daysAgo(15), []);

  const groupedItems = useMemo(() => {
    const visible = selectedCategory === "all" ? items : items.filter((item) => item.category === selectedCategory);
    return categories
      .filter((category) => category.id !== "all")
      .map((category) => ({
        ...category,
        items: visible.filter((item) => item.category === category.id),
      }))
      .filter((group) => selectedCategory === "all" ? group.items.length > 0 : group.id === selectedCategory);
  }, [items, selectedCategory]);

  const highPriorityCount = items.filter((item) => item.importance === "high").length;

  async function loadTracked(startDateOverride?: string) {
    setLoading(true);
    try {
      const activeStartDate = startDateOverride ?? startDate;
      const params = new URLSearchParams({ limit: "80" });
      if (activeStartDate) params.set("startDate", activeStartDate);
      const res = await fetch(`/api/gmail/tracker?${params.toString()}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Could not load Gmail tracker");
      setItems(data.items ?? []);
      setCounts(data.groupedCounts ?? {});
    } catch (error: any) {
      toast.error(error?.message ?? "Could not load Gmail tracker");
    } finally {
      setLoading(false);
    }
  }

  async function syncGmail() {
    setSyncing(true);
    setNeedsConnection(false);
    try {
      const res = await fetch("/api/gmail/tracker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, startDate: startDate || null, limit: 60 }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data?.needsConnection) setNeedsConnection(true);
        throw new Error(data?.error ?? "Gmail sync failed");
      }
      setItems(data.items ?? []);
      setCounts(data.groupedCounts ?? {});
      setLastSummary(data.summary ?? null);
      toast.success(`Synced ${data.summary?.synced ?? 0} Gmail updates`);
    } catch (error: any) {
      toast.error(error?.message ?? "Gmail sync failed");
    } finally {
      setSyncing(false);
    }
  }

  async function clearEmailCache() {
    if (!window.confirm("Clear stored Gmail tracker metadata? This does not delete emails from Gmail.")) return;
    setClearingCache(true);
    try {
      const res = await fetch("/api/gmail/tracker", { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Could not clear Gmail cache");
      setItems([]);
      setCounts({});
      setLastSummary(null);
      toast.success(`Cleared ${data.deleted ?? 0} cached Gmail updates`);
    } catch (error: any) {
      toast.error(error?.message ?? "Could not clear Gmail cache");
    } finally {
      setClearingCache(false);
    }
  }

  async function connectGmail() {
    setConnecting(true);
    try {
      const result = await connectGoogleFeature(GMAIL_SCOPE);
      if ((result as any)?.redirected) return;
      setNeedsConnection(false);
      toast.success("Gmail connected");
      await syncGmail();
    } catch (error: any) {
      toast.error(error?.message ?? "Could not connect Gmail");
    } finally {
      setConnecting(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    completeGoogleFeatureRedirect()
      .then(async (result) => {
        if (!result || result.scope !== GMAIL_SCOPE || cancelled) return;
        toast.success("Gmail connected");
        await syncGmail();
      })
      .catch((error) => {
        if (!cancelled) toast.error(error?.message ?? "Could not complete Gmail connection");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    loadTracked();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="w-full max-w-full space-y-5 overflow-x-hidden">
      <section className="rounded-[28px] border border-border bg-card/80 p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Mail className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <h2 className="font-display text-2xl font-bold leading-tight tracking-tight">Gmail Tracker</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Group important Gmail updates without storing full email bodies.
                </p>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <Button variant="outline" onClick={connectGmail} loading={connecting} className="h-11 rounded-2xl">
              <Mail className="h-4 w-4" />
              Connect
            </Button>
            <Button onClick={syncGmail} loading={syncing} className="h-11 rounded-2xl">
              <RefreshCw className={cn("h-4 w-4", syncing && "animate-spin")} />
              Sync range
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={clearEmailCache}
              loading={clearingCache}
              className="col-span-2 h-11 rounded-2xl sm:col-span-1"
            >
              <Trash2 className="h-4 w-4" />
              Clear cache
            </Button>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-border/80 bg-background/60 p-3">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Search className="h-3.5 w-3.5" />
            Gmail search
          </div>
          <div className="grid gap-2 sm:grid-cols-[1fr_12rem_auto_auto]">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="newer_than:45d -category:promotions"
              className="h-11 rounded-2xl"
            />
            <Input
              type="date"
              value={startDate}
              min={minStartDate}
              max={maxStartDate}
              onChange={(event) => setStartDate(event.target.value)}
              className="h-11 rounded-2xl"
            />
            <Button type="button" onClick={syncGmail} loading={syncing} className="h-11 rounded-2xl">
              Get emails
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setStartDate("");
                void loadTracked("");
              }}
              className="h-11 rounded-2xl"
            >
              Clear
            </Button>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            Dayza reads recent headers and snippets only. {startDate ? `Selected range: ${startDate} through today.` : "No start date selected, so Dayza uses the Gmail query above."} Start date can be up to 15 days old.
          </p>
        </div>

        {(needsConnection || lastSummary) && (
          <div
            className={cn(
              "mt-4 flex items-start gap-3 rounded-2xl border px-3 py-3 text-sm",
              needsConnection
                ? "border-amber-500/40 bg-amber-500/10 text-amber-200"
                : "border-primary/25 bg-primary/10 text-primary"
            )}
          >
            {needsConnection ? <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}
            <span>
              {needsConnection
                ? "Gmail read-only access is required before Dayza can group your email updates."
                : `Last sync scanned ${lastSummary?.scanned ?? 0} messages and saved ${lastSummary?.synced ?? 0} updates.`}
            </span>
          </div>
        )}
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card/80 p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Tracked emails</p>
          <p className="mt-2 font-mono text-2xl font-bold">{items.length}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card/80 p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">High priority</p>
          <p className="mt-2 font-mono text-2xl font-bold text-amber-300">{highPriorityCount}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card/80 p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Top group</p>
          <p className="mt-2 truncate text-lg font-semibold capitalize">
            {Object.entries(counts).sort((a, b) => b[1] - a[1])?.[0]?.[0] ?? "None"}
          </p>
        </div>
      </section>

      <section className="overflow-x-auto pb-1 scrollbar-hide">
        <div className="flex min-w-max gap-2">
          {categories.map((category) => {
            const Icon = category.icon;
            const count = category.id === "all" ? items.length : counts[category.id] ?? 0;
            const active = selectedCategory === category.id;
            return (
              <button
                key={category.id}
                type="button"
                onClick={() => setSelectedCategory(category.id)}
                className={cn(
                  "flex h-11 items-center gap-2 rounded-2xl border px-3 text-sm font-semibold transition active:scale-[0.98]",
                  active
                    ? "border-primary/50 bg-primary/15 text-primary"
                    : "border-border bg-card/80 text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
                {category.label}
                <span className="rounded-full bg-background/80 px-2 py-0.5 font-mono text-xs">{count}</span>
              </button>
            );
          })}
        </div>
      </section>

      {loading ? (
        <div className="rounded-[28px] border border-border bg-card/80 p-8 text-center text-sm text-muted-foreground">
          Loading Gmail tracker...
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-[28px] border border-dashed border-border bg-card/70 p-8 text-center">
          <Inbox className="mx-auto h-10 w-10 text-muted-foreground" />
          <h3 className="mt-3 text-lg font-semibold">No Gmail updates loaded yet</h3>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Connect Gmail and tap Sync latest. Dayza will group recent updates into practical buckets like bills, finance, travel, orders, and work.
          </p>
          <div className="mt-4 flex justify-center gap-2">
            <Button variant="outline" onClick={connectGmail} loading={connecting}>Connect Gmail</Button>
            <Button onClick={syncGmail} loading={syncing}>Sync latest</Button>
          </div>
        </div>
      ) : groupedItems.length === 0 ? (
        <div className="rounded-[28px] border border-border bg-card/80 p-8 text-center text-sm text-muted-foreground">
          No emails found in this group.
        </div>
      ) : (
        <div className="space-y-4">
          {groupedItems.map((group) => {
            const Icon = group.icon;
            return (
              <section key={group.id} className="rounded-[28px] border border-border bg-card/80 p-4 shadow-sm sm:p-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                      <Icon className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <h3 className="truncate text-lg font-semibold">{group.label}</h3>
                      <p className="text-xs text-muted-foreground">{group.items.length} tracked updates</p>
                    </div>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {group.items.map((item) => (
                    <article
                      key={item.id}
                      className={cn(
                        "min-w-0 rounded-2xl border bg-background/60 p-4 transition active:scale-[0.99]",
                        item.importance === "high" ? "border-amber-500/35" : "border-border/80"
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{senderName(item)}</p>
                          <p className="mt-1 truncate text-xs text-muted-foreground">{item.fromEmail}</p>
                        </div>
                        <span
                          className={cn(
                            "shrink-0 rounded-full px-2 py-1 text-[0.65rem] font-semibold uppercase tracking-wide",
                            item.importance === "high"
                              ? "bg-amber-500/15 text-amber-200"
                              : item.importance === "low"
                                ? "bg-muted text-muted-foreground"
                                : "bg-primary/10 text-primary"
                          )}
                        >
                          {item.importance ?? "medium"}
                        </span>
                      </div>
                      <h4 className="mt-3 line-clamp-2 text-base font-semibold leading-snug">{item.subject}</h4>
                      <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-muted-foreground">{item.snippet}</p>
                      <div className="mt-4 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                        <span className="truncate">{formatDate(item.internalDate)}</span>
                        <a
                          href={gmailUrl(item)}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-1 text-foreground transition hover:bg-muted"
                        >
                          Open
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
