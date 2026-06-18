"use client";

import { getClientTimeZone } from "@/lib/local-dates";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

export function supportsPushNotifications() {
  return typeof window !== "undefined"
    && "serviceWorker" in navigator
    && "PushManager" in window
    && "Notification" in window;
}

export async function registerPushNotifications() {
  if (!supportsPushNotifications()) {
    throw new Error("Push notifications are not supported on this device/browser.");
  }

  const stateRes = await fetch("/api/push/subscription");
  const state = await stateRes.json();
  if (!stateRes.ok) throw new Error(state?.error ?? "Could not load push settings");
  if (!state?.configured || !state?.publicKey) {
    throw new Error("Push notifications are not configured on the server yet.");
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Notification permission was not granted.");
  }

  const registration = await navigator.serviceWorker.register("/sw.js");
  const existing = await registration.pushManager.getSubscription();
  const subscription = existing ?? await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(state.publicKey),
  });

  const saveRes = await fetch("/api/push/subscription", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...subscription.toJSON(),
      timeZone: getClientTimeZone(),
    }),
  });
  const saveData = await saveRes.json().catch(() => ({}));
  if (!saveRes.ok) throw new Error(saveData?.error ?? "Could not save push subscription");
  return saveData;
}

export async function unregisterPushNotifications() {
  if (!supportsPushNotifications()) return;
  const registration = await navigator.serviceWorker.getRegistration("/sw.js");
  const subscription = await registration?.pushManager.getSubscription();
  if (subscription) {
    await fetch("/api/push/subscription", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    });
    await subscription.unsubscribe();
  } else {
    await fetch("/api/push/subscription", { method: "DELETE" });
  }
}
