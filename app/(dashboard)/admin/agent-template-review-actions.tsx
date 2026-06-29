"use client";

import { useState } from "react";
import { Check, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { dayzaFetch } from "@/lib/firebase-session-client";

export function AgentTemplateReviewActions({ id, name }: { id: string; name: string }) {
  const [loading, setLoading] = useState<string | null>(null);

  async function review(status: "approved" | "rejected") {
    setLoading(status);
    try {
      const res = await dayzaFetch("/api/admin/agent-task-templates", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.error ?? "Failed to review template");
        return;
      }
      toast.success(`${name} ${status}`);
    } catch {
      toast.error("Failed to review template");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button type="button" size="sm" onClick={() => review("approved")} loading={loading === "approved"} disabled={Boolean(loading)}>
        <Check className="h-4 w-4" />
        Approve
      </Button>
      <Button type="button" size="sm" variant="outline" onClick={() => review("rejected")} loading={loading === "rejected"} disabled={Boolean(loading)}>
        <X className="h-4 w-4" />
        Reject
      </Button>
    </div>
  );
}
