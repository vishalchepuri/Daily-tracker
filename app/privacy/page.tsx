import Link from "next/link";

export default function PrivacyPage() {
  return (
    <main className="app-viewport overflow-y-auto bg-background px-4 py-10 text-foreground ios-scroll">
      <article className="mx-auto max-w-3xl space-y-7">
        <div>
          <Link href="/" className="text-sm text-primary hover:underline">Dayza</Link>
          <h1 className="mt-3 font-display text-3xl font-bold tracking-tight">Privacy Policy</h1>
          <p className="mt-2 text-sm text-muted-foreground">Last updated: May 17, 2026</p>
        </div>

        <PolicySection title="Overview">
          Dayza is a personal dashboard for fitness, nutrition, reminders, medications, spending, progress tracking, AI coaching, and YouTube video summaries. This policy explains what information Dayza collects, how it is used, and how Google user data is handled.
        </PolicySection>

        <PolicySection title="Information You Provide">
          Dayza stores account and profile information you provide, including name, email address, age, height, weight, gender, activity level, goals, health limitations, food allergies, reminders, medication schedules, workout plans, workout logs, nutrition logs, diet plans, water logs, progress entries, spending records, bank account labels and balances, credit card payable amounts, lend/borrow entries, uploaded screenshots, and chat messages.
        </PolicySection>

        <PolicySection title="Google Sign-In Data">
          When you sign in with Google, Dayza receives basic profile information such as your Google account identifier, email address, name, and profile image when provided by Google. This information is used to create or access your Dayza account.
        </PolicySection>

        <PolicySection title="YouTube Data">
          If you grant YouTube read-only access, Dayza uses it to list your subscribed channels and recent videos from a selected subscribed channel. When you choose a video, Dayza may use video metadata and available transcript text to generate a summary. Dayza does not upload, edit, delete, rate, comment on, or manage YouTube videos, channels, playlists, or subscriptions.
        </PolicySection>

        <PolicySection title="Gmail Data">
          If you grant Gmail read-only access, Dayza uses it only when you explicitly run the Gmail receipt import feature in Spends. The app scans receipt-like messages to extract merchant, amount, date, sender, subject, and related receipt metadata for personal expense tracking. Dayza does not send, delete, modify, archive, label, or forward Gmail messages.
        </PolicySection>

        <PolicySection title="How Dayza Uses Data">
          Dayza uses your data to provide dashboard features, authenticate your account, calculate fitness and nutrition targets, display history, create reminders, manage personal spending records, summarize selected YouTube videos, generate AI coaching responses, and improve your in-app experience.
        </PolicySection>

        <PolicySection title="AI Processing">
          When you request AI help, Dayza may send relevant prompt text, selected logs, uploaded screenshots, YouTube video metadata, transcript text, or other context needed for the requested task to the configured AI provider. Dayza limits AI context to information needed to answer or perform the action you requested.
        </PolicySection>

        <PolicySection title="Data Sharing">
          Dayza does not sell your personal information or Google user data. Data may be processed by service providers used to run the app, including database hosting, authentication, email delivery, file storage, analytics or logging, and AI processing providers. These providers process data only as needed to operate Dayza.
        </PolicySection>

        <PolicySection title="Google API Services User Data Policy">
          Dayza's use and transfer of information received from Google APIs adheres to the Google API Services User Data Policy, including the Limited Use requirements.
        </PolicySection>

        <PolicySection title="Storage and Security">
          Dayza stores application data in a database and uses authentication controls to protect user accounts. OAuth tokens may be stored by the authentication system to perform connected Google features you request. No internet service can be guaranteed fully secure, but Dayza is designed to limit access to user-specific records.
        </PolicySection>

        <PolicySection title="Retention and Deletion">
          Dayza keeps your account data while your account is active or as needed to provide the service. You can delete your account from the Profile page. Account deletion removes user-specific records where supported by the app's database relationships. You can also revoke Google access from your Google Account permissions page.
        </PolicySection>

        <PolicySection title="Children">
          Dayza is not intended for children under 13. Users should not create an account if they are not old enough to use online services in their location.
        </PolicySection>

        <PolicySection title="Changes to This Policy">
          Dayza may update this Privacy Policy as features change. The updated date at the top of this page shows when it was last revised.
        </PolicySection>

        <PolicySection title="Contact">
          For privacy questions, contact the app owner using the support email listed on the Google OAuth consent screen or the account email associated with Dayza.
        </PolicySection>

        <div className="flex flex-wrap gap-4 border-t border-border pt-6 text-sm">
          <Link href="/" className="text-primary hover:underline">Home</Link>
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
