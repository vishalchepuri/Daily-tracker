"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  LayoutDashboard, Utensils, Dumbbell, TrendingUp, MessageSquare, UserCircle,
  Bot, LogOut, Menu, X, ChevronRight, WalletCards, ListTodo, Pill, Youtube, Shield,
  ClipboardList
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { BrandLogo } from "@/components/brand-logo";
import { toast } from "sonner";

const navItems = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Reminders", href: "/reminders", icon: ListTodo },
  { label: "Medications", href: "/medications", icon: Pill },
  { label: "Spends", href: "/spends", icon: WalletCards },
  { label: "YT Summary", href: "/yt-summary", icon: Youtube },
  { label: "Report", href: "/report", icon: ClipboardList },
  { label: "Nutrition", href: "/nutrition", icon: Utensils },
  { label: "Workouts", href: "/workouts", icon: Dumbbell },
  { label: "Progress", href: "/progress", icon: TrendingUp },
  { label: "Profile", href: "/profile", icon: UserCircle },
];

const adminNavItem = { label: "Admin", href: "/admin", icon: Shield };

const mobileNavItems = navItems.filter((item) =>
  ["/dashboard", "/reminders", "/medications", "/spends", "/workouts"].includes(item.href)
);

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
  "/workouts": {
    label: "Workouts",
    suggestions: [
      "Create a workout plan for your goal and available time.",
      "Suggest exercise substitutions.",
      "Review recent training and recommend progression.",
    ],
  },
  "/progress": {
    label: "Progress",
    suggestions: [
      "Explain your progress trends in plain language.",
      "Identify plateaus or momentum shifts.",
      "Recommend what to change next week.",
    ],
  },
  "/profile": {
    label: "Profile",
    suggestions: [
      "Help set a realistic fitness goal.",
      "Adjust targets for your body metrics and routine.",
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
  const [coachOpen, setCoachOpen] = useState(false);
  const [profileComplete, setProfileComplete] = useState(isProfileComplete(initialProfile));
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [profileForm, setProfileForm] = useState({
    age: initialProfile?.age ? String(initialProfile.age) : "",
    weight: initialProfile?.weight ? String(initialProfile.weight) : "",
    height: initialProfile?.height ? String(initialProfile.height) : "",
    gender: initialProfile?.gender ?? "male",
    activityLevel: initialProfile?.activityLevel ?? "moderate",
    goal: initialProfile?.goal ?? "muscle_gain",
    healthLimitations: initialProfile?.healthLimitations ?? "",
    foodAllergies: initialProfile?.foodAllergies ?? "",
  });
  const pathname = usePathname();
  const router = useRouter();
  const mainRef = useRef<HTMLElement | null>(null);
  const prefersReducedMotion = useReducedMotion();
  const [isRoutePending, startRouteTransition] = useTransition();
  const currentFeature = getFeatureHelp(pathname);
  const visibleNavItems = isAdmin ? [...navItems, adminNavItem] : navItems;
  const chatHref = `/chat?from=${encodeURIComponent(pathname || "/dashboard")}`;

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0, behavior: prefersReducedMotion ? "auto" : "smooth" });
  }, [pathname, prefersReducedMotion]);

  const goToFeature = (href: string) => {
    setSidebarOpen(false);
    router.prefetch(href);
    startRouteTransition(() => router.push(href));
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
          activityLevel: profileForm.activityLevel,
          goal: profileForm.goal,
          healthLimitations: profileForm.healthLimitations || "None",
          foodAllergies: profileForm.foodAllergies || "None",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        toast.error("Your account session is no longer valid. Please sign in again.");
        await signOut({ callbackUrl: "/login" });
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

  return (
    <div className="app-viewport flex overflow-hidden bg-background">
      <Dialog open={!profileComplete}>
        <DialogContent className="sm:max-w-[32rem]" hideClose>
          <DialogHeader>
            <DialogTitle>Set up your fitness profile</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              These details help calculate accurate calories, macros, and coaching answers.
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
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <Label>Gender</Label>
                <Select value={profileForm.gender} onValueChange={(value) => setProfileForm({ ...profileForm, gender: value })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Activity</Label>
                <Select value={profileForm.activityLevel} onValueChange={(value) => setProfileForm({ ...profileForm, activityLevel: value })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sedentary">Sedentary</SelectItem>
                    <SelectItem value="light">Light</SelectItem>
                    <SelectItem value="moderate">Moderate</SelectItem>
                    <SelectItem value="active">Very Active</SelectItem>
                    <SelectItem value="very_active">Extremely Active</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Goal</Label>
                <Select value={profileForm.goal} onValueChange={(value) => setProfileForm({ ...profileForm, goal: value })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="muscle_gain">Muscle Gain</SelectItem>
                    <SelectItem value="fat_loss">Fat Loss</SelectItem>
                    <SelectItem value="maintain">Maintain</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label>Joint pain, injuries, surgeries</Label>
                <Input
                  value={profileForm.healthLimitations}
                  onChange={(e) => setProfileForm({ ...profileForm, healthLimitations: e.target.value })}
                  className="mt-1"
                  placeholder="None, knee pain, shoulder surgery..."
                />
              </div>
              <div>
                <Label>Food allergies or avoided foods</Label>
                <Input
                  value={profileForm.foodAllergies}
                  onChange={(e) => setProfileForm({ ...profileForm, foodAllergies: e.target.value })}
                  className="mt-1"
                  placeholder="None, peanuts, lactose..."
                />
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
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-muted-foreground hover:text-destructive"
            onClick={() => signOut({ callbackUrl: "/login" })}
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
            {(visibleNavItems ?? []).find((n: any) => pathname === n?.href || pathname?.startsWith?.(n?.href + "/"))?.label ?? "Dashboard"}
          </h1>
        </header>
        <div className="border-b border-border bg-background/95 px-3 py-2 lg:hidden">
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 ios-scroll">
            {visibleNavItems.map((item: any) => {
              const isActive = pathname === item?.href || pathname?.startsWith?.(item?.href + "/");
              return (
                <button
                  key={item.href}
                  type="button"
                  onClick={() => goToFeature(item.href)}
                  className={cn(
                    "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors",
                    isActive ? "border-primary/40 bg-primary/15 text-primary" : "border-border bg-card text-muted-foreground"
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>
        <main ref={mainRef} className="min-h-0 flex-1 scroll-smooth overflow-y-auto ios-scroll p-3 pb-[calc(6.9rem_+_env(safe-area-inset-bottom))] sm:p-4 lg:p-6 lg:pb-6">
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
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 px-2 pb-[calc(0.35rem+env(safe-area-inset-bottom))] pt-2 backdrop-blur lg:hidden">
        <div className="grid grid-cols-5 gap-1">
          {mobileNavItems.map((item: any) => {
            const isActive = pathname === item?.href || pathname?.startsWith?.(item?.href + "/");
            return (
              <button
                key={item.href}
                type="button"
                onClick={() => goToFeature(item.href)}
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

      {pathname !== "/chat" && (
      <div className="fixed bottom-[calc(5.2rem_+_env(safe-area-inset-bottom))] right-4 z-40 flex max-w-[calc(100vw-2rem)] flex-col items-end gap-3 lg:bottom-4">
        {coachOpen && (
          <div className="hidden max-h-[min(70dvh,28rem)] w-[min(calc(100vw-2rem),22rem)] overflow-y-auto rounded-lg border border-border bg-card p-4 shadow-xl ios-scroll lg:block">
            <div className="mb-3 flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Bot className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold">You are in {currentFeature.label}</p>
                <p className="mt-1 text-xs text-muted-foreground">You can do these things with AI:</p>
              </div>
              <button
                type="button"
                className="ml-auto rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={() => setCoachOpen(false)}
                aria-label="Close AI help"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {currentFeature.suggestions.map((suggestion) => (
                <li key={suggestion} className="flex gap-2">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                  <span>{suggestion}</span>
                </li>
              ))}
            </ul>
            <Button asChild className="mt-4 w-full">
              <Link href={chatHref} onClick={() => setCoachOpen(false)}>
                Open Dayza Agent
              </Link>
            </Button>
          </div>
        )}
        <Button
          asChild
          size="icon"
          className="h-12 w-12 rounded-full shadow-lg"
        >
          <Link href={chatHref} aria-label="Open Dayza Agent">
            <MessageSquare className="h-5 w-5" />
          </Link>
        </Button>
      </div>
      )}
    </div>
  );
}
