export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";

export async function POST(req: Request) {
  try {
    const { email, password, name } = await req.json();
    const normalizedEmail = String(email ?? "").trim().toLowerCase();
    if (!normalizedEmail || !password) {
      return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
    }
    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) {
      return NextResponse.json({ error: "Email already registered" }, { status: 400 });
    }
    const hashedPassword = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { email: normalizedEmail, password: hashedPassword, name: name ?? normalizedEmail.split("@")[0] },
    });
    return NextResponse.json({ message: "Account created successfully", user: { id: user.id, email: user.email, name: user.name } });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Signup failed" }, { status: 500 });
  }
}
