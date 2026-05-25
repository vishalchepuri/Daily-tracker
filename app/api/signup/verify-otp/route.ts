export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import crypto from "crypto";

function hashOtp(email: string, otp: string) {
  return crypto
    .createHash("sha256")
    .update(`${email}:${otp}:${process.env.APP_SECRET ?? "dayza-dev-secret"}`)
    .digest("hex");
}

export async function POST(req: Request) {
  try {
    const { email, otp } = await req.json();
    const normalizedEmail = String(email ?? "").trim().toLowerCase();
    const cleanOtp = String(otp ?? "").trim();
    if (!normalizedEmail || !cleanOtp) {
      return NextResponse.json({ error: "Email and verification code are required" }, { status: 400 });
    }

    const otpRow = await prisma.signupOtp.findFirst({
      where: {
        email: normalizedEmail,
        tokenHash: hashOtp(normalizedEmail, cleanOtp),
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: { id: true },
      orderBy: { createdAt: "desc" },
    });

    if (!otpRow) {
      return NextResponse.json({ error: "Invalid or expired verification code" }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Verification failed" }, { status: 500 });
  }
}
