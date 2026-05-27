"use client";

import { onAuthStateChanged, signOut as firebaseSignOut, type User } from "firebase/auth";
import { getFirebaseClientAuth, hasFirebaseClientConfig } from "@/lib/firebase-client";

async function waitForFirebaseUser(timeoutMs = 1200) {
  const auth = getFirebaseClientAuth();
  if (auth.currentUser) return auth.currentUser;
  return new Promise<User | null>((resolve) => {
    const timeout = window.setTimeout(() => {
      unsubscribe();
      resolve(auth.currentUser);
    }, timeoutMs);
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      window.clearTimeout(timeout);
      unsubscribe();
      resolve(user);
    });
  });
}

export async function getFirebaseIdTokenForRequest() {
  if (!hasFirebaseClientConfig()) return null;
  const user = await waitForFirebaseUser();
  if (!user) return null;
  return user.getIdToken().catch(() => null);
}

export async function dayzaFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const token = await getFirebaseIdTokenForRequest();
  const headers = new Headers(init.headers);
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return fetch(input, {
    ...init,
    headers,
    credentials: init.credentials ?? "same-origin",
  });
}

export async function ensureDayzaSession() {
  const token = await getFirebaseIdTokenForRequest();
  if (!token) return false;
  const res = await fetch("/api/auth/firebase-session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ idToken: token }),
  }).catch(() => null);
  return Boolean(res?.ok);
}

export async function signOutOfDayza() {
  await fetch("/api/auth/firebase-session", { method: "DELETE" }).catch(() => null);
  if (hasFirebaseClientConfig()) {
    await firebaseSignOut(getFirebaseClientAuth()).catch(() => null);
  }
}
