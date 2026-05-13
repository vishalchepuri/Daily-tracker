export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = (session.user as any)?.id;

    const since = new Date();
    since.setDate(since.getDate() - 30);

    const metrics = await prisma.healthMetric.findMany({
      where: { userId, startDate: { gte: since } },
      orderBy: { startDate: "desc" },
      take: 500,
    });

    return NextResponse.json({ metrics });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Failed" }, { status: 500 });
  }
}
