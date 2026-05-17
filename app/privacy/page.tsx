import Link from "next/link";

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-background px-4 py-10 text-foreground">
      <article className="mx-auto max-w-3xl space-y-6">
        <div>
          <Link href="/" className="text-sm text-primary hover:underline">Dayza</Link>
          <h1 className="mt-3 font-display text-3xl font-bold tracking-tight">Privacy Policy</h1>
          <p className="mt-2 text-sm text-muted-foreground">Last updated: May 17, 2026</p>
        </div>

        <PolicySection title="What Dayza Collects">
          Dayza stores the account information you provide, such as name, email address, profile settings, fitness details, nutrition logs, workout logs, reminders, medication schedules, spending records, bank account labels and balances, credit card payable amounts, progress entries, uploaded screenshots, and chat messages you create in the app.
        </PolicySection>

        <PolicySection title="Google and YouTube Data">
          If you connect Google, Dayza may request read-only access to Gmail receipts and YouTube subscriptions/videos. YouTube access is used to show your subscribed channels, list recent videos from a selected channel, and generate a summary for a video you choose. Gmail access is used only to scan receipt-like emails when you explicitly run the import feature. Dayza does not sell Google user data.
        </PolicySection>

        <PolicySection title="How Data Is Used">
          Your data is used to provide dashboard features, calculate targets, display history, generate AI coaching responses, send reminders, summarize selected YouTube videos, and improve your personal experience inside Dayza.
        </PolicySection>

        <PolicySection title="AI Processing">
          When you ask for AI help, Dayza may send relevant prompt text, selected logs, screenshots, video metadata, or transcript text to the configured AI provider to generate a response. Only data needed for the requested feature is sent.
        </PolicySection>

        <PolicySection title="Storage and Security">
          Dayza stores application data in a database and uses authentication to protect user accounts. Access tokens from connected providers are stored by the authentication system so the app can perform requested connected features.
        </PolicySection>

        <PolicySection title="Sharing">
          Dayza does not sell your personal information. Data may be processed by infrastructure providers used to run the app, authentication providers, email delivery providers, storage providers, and AI providers when necessary to provide the service.
        </PolicySection>

        <PolicySection title="Deleting Your Data">
          You can delete your account from the Profile page. Deleting an account removes user-specific application records where supported by the app database relationships.
        </PolicySection>

        <PolicySection title="Contact">
          For privacy questions, contact the app owner at the support email shown in the Google OAuth consent screen or through the account email used for Dayza.
        </PolicySection>

        <div className="border-t border-border pt-6 text-sm">
          <Link href="/terms" className="text-primary hover:underline">Terms of Service</Link>
        </div>
      </article>
    </main>
  );
}

function PolicySection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="font-display text-xl font-semibold">{title}</h2>
      <p className="leading-7 text-muted-foreground">{children}</p>
    </section>
  );
}
