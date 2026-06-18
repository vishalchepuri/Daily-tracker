export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getWebPushConfigStatus, isWebPushConfigured } from "@/lib/web-push";
import { normalizeTimeZone } from "@/lib/local-dates";

export async function GET() {
  try {
    const user = await requireCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const [subscription, profile] = await Promise.all([
      prisma.webPushSubscription.findFirst({
        where: { userId: user.id },
        orderBy: { updatedAt: "desc" },
        select: { id: true, endpoint: true, updatedAt: true },
      }),
      prisma.userProfile.findUnique({
        where: { userId: user.id },
        select: { timeZone: true },
      }),
    ]);

    const webPushConfig = getWebPushConfigStatus();

    return NextResponse.json({
      configured: webPushConfig.configured,
      publicKey: webPushConfig.publicKey,
      missing: webPushConfig.missing,
      subscribed: Boolean(subscription),
      subscription,
      timeZone: profile?.timeZone ?? null,
    });
  } catch (error: any) {
    return NextResponse.json({ error: process.env.NODE_ENV === "production" ? "Failed" : error?.message ?? "Failed" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!isWebPushConfigured()) {
      return NextResponse.json({ error: "Web push is not configured" }, { status: 400 });
    }

    const data = await req.json();
    const endpoint = String(data?.endpoint ?? "").trim();
    const p256dh = String(data?.keys?.p256dh ?? "").trim();
    const auth = String(data?.keys?.auth ?? "").trim();
    if (!endpoint || !p256dh || !auth) {
      return NextResponse.json({ error: "Invalid push subscription payload" }, { status: 400 });
    }
    const timeZone = normalizeTimeZone(data?.timeZone);

    const [subscription] = await Promise.all([
      prisma.webPushSubscription.upsert({
        where: { endpoint },
        update: {
          userId: user.id,
          p256dh,
          auth,
          expirationTime: data?.expirationTime ? new Date(data.expirationTime) : null,
          userAgent: req.headers.get("user-agent"),
        },
        create: {
          userId: user.id,
          endpoint,
          p256dh,
          auth,
          expirationTime: data?.expirationTime ? new Date(data.expirationTime) : null,
          userAgent: req.headers.get("user-agent"),
        },
      }),
      prisma.userProfile.upsert({
        where: { userId: user.id },
        update: { timeZone },
        create: { userId: user.id, timeZone },
      }),
    ]);

    return NextResponse.json({ ok: true, subscription });
  } catch (error: any) {
    return NextResponse.json({ error: process.env.NODE_ENV === "production" ? "Failed" : error?.message ?? "Failed" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await requireCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const data = await req.json().catch(() => ({}));
    const endpoint = String(data?.endpoint ?? "").trim();

    if (endpoint) {
      await prisma.webPushSubscription.deleteMany({
        where: { userId: user.id, endpoint },
      });
    } else {
      await prisma.webPushSubscription.deleteMany({
        where: { userId: user.id },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: process.env.NODE_ENV === "production" ? "Failed" : error?.message ?? "Failed" }, { status: 500 });
  }
}
