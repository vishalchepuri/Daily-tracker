"use client";

import { GoogleAuthProvider, getRedirectResult, signInWithPopup, signInWithRedirect } from "firebase/auth";
import { getFirebaseClientAuth } from "@/lib/firebase-client";
import { shouldUseRedirectGoogleAuth } from "@/lib/client-runtime";
import { dayzaFetch, ensureDayzaSession } from "@/lib/firebase-session-client";

const FEATURE_SCOPE_KEY = "dayza_google_feature_scope";

function rememberFeatureScope(scope: string) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(FEATURE_SCOPE_KEY, scope);
  } catch {}
  try {
    window.localStorage.setItem(FEATURE_SCOPE_KEY, scope);
  } catch {}
}

function readFeatureScope() {
  if (typeof window === "undefined") return null;
  try {
    const scope = window.sessionStorage.getItem(FEATURE_SCOPE_KEY);
    if (scope) return scope;
  } catch {}
  try {
    return window.localStorage.getItem(FEATURE_SCOPE_KEY);
  } catch {
    return null;
  }
}

function clearFeatureScope() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(FEATURE_SCOPE_KEY);
  } catch {}
  try {
    window.localStorage.removeItem(FEATURE_SCOPE_KEY);
  } catch {}
}

async function saveGoogleFeatureConnection(result: any, scope: string) {
  const credential = GoogleAuthProvider.credentialFromResult(result);
  const accessToken = credential?.accessToken;
  if (!accessToken) throw new Error("Google did not return an access token");

  const tokenResult = await result.user.getIdTokenResult();
  await ensureDayzaSession().catch(() => false);

  const res = await dayzaFetch("/api/google-oauth/connect", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      accessToken,
      scope,
      providerAccountId: result.user.providerData.find((item: any) => item.providerId === "google.com")?.uid ?? result.user.email,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error ?? "Could not connect Google");
  return { data, expiresAt: tokenResult.expirationTime, scope };
}

export async function connectGoogleFeature(scope: string) {
  const provider = new GoogleAuthProvider();
  provider.addScope(scope);
  provider.setCustomParameters({ prompt: "consent", include_granted_scopes: "true" });
  const auth = getFirebaseClientAuth();

  if (shouldUseRedirectGoogleAuth()) {
    rememberFeatureScope(scope);
    await signInWithRedirect(auth, provider);
    return { redirected: true };
  }

  let result;
  try {
    result = await signInWithPopup(auth, provider);
  } catch (error: any) {
    if (error?.code === "auth/popup-blocked") {
      rememberFeatureScope(scope);
      await signInWithRedirect(auth, provider);
      return { redirected: true };
    }
    throw error;
  }
  return saveGoogleFeatureConnection(result, scope);
}

export async function completeGoogleFeatureRedirect() {
  const scope = readFeatureScope();
  if (!scope) return null;

  const result = await getRedirectResult(getFirebaseClientAuth());
  if (!result) {
    clearFeatureScope();
    return null;
  }

  try {
    return await saveGoogleFeatureConnection(result, scope);
  } finally {
    clearFeatureScope();
  }
}
