"use client";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  LayoutDashboard, Utensils, Dumbbell, MessageSquare, UserCircle,
  LogOut, Menu, X, ChevronRight, WalletCards, ListTodo, Pill, Youtube, Shield,
  Mail, CalendarClock, Settings, Check, HeartPulse,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { BrandLogo } from "@/components/brand-logo";
import { toast } from "sonner";
import { ensureDayzaSession, signOutOfDayza } from "@/lib/firebase-session-client";
import { GlobalQuickAdd } from "./global-quick-add";

const navItems = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Reminders", href: "/reminders", icon: ListTodo },
  { label: "Agent Tasks", href: "/agent-tasks", icon: CalendarClock },
  { label: "Medications", href: "/medications", icon: Pill },
  { label: "Spends", href: "/spends", icon: WalletCards },
  { label: "Gmail", href: "/gmail", icon: Mail },
  { label: "YT Summary", href: "/yt-summary", icon: Youtube },
  { label: "Nutrition", href: "/nutrition", icon: Utensils },
  { label: "Workouts", href: "/workouts", icon: Dumbbell },
  { label: "Recovery", href: "/recovery", icon: HeartPulse },
  { label: "Profile", href: "/profile", icon: UserCircle },
];

const adminNavItem = { label: "Admin", href: "/admin", icon: Shield };

const mobileNavItems = [
  { label: "Today", href: "/dashboard", icon: LayoutDashboard },
  { label: "Agent", href: "/chat", icon: MessageSquare, agent: true },
  { label: "Workouts", href: "/workouts", icon: Dumbbell },
  { label: "Spends", href: "/spends", icon: WalletCards },
  { label: "Profile", href: "/profile", icon: UserCircle },
];

const mobileNavStorageKey = "dayza-mobile-nav-v1";
const defaultMobileNavHrefs = mobileNavItems.map((item) => item.href);

const featureHelp: Record<string, { label: string; suggestions: string[] }> = {
  "/dashboard": {
    label: "Dashboard",
    suggestions: [
      "Summarize your daily fitness, nutrition, and progress signals.",
      "Spot patterns across your latest logs.",
      "Suggest the next best action for today.",
    ],
  },
  "/reminders": {
    label: "Reminders",
    suggestions: [
      "Create reminders for workouts, meals, water, or supplements.",
      "Tune reminder timing around your schedule.",
      "Turn missed habits into a realistic follow-up plan.",
    ],
  },
  "/medications": {
    label: "Medications",
    suggestions: [
      "Create medication schedules with daily, weekly, monthly, or custom repeats.",
      "Track taken and skipped doses.",
      "Review medication timing and consistency.",
    ],
  },
  "/spends": {
    label: "Spends",
    suggestions: [
      "Review fitness and food spending trends.",
      "Find budget-friendly swaps for meals or gear.",
      "Plan purchases around your goals.",
    ],
  },
  "/gmail": {
    label: "Gmail",
    suggestions: [
      "Group recent Gmail updates into bills, finance, travel, health, work, and orders.",
      "Track important follow-ups without storing full email bodies.",
      "Turn email updates into reminders or tasks when needed.",
    ],
  },
  "/nutrition": {
    label: "Nutrition",
    suggestions: [
      "Estimate macros from meals or food photos.",
      "Build meal ideas around your calorie and protein goals.",
      "Explain what to adjust based on your recent eating pattern.",
    ],
  },
  "/yt-summary": {
    label: "YT Summary",
    suggestions: [
      "Summarize videos from channels you subscribe to.",
      "Pull out key ideas, action items, and timestamps when available.",
      "Turn long videos into a quick reading list.",
    ],
  },
  "/agent-tasks": {
    label: "Agent Tasks",
    suggestions: [
      "Schedule daily link checks, IPO watches, or recurring research tasks.",
      "Run a saved task manually and review the latest status.",
      "Turn repeated checks into push notifications.",
    ],
  },
  "/workouts": {
    label: "Workouts",
    suggestions: [
      "Create a workout plan for your goal and available time.",
      "Suggest exercise substitutions.",
      "Review recent training and recommend progression.",
    ],
  },
  "/recovery": {
    label: "Recovery",
    suggestions: [
      "Log sleep, soreness, energy, and mood.",
      "Adjust today&apos;s workout intensity based on recovery.",
      "Spot fatigue patterns before they affect consistency.",
    ],
  },
  "/profile": {
    label: "Profile",
    suggestions: [
      "Help set a realistic fitness goal.",
      "Adjust targets for your body metrics and routine.",
      "Review progress trends and report insights.",
      "Translate preferences into a coaching plan.",
    ],
  },
  "/admin": {
    label: "Admin",
    suggestions: [
      "Review registered users and account activity.",
      "Check whether production data is growing normally.",
      "Spot users who may need support.",
    ],
  },
  "/chat": {
    label: "Dayza Agent",
    suggestions: [
      "Ask questions about fitness, nutrition, recovery, or progress.",
      "Upload food or health screenshots for analysis.",
      "Turn your logs into practical next steps.",
    ],
  },
};

