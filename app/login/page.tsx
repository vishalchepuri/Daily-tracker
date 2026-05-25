"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Apple, Mail, Lock, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { BrandLogo } from "@/components/brand-logo";
import Link from "next/link";
import { toast } from "sonner";
import { getFirebaseClientAuth, hasFirebaseClientConfig } from "@/lib/firebase-client";
import { GoogleAuthProvider, OAuthProvider, signInWithEmailAndPassword, signInWithPopup } from "firebase/auth";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  const router = useRouter();

  const startAppSessionFromFirebase = async (firebaseIdToken: string) => {
    const res = await fetch("/api/auth/firebase-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: firebaseIdToken }),
    });
    if (!res.ok) {
      toast.error("Could not start app session");
      return false;
    }
    router.replace("/dashboard");
    return true;
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (!hasFirebaseClientConfig()) throw new Error("Firebase Auth is not configured");
      const credential = await signInWithEmailAndPassword(getFirebaseClientAuth(), email.trim().toLowerCase(), password);
      const firebaseIdToken = await credential.user.getIdToken();
      await startAppSessionFromFirebase(firebaseIdToken);
    } catch (err: any) {
      toast.error(err?.code === "auth/invalid-credential" ? "Invalid email or password" : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      const credential = await signInWithPopup(getFirebaseClientAuth(), provider);
      const firebaseIdToken = await credential.user.getIdToken();
      await startAppSessionFromFirebase(firebaseIdToken);
    } catch (error: any) {
      toast.error(error?.code === "auth/popup-closed-by-user" ? "Google sign-in cancelled" : "Google sign-in failed");
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleAppleLogin = async () => {
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
      await startAppSessionFromFirebase(firebaseIdToken);
    } catch (error: any) {
      toast.error(error?.code === "auth/popup-closed-by-user" ? "Apple sign-in cancelled" : "Apple sign-in failed");
    } finally {
      setAppleLoading(false);
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
              disabled={googleLoading}
            >
              <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-white text-sm font-bold text-[#4285F4]">G</span>
              {googleLoading ? "Opening Google..." : "Continue with Google"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="mb-4 w-full"
              onClick={handleAppleLogin}
              disabled={appleLoading || !hasFirebaseClientConfig()}
            >
              <Apple className="mr-2 h-5 w-5" />
              {appleLoading ? "Opening Apple..." : "Continue with Apple"}
            </Button>
            <div className="mb-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-xs text-muted-foreground">
              <div className="h-px bg-border" />
              <span>or sign in with email</span>
              <div className="h-px bg-border" />
            </div>
            <form onSubmit={handleLogin} className="space-y-4">
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
              <Button type="submit" className="w-full" loading={loading}>
                Sign In
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
