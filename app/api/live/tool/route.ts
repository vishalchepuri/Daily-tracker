export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { executeDayzaLiveTool } from "@/lib/dayza-live-tools";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";

export async function POST(req: Request) {
  try {
    const user = await requireCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const limited = rateLimit(req, "gemini-live-tool", {
      limit: 180,
      windowMs: 60 * 60 * 1000,
      userId: user.id,
    });
    if (!limited.ok) {
      return NextResponse.json(
        { error: "Too many Live Agent tool calls. Please try again later." },
        { status: 429, headers: rateLimitHeaders(limited) }
      );
    }

    const body = await req.json().catch(() => ({}));
    const name = String(body?.name || "").trim();
    if (!name) return NextResponse.json({ error: "Tool name is required" }, { status: 400 });

    const result = await executeDayzaLiveTool(user.id, name, body?.args ?? {});
    return NextResponse.json({ result });
  } catch (error: any) {
    return NextResponse.json(
      { error: process.env.NODE_ENV === "production" ? "Live Agent tool failed" : error?.message ?? "Live Agent tool failed" },
      { status: 500 }
    );
  }
}
