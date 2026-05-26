"use client";

import { getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

export function hasFirebaseClientConfig() {
  return Boolean(
    firebaseConfig.apiKey &&
      firebaseConfig.authDomain &&
      firebaseConfig.projectId &&
      firebaseConfig.appId
  );
}

export function getFirebaseClientAuth() {
  const apps = getApps();
  if (apps.length) {
    return getAuth(apps[0]);
  }

  if (!hasFirebaseClientConfig()) {
    const missingKeys = Object.entries(firebaseConfig)
      .filter(([, value]) => !value)
      .map(([key]) => key)
      .join(", ");

    throw new Error(
      `Firebase Auth client config is missing: ${missingKeys || "unknown"}`
    );
  }

  const app = initializeApp(firebaseConfig);
  return getAuth(app);
}
