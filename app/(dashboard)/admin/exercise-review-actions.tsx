"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { dayzaFetch } from "@/lib/firebase-session-client";

type ReviewStatus = "approved" | "rejected";

export function ExerciseReviewActions({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState<ReviewStatus | null>(null);

  async function updateReview(status: ReviewStatus) {
    if (!id || submitting) return;
    setSubmitting(status);
    try {
      const res = await dayzaFetch("/api/exercises", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.error ?? `Failed to ${status === "approved" ? "approve" : "reject"} exercise`);
        return;
      }
      toast.success(status === "approved" ? `${name} approved` : `${name} rejected`);
      router.refresh();
    } catch {
      toast.error(`Failed to ${status === "approved" ? "approve" : "reject"} exercise`);
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        type="button"
        size="sm"
        onClick={() => updateReview("approved")}
        loading={submitting === "approved"}
      >
        <CheckCircle2 className="h-4 w-4" />
        Approve
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
        onClick={() => updateReview("rejected")}
        loading={submitting === "rejected"}
      >
        <XCircle className="h-4 w-4" />
        Reject
      </Button>
    </div>
  );
}
