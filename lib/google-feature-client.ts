"use client";

import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { getFirebaseClientAuth } from "@/lib/firebase-client";

export async function connectGoogleFeature(scope: string) {
  const provider = new GoogleAuthProvider();
  provider.addScope(scope);
  provider.setCustomParameters({ prompt: "consent" });
  const result = await signInWithPopup(getFirebaseClientAuth(), provider);
  const credential = GoogleAuthProvider.credentialFromResult(result);
  const accessToken = credential?.accessToken;
  if (!accessToken) throw new Error("Google did not return an access token");
  const tokenResult = await result.user.getIdTokenResult();

  const res = await fetch("/api/google-oauth/connect", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      accessToken,
      scope,
      providerAccountId: result.user.providerData.find((item) => item.providerId === "google.com")?.uid ?? result.user.email,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error ?? "Could not connect Google");
  return { data, expiresAt: tokenResult.expirationTime };
}
