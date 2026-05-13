# FitCoach Pro Dashboard

FitCoach Pro is a fitness, nutrition, health, reminders, and AI coaching dashboard built with Next.js, Prisma, PostgreSQL, and NextAuth.

## Current Status

The app runs locally against a PostgreSQL database and includes dashboard pages for workouts, nutrition, diet plans, reminders, progress, Telegram reminders, and an AI coach/agent.

Default local URL:

```bash
http://localhost:3000
```

## Tech Stack

- Next.js 14 App Router
- React 18
- Prisma 6
- PostgreSQL database
- NextAuth credentials login
- Tailwind CSS
- shadcn/Radix UI components
- Abacus/OpenAI-compatible chat completions endpoint for AI coaching

## Setup

Install dependencies:

```bash
pnpm install
```

Generate Prisma Client:

```bash
pnpm exec prisma generate
```

Create/update the database:

```bash
pnpm exec prisma db push
```

Seed starter data:

```bash
pnpm exec prisma db seed
```

Run the app:

```bash
pnpm dev
```

## Environment

Do not commit `.env`. Copy `.env.example` to `.env` locally and fill in real values:

```bash
cp .env.example .env
```

Required values:

```bash
DATABASE_URL="postgresql://USER:PASSWORD@HOST/DATABASE?sslmode=require"
NEXTAUTH_SECRET="replace-with-a-long-random-secret"
NEXTAUTH_URL="http://localhost:3000"
ABACUSAI_API_KEY="your-key"
```

Gmail spend import requires a Google OAuth app with Gmail API enabled and the redirect URL:

```bash
http://localhost:3000/api/auth/callback/google
```

Optional storage values are used for progress photo uploads:

```bash
AWS_PROFILE=
AWS_REGION=
AWS_BUCKET_NAME=
AWS_FOLDER_PREFIX=
```

Telegram reminders require:

```bash
TELEGRAM_BOT_TOKEN="your-telegram-bot-token"
```

## Deployment

This app cannot be fully hosted on GitHub Pages / `github.io` because it uses:

- Next.js API routes
- NextAuth server-side authentication
- Prisma database access
- private environment variables such as `DATABASE_URL`, `NEXTAUTH_SECRET`, `ABACUSAI_API_KEY`, and `TELEGRAM_BOT_TOKEN`

GitHub Pages only serves static files and does not provide a secure server runtime for those secrets.

Recommended hosting:

- Vercel
- Render
- Railway
- Fly.io

Set environment variables in the hosting provider's dashboard. Do not put secrets in source code or commit them to GitHub.

## Features

### Dashboard

- Daily macro summary
- Workout count and streak
- Recent progress
- Today’s food and workout activity

### Nutrition

- Log meals by breakfast, lunch, dinner, and snack
- Edit and delete food logs
- Track calories, protein, carbs, fat, fiber, and water
- Edit nutrition targets:
  - calories
  - protein
  - carbs
  - fat
  - fiber
  - water
- Quick-add water buttons
- Muscle-building meal suggestions

### Workouts

- Workout programs/days
- Exercise library
- Workout history
- Add and edit exercises
- Add and edit workout days
- Configure workout day exercises, sets, reps, and rest seconds
- Log workouts with sets, reps, and weight

### Fitness

- Weekly workout count
- Weekly training minutes
- Weekly lift volume
- Active calorie burn from imported health data
- Workout day overview
- Recent training sessions

### Spends

- Manual spend tracking
- Edit and delete spend entries
- Monthly spend summary
- Gmail connection button
- Gmail receipt import using read-only Gmail scope
- Imports likely receipt, invoice, order, payment, and purchase emails
- Stores Gmail imports locally with deduplication by Gmail message ID

### Reminders

- Apple Reminders-style local reminder manager
- Smart views:
  - Today
  - Scheduled
  - All
  - Flagged
  - Completed
