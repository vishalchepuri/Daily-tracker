"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { applyActionCode, confirmPasswordReset, verifyPasswordResetCode } from "firebase/auth";
import { CheckCircle2, KeyRound, MailCheck, XCircle } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getFirebaseClientAuth } from "@/lib/firebase-client";

type ActionState = "loading" | "ready" | "success" | "error";

export default function AuthActionPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [state, setState] = useState<ActionState>("loading");
  const [message, setMessage] = useState("Checking link...");
  const [continueUrl, setContinueUrl] = useState("/login");
  const [mode, setMode] = useState<string | null>(null);
  const [oobCode, setOobCode] = useState<string | null>(null);
  const [accountEmail, setAccountEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function handleAction() {
      const params = new URLSearchParams(window.location.search);
      const mode = params.get("mode");
      const oobCode = params.get("oobCode");
      const continueUrl = params.get("continueUrl") || "/login";

      setMode(mode);
      setOobCode(oobCode);
      setContinueUrl(continueUrl);

      if (!mode || !oobCode) {
        setState("error");
        setMessage("This email link is missing required details.");
        return;
      }

      try {
        const auth = getFirebaseClientAuth();
        if (mode === "verifyEmail") {
          await applyActionCode(auth, oobCode);
          if (cancelled) return;
          setState("success");
          setMessage("Your email has been verified. Redirecting to login...");
          return;
        }

        if (mode === "resetPassword") {
          const email = await verifyPasswordResetCode(auth, oobCode);
          if (cancelled) return;
          setAccountEmail(email);
          setState("ready");
          setMessage("Choose a new password for your account.");
          return;
        }

        setState("error");
        setMessage("This email action is not supported.");
      } catch (error: unknown) {
        if (cancelled) return;
        setState("error");
        const message = error instanceof Error ? error.message : "This email link is invalid or expired. Please request a new one.";
        setMessage(message);
      }
    }

    handleAction();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const mode = params.get("mode");

    if (state !== "success" || mode !== "verifyEmail") return;

    const timer = setTimeout(() => {
      router.replace(continueUrl);
    }, 1500);

    return () => clearTimeout(timer);
  }, [state, continueUrl, router]);

  const resetPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!oobCode) return;
    if (password.length < 6) {
      setState("error");
      setMessage("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setState("error");
      setMessage("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      await confirmPasswordReset(getFirebaseClientAuth(), oobCode, password);
      setState("success");
      setMessage("Your password has been updated. You can sign in now.");
    } catch (error: unknown) {
      setState("error");
      const message = error instanceof Error ? error.message : "Could not reset the password. Please request a new reset link.";
      setMessage(message);
    } finally {
      setSubmitting(false);
    }
  };

  const isResetReady = mode === "resetPassword" && state === "ready";
  const Icon = state === "success" ? CheckCircle2 : state === "error" ? XCircle : mode === "resetPassword" ? KeyRound : MailCheck;

  return (
    <div className="app-viewport flex items-center justify-center overflow-y-auto bg-gradient-to-br from-background via-background to-secondary/20 p-4 ios-scroll">
      <div className="w-full max-w-md">
        <BrandLogo className="mb-8 justify-center" />
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Icon className="h-6 w-6" />
            </div>
            <CardTitle className="font-display text-2xl tracking-tight">
              {mode === "resetPassword" ? "Reset Password" : "Email Verification"}
            </CardTitle>
            <CardDescription>{message}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isResetReady ? (
              <form onSubmit={resetPassword} className="space-y-4">
                <div className="rounded-lg bg-muted/40 p-3 text-sm text-muted-foreground">
                  Resetting password for <span className="font-medium text-foreground">{accountEmail}</span>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">New Password</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    minLength={6}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm Password</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    minLength={6}
                    required
                  />
                </div>
                <Button type="submit" className="w-full" loading={submitting}>
                  Update Password
                </Button>
              </form>
            ) : (
              <Button asChild className="w-full" disabled={state === "loading"}>
                <Link href={state === "success" ? continueUrl : "/login"}>
                  {state === "loading" ? "Checking..." : "Go to Sign In"}
                </Link>
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
