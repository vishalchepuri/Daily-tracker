export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

async function currentUserId() {
  const user = await requireCurrentUser();
  return user?.id;
}

export async function GET(req: Request) {
  try {
    const userId = await currentUserId();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") || "open";
    const items = await prisma.reviewItem.findMany({
      where: { userId, ...(status === "all" ? {} : { status }) },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 100,
    });
    const counts = await prisma.reviewItem.groupBy({
      by: ["status"],
      where: { userId },
      _count: { id: true },
    });
    return NextResponse.json({ items, counts });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Failed" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const userId = await currentUserId();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const data = await req.json();
    if (!data?.id) return NextResponse.json({ error: "ID required" }, { status: 400 });
    const existing = await prisma.reviewItem.findUnique({ where: { id: String(data.id) } });
    if (!existing || existing.userId !== userId) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const status = ["open", "confirmed", "ignored"].includes(data.status) ? data.status : existing.status;
    const item = await prisma.reviewItem.update({
      where: { id: existing.id },
      data: {
        status,
        resolvedAt: status === "open" ? null : new Date(),
      },
    });
    return NextResponse.json({ item });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Failed" }, { status: 500 });
  }
}
