import Link from "next/link";
import { redirect } from "next/navigation";
import { Bot, Clock, Dumbbell, Mail, MessageSquare, Pill, ShieldCheck, Sparkles, Utensils, WalletCards, Youtube } from "lucide-react";
import { requireCurrentUser } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { IssueReportForm } from "@/components/issue-report-form";
import { BrandLogo } from "@/components/brand-logo";

export default async function Home() {
  const user = await requireCurrentUser();
  if (user) redirect("/dashboard");

  return (
    <main className="app-viewport overflow-y-auto bg-background text-foreground ios-scroll">
      <section className="mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-6">
        <nav className="flex items-center justify-between gap-3">
          <Link href="/" className="min-w-0">
            <BrandLogo className="min-w-0" />
          </Link>
          <div className="grid shrink-0 grid-cols-2 gap-2">
            <Button asChild variant="ghost" className="px-3 text-sm whitespace-nowrap">
              <Link href="/login">Sign in</Link>
            </Button>
            <Button asChild className="px-3 text-sm whitespace-nowrap">
              <Link href="/signup">Create account</Link>
            </Button>
          </div>
        </nav>

        <div className="grid flex-1 items-center gap-8 py-12 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-6">
            <div className="space-y-3">
              <p className="text-sm font-semibold uppercase tracking-wide text-primary">Daily fitness and life dashboard</p>
              <h1 className="font-display text-4xl font-bold tracking-tight sm:text-5xl">
                Plan workouts, meals, reminders, spends, and YouTube learning in one place.
              </h1>
              <p className="max-w-2xl text-base leading-7 text-muted-foreground">
                Dayza helps users manage everyday health and planning: workout programs, nutrition targets, medications, reminders, spending, progress tracking, and AI-assisted summaries for YouTube videos they choose from their subscriptions.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link href="/signup">Get started</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/login">Sign in</Link>
              </Button>
            </div>
            <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
              <Link href="/privacy" className="hover:text-foreground hover:underline">Privacy Policy</Link>
              <Link href="/terms" className="hover:text-foreground hover:underline">Terms of Service</Link>
            </div>
            <div className="grid max-w-2xl gap-3 pt-2 sm:grid-cols-3">
              <MiniStat label="Private by default" value="User-specific records" />
              <MiniStat label="Manual imports" value="You choose when" />
              <MiniStat label="Agent help" value="Across daily logs" />
            </div>
          </div>

          <div className="grid gap-3">
            <FeatureCard icon={Dumbbell} title="Workouts and progress" text="Create training days, log workouts set by set, and track body progress over time." />
            <FeatureCard icon={Utensils} title="Nutrition and diet" text="Track meals, create diet plans, and compare daily intake with calorie and macro targets." />
            <FeatureCard icon={WalletCards} title="Spends and money hub" text="Manage monthly spend targets, bank accounts, credit card payables, lending, and borrowing." />
            <FeatureCard icon={Pill} title="Medications and reminders" text="Schedule medications and create personal reminders with repeat timing." />
            <FeatureCard icon={Youtube} title="YT Summary" text="Connect YouTube read-only access to list subscriptions and summarize selected videos." />
            <FeatureCard icon={MessageSquare} title="Dayza Agent" text="Ask for help interpreting logs, screenshots, meals, workouts, spending, and video summaries." />
          </div>
        </div>

        <div className="grid gap-4 pb-12 md:grid-cols-3">
          <InfoCard title="How Google access is used">
            Google sign-in identifies your account. YouTube read-only access is used to show your subscriptions and recent videos for summaries. Gmail read-only access is used only when you manually run receipt import or Gmail Tracker grouping.
          </InfoCard>
          <InfoCard title="You stay in control">
            Dayza does not upload, edit, delete, or manage YouTube content. It does not send, delete, or modify Gmail messages. Gmail import scans candidate receipt emails, and Gmail Tracker stores only metadata summaries.
          </InfoCard>
          <InfoCard title="Privacy-minded by design">
            Public policy pages explain what is collected, why it is used, how AI processing works, and how account deletion works.
          </InfoCard>
        </div>

        <div className="pb-12">
          <Card>
            <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-start">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-semibold">Google API Limited Use</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Dayza uses Google user data only to provide user-requested features, such as Google sign-in, YouTube read-only summaries, manual Gmail receipt import, and Gmail Tracker grouping. Dayza&apos;s use and transfer of information received from Google APIs adheres to the Google API Services User Data Policy, including the Limited Use requirements.
                </p>
                <div className="mt-3 flex flex-wrap gap-3 text-sm">
                  <Link href="/privacy" className="text-primary hover:underline">Privacy Policy</Link>
                  <Link href="/terms" className="text-primary hover:underline">Terms of Service</Link>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 pb-12 lg:grid-cols-[0.9fr_1.1fr]">
          <Card>
            <CardContent className="space-y-4 p-6">
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-display text-2xl font-bold tracking-tight">What Dayza is built for</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Dayza is a personal command center for the small things people track every day: training, meals, medicine, reminders, money, progress, and learning. The goal is not just storing logs, but turning those logs into useful next steps.
                </p>
              </div>
            </CardContent>
          </Card>
          <div className="grid gap-3 sm:grid-cols-2">
            <DetailCard icon={Bot} title="Dayza Agent" text="Ask questions, upload screenshots, create workout and diet plans, and let the agent update logs only when you clearly ask." />
            <DetailCard icon={Mail} title="Gmail tracker" text="Receipt import and update grouping use Gmail read-only access only when you start them. Tracker cards store metadata, not full email bodies." />
            <DetailCard icon={Clock} title="Short retention images" text="Dayza Agent chat images can be stored temporarily and removed after the retention window." />
            <DetailCard icon={ShieldCheck} title="Account deletion" text="Deleting an account removes user-owned records such as chats, workouts, spends, reminders, medications, and logs." />
          </div>
        </div>

        <div className="pb-12">
          <IssueReportForm defaultPage="Home page" showContactFields />
        </div>
      </section>
    </main>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card/60 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold">{value}</p>
    </div>
  );
}

function FeatureCard({ icon: Icon, title, text }: { icon: any; title: string; text: string }) {
  return (
    <Card>
      <CardContent className="flex gap-3 p-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <h2 className="font-semibold">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{text}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <ShieldCheck className="h-5 w-5" />
        </div>
        <h2 className="font-semibold">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{children}</p>
      </CardContent>
    </Card>
  );
}

function DetailCard({ icon: Icon, title, text }: { icon: any; title: string; text: string }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </div>
        <h2 className="font-semibold">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p>
      </CardContent>
    </Card>
  );
}
