export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { getReviewItemCounts, listReviewItems, updateReviewItemStatus } from "@/lib/firestore-app-data";

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
    const [items, counts] = await Promise.all([
      listReviewItems(userId, status),
      getReviewItemCounts(userId),
    ]);
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
    const status = ["open", "confirmed", "ignored"].includes(data.status) ? data.status : "open";
    const item = await updateReviewItemStatus(userId, String(data.id), status);
    if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ item });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Failed" }, { status: 500 });
  }
}
