export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getWebPushConfigStatus, isWebPushConfigured, pruneStalePushSubscriptions } from "@/lib/web-push";
import { DEFAULT_TIME_ZONE, normalizeTimeZone } from "@/lib/local-dates";
import { createHash } from "crypto";

function shortDeviceId(endpoint: string) {
  return createHash("sha256").update(endpoint).digest("hex").slice(0, 8).toUpperCase();
}

function readBrowser(userAgent?: string | null) {
  const ua = userAgent ?? "";
  if (/CriOS|Chrome/i.test(ua) && !/Edg/i.test(ua)) return "Chrome";
  if (/Safari/i.test(ua) && !/Chrome|CriOS|Android/i.test(ua)) return "Safari";
  if (/Edg/i.test(ua)) return "Edge";
  if (/Firefox|FxiOS/i.test(ua)) return "Firefox";
  return "Browser";
}

function readPlatform(userAgent?: string | null) {
  const ua = userAgent ?? "";
  if (/iPhone/i.test(ua)) return "iPhone";
  if (/iPad/i.test(ua)) return "iPad";
  if (/Android/i.test(ua)) return "Android";
  if (/Windows/i.test(ua)) return "Windows";
  if (/Macintosh|Mac OS/i.test(ua)) return "Mac";
  if (/Linux/i.test(ua)) return "Linux";
  return "Device";
}

function toSafeDevice(subscription: {
  id: string;
  endpoint: string;
  userAgent: string | null;
  createdAt: Date;
  updatedAt: Date;
  lastUsedAt: Date | null;
}, currentId?: string | null) {
  const browser = readBrowser(subscription.userAgent);
  const platform = readPlatform(subscription.userAgent);
  return {
    id: subscription.id,
    deviceId: shortDeviceId(subscription.endpoint),
    label: `${platform} ${browser}`,
    browser,
    platform,
    isCurrent: subscription.id === currentId,
    createdAt: subscription.createdAt,
    updatedAt: subscription.updatedAt,
    lastUsedAt: subscription.lastUsedAt,
  };
}

export async function GET(req: Request) {
  try {
    const user = await requireCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const currentEndpoint = String(req.headers.get("x-dayza-push-endpoint") ?? "").trim();
    await pruneStalePushSubscriptions(user.id);

    const [subscriptions, currentSubscription, profile] = await Promise.all([
      prisma.webPushSubscription.findMany({
        where: { userId: user.id },
        orderBy: { updatedAt: "desc" },
        select: { id: true, endpoint: true, userAgent: true, createdAt: true, updatedAt: true, lastUsedAt: true },
      }),
      currentEndpoint
        ? prisma.webPushSubscription.findFirst({
            where: { userId: user.id, endpoint: currentEndpoint },
            select: { id: true, endpoint: true, userAgent: true, createdAt: true, updatedAt: true, lastUsedAt: true },
          })
        : Promise.resolve(null),
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
      subscribed: Boolean(currentSubscription),
      subscription: currentSubscription ? toSafeDevice(currentSubscription, currentSubscription.id) : null,
      devices: subscriptions.map((subscription) => toSafeDevice(subscription, currentSubscription?.id)),
      timeZone: profile?.timeZone ?? DEFAULT_TIME_ZONE,
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
    const id = String(data?.id ?? "").trim();

    if (id) {
      await prisma.webPushSubscription.deleteMany({
        where: { userId: user.id, id },
      });
    } else if (endpoint) {
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