- Custom reminder lists with colors
- Add, edit, complete, and delete reminders
- Due dates and times
- Calendar date picker and dropdown time picker
- Recurrence: daily, weekly, monthly, and custom
- Notes
- Flags
- Priorities

### Health

- Steps
- Active calories
- Exercise minutes
- Sleep
- Water
- Resting heart rate
- VO2 max
- Body weight
- Recent Apple Health metrics

### Progress

- Body weight tracking
- Body measurements
- Strength charts
- Progress photo uploads

### Apple Health Import

The app can import Apple Health `export.xml` or an Apple Health ZIP containing `export.xml`.

Supported imported records:

- steps
- active energy
- basal energy
- walking/running distance
- heart rate
- resting heart rate
- exercise minutes
- sleep analysis
- flights climbed
- VO2 max
- body weight
- workouts
- sleep sessions

Imported body weight is also saved to Progress. Imported workouts are saved to Workout History. Imported sleep analysis is saved as Health sleep sessions.

Important current limitation:

- The importer currently reads `export.xml` into memory.
- Very large Apple Health exports, like an 800 MB plus uncompressed `export.xml`, are not safe for the current importer.
- The API now rejects uploads over 200 MB with a clear error instead of risking a crash.
- For very large exports, add a streaming XML importer before uploading the full archive.

Apple Health files shown in exports:

- `export.xml`: main health records. This is the file the app imports.
- `export_cda.xml`: clinical document data. Not imported currently.
- `electrocardiograms/`: ECG files. Not imported currently.
- `workout-routes/`: route files. Not imported currently.

### AI Coach And Agent

The AI Coach is more than a chatbot. It can answer questions and take controlled actions in the app.

Supported AI actions:

- answer fitness and nutrition questions
- read profile and recent dashboard context
- log food
- estimate food from uploaded meal images
- ask for portion/quantity when food image confidence is low
- save progress entries
- log workouts
- add exercises to the exercise library
- log sleep from Apple Health sleep screenshots, including total sleep and visible stages

Chat input features:

- text chat
- food image upload
- sleep screenshot upload
- microphone speech-to-text input when the browser supports SpeechRecognition

Example AI prompts:

```text
Add chest press exercise in exercise library
Log 200g chicken breast for lunch
Save my weight as 81.2 kg today
Log a 45 minute push workout, notes: felt strong
How much protein do I need today?
```

## Data Model Highlights

Main Prisma models:

- `User`
- `UserProfile`
- `FoodLog`
- `WaterLog`
- `Spend`
- `ReminderList`
- `Reminder`
- `Exercise`
- `WorkoutTemplate`
- `WorkoutExercise`
- `WorkoutLog`
- `ExerciseLog`
- `ProgressEntry`
- `ProgressPhoto`
- `HealthMetric`
- `ChatMessage`

## Custom Instructions For Future Changes

- Keep the app local-first unless explicitly moving to a hosted database.
- Use SQLite-compatible Prisma schema features.
- When adding nutrition fields, update:
  - `prisma/schema.prisma`
  - food log API
  - nutrition UI totals
  - AI `create_food_log` action
  - README
- When adding AI actions, keep them explicit and narrow. The agent should only mutate app data when the user clearly asks.
- For Apple Health, do not increase upload limits casually. Large exports need streaming parsing, batching, and progress reporting.
- Preserve existing user data when modifying the database.
- On Windows, stop the dev server before regenerating Prisma Client if the query engine DLL is locked.
- Prefer `pnpm` for dependency management in this repo.
- Run validation before handing off:

```bash
pnpm exec tsc --noEmit
```

## Known Limitations

- Apple Health large-file import needs a streaming parser before full exports can be imported safely.
- ECG and workout route folders are not imported yet.
- AI image food logging depends on the configured AI endpoint supporting vision input.
- Speech-to-text depends on browser support.
- `NEXTAUTH_URL` may warn in development if it is not set, but local auth still works.
