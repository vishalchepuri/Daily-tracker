"use client";

import { useEffect } from "react";

export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const isLocalhost = typeof window !== "undefined" && /^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname);
    if (process.env.NODE_ENV !== "production" && !isLocalhost) return;

    navigator.serviceWorker.register("/sw.js").catch((error) => {
      console.warn("Dayza service worker registration failed", error);
    });
  }, []);

  return null;
}
