"use client";

import { GoogleAuthProvider, getRedirectResult, signInWithPopup, signInWithRedirect } from "firebase/auth";
import { getFirebaseClientAuth } from "@/lib/firebase-client";
import { shouldUseRedirectGoogleAuth } from "@/lib/client-runtime";

export async function connectGoogleFeature(scope: string) {
  const provider = new GoogleAuthProvider();
  provider.addScope(scope);
  provider.setCustomParameters({ prompt: "consent" });
  const auth = getFirebaseClientAuth();

  if (shouldUseRedirectGoogleAuth()) {
    window.sessionStorage.setItem("dayza_google_feature_scope", scope);
    await signInWithRedirect(auth, provider);
    return { redirected: true };
  }

  let result;
  try {
    result = await signInWithPopup(auth, provider);
  } catch (error: any) {
    if (error?.code === "auth/popup-blocked") {
      window.sessionStorage.setItem("dayza_google_feature_scope", scope);
      await signInWithRedirect(auth, provider);
      return { redirected: true };
    }
    throw error;
  }
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

export async function completeGoogleFeatureRedirect() {
  const scope = typeof window !== "undefined" ? window.sessionStorage.getItem("dayza_google_feature_scope") : null;
  if (!scope) return null;

  const result = await getRedirectResult(getFirebaseClientAuth());
  if (!result) return null;

  const credential = GoogleAuthProvider.credentialFromResult(result);
  const accessToken = credential?.accessToken;
  if (!accessToken) {
    window.sessionStorage.removeItem("dayza_google_feature_scope");
    throw new Error("Google did not return an access token");
  }

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
  window.sessionStorage.removeItem("dayza_google_feature_scope");
  if (!res.ok) throw new Error(data?.error ?? "Could not connect Google");
  return { data, expiresAt: tokenResult.expirationTime, scope };
}
