"use client";

import { signOut as firebaseSignOut } from "firebase/auth";
import { getFirebaseClientAuth, hasFirebaseClientConfig } from "@/lib/firebase-client";

export async function signOutOfDayza() {
  await fetch("/api/auth/firebase-session", { method: "DELETE" }).catch(() => null);
  if (hasFirebaseClientConfig()) {
    await firebaseSignOut(getFirebaseClientAuth()).catch(() => null);
  }
}
