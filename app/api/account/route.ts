export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function DELETE() {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id;
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await prisma.user.delete({ where: { id: userId } });
    return NextResponse.json({ message: "Account deleted" });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Failed to delete account" }, { status: 500 });
  }
}
