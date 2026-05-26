"use client";
import { useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Mail, Lock, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { BrandLogo } from "@/components/brand-logo";
import Link from "next/link";
import { toast } from "sonner";
import { getFirebaseActionContinueUrl, getFirebaseClientAuth, hasFirebaseClientConfig } from "@/lib/firebase-client";
import { GoogleAuthProvider, sendEmailVerification, signInWithEmailAndPassword, signInWithPopup, type User } from "firebase/auth";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [unverifiedUser, setUnverifiedUser] = useState<User | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const verifyEmail = searchParams.get("verifyEmail");

  const startAppSessionFromFirebase = async (firebaseIdToken: string) => {
    const res = await fetch("/api/auth/firebase-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: firebaseIdToken }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      const apiMessage = data?.error ?? "Could not start app session";
      const message = apiMessage === "Email address is not verified"
        ? "Please verify your email by clicking the link sent to your inbox, then sign in again."
        : apiMessage;
      setAuthError(message);
      toast.error(message);
      return false;
    }
    setAuthError(null);
    router.replace("/dashboard");
    return true;
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setAuthError(null);
    setLoading(true);
    try {
      if (!hasFirebaseClientConfig()) throw new Error("Firebase Auth is not configured");
      const credential = await signInWithEmailAndPassword(getFirebaseClientAuth(), email.trim().toLowerCase(), password);
      await credential.user.reload();
      if (!credential.user.emailVerified) {
        const message = "Please verify your email by clicking the Firebase verification link sent to your inbox, then sign in again.";
        setUnverifiedUser(credential.user);
        setAuthError(message);
        toast.error("Email not verified");
        setLoading(false);
        return;
      }
      setUnverifiedUser(null);
      const firebaseIdToken = await credential.user.getIdToken();
      const started = await startAppSessionFromFirebase(firebaseIdToken);
      if (!started) setLoading(false);
    } catch (err: any) {
      let message = "Login failed";
      if (err?.code === "auth/invalid-credential") {
        message = "User doesn't exist. Please create an account.";
      } else if (err?.code === "auth/too-many-requests") {
        message = "Too many login attempts. Please try again later.";
      }
      setAuthError(message);
      toast.error(message);
      setLoading(false);
    }
  };

  const handleResendVerification = async () => {
    if (resendLoading) return;
    setResendLoading(true);
    try {
      const auth = getFirebaseClientAuth();
      const user = unverifiedUser ?? auth.currentUser;
      if (!user) {
        toast.error("Enter your email and password, then sign in once to resend the link.");
        return;
      }
      await sendEmailVerification(user, {
        url: getFirebaseActionContinueUrl("/login"),
        handleCodeInApp: false,
      });
      toast.success("Verification email sent");
    } catch (error: any) {
      const message = error?.code === "auth/too-many-requests"
        ? "Too many requests. Please wait a little before trying again."
        : "Could not send verification email";
      toast.error(message);
    } finally {
      setResendLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    if (googleLoading) return;
    setAuthError(null);
    setGoogleLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      const credential = await signInWithPopup(getFirebaseClientAuth(), provider);
      const firebaseIdToken = await credential.user.getIdToken();
      const started = await startAppSessionFromFirebase(firebaseIdToken);
      if (!started) setGoogleLoading(false);
    } catch (error: any) {
      const message = error?.code === "auth/popup-closed-by-user" ? "Google sign-in cancelled" : "Google sign-in failed";
      setAuthError(message);
      toast.error(message);
      setGoogleLoading(false);
    }
  };

  return (
    <div className="app-viewport flex items-center justify-center overflow-y-auto bg-gradient-to-br from-background via-background to-secondary/20 p-4 ios-scroll">
      <div className="w-full max-w-md">
        <BrandLogo className="mb-8 justify-center" />
        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-display tracking-tight">Welcome Back</CardTitle>
            <CardDescription>Sign in to continue your fitness journey</CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              type="button"
              variant="outline"
              className="mb-4 w-full"
              onClick={handleGoogleLogin}
              disabled={googleLoading || loading}
            >
              <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-white text-sm font-bold text-[#4285F4]">G</span>
              {googleLoading ? "Opening dashboard..." : "Continue with Google"}
            </Button>
            <div className="mb-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-xs text-muted-foreground">
              <div className="h-px bg-border" />
              <span>or sign in with email</span>
              <div className="h-px bg-border" />
            </div>
            <form onSubmit={handleLogin} className="space-y-4">
              {verifyEmail && !authError ? (
                <div className="space-y-3 rounded-lg border border-primary/20 bg-primary/10 p-3 text-sm text-primary">
                  <p>Check {verifyEmail} and verify your email before signing in.</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="border-primary/30 bg-transparent text-primary hover:bg-primary/10"
                    onClick={handleResendVerification}
                    disabled={resendLoading || loading || googleLoading}
                  >
                    {resendLoading ? "Sending..." : "Resend verification email"}
                  </Button>
                </div>
              ) : null}
              {authError ? (
                <div className="space-y-3 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-700">
                  <p>{authError}</p>
                  {unverifiedUser ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="border-red-500/30 bg-transparent text-red-700 hover:bg-red-500/10"
                      onClick={handleResendVerification}
                      disabled={resendLoading || loading || googleLoading}
                    >
                      {resendLoading ? "Sending..." : "Resend verification email"}
                    </Button>
                  ) : null}
                </div>
              ) : null}
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="your@email.com"
                    value={email}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
                    className="pl-10"
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="password">Password</Label>
                  <Link href="/forgot-password" className="text-xs font-medium text-primary hover:underline">Forgot password?</Link>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
                    className="pl-10 pr-10"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <Button type="submit" className="w-full" loading={loading} disabled={loading || googleLoading}>
                {loading ? "Opening dashboard..." : "Sign In"}
              </Button>
            </form>
            <p className="text-center text-sm text-muted-foreground mt-4">
              Don&apos;t have an account?{" "}
              <Link href="/signup" className="text-primary hover:underline font-medium">
                Sign Up
              </Link>
            </p>
            <div className="mt-4 flex justify-center gap-4 text-xs text-muted-foreground">
              <Link href="/privacy" className="hover:text-foreground hover:underline">Privacy</Link>
              <Link href="/terms" className="hover:text-foreground hover:underline">Terms</Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
