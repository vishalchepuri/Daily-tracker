export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(req: Request) {
  try {
    const user = await requireCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(req.url);
    const limit = Math.min(50, Math.max(5, Number(url.searchParams.get("limit") ?? 20) || 20));
    const items = await prisma.pushNotificationLog.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        deviceId: true,
        kind: true,
        title: true,
        body: true,
        status: true,
        error: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ items });
  } catch (error: any) {
    return NextResponse.json({ error: process.env.NODE_ENV === "production" ? "Failed" : error?.message ?? "Failed" }, { status: 500 });
  }
}
