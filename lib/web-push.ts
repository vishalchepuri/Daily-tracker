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

export function isWebPushConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY &&
    process.env.VAPID_PRIVATE_KEY &&
    process.env.VAPID_SUBJECT
  );
}

export function getPublicVapidKey() {
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!key) throw new Error("NEXT_PUBLIC_VAPID_PUBLIC_KEY is missing");
  return key;
}

function configureWebPush() {
  if (!isWebPushConfigured()) {
    throw new Error("Web push is not configured. Add NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, and VAPID_SUBJECT.");
  }

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT!,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
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

export async function sendPushToUser(userId: string, payload: PushPayload) {
  configureWebPush();

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
