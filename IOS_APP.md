# Dayza iOS App

This branch uses Capacitor to package the hosted Dayza web app as an iOS app.

The website and iOS app both stay supported. The iOS wrapper points to `https://dayza.site` by default so API routes, Firebase Auth, Firestore, SQL-backed features, chat, and server-side work keep running through the production deployment.

## Local Setup

```bash
pnpm install
pnpm ios:sync
```

To point the iOS wrapper at a different hosted URL:

```bash
CAPACITOR_SERVER_URL=https://dayza.site pnpm ios:sync
```

## Build On macOS

Final iOS builds require macOS and Xcode.

```bash
pnpm ios:open
```

Then in Xcode:

1. Select the `App` target.
2. Set the Apple developer team and signing settings.
3. Confirm the bundle identifier is `site.dayza.app`.
4. Run on a simulator or physical iPhone.
5. Use Product > Archive for TestFlight or App Store distribution.

## Firebase And Google Login

The website keeps using popup Google sign-in. The iOS wrapper prefers Firebase redirect sign-in when it detects Capacitor.

Keep these configured:

- Firebase Auth authorized domains: `dayza.site`, `auth.dayza.site`, `localhost`
- Google OAuth JavaScript origins: `https://dayza.site`, `https://auth.dayza.site`, local development origins
- Google OAuth redirect URIs: `https://auth.dayza.site/__/auth/handler` and `https://dayza.site/__/auth/handler` if you continue testing both

After changing Firebase or OAuth settings, redeploy the website and run:

```bash
pnpm ios:sync
```

## Notes

- Do not static-export the Next app for iOS. Dayza depends on server APIs.
- Keep `dayza.site` and any auth subdomains configured in Firebase and Google OAuth.
- After changing Capacitor config, run `pnpm ios:sync`.
- iOS App Store signing, simulator testing, and TestFlight upload must be completed on macOS with Xcode.
