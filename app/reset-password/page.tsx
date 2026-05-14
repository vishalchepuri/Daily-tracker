"use client";
import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Dumbbell, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

function ResetPasswordForm() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? "Could not reset password");
        return;
      }
      toast.success("Password updated");
      router.replace("/login");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="font-display text-2xl tracking-tight">Choose New Password</CardTitle>
        <CardDescription>Use at least 6 characters</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="password">New Password</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="pl-10" required />
            </div>
          </div>
          <Button type="submit" className="w-full" loading={loading} disabled={!token}>Reset Password</Button>
        </form>
        {!token && <p className="text-center text-sm text-destructive">Reset token is missing.</p>}
        <p className="text-center text-sm text-muted-foreground">
          Back to <Link href="/login" className="font-medium text-primary hover:underline">sign in</Link>
        </p>
      </CardContent>
    </Card>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="app-viewport flex items-center justify-center overflow-y-auto bg-gradient-to-br from-background via-background to-secondary/20 p-4 ios-scroll">
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center justify-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
            <Dumbbell className="h-6 w-6 text-primary-foreground" />
          </div>
          <span className="font-display text-2xl font-bold tracking-tight">FitCoach Pro</span>
        </div>
        <Suspense fallback={<div className="h-48 rounded-lg bg-muted animate-pulse" />}>
          <ResetPasswordForm />
        </Suspense>
      </div>
    </div>
  );
}
