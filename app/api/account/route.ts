export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function DELETE() {
  try {
    const user = await requireCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = user.id;

    await prisma.user.delete({ where: { id: userId } });
    return NextResponse.json({ message: "Account deleted" });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Failed to delete account" }, { status: 500 });
  }
}
