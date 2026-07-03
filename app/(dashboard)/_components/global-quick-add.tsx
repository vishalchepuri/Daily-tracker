"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bot,
  Droplets,
  Dumbbell,
  Loader2,
  ListTodo,
  MessageSquare,
  Pill,
  Plus,
  Utensils,
  WalletCards,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const QUICK_ACTIONS = [
  { label: "Log food", detail: "Nutrition", href: "/nutrition", icon: Utensils },
  { label: "Add spend", detail: "Money", href: "/spends", icon: WalletCards },
  { label: "Reminder", detail: "Task", href: "/reminders", icon: ListTodo },
  { label: "Medication", detail: "Dose", href: "/medications", icon: Pill },
  { label: "Workout", detail: "Training", href: "/workouts", icon: Dumbbell },
  {
    label: "Ask Dayza",
    detail: "Agent",
    href: "/chat?prompt=Help%20me%20quickly%20log%20or%20plan%20something.",
    icon: MessageSquare,
  },
];

export function GlobalQuickAdd({ hidden = false }: { hidden?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loggingWater, setLoggingWater] = useState(false);

  if (hidden) return null;

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  const logWater = async () => {
    if (loggingWater) return;
    setLoggingWater(true);
    try {
      const res = await fetch("/api/water-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountMl: 250 }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.error ?? "Could not log water");
        return;
      }
      toast.success("Logged 250ml water");
      setOpen(false);
      router.refresh();
    } catch {
      toast.error("Could not log water");
    } finally {
      setLoggingWater(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        size="icon"
        className="fixed bottom-[calc(5.2rem_+_env(safe-area-inset-bottom))] left-4 z-40 hidden h-12 w-12 rounded-full shadow-lg lg:bottom-4 lg:left-[17rem] lg:flex"
        onClick={() => setOpen(true)}
        aria-label="Quick add"
      >
        <Plus className="h-5 w-5" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[25rem] rounded-[28px] border-border/70 bg-card/95 p-5 shadow-2xl backdrop-blur">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <Bot className="h-5 w-5 text-primary" />
              Quick Add
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={logWater}
              disabled={loggingWater}
              className={cn(
                "rounded-2xl border border-blue-500/25 bg-blue-500/10 p-4 text-left transition active:scale-[0.98]",
                "hover:border-blue-400/50 hover:bg-blue-500/15 disabled:cursor-not-allowed disabled:opacity-70"
              )}
            >
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-500/15 text-blue-300">
                {loggingWater ? <Loader2 className="h-5 w-5 animate-spin" /> : <Droplets className="h-5 w-5" />}
              </div>
              <p className="text-sm font-semibold">Water</p>
              <p className="mt-1 text-xs text-muted-foreground">Add 250ml</p>
            </button>
            {QUICK_ACTIONS.map((action) => (
              <button
                key={action.label}
                type="button"
                onClick={() => go(action.href)}
                className="rounded-2xl border border-border/70 bg-background/70 p-4 text-left transition hover:border-primary/40 hover:bg-background active:scale-[0.98]"
              >
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <action.icon className="h-5 w-5" />
                </div>
                <p className="text-sm font-semibold">{action.label}</p>
                <p className="mt-1 text-xs text-muted-foreground">{action.detail}</p>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
