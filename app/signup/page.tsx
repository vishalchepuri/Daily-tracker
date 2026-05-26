"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Mail, Lock, User, Eye, EyeOff, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { BrandLogo } from "@/components/brand-logo";
import Link from "next/link";
import { toast } from "sonner";
import { getFirebaseActionContinueUrl, getFirebaseClientAuth, hasFirebaseClientConfig } from "@/lib/firebase-client";
import { FirebaseError } from "firebase/app";
import { GoogleAuthProvider, createUserWithEmailAndPassword, signInWithPopup, updateProfile, sendEmailVerification } from "firebase/auth";

function getSignupErrorMessage(error: unknown) {
  if (error instanceof FirebaseError) {
    switch (error.code) {
      case "auth/email-already-in-use":
        return "This email already has an account. Please sign in instead.";
      case "auth/invalid-email":
        return "Please enter a valid email address.";
      case "auth/operation-not-allowed":
        return "Email/password signup is disabled in Firebase Auth.";
      case "auth/weak-password":
        return "Password is too weak. Use at least 6 characters.";
      case "auth/network-request-failed":
        return "Network error while creating the account. Please try again.";
      default:
        return error.message || "Signup failed";
    }
  }
  return "Signup failed";
}

function validateFullName(value: string) {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length < 2) return "Enter your real full name.";
  if (normalized.length > 60) return "Name must be 60 characters or less.";
  if (normalized.includes("@") || /^https?:\/\//i.test(normalized)) return "Name cannot be an email, link, or username.";
  if (!/^[A-Za-z][A-Za-z .'-]*[A-Za-z]$/.test(normalized)) {
    return "Name can only use letters, spaces, apostrophes, hyphens, and periods.";
  }
  const letters = normalized.replace(/[^A-Za-z]/g, "");
  if (letters.length < 2) return "Enter at least two letters.";
  if (/([A-Za-z])\1{3,}/.test(normalized)) return "Name has too many repeated letters.";
  if (normalized.split(" ").filter(Boolean).some((part) => part.length === 1)) {
    return "Use complete name parts, not single letters.";
  }
  return null;
}

function validateEmail(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return "Enter your email address.";
  if (normalized.length > 254) return "Email address is too long.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalized)) return "Enter a valid email address.";
  if (/[<>()[\]\\,;:"']/.test(normalized)) return "Email contains unsupported characters.";
  return null;
}

function validatePassword(value: string) {
  if (!value) return "Enter a password.";
  if (value.length < 6) return "Password must be at least 6 characters.";
  return null;
}

export default function SignupPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [signupStep, setSignupStep] = useState<"idle" | "creating" | "sending-verification">("idle");
  const [googleLoading, setGoogleLoading] = useState(false);
  const router = useRouter();
  const nameError = name.trim() ? validateFullName(name) : null;
  const emailError = email.trim() ? validateEmail(email) : null;
  const passwordError = password ? validatePassword(password) : null;

  const handleGoogleSignup = async () => {
    setGoogleLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      const credential = await signInWithPopup(getFirebaseClientAuth(), provider);
      const firebaseIdToken = await credential.user.getIdToken();
      const res = await fetch("/api/auth/firebase-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken: firebaseIdToken }),
      });
      if (!res.ok) toast.error("Could not start app session");
      else router.replace("/dashboard");
    } catch (error: any) {
      toast.error(error?.code === "auth/popup-closed-by-user" ? "Google sign-in cancelled" : "Google sign-in failed");
    } finally {
      setGoogleLoading(false);
    }
  };


  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    const normalizedName = name.trim().replace(/\s+/g, " ");
    const fullNameError = validateFullName(normalizedName);
    if (fullNameError) {
      toast.error(fullNameError);
      return;
    }
    const fullEmailError = validateEmail(email);
    if (fullEmailError) {
      toast.error(fullEmailError);
      return;
    }
    const fullPasswordError = validatePassword(password);
    if (fullPasswordError) {
      toast.error(fullPasswordError);
      return;
    }
    setLoading(true);
    setSignupStep("creating");
    try {
      if (!hasFirebaseClientConfig()) {
        toast.error("Firebase Auth is not configured");
        return;
      }

      const normalizedEmail = email.trim().toLowerCase();
      const emailCheck = await fetch("/api/auth/check-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalizedEmail }),
      });
      const emailCheckData = await emailCheck.json().catch(() => null);
      if (!emailCheck.ok) {
        toast.error(emailCheckData?.error ?? "Please use a permanent email address");
        setLoading(false);
        setSignupStep("idle");
        return;
      }

      const credential = await createUserWithEmailAndPassword(getFirebaseClientAuth(), normalizedEmail, password);
      await updateProfile(credential.user, { displayName: normalizedName });
      setSignupStep("sending-verification");
      if (!credential.user.emailVerified) {
        await sendEmailVerification(credential.user, {
          url: getFirebaseActionContinueUrl(`/login?verifyEmail=${encodeURIComponent(normalizedEmail)}`),
          handleCodeInApp: true,
        });
      }
      toast.success("Account created. Please verify your email before signing in.");
      router.replace(`/login?verifyEmail=${encodeURIComponent(normalizedEmail)}`);
    } catch (err: any) {
      toast.error(getSignupErrorMessage(err));
      setLoading(false);
      setSignupStep("idle");
    } finally {
    }
  };

  return (
    <div className="app-viewport flex items-center justify-center overflow-y-auto bg-gradient-to-br from-background via-background to-secondary/20 p-4 ios-scroll">
      <div className="w-full max-w-md">
        <BrandLogo className="mb-8 justify-center" />
        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-display tracking-tight">Create Account</CardTitle>
            <CardDescription>Start your muscle-building journey today</CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              type="button"
              variant="outline"
              className="mb-4 w-full"
              onClick={handleGoogleSignup}
              disabled={googleLoading}
            >
              <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-white text-sm font-bold text-[#4285F4]">G</span>
              {googleLoading ? "Opening Google..." : "Continue with Google"}
            </Button>
            <div className="mb-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-xs text-muted-foreground">
              <div className="h-px bg-border" />
              <span>or sign up with email</span>
              <div className="h-px bg-border" />
            </div>
            <form onSubmit={handleSignup} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Full Name</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  {nameError ? (
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full text-destructive hover:bg-destructive/10"
                      onClick={() => toast.error(nameError)}
                      aria-label="Name field issue"
                      title={nameError}
                    >
                      <Info className="h-4 w-4" />
                    </button>
                  ) : null}
                  <Input
                    id="name"
                    placeholder="John Doe"
                    value={name}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
                    className={`pl-10 ${nameError ? "border-destructive pr-10 text-destructive focus-visible:ring-destructive" : ""}`}
                    minLength={2}
                    maxLength={60}
                    pattern="[A-Za-z][A-Za-z .'-]*[A-Za-z]"
                    autoComplete="name"
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  {emailError ? (
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full text-destructive hover:bg-destructive/10"
                      onClick={() => toast.error(emailError)}
                      aria-label="Email field issue"
                      title={emailError}
                    >
                      <Info className="h-4 w-4" />
                    </button>
                  ) : null}
                  <Input
                    id="email"
                    type="email"
                    placeholder="your@email.com"
                    value={email}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
                    className={`pl-10 ${emailError ? "border-destructive pr-10 text-destructive focus-visible:ring-destructive" : ""}`}
                    autoComplete="email"
                    required
                  />
                </div>
                <p className="text-xs text-muted-foreground">We will send a verification link to this address after signup.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  {passwordError ? (
                    <button
                      type="button"
                      className="absolute right-10 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full text-destructive hover:bg-destructive/10"
                      onClick={() => toast.error(passwordError)}
                      aria-label="Password field issue"
                      title={passwordError}
                    >
                      <Info className="h-4 w-4" />
                    </button>
                  ) : null}
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Min 6 characters"
                    value={password}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
                    className={`pl-10 pr-10 ${passwordError ? "border-destructive pr-16 text-destructive focus-visible:ring-destructive" : ""}`}
                    minLength={6}
                    autoComplete="new-password"
                    required
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <Button type="submit" className="w-full" loading={loading} disabled={loading}>
                {signupStep === "creating"
                  ? "Creating account..."
                  : signupStep === "sending-verification"
                    ? "Sending verification..."
                    : "Create Account"}
              </Button>
            </form>
            <p className="text-center text-sm text-muted-foreground mt-4">
              Already have an account?{" "}
              <Link href="/login" className="text-primary hover:underline font-medium">Sign In</Link>
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
