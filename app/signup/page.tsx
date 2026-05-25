"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Apple, Mail, Lock, User, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { BrandLogo } from "@/components/brand-logo";
import Link from "next/link";
import { toast } from "sonner";
import { getFirebaseClientAuth, hasFirebaseClientConfig } from "@/lib/firebase-client";
import { GoogleAuthProvider, OAuthProvider, createUserWithEmailAndPassword, signInWithPopup, updateProfile } from "firebase/auth";

export default function SignupPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [signupStep, setSignupStep] = useState<"idle" | "creating" | "signing-in">("idle");
  const [otpSent, setOtpSent] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  const router = useRouter();

  const requestOtp = async () => {
    if (!email) {
      toast.error("Enter your email first");
      return;
    }
    setSendingOtp(true);
    try {
      const res = await fetch("/api/signup/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? "Could not send verification code");
        return;
      }
      setOtpSent(true);
      if (data?.devOtp) {
        setOtp(data.devOtp);
        toast.success(`Verification code filled for local testing: ${data.devOtp}`);
      } else {
        toast.success("Verification code sent to your email");
      }
    } catch {
      toast.error("Could not send verification code");
    } finally {
      setSendingOtp(false);
    }
  };

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

  const handleAppleSignup = async () => {
    if (!hasFirebaseClientConfig()) {
      toast.error("Firebase Auth is not configured");
      return;
    }
    setAppleLoading(true);
    try {
      const provider = new OAuthProvider("apple.com");
      provider.addScope("email");
      provider.addScope("name");
      const credential = await signInWithPopup(getFirebaseClientAuth(), provider);
      const firebaseIdToken = await credential.user.getIdToken();
      const signInRes = await fetch("/api/auth/firebase-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken: firebaseIdToken }),
      });
      if (!signInRes.ok) {
        toast.error("Could not start app session");
      } else {
        router.replace("/dashboard");
      }
    } catch (error: any) {
      toast.error(error?.code === "auth/popup-closed-by-user" ? "Apple sign-in cancelled" : "Apple sign-in failed");
    } finally {
      setAppleLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    setLoading(true);
    setSignupStep("creating");
    try {
      if (hasFirebaseClientConfig()) {
        const verifyRes = await fetch("/api/signup/verify-otp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, otp }),
        });
        const verifyData = await verifyRes.json();
        if (!verifyRes.ok) {
          toast.error(verifyData?.error ?? "Invalid verification code");
          return;
        }
      }

      let firebaseIdToken = "";
      if (hasFirebaseClientConfig()) {
        const credential = await createUserWithEmailAndPassword(getFirebaseClientAuth(), email.trim().toLowerCase(), password);
        if (name.trim()) await updateProfile(credential.user, { displayName: name.trim() });
        firebaseIdToken = await credential.user.getIdToken(true);
      }

      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: hasFirebaseClientConfig() ? undefined : password, name, otp, firebaseIdToken }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? "Signup failed");
        return;
      }
      setSignupStep("signing-in");
      const signInRes = await fetch("/api/auth/firebase-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken: firebaseIdToken }),
      });
      if (!signInRes.ok) {
        toast.error("Account created. Please sign in.");
        router.replace("/login");
      } else {
        router.replace("/dashboard");
      }
    } catch (err: any) {
      toast.error("Signup failed");
    } finally {
      setLoading(false);
      setSignupStep("idle");
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
            <Button
              type="button"
              variant="outline"
              className="mb-4 w-full"
              onClick={handleAppleSignup}
              disabled={appleLoading || !hasFirebaseClientConfig()}
            >
              <Apple className="mr-2 h-5 w-5" />
              {appleLoading ? "Opening Apple..." : "Continue with Apple"}
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
                  <Input id="name" placeholder="John Doe" value={name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)} className="pl-10" required />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input id="email" type="email" placeholder="your@email.com" value={email} onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setEmail(e.target.value); setOtpSent(false); }} className="pl-10" required />
                  </div>
                  <Button type="button" variant="outline" onClick={requestOtp} disabled={sendingOtp || !email}>
                    {otpSent ? "Resend" : "Verify"}
                  </Button>
                </div>
              </div>
              {otpSent && (
                <div className="space-y-2">
                  <Label htmlFor="otp">Verification Code</Label>
                  <Input id="otp" inputMode="numeric" maxLength={6} placeholder="6-digit code" value={otp} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))} required />
                  <p className="text-xs text-muted-foreground">Enter the code sent to your email.</p>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input id="password" type={showPassword ? "text" : "password"} placeholder="Min 6 characters" value={password} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)} className="pl-10 pr-10" required />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <Button type="submit" className="w-full" loading={loading} disabled={loading || !otpSent || otp.length !== 6}>
                {signupStep === "creating" ? "Creating account..." : signupStep === "signing-in" ? "Signing you in..." : "Create Account"}
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
