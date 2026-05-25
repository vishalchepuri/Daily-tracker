import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";

export default function ResetPasswordPage() {
  return (
    <div className="app-viewport flex items-center justify-center overflow-y-auto bg-gradient-to-br from-background via-background to-secondary/20 p-4 ios-scroll">
      <div className="w-full max-w-md">
        <BrandLogo className="mb-8 justify-center" />
        <Card>
          <CardHeader className="text-center">
            <CardTitle className="font-display text-2xl tracking-tight">Firebase Password Reset</CardTitle>
            <CardDescription>Use the secure reset link sent by Firebase Auth.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-center text-sm text-muted-foreground">
              Password reset is handled by Firebase Auth. Request a fresh reset email if your link expired.
            </p>
            <Button asChild className="w-full">
              <Link href="/forgot-password">Request Reset Email</Link>
            </Button>
            <Button asChild variant="outline" className="w-full">
              <Link href="/login">Back To Sign In</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
