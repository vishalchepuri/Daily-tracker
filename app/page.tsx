import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { Dumbbell, MessageSquare, WalletCards, Youtube } from "lucide-react";
import { authOptions } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default async function Home() {
  const session = await getServerSession(authOptions);
  if (session) redirect("/dashboard");

  return (
    <main className="min-h-screen bg-background text-foreground">
      <section className="mx-auto flex min-h-screen max-w-5xl flex-col px-4 py-6">
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
                Dayza helps users track fitness, nutrition, medications, expenses, reminders, and AI-assisted summaries for YouTube videos they choose from their subscriptions.
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
            <FeatureCard icon={Dumbbell} title="Fitness and nutrition" text="Track workouts, diet, health targets, and progress." />
            <FeatureCard icon={WalletCards} title="Spends and reminders" text="Manage monthly spend targets, bank accounts, credit card payables, and daily reminders." />
            <FeatureCard icon={Youtube} title="YT Summary" text="Connect YouTube access to list subscriptions and summarize selected videos." />
            <FeatureCard icon={MessageSquare} title="AI Coach" text="Ask for help interpreting logs, screenshots, and daily plans." />
          </div>
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
