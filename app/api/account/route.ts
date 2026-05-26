export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";
import { requireCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getFirebaseAdminApp } from "@/lib/firebase-storage";

export async function DELETE() {
  try {
    const user = await requireCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = user.id;

    const auth = getAuth(getFirebaseAdminApp());
    const firebaseUser = await auth.getUserByEmail(user.email).catch(() => null);
    if (firebaseUser) {
      await auth.deleteUser(firebaseUser.uid);
    }

    await prisma.user.delete({ where: { id: userId } });
    return NextResponse.json({ message: "Account deleted" });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Failed to delete account" }, { status: 500 });
  }
}
