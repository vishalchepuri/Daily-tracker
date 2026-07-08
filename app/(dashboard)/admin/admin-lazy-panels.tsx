"use client";

import { useState } from "react";
import type { ComponentType, ReactNode } from "react";
import { Dumbbell, Shield, WalletCards, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { dayzaFetch } from "@/lib/firebase-session-client";
import { ExerciseReviewActions } from "./exercise-review-actions";
import { AgentTemplateReviewActions } from "./agent-template-review-actions";

type AdminPanel = "review-queue" | "recent-spends" | "recent-workouts";

type LazyPanelProps<T> = {
  panel: AdminPanel;
  title: string;
  description: string;
  emptyLabel: string;
  icon: ComponentType<{ className?: string }>;
  renderItem: (item: T) => ReactNode;
};

type ReviewQueueItem = {
  id: string;
  kind: "exercise" | "agent-template" | "issue";
  type: string;
  title: string;
  detail: string;
  user: string;
  createdAt: string;
};

type AdminListItem = {
  id: string;
  title: string;
  detail: string;
  value: string;
};

function formatDate(value?: string | null) {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function LazyAdminPanel<T extends { id: string }>({
  panel,
  title,
  description,
  emptyLabel,
  icon: Icon,
  renderItem,
}: LazyPanelProps<T>) {
  const [items, setItems] = useState<T[]>([]);
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  async function loadPanel() {
    setVisible(true);
    setLoading(true);
    try {
      const res = await dayzaFetch(`/api/admin/panels?panel=${panel}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.error ?? `Failed to load ${title.toLowerCase()}`);
        setVisible(false);
        return;
      }
      setItems(Array.isArray(data.items) ? data.items : []);
      setLoaded(true);
    } catch {
      toast.error(`Failed to load ${title.toLowerCase()}`);
      setVisible(false);
    } finally {
      setLoading(false);
    }
  }

  function closePanel() {
    setVisible(false);
    setItems([]);
    setLoaded(false);
  }

  return (
    <Card>
      <CardHeader>
        <div className="grid gap-3 sm:flex sm:items-center sm:justify-between">
          <CardTitle className="flex items-center gap-2">
            <Icon className="h-5 w-5 text-primary" />
            {title}
          </CardTitle>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant={visible ? "outline" : "default"} onClick={loadPanel} loading={loading}>
              {loaded ? "Reload" : "Load"}
            </Button>
            {visible && (
              <Button type="button" size="sm" variant="ghost" onClick={closePanel}>
                <X className="h-4 w-4" />
                Close
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {!visible ? (
          <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            <p>{description}</p>
            <Button type="button" size="sm" className="mt-3" onClick={loadPanel} loading={loading}>
              Load data
            </Button>
          </div>
        ) : loading ? (
          <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Loading secure admin data...</div>
        ) : items.length === 0 ? (
          <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">{emptyLabel}</div>
        ) : (
          <div className="grid gap-2">
            {items.map((item) => renderItem(item))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function AdminReviewQueue() {
  return (
    <LazyAdminPanel<ReviewQueueItem>
      panel="review-queue"
      title="Smart Review Queue"
      description="Review data is hidden until you load it."
      emptyLabel="Nothing needs review right now."
      icon={Shield}
      renderItem={(item) => (
        <div key={`${item.kind}-${item.id}`} className="grid gap-3 rounded-lg bg-muted/40 p-3 md:grid-cols-[1fr_auto] md:items-center">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={item.kind === "issue" ? "secondary" : "default"}>{item.type}</Badge>
              <p className="truncate font-semibold">{item.title}</p>
            </div>
            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{item.detail}</p>
            <p className="mt-1 text-xs text-muted-foreground">{item.user} - {formatDate(item.createdAt)}</p>
          </div>
          {item.kind === "exercise" ? (
            <ExerciseReviewActions id={item.id} name={item.title} />
          ) : item.kind === "agent-template" ? (
            <AgentTemplateReviewActions id={item.id} name={item.title} />
          ) : (
            <Badge variant="outline">Open</Badge>
          )}
        </div>
      )}
    />
  );
}

export function AdminRecentSpends() {
  return (
    <LazyAdminPanel<AdminListItem>
      panel="recent-spends"
      title="Recent Spends"
      description="Recent spend rows are hidden until you load them."
      emptyLabel="No spends recorded yet."
      icon={WalletCards}
      renderItem={(item) => <AdminListRow key={item.id} item={item} />}
    />
  );
}

export function AdminRecentWorkouts() {
  return (
    <LazyAdminPanel<AdminListItem>
      panel="recent-workouts"
      title="Recent Workouts"
      description="Recent workout rows are hidden until you load them."
      emptyLabel="No workout logs yet."
      icon={Dumbbell}
      renderItem={(item) => <AdminListRow key={item.id} item={item} />}
    />
  );
}

function AdminListRow({ item }: { item: AdminListItem }) {
  return (
    <div className="grid grid-cols-[1fr_auto] gap-3 rounded-lg bg-muted/40 px-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{item.title}</p>
        <p className="truncate text-xs text-muted-foreground">{item.detail}</p>
      </div>
      <span className="whitespace-nowrap font-mono text-sm">{item.value}</span>
    </div>
  );
}
