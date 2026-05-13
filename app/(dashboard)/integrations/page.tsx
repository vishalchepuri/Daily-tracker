"use client";

import { useState } from "react";
import { Activity, CheckCircle2, FileUp, Loader2, Watch } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FadeIn } from "@/components/ui/animate";

type ImportSummary = {
  recordsRead: number;
  metricsImported: number;
  workoutsImported: number;
  progressImported: number;
  unsupportedRecords: number;
};

export default function IntegrationsPage() {
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  const handleImport = async () => {
    if (!file) {
      toast.error("Choose an Apple Health export first");
      return;
    }

    setImporting(true);
    setSummary(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/apple-health/import", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? "Import failed");
        return;
      }
      setSummary(data.summary);
      toast.success("Apple Health import complete");
    } catch (error) {
      console.error(error);
      toast.error("Import failed");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <FadeIn>
        <div>
          <h2 className="text-2xl font-display font-bold tracking-tight">Integrations</h2>
          <p className="text-muted-foreground text-sm mt-1">Import fitness data from Apple Health exports</p>
        </div>
      </FadeIn>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2">
              <Watch className="h-5 w-5 text-primary" />
              Apple Health
            </CardTitle>
            <Badge variant="secondary">Import</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
            <div className="space-y-2">
              <label className="text-sm font-medium">Apple Health export</label>
              <div className="flex min-h-24 items-center gap-3 rounded-lg border border-dashed border-border bg-muted/30 p-4">
                <FileUp className="h-8 w-8 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{file?.name ?? "Upload export.zip or export.xml"}</p>
                  <p className="text-xs text-muted-foreground">Supported: steps, calories, distance, heart rate, exercise time, workouts, body weight</p>
                </div>
                <input
                  id="apple-health-file"
                  type="file"
                  accept=".zip,.xml,application/zip,text/xml"
                  className="hidden"
                  onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                />
                <label htmlFor="apple-health-file">
                  <Button type="button" variant="outline" asChild disabled={importing}>
                    <span>Choose File</span>
                  </Button>
                </label>
              </div>
            </div>
            <Button onClick={handleImport} disabled={!file || importing} className="md:w-40">
              {importing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Activity className="mr-2 h-4 w-4" />}
              Import
            </Button>
          </div>

          {summary && (
            <div className="rounded-lg border border-border p-4">
              <div className="mb-3 flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                <h3 className="font-medium">Import Summary</h3>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <SummaryItem label="Records read" value={summary.recordsRead} />
                <SummaryItem label="Metrics saved" value={summary.metricsImported} />
                <SummaryItem label="Workouts saved" value={summary.workoutsImported} />
                <SummaryItem label="Progress saved" value={summary.progressImported} />
                <SummaryItem label="Skipped" value={summary.unsupportedRecords} />
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryItem({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-muted/50 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value.toLocaleString()}</p>
    </div>
  );
}
