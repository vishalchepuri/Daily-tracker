import Link from "next/link";

export default function TermsPage() {
  return (
    <main className="app-viewport overflow-y-auto bg-background px-4 py-10 text-foreground ios-scroll">
      <article className="mx-auto max-w-3xl space-y-7">
        <div>
          <Link href="/" className="text-sm text-primary hover:underline">Dayza</Link>
          <h1 className="mt-3 font-display text-3xl font-bold tracking-tight">Terms of Service</h1>
          <p className="mt-2 text-sm text-muted-foreground">Last updated: May 17, 2026</p>
        </div>

        <TermsSection title="Acceptance of Terms">
          By creating an account or using Dayza, you agree to these Terms of Service and the Privacy Policy. If you do not agree, do not use the app.
        </TermsSection>

        <TermsSection title="What Dayza Provides">
          Dayza provides personal dashboard tools for workouts, nutrition, reminders, medications, spending, bank balance tracking, credit card payable tracking, progress logs, AI coaching, and YouTube video summaries. Features may change over time.
        </TermsSection>

        <TermsSection title="Your Account">
          You are responsible for maintaining the security of your account and for all activity under your account. You agree to provide accurate information and not use Dayza for unlawful, abusive, or harmful purposes.
        </TermsSection>

        <TermsSection title="Google and YouTube Access">
          If you connect Google, you authorize Dayza to use the permissions you grant for the features you request. YouTube read-only access is used to show subscriptions, list recent videos from selected channels, and summarize selected videos. Gmail read-only access is used only for receipt import when you start that import. You may revoke access from your Google Account at any time.
        </TermsSection>

        <TermsSection title="Health and Fitness Disclaimer">
          Dayza is not medical advice. Workout, nutrition, medication, sleep, recovery, and wellness suggestions are informational only. Always consult a qualified medical professional before making health decisions, changing medication routines, training around injuries, or starting a new diet or exercise program.
        </TermsSection>

        <TermsSection title="Medication Disclaimer">
          Medication reminders are tracking aids only. Dayza does not prescribe medication, verify dosage safety, or replace instructions from your doctor, pharmacist, or healthcare provider.
        </TermsSection>

        <TermsSection title="Financial Disclaimer">
          Spending, bank account, credit card payable, lending, and borrowing features are personal tracking tools only. Dayza is not financial advice and does not replace official bank statements, credit card statements, tax records, or professional financial guidance.
        </TermsSection>

        <TermsSection title="AI Output">
          AI-generated summaries, plans, interpretations, and coaching responses may be incomplete, outdated, or inaccurate. You should review important information independently before relying on it. You are responsible for decisions made from AI output.
        </TermsSection>

        <TermsSection title="User Content">
          You retain responsibility for information you enter, upload, or connect to Dayza. Do not upload content you do not have rights to use or content that violates privacy, law, or platform rules.
        </TermsSection>

        <TermsSection title="Third-Party Services">
          Dayza may rely on third-party services such as Google, YouTube, email delivery, hosting, database, storage, and AI providers. Your use of those services may also be governed by their own terms and policies.
        </TermsSection>

        <TermsSection title="Availability">
          Dayza may be unavailable at times due to maintenance, provider outages, network issues, or changes to third-party APIs. Dayza is provided without a guarantee of uninterrupted availability.
        </TermsSection>

        <TermsSection title="Account Deletion">
          You may delete your account from the Profile page where available. Deletion removes user-specific records where supported by the app's database relationships. Some provider logs or backups may persist for a limited time according to infrastructure provider policies.
        </TermsSection>

        <TermsSection title="Changes to Terms">
          Dayza may update these terms as the app changes. Continued use of Dayza after updates means you accept the revised terms.
        </TermsSection>

        <TermsSection title="Contact">
          For questions about these terms, contact the app owner using the support email listed on the Google OAuth consent screen or the account email associated with Dayza.
        </TermsSection>

        <div className="flex flex-wrap gap-4 border-t border-border pt-6 text-sm">
          <Link href="/" className="text-primary hover:underline">Home</Link>
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
