export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";
import crypto from "crypto";

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function POST(req: Request) {
  try {
    const { token, password } = await req.json();
    const rawToken = String(token ?? "");
    const nextPassword = String(password ?? "");
    if (!rawToken || nextPassword.length < 6) {
      return NextResponse.json({ error: "Valid token and 6+ character password are required" }, { status: 400 });
    }

    const resetToken = await prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashToken(rawToken) },
    });
    if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
      return NextResponse.json({ error: "Reset link is invalid or expired" }, { status: 400 });
    }

    const hashedPassword = await bcrypt.hash(nextPassword, 12);
    await prisma.$transaction([
      prisma.user.update({ where: { id: resetToken.userId }, data: { password: hashedPassword } }),
      prisma.passwordResetToken.update({ where: { id: resetToken.id }, data: { usedAt: new Date() } }),
    ]);

    return NextResponse.json({ message: "Password updated" });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Failed to reset password" }, { status: 500 });
  }
}
