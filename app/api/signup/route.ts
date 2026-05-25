export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyFirebaseIdToken } from "@/lib/firebase-admin-auth";
import bcrypt from "bcryptjs";
import crypto from "crypto";

function hashOtp(email: string, otp: string) {
  return crypto
    .createHash("sha256")
    .update(`${email}:${otp}:${process.env.APP_SECRET ?? "dayza-dev-secret"}`)
    .digest("hex");
}

export async function POST(req: Request) {
  try {
    const { email, password, name, otp, firebaseIdToken } = await req.json();
    const normalizedEmail = String(email ?? "").trim().toLowerCase();
    const firebaseUser = await verifyFirebaseIdToken(firebaseIdToken);
    const accountEmail = firebaseUser?.email ?? normalizedEmail;
    if (!accountEmail || (!password && !firebaseUser)) {
      return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
    }
    if (!otp) {
      return NextResponse.json({ error: "Verification code is required" }, { status: 400 });
    }
    const existing = await prisma.user.findUnique({ where: { email: accountEmail } });
    if (existing) {
      return NextResponse.json({ error: "Email already registered" }, { status: 400 });
    }
    const otpRow = await prisma.signupOtp.findFirst({
      where: {
        email: accountEmail,
        tokenHash: hashOtp(accountEmail, String(otp).trim()),
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });
    if (!otpRow) {
      return NextResponse.json({ error: "Invalid or expired verification code" }, { status: 400 });
    }

    const hashedPassword = password ? await bcrypt.hash(password, 12) : null;
    const user = await prisma.user.create({
      data: {
        email: accountEmail,
        password: hashedPassword,
        name: name ?? firebaseUser?.name ?? accountEmail.split("@")[0],
        image: firebaseUser?.picture ?? null,
      },
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
