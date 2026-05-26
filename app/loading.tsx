import { Loader2 } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";

export default function Loading() {
  return (
    <main className="app-viewport flex items-center justify-center bg-background p-4 text-foreground">
      <div className="flex flex-col items-center gap-4 text-center">
        <BrandLogo />
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          Loading Dayza...
        </div>
      </div>
    </main>
  );
}
