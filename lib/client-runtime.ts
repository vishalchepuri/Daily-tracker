"use client";

export function isStandaloneDisplayMode() {
  if (typeof window === "undefined") return false;

  const iosStandalone = typeof navigator !== "undefined" && "standalone" in navigator
    ? Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
    : false;

  const mediaStandalone = typeof window.matchMedia === "function"
    ? window.matchMedia("(display-mode: standalone)").matches || window.matchMedia("(display-mode: fullscreen)").matches
    : false;

  return iosStandalone || mediaStandalone;
}

export function isNativeCapacitorRuntime() {
  return typeof window !== "undefined" && Boolean((window as any).Capacitor?.isNativePlatform?.());
}

export function isMobileBrowserRuntime() {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;

  const userAgent = navigator.userAgent || "";
  const mobileUserAgent = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(userAgent);
  const touchSmallScreen = navigator.maxTouchPoints > 1 && window.innerWidth <= 900;

  return mobileUserAgent || touchSmallScreen;
}

export function shouldUseRedirectGoogleAuth() {
  return isStandaloneDisplayMode() || isNativeCapacitorRuntime() || isMobileBrowserRuntime();
}
