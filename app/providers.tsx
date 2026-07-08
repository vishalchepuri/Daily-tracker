"use client";
import { ThemeProvider } from "@/components/theme-provider";
import { PwaLinkGuard } from "@/components/pwa-link-guard";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
      <PwaLinkGuard />
      {children}
    </ThemeProvider>
  );
}
