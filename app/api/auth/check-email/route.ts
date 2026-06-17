export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getBlockedEmailMessage, isBlockedEmailDomain } from "@/lib/email-domain-guard";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";

export async function POST(req: Request) {
  try {
    const limited = rateLimit(req, "check-email", { limit: 60, windowMs: 10 * 60 * 1000 });
    if (!limited.ok) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429, headers: rateLimitHeaders(limited) }
      );
    }
    const { email } = await req.json();
    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }
    if (isBlockedEmailDomain(email)) {
      return NextResponse.json({ error: getBlockedEmailMessage(email) }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Could not validate email" }, { status: 400 });
  }
}
