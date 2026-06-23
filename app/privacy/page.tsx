import Link from "next/link";

export default function PrivacyPage() {
  return (
    <main className="app-viewport overflow-y-auto bg-background px-4 py-10 text-foreground ios-scroll">
      <article className="mx-auto max-w-3xl space-y-7">
        <div>
          <Link href="/" className="text-sm text-primary hover:underline">Dayza</Link>
          <h1 className="mt-3 font-display text-3xl font-bold tracking-tight">Privacy Policy</h1>
          <p className="mt-2 text-sm text-muted-foreground">Last updated: June 23, 2026</p>
        </div>

        <PolicySection title="Overview">
          Dayza is a personal dashboard for fitness, nutrition, reminders, medications, spending, progress tracking, Dayza Agent, and YouTube video summaries. This policy explains what information Dayza collects, how it is used, and how Google user data is handled.
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
          If you grant Gmail read-only access, Dayza uses it only when you explicitly run Gmail-powered features. Gmail receipt import in Spends scans receipt-like messages to extract merchant, amount, date, sender, subject, and related receipt metadata for personal expense tracking. Gmail Tracker reads recent message headers, snippets, label identifiers, sender, subject, and date so Dayza can group updates such as bills, finance, travel, health, work, orders, security, and subscriptions. Dayza does not send, delete, modify, archive, label, or forward Gmail messages, and Gmail Tracker does not store full email bodies.
        </PolicySection>

        <PolicySection title="How Dayza Uses Data">
          Dayza uses your data to provide dashboard features, authenticate your account, calculate fitness and nutrition targets, display history, create reminders, manage personal spending records, summarize selected YouTube videos, generate Dayza Agent responses, and improve your in-app experience.
        </PolicySection>

        <PolicySection title="AI Processing">
          When you request AI help, Dayza may send relevant prompt text, selected logs, uploaded screenshots, YouTube video metadata, transcript text, or other context needed for the requested task to the configured AI provider. Dayza limits AI context to information needed to answer or perform the action you requested.
        </PolicySection>

        <PolicySection title="Data Sharing">
          Dayza does not sell your personal information or Google user data. Dayza does not transfer Google user data to advertising platforms, data brokers, or information resellers. Dayza does not disclose Google user data to third parties except as described in this policy and only as needed to provide, secure, or maintain the app.
        </PolicySection>

        <PolicySection title="Google User Data Sharing and Disclosure">
          Google user data may be shared with service providers that help operate Dayza, such as authentication, database hosting, cloud hosting, file storage, logging, email delivery, and AI processing providers. These providers are permitted to process Google user data only for Dayza's app functionality, security, maintenance, or legal compliance, and not for their own advertising or unrelated purposes. Dayza may also disclose information if required by law, to protect users, to investigate abuse or security issues, or with your explicit direction when you use a feature that requires processing by a connected provider.
        </PolicySection>

        <PolicySection title="Sensitive Data Protection">
          Dayza protects sensitive data, including Google user data, using authentication controls, per-user authorization checks, HTTPS/TLS for data transmitted between the browser and the app, service-provider access controls, and database-backed storage with restricted access. OAuth tokens are handled by the authentication system and are used only to perform the Google features you request. Access to production systems and stored data is limited to the app owner and necessary service providers. Dayza aims to minimize the Google data it reads, use read-only Google scopes where possible, and process only the data needed for the selected feature.
        </PolicySection>

        <PolicySection title="Google API Services User Data Policy">
          Dayza's use and transfer of information received from Google APIs adheres to the Google API Services User Data Policy, including the Limited Use requirements.
        </PolicySection>

        <PolicySection title="Storage and Security">
          Dayza stores application data in a database and uses authentication controls to protect user accounts. OAuth tokens may be stored by the authentication system to perform connected Google features you request. Dayza uses session-based access checks so users can access only their own records. No internet service can be guaranteed fully secure, but Dayza is designed to limit access to user-specific records and reduce unnecessary collection, use, and retention of sensitive information.
        </PolicySection>

        <PolicySection title="Development Risk Notice">
          Dayza is currently in active development. Although the app uses authentication controls and service-provider security features, development-stage systems may contain bugs, configuration mistakes, or incomplete protections. Your data may be exposed, leaked, lost, corrupted, or deleted. Please do not provide sensitive, confidential, regulated, or mission-critical information.
        </PolicySection>

        <PolicySection title="Retention and Deletion">
          Dayza keeps your account data while your account is active or as needed to provide the service. You can delete your account from the Profile page. Account deletion removes user-specific records where supported by the app's database relationships. Dayza may also delete an account and related data if we believe the account is unsafe, compromised, abusive, harmful, unlawful, risky to operate, or otherwise unsuitable for continued access to the service. You can also revoke Google access from your Google Account permissions page.
        </PolicySection>

        <PolicySection title="Your Backups">
          You should keep independent backups of information that is important to you. Dayza should not be used as the only copy of workout history, financial records, medication information, reminders, images, chat history, or other important data.
        </PolicySection>

        <PolicySection title="Children">
          Dayza is not intended for children under 13. Users should not create an account if they are not old enough to use online services in their location.
        </PolicySection>

        <PolicySection title="Changes to This Policy">
          Dayza may update this Privacy Policy as features change. The updated date at the top of this page shows when it was last revised.
        </PolicySection>

        <PolicySection title="Contact">
          For privacy questions, Google data questions, data deletion requests, or security concerns, contact the Dayza app owner using the support email listed on the Google OAuth consent screen. If you are already signed in, you may also use the in-app issue report form from the Home or Profile pages.
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
