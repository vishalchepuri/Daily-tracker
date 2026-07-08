"use client";

import {
  GoogleAuthProvider,
  signInWithRedirect,
  signInWithPopup,
} from "firebase/auth";
import { getFirebaseClientAuth } from "@/lib/firebase-client";
import { shouldUseRedirectGoogleAuth } from "@/lib/client-runtime";

export function getGoogleProvider() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  return provider;
}

export async function signInWithGoogle() {
  const auth = getFirebaseClientAuth();
  const provider = getGoogleProvider();

  if (shouldUseRedirectGoogleAuth()) {
    await signInWithRedirect(auth, provider);
    return null;
  }

  try {
    return await signInWithPopup(auth, provider);
  } catch (error: any) {
    if (error?.code === "auth/popup-blocked") {
      await signInWithRedirect(auth, provider);
      return null;
    }
    throw error;
  }
}

export function getGoogleAuthErrorMessage(error: any) {
  switch (error?.code) {
    case "auth/popup-closed-by-user":
      return "Google sign-in was cancelled before choosing an account.";
    case "auth/popup-blocked":
      return "Google popup was blocked. We can switch to redirect sign-in on mobile or installed mode.";
    case "auth/cancelled-popup-request":
      return "Another Google sign-in window is already open.";
    case "auth/unauthorized-domain":
      return "This domain is not authorized in Firebase Auth.";
    case "auth/account-exists-with-different-credential":
      return "This email already exists with a different sign-in method.";
    case "auth/network-request-failed":
      return "Network error while signing in with Google. Please try again.";
    default:
      return error?.message ? `Google sign-in failed: ${error.message}` : "Google sign-in failed";
  }
}
