export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { cacheGetJson, cacheSetJson } from "@/lib/cache";
import { formatLocalDateInput } from "@/lib/local-dates";
import { getDashboardData } from "@/lib/services/dashboard-service";

const DASHBOARD_CACHE_TTL_SECONDS = 2 * 60;

export async function GET() {
  try {
    const user = await requireCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = user.id;
    const cacheKey = `v1:dashboard:${userId}:day:${formatLocalDateInput(new Date())}`;
    const cached = await cacheGetJson<any>(cacheKey);

    if (cached) {
      return NextResponse.json(cached, {
        headers: {
          "X-Dayza-Cache": "HIT",
          "Cache-Control": "private, max-age=30, stale-while-revalidate=120",
        },
      });
    }

    const dashboardData = await getDashboardData(userId);
    await cacheSetJson(cacheKey, dashboardData, DASHBOARD_CACHE_TTL_SECONDS);
    return NextResponse.json(dashboardData, {
      headers: {
        "X-Dayza-Cache": "MISS",
        "Cache-Control": "private, max-age=30, stale-while-revalidate=120",
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: process.env.NODE_ENV === "production" ? "Failed" : error?.message ?? "Failed" }, { status: 500 });
  }
}
