"use client";

import { AlertCircle, RefreshCw } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";

type ErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  return (
    <main className="app-viewport flex items-center justify-center bg-background p-4 text-foreground">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-5 shadow-lg">
        <BrandLogo className="mb-6 justify-center" />
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <AlertCircle className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-xl font-bold tracking-tight">Something went wrong</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Dayza could not finish loading this view. Try again, or refresh the page if it keeps happening.
            </p>
            {error.digest ? <p className="mt-2 text-xs text-muted-foreground">Error ID: {error.digest}</p> : null}
          </div>
        </div>
        <Button type="button" className="mt-5 w-full" onClick={reset}>
          <RefreshCw className="h-4 w-4" />
          Try Again
        </Button>
      </div>
    </main>
  );
}
