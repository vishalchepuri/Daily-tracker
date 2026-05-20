"use client";

import { useState } from "react";
import { Bug, CheckCircle2, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type IssueReportFormProps = {
  compact?: boolean;
  defaultPage?: string;
  showContactFields?: boolean;
};

export function IssueReportForm({
  compact = false,
  defaultPage = "Dayza",
  showContactFields = false,
}: IssueReportFormProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");

  async function submitReport(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("sending");
    setError("");

    const response = await fetch("/api/issue-reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        email,
        page: defaultPage,
        category: "issue",
        message,
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(payload.error ?? "Could not submit the report right now.");
      setStatus("error");
      return;
    }

    setMessage("");
    setStatus("sent");
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className={compact ? "p-4 pb-2" : "p-5 pb-3"}>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Bug className="h-5 w-5 text-primary" />
          Report an issue
        </CardTitle>
        <p className="text-sm leading-6 text-muted-foreground">
          Tell us what broke, what page you were on, or what felt confusing.
        </p>
      </CardHeader>
      <CardContent className={compact ? "p-4 pt-2" : "p-5 pt-2"}>
        <form onSubmit={submitReport} className="space-y-3">
          {showContactFields && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="issue-name">Name</Label>
                <Input
                  id="issue-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Your name"
                  autoComplete="name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="issue-email">Email</Label>
                <Input
                  id="issue-email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  type="email"
                  autoComplete="email"
                />
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor={`issue-message-${defaultPage}`}>Issue</Label>
            <Textarea
              id={`issue-message-${defaultPage}`}
              value={message}
              onChange={(event) => {
                setMessage(event.target.value);
                if (status !== "sending") setStatus("idle");
              }}
              placeholder="Example: The workout history button is not opening on iPhone Safari."
              rows={compact ? 4 : 5}
              required
            />
          </div>

          {status === "sent" && (
            <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-primary">
              <CheckCircle2 className="h-4 w-4" />
              Issue submitted. Thank you.
            </div>
          )}
          {status === "error" && error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          <Button type="submit" className="w-full sm:w-auto" disabled={status === "sending" || message.trim().length < 8}>
            {status === "sending" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            {status === "sending" ? "Submitting..." : "Submit issue"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
