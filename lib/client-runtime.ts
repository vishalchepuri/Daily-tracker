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

export function shouldUseRedirectGoogleAuth() {
  return isStandaloneDisplayMode() || isNativeCapacitorRuntime();
}