function getFeatureHelp(pathname: string | null) {
  const match = Object.entries(featureHelp).find(([href]) => pathname === href || pathname?.startsWith?.(href + "/"));
  return match?.[1] ?? featureHelp["/dashboard"];
}

function isProfileComplete(profile: any) {
  if (profile === undefined) return true;
  return Boolean(profile?.age && profile?.weight && profile?.height);
}

export function DashboardShell({ children, user, initialProfile, isAdmin = false }: { children: React.ReactNode; user: any; initialProfile?: any; isAdmin?: boolean }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [mobileNavHrefs, setMobileNavHrefs] = useState<string[]>(defaultMobileNavHrefs);
  const [profileComplete, setProfileComplete] = useState(isProfileComplete(initialProfile));
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [profileForm, setProfileForm] = useState({
    age: initialProfile?.age ? String(initialProfile.age) : "",
    weight: initialProfile?.weight ? String(initialProfile.weight) : "",
    height: initialProfile?.height ? String(initialProfile.height) : "",
    gender: initialProfile?.gender ?? "male",
  });
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const isEmbedded = searchParams?.get("embed") === "1";
  const mainRef = useRef<HTMLElement | null>(null);
  const prefersReducedMotion = useReducedMotion();
  const [isRoutePending, startRouteTransition] = useTransition();
  const currentFeature = getFeatureHelp(pathname);
  const visibleNavItems = isAdmin ? [...navItems, adminNavItem] : navItems;
  const mobileNavOptions = useMemo(() => {
    const agentItem = mobileNavItems.find((item) => item.agent)!;
    const standardItems = visibleNavItems.map((item) => ({
      label: item.label === "Dashboard" ? "Today" : item.label,
      href: item.href,
      icon: item.icon,
    }));
    return [agentItem, ...standardItems].filter((item, index, items) => items.findIndex((candidate) => candidate.href === item.href) === index);
  }, [visibleNavItems]);
  const selectedMobileNavItems = useMemo(() => {
    const selected = mobileNavHrefs
      .map((href) => mobileNavOptions.find((item) => item.href === href))
      .filter(Boolean) as typeof mobileNavOptions;
    return selected.length > 0 ? selected.slice(0, 5) : mobileNavItems;
  }, [mobileNavHrefs, mobileNavOptions]);
  const chatHref = `/chat?from=${encodeURIComponent(pathname || "/dashboard")}`;
  const isChatPage = pathname === "/chat";

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0, behavior: prefersReducedMotion ? "auto" : "smooth" });
  }, [pathname, prefersReducedMotion]);

  useEffect(() => {
    ensureDayzaSession().then((repaired) => {
      if (repaired) router.refresh();
    }).catch(() => null);
  }, [router]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(mobileNavStorageKey);
      const parsed = raw ? JSON.parse(raw) : null;
      if (Array.isArray(parsed)) {
        const valid = parsed.filter((href) => typeof href === "string").slice(0, 5);
        if (valid.length > 0) setMobileNavHrefs(valid);
      }
    } catch {
      setMobileNavHrefs(defaultMobileNavHrefs);
    }
  }, []);

  const goToFeature = (href: string) => {
    setSidebarOpen(false);
    router.prefetch(href);
    startRouteTransition(() => router.push(href));
  };

  const toggleMobileNavHref = (href: string) => {
    setMobileNavHrefs((current) => {
      const exists = current.includes(href);
      const next = exists ? current.filter((item) => item !== href) : current.length < 5 ? [...current, href] : current;
      if (!exists && current.length >= 5) {
        toast.error("Choose up to 5 bottom icons");
        return current;
      }
      if (exists && current.length <= 1) {
        toast.error("Keep at least 1 bottom icon");
        return current;
      }
      window.localStorage.setItem(mobileNavStorageKey, JSON.stringify(next));
      return next;
    });
  };

  const saveProfile = async () => {
    if (!profileForm.age || !profileForm.weight || !profileForm.height) return;
    setSavingProfile(true);
    setProfileError("");
    try {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          age: parseInt(profileForm.age) || null,
          weight: parseFloat(profileForm.weight) || null,
          height: parseFloat(profileForm.height) || null,
          gender: profileForm.gender,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        toast.error("Your account session is no longer valid. Please sign in again.");
        await signOutOfDayza();
        router.replace("/login");
        return;
      }
      if (!res.ok) {
        const message = data?.error ?? "Could not save profile. Please try again.";
        setProfileError(message);
        toast.error(message);
        return;
      }
      setProfileComplete(true);
      toast.success("Profile saved");
    } catch {
      const message = "Could not reach the app server. Please check your connection and try again.";
      setProfileError(message);
      toast.error(message);
    } finally {
      setSavingProfile(false);
    }
  };

  if (isChatPage && isEmbedded) {
    return (
      <main className="h-dvh overflow-hidden bg-background text-foreground">
        {children}
      </main>
    );
  }

  return (
    <div className="app-viewport flex overflow-hidden bg-background">
      <Dialog open={!profileComplete}>
        <DialogContent className="sm:max-w-[32rem]" hideClose>
          <DialogHeader>
            <DialogTitle>Set up your fitness profile</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Add the basics now. Dayza Agent will ask goals, safety details, food preferences, and workout focus when needed.
            </p>
            {profileError && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {profileError}
              </div>
            )}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <Label>Age</Label>
                <Input
                  type="number"
                  min="1"
                  value={profileForm.age}
                  onChange={(e) => setProfileForm({ ...profileForm, age: e.target.value })}
                  className="mt-1"
                  autoFocus
                />
              </div>
              <div>
                <Label>Weight (kg)</Label>
                <Input
                  type="number"
                  min="1"
                  step="0.1"
                  value={profileForm.weight}
                  onChange={(e) => setProfileForm({ ...profileForm, weight: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Height (cm)</Label>
                <Input
                  type="number"
                  min="1"
                  step="0.1"
                  value={profileForm.height}
                  onChange={(e) => setProfileForm({ ...profileForm, height: e.target.value })}
                  className="mt-1"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label>Gender</Label>
                <Select value={profileForm.gender} onValueChange={(value) => setProfileForm({ ...profileForm, gender: value })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button
              type="button"
              className="w-full"
              onClick={saveProfile}
              disabled={savingProfile || !profileForm.age || !profileForm.weight || !profileForm.height}
            >
              {savingProfile ? "Saving..." : "Save and Continue"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside
        className={cn(
          "fixed lg:sticky top-0 left-0 z-50 app-viewport w-64 bg-card border-r border-border flex flex-col transition-transform duration-300",
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        <div className="flex items-center gap-2 px-4 h-16 border-b border-border">
          <BrandLogo size="sm" />
          <button className="lg:hidden ml-auto" onClick={() => setSidebarOpen(false)}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto ios-scroll">
          {(visibleNavItems ?? []).map((item: any) => {
            const isActive = pathname === item?.href || pathname?.startsWith?.(item?.href + "/");
            return (
              <button
                key={item?.href}
                type="button"
                onMouseEnter={() => router.prefetch(item?.href)}
                onFocus={() => router.prefetch(item?.href)}
                onClick={() => goToFeature(item?.href)}
                className={cn(
                  "flex w-full items-center gap-3 px-3 py-2.5 rounded-lg text-left text-sm font-medium transition-all duration-200 ease-out hover:translate-x-0.5 active:scale-[0.99]",
                  isActive
                    ? "bg-primary/10 text-primary shadow-sm"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <item.icon className="w-5 h-5 shrink-0" />
                {item?.label}
                {isActive && <ChevronRight className="w-4 h-4 ml-auto" />}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-border">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary text-sm font-bold">
              {(user?.name ?? user?.email ?? "U")?.charAt?.(0)?.toUpperCase?.() ?? "U"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user?.name ?? "User"}</p>
              <p className="text-xs text-muted-foreground truncate">{user?.email ?? ""}</p>
            </div>
          </div>
          <div className="mb-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
            <Link href="/privacy" className="hover:text-foreground hover:underline">Privacy</Link>
            <Link href="/terms" className="hover:text-foreground hover:underline">Terms</Link>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-muted-foreground hover:text-destructive"
            onClick={async () => {
              await signOutOfDayza();
              router.replace("/login");
            }}
          >
            <LogOut className="w-4 h-4 mr-2" />
            Sign Out
          </Button>
        </div>
      </aside>

      <div className="flex min-h-0 flex-1 flex-col min-w-0">
        <header className="sticky top-0 z-30 flex h-14 items-center border-b border-border bg-card/90 px-3 backdrop-blur-md lg:h-16 lg:px-6">
          <button className="mr-3 rounded-md p-2 -ml-2 lg:hidden" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
            <Menu className="w-6 h-6" />
          </button>
          <h1 className="min-w-0 truncate font-display text-base font-semibold tracking-tight sm:text-lg">
            {(visibleNavItems ?? []).find((n: any) => pathname === n?.href || pathname?.startsWith?.(n?.href + "/"))?.label ?? currentFeature.label}
          </h1>
          <button
            type="button"
            className="ml-auto rounded-md p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground lg:hidden"
            onClick={() => setMobileNavOpen(true)}
            aria-label="Customize bottom navigation"
          >
            <Settings className="h-5 w-5" />
          </button>
        </header>

        <main
          ref={mainRef}
          className={cn(
            "min-h-0 flex-1 touch-pan-y scroll-smooth ios-scroll",
            isChatPage
              ? "overflow-hidden"
              : "overflow-y-auto p-4 pb-[calc(7.25rem_+_env(safe-area-inset-bottom))] sm:p-5 lg:p-8 lg:pb-8 xl:p-10 xl:pb-10"
          )}
        >
          {isChatPage ? (
            children
          ) : (
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={pathname}
                className="mx-auto w-full max-w-[1600px]"
                initial={prefersReducedMotion ? false : { opacity: 0, y: 10, scale: 0.995 }}
                animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
                exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.998 }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              >
                {children}
              </motion.div>
            </AnimatePresence>
          )}
        </main>
      </div>

      <Dialog open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <DialogContent className="max-w-[calc(100vw-1.5rem)] rounded-2xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Bottom icons</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Choose up to 5 shortcuts for the mobile bottom bar.</p>
            <div className="grid grid-cols-2 gap-2">
              {mobileNavOptions.map((item) => {
                const selected = mobileNavHrefs.includes(item.href);
                return (
                  <button
                    key={item.href}
                    type="button"
                    onClick={() => toggleMobileNavHref(item.href)}
                    className={cn(
                      "flex min-h-12 items-center gap-3 rounded-xl border px-3 text-left text-sm font-semibold transition active:scale-[0.98]",
                      selected ? "border-primary/45 bg-primary/10 text-primary" : "border-border bg-background/60 text-muted-foreground hover:bg-muted"
                    )}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {selected && <Check className="h-4 w-4 shrink-0" />}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">{selectedMobileNavItems.length} / 5 selected</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setMobileNavHrefs(defaultMobileNavHrefs);
                  window.localStorage.setItem(mobileNavStorageKey, JSON.stringify(defaultMobileNavHrefs));
                }}
              >
                Reset
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 px-2 pb-[calc(0.35rem+env(safe-area-inset-bottom))] pt-2 backdrop-blur lg:hidden">
        <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${Math.min(5, Math.max(1, selectedMobileNavItems.length))}, minmax(0, 1fr))` }}>
          {selectedMobileNavItems.map((item: any) => {
            const isActive = pathname === item?.href || pathname?.startsWith?.(item?.href + "/");
            return (
              <button
                key={item.href}
                type="button"
                onClick={() => item.agent ? goToFeature(chatHref) : goToFeature(item.href)}
                className={cn(
                  "flex min-w-0 flex-col items-center gap-1 rounded-md px-1 py-2 text-[0.66rem] font-medium transition-all duration-200 ease-out active:scale-95",
                  isActive ? "bg-primary/10 text-primary shadow-sm" : "text-muted-foreground hover:bg-muted/70"
                )}
              >
                <item.icon className="h-5 w-5 shrink-0" />
                <span className="max-w-full truncate">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {isRoutePending && (
        <div className="pointer-events-none fixed left-0 right-0 top-0 z-[60] h-0.5 overflow-hidden bg-primary/15">
          <div className="h-full w-1/2 animate-[loading-bar_0.9s_ease-in-out_infinite] bg-primary" />
        </div>
      )}

      <GlobalQuickAdd
        hidden={
          pathname === "/chat" ||
          pathname === "/profile" ||
          pathname === "/reminders" ||
          mobileNavOpen ||
          !profileComplete
        }
      />
    </div>
  );
}
