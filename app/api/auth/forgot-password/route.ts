export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import crypto from "crypto";

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function POST(req: Request) {
  try {
    const { email } = await req.json();
    const normalizedEmail = String(email ?? "").trim().toLowerCase();
    if (!normalizedEmail) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (!user) {
      return NextResponse.json({ message: "If this email exists, a reset link is ready." });
    }

    const token = crypto.randomBytes(32).toString("hex");
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + 1000 * 60 * 30),
      },
    });

    const origin = new URL(req.url).origin;
    const resetUrl = `${origin}/reset-password?token=${token}`;
    return NextResponse.json({
      message: "Reset link created.",
      resetUrl,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Failed to create reset link" }, { status: 500 });
  }
}
