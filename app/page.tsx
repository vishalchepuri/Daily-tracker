import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { Dumbbell, MessageSquare, Pill, ShieldCheck, Utensils, WalletCards, Youtube } from "lucide-react";
import { authOptions } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default async function Home() {
  const session = await getServerSession(authOptions);
  if (session) redirect("/dashboard");

  return (
    <main className="app-viewport overflow-y-auto bg-background text-foreground ios-scroll">
      <section className="mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-6">
        <nav className="flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
              <Dumbbell className="h-6 w-6 text-primary-foreground" />
            </div>
            <span className="font-display text-2xl font-bold tracking-tight">Dayza</span>
          </Link>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost">
              <Link href="/login">Sign in</Link>
            </Button>
            <Button asChild>
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
          </div>

          <div className="grid gap-3">
            <FeatureCard icon={Dumbbell} title="Workouts and progress" text="Create training days, log workouts set by set, and track body progress over time." />
            <FeatureCard icon={Utensils} title="Nutrition and diet" text="Track meals, create diet plans, and compare daily intake with calorie and macro targets." />
            <FeatureCard icon={WalletCards} title="Spends and money hub" text="Manage monthly spend targets, bank accounts, credit card payables, lending, and borrowing." />
            <FeatureCard icon={Pill} title="Medications and reminders" text="Schedule medications and create personal reminders with repeat timing." />
            <FeatureCard icon={Youtube} title="YT Summary" text="Connect YouTube read-only access to list subscriptions and summarize selected videos." />
            <FeatureCard icon={MessageSquare} title="AI Coach" text="Ask for help interpreting logs, screenshots, meals, workouts, spending, and video summaries." />
          </div>
        </div>

        <div className="grid gap-4 pb-12 md:grid-cols-3">
          <InfoCard title="How Google access is used">
            Google sign-in identifies your account. YouTube read-only access is used to show your subscriptions and recent videos for summaries. Gmail read-only access is used only when you choose to import receipt-like emails into Spends.
          </InfoCard>
          <InfoCard title="You stay in control">
            Dayza does not upload, edit, delete, or manage YouTube content. It does not send, delete, or modify Gmail messages. You can revoke Google access from your Google Account at any time.
          </InfoCard>
          <InfoCard title="Privacy-minded by design">
            Public policy pages explain what is collected, why it is used, how AI processing works, and how account deletion works.
          </InfoCard>
        </div>
      </section>
    </main>
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
