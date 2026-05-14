"use client";
import { useState } from "react";
import Link from "next/link";
import { Dumbbell, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetUrl, setResetUrl] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? "Could not create reset link");
        return;
      }
      setResetUrl(data?.resetUrl ?? "");
      toast.success("Reset link created");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-viewport flex items-center justify-center overflow-y-auto bg-gradient-to-br from-background via-background to-secondary/20 p-4 ios-scroll">
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center justify-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
            <Dumbbell className="h-6 w-6 text-primary-foreground" />
          </div>
          <span className="font-display text-2xl font-bold tracking-tight">Dayza</span>
        </div>
        <Card>
          <CardHeader className="text-center">
            <CardTitle className="font-display text-2xl tracking-tight">Reset Password</CardTitle>
            <CardDescription>Enter your email to create a reset link</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="pl-10" required />
                </div>
              </div>
              <Button type="submit" className="w-full" loading={loading}>Create Reset Link</Button>
            </form>
            {resetUrl && (
              <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
                <p className="mb-2 text-muted-foreground">Email sending is not configured yet. Use this reset link:</p>
                <Link href={resetUrl} className="break-all text-primary hover:underline">{resetUrl}</Link>
              </div>
            )}
            <p className="text-center text-sm text-muted-foreground">
              Remembered it? <Link href="/login" className="font-medium text-primary hover:underline">Sign in</Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
