export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const requiredEnv = [
  "DATABASE_URL",
  "NEXTAUTH_SECRET",
  "NEXTAUTH_URL",
  "ABACUSAI_API_KEY",
  "RESEND_API_KEY",
  "EMAIL_FROM",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "TELEGRAM_BOT_TOKEN",
];

const recommendedEnv = [
  "ADMIN_EMAILS",
  "TELEGRAM_WEBHOOK_SECRET",
];

function envStatus(name: string) {
  return {
    name,
    present: Boolean(process.env[name]),
  };
}

export async function GET() {
  const required = requiredEnv.map(envStatus);
  const recommended = recommendedEnv.map(envStatus);
  let database = "ok";

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    database = "unreachable";
  }

  const missingRequired = required.filter((item) => !item.present).map((item) => item.name);
  const missingRecommended = recommended.filter((item) => !item.present).map((item) => item.name);
  const ok = database === "ok" && missingRequired.length === 0;

  return NextResponse.json(
    {
      ok,
      database,
      missingRequired,
      missingRecommended,
      required,
      recommended,
    },
    { status: ok ? 200 : 503 }
  );
}
