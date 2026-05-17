import Link from "next/link";

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-background px-4 py-10 text-foreground">
      <article className="mx-auto max-w-3xl space-y-6">
        <div>
          <Link href="/" className="text-sm text-primary hover:underline">Dayza</Link>
          <h1 className="mt-3 font-display text-3xl font-bold tracking-tight">Terms of Service</h1>
          <p className="mt-2 text-sm text-muted-foreground">Last updated: May 17, 2026</p>
        </div>

        <TermsSection title="Use of Dayza">
          Dayza is a personal dashboard for fitness, nutrition, spending, reminders, medications, progress tracking, AI coaching, and YouTube video summaries. You are responsible for the information you enter and the actions you take based on app output.
        </TermsSection>

        <TermsSection title="Health and Fitness Disclaimer">
          Dayza is not medical advice. Workout, nutrition, medication, and wellness suggestions are informational only. Consult a qualified professional before making health, medication, injury, diet, or training decisions.
        </TermsSection>

        <TermsSection title="Financial Disclaimer">
          Spending, bank balance, credit card payable, lending, and borrowing features are personal tracking tools only. Dayza is not financial advice and does not replace official bank or card statements.
        </TermsSection>

        <TermsSection title="Google and YouTube Features">
          If you connect Google, you authorize Dayza to use the granted permissions for the features you request, such as reading YouTube subscriptions and recent videos for summary generation or importing Gmail receipt information. You can revoke Google access from your Google Account settings.
        </TermsSection>

        <TermsSection title="AI Output">
          AI-generated summaries and coaching responses may be incomplete or inaccurate. You should review important information before relying on it.
        </TermsSection>

        <TermsSection title="Accounts">
          You are responsible for keeping your account credentials secure. You may delete your account from the Profile page where available.
        </TermsSection>

        <TermsSection title="Changes">
          Dayza may change features or these terms over time. Continued use of the app means you accept the updated terms.
        </TermsSection>

        <div className="border-t border-border pt-6 text-sm">
          <Link href="/privacy" className="text-primary hover:underline">Privacy Policy</Link>
        </div>
      </article>
    </main>
  );
}

function TermsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="font-display text-xl font-semibold">{title}</h2>
      <p className="leading-7 text-muted-foreground">{children}</p>
    </section>
  );
}
