"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Dumbbell, Mail, Lock, User, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import Link from "next/link";
import { toast } from "sonner";

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

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    setLoading(true);
    setSignupStep("creating");
    try {
      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name, otp }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? "Signup failed");
        return;
      }
      setSignupStep("signing-in");
      const signInRes = await signIn("credentials", { email, password, redirect: false });
      if (signInRes?.error) {
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
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
            <Dumbbell className="w-6 h-6 text-primary-foreground" />
          </div>
          <span className="text-2xl font-display font-bold tracking-tight">Dayza</span>
        </div>
        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-display tracking-tight">Create Account</CardTitle>
            <CardDescription>Start your muscle-building journey today</CardDescription>
          </CardHeader>
          <CardContent>
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
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
