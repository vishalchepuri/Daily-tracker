export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import crypto from "crypto";

function normalizeEmail(email: unknown) {
  return String(email ?? "").trim().toLowerCase();
}

function hashOtp(email: string, otp: string) {
  return crypto
    .createHash("sha256")
    .update(`${email}:${otp}:${process.env.NEXTAUTH_SECRET ?? "dayza-dev-secret"}`)
    .digest("hex");
}

async function sendOtpEmail(email: string, otp: string) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || "Dayza <onboarding@resend.dev>";
  if (!apiKey) return false;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: email,
      subject: "Your Dayza verification code",
      text: `Your Dayza verification code is ${otp}. It expires in 10 minutes.`,
      html: `<p>Your Dayza verification code is:</p><h2>${otp}</h2><p>This code expires in 10 minutes.</p>`,
    }),
  });

  if (!res.ok) {
    const data = await res.text();
    throw new Error(data || "Failed to send verification email");
  }
  return true;
}

export async function POST(req: Request) {
  try {
    const { email } = await req.json();
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) {
      return NextResponse.json({ error: "Email already registered" }, { status: 400 });
    }

    const otp = String(crypto.randomInt(100000, 1000000));
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await prisma.signupOtp.create({
      data: {
        email: normalizedEmail,
        tokenHash: hashOtp(normalizedEmail, otp),
        expiresAt,
      },
    });

    let sent = false;
    let emailWarning: string | undefined;
    try {
      sent = await sendOtpEmail(normalizedEmail, otp);
    } catch (error: any) {
      emailWarning = error?.message?.includes("testing emails")
        ? "Resend is in testing mode. Verify a domain in Resend to email other users."
        : "Email provider could not send the code.";
      if (process.env.NODE_ENV === "production" && process.env.ALLOW_OTP_DEBUG !== "true") {
        return NextResponse.json({ error: emailWarning }, { status: 400 });
      }
    }
    return NextResponse.json({
      message: sent ? "Verification code sent" : "Verification code generated",
      warning: emailWarning,
      devOtp: sent || (process.env.NODE_ENV === "production" && process.env.ALLOW_OTP_DEBUG !== "true") ? undefined : otp,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Failed to send verification code" }, { status: 500 });
  }
}
