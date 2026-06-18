"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const DAYZA_HOSTS = new Set(["dayza.site", "www.dayza.site"]);

function isSameDayzaAppUrl(url: URL, current: URL) {
  if (url.origin === current.origin) return true;
  return DAYZA_HOSTS.has(url.hostname) && DAYZA_HOSTS.has(current.hostname);
}

export function PwaLinkGuard() {
  const router = useRouter();

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      const target = event.target as Element | null;
      const anchor = target?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor || anchor.hasAttribute("download")) return;

      const href = anchor.getAttribute("href")?.trim();
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;

      const targetAttr = anchor.getAttribute("target");
      if (targetAttr && targetAttr !== "_self") return;

      const current = new URL(window.location.href);
      let nextUrl: URL;
      try {
        nextUrl = new URL(href, current.href);
      } catch {
        return;
      }

      if (!["http:", "https:"].includes(nextUrl.protocol)) return;
      if (!isSameDayzaAppUrl(nextUrl, current)) return;

      event.preventDefault();
      const nextPath = `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`;
      const currentPath = `${current.pathname}${current.search}${current.hash}`;
      if (nextPath !== currentPath) {
        router.push(nextPath);
      }
    };

    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [router]);

  return null;
}
