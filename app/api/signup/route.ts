export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";
import crypto from "crypto";

function hashOtp(email: string, otp: string) {
  return crypto
    .createHash("sha256")
    .update(`${email}:${otp}:${process.env.NEXTAUTH_SECRET ?? "dayza-dev-secret"}`)
    .digest("hex");
}

export async function POST(req: Request) {
  try {
    const { email, password, name, otp } = await req.json();
    const normalizedEmail = String(email ?? "").trim().toLowerCase();
    if (!normalizedEmail || !password) {
      return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
    }
    if (!otp) {
      return NextResponse.json({ error: "Verification code is required" }, { status: 400 });
    }
    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) {
      return NextResponse.json({ error: "Email already registered" }, { status: 400 });
    }
    const otpRow = await prisma.signupOtp.findFirst({
      where: {
        email: normalizedEmail,
        tokenHash: hashOtp(normalizedEmail, String(otp).trim()),
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });
    if (!otpRow) {
      return NextResponse.json({ error: "Invalid or expired verification code" }, { status: 400 });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { email: normalizedEmail, password: hashedPassword, name: name ?? normalizedEmail.split("@")[0] },
    });
    await prisma.signupOtp.update({
      where: { id: otpRow.id },
      data: { usedAt: new Date(), userId: user.id },
    });
    return NextResponse.json({ message: "Account created successfully", user: { id: user.id, email: user.email, name: user.name } });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Signup failed" }, { status: 500 });
  }
}
