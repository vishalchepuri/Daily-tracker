import webpush from "web-push";
import { prisma } from "@/lib/db";

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  icon?: string;
  badge?: string;
  requireInteraction?: boolean;
  data?: Record<string, any>;
};

function getBaseUrl() {
  return process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "https://dayza.site";
}

function env(name: string) {
  return process.env[name]?.trim();
}

function readPublicVapidKey() {
  return env("VAPID_PUBLIC_KEY") || env("NEXT_PUBLIC_VAPID_PUBLIC_KEY");
}

export function getWebPushConfigStatus() {
  const missing: string[] = [];
  if (!readPublicVapidKey()) missing.push("publicKey");
  if (!env("VAPID_PRIVATE_KEY")) missing.push("privateKey");
  if (!env("VAPID_SUBJECT")) missing.push("subject");

  return {
    configured: missing.length === 0,
    missing,
    publicKey: readPublicVapidKey() ?? null,
  };
}

export function isWebPushConfigured() {
  return getWebPushConfigStatus().configured;
}

export function getPublicVapidKey() {
  const key = readPublicVapidKey();
  if (!key) throw new Error("NEXT_PUBLIC_VAPID_PUBLIC_KEY is missing");
  return key;
}

function configureWebPush() {
  if (!isWebPushConfigured()) {
    throw new Error("Web push is not configured. Add NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, and VAPID_SUBJECT.");
  }

  webpush.setVapidDetails(
    env("VAPID_SUBJECT")!,
    getPublicVapidKey(),
    env("VAPID_PRIVATE_KEY")!
  );
}

function normalizePayload(payload: PushPayload) {
  return JSON.stringify({
    title: payload.title,
    body: payload.body,
    tag: payload.tag ?? "dayza-notification",
    url: payload.url ?? "/dashboard",
    icon: payload.icon ?? "/icon-192.png",
    badge: payload.badge ?? "/icon-192.png",
    requireInteraction: Boolean(payload.requireInteraction),
    data: payload.data ?? {},
  });
}

export async function pruneStalePushSubscriptions(userId?: string, maxAgeDays = 60) {
  const cutoff = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000);
  const result = await prisma.webPushSubscription.deleteMany({
    where: {
      ...(userId ? { userId } : {}),
      lastUsedAt: null,
      updatedAt: { lt: cutoff },
    },
  });
  const usedResult = await prisma.webPushSubscription.deleteMany({
    where: {
      ...(userId ? { userId } : {}),
      lastUsedAt: { lt: cutoff },
    },
  });
  return result.count + usedResult.count;
}

export async function sendPushToUser(userId: string, payload: PushPayload) {
  configureWebPush();
  await pruneStalePushSubscriptions(userId);

  const subscriptions = await prisma.webPushSubscription.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
  });

  if (subscriptions.length === 0) return { sent: 0, removed: 0 };

  let sent = 0;
  let removed = 0;
  const body = normalizePayload({ ...payload, url: payload.url ?? `${getBaseUrl()}/dashboard` });

  for (const subscription of subscriptions) {
    try {
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          expirationTime: subscription.expirationTime?.getTime() ?? null,
          keys: {
            p256dh: subscription.p256dh,
            auth: subscription.auth,
          },
        },
        body
      );
      sent += 1;
      await prisma.webPushSubscription.update({
        where: { id: subscription.id },
        data: { lastUsedAt: new Date() },
      });
    } catch (error: any) {
      const statusCode = Number(error?.statusCode ?? 0);
      if (statusCode === 404 || statusCode === 410) {
        await prisma.webPushSubscription.delete({ where: { id: subscription.id } });
        removed += 1;
      } else {
        throw error;
      }
    }
  }

  return { sent, removed };
}
