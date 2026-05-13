export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getFileUrl } from "@/lib/s3";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = (session.user as any)?.id;
    const photos = await prisma.progressPhoto.findMany({
      where: { userId },
      orderBy: { date: "desc" },
    });
    const photosWithUrls = await Promise.all(
      (photos ?? []).map(async (p: any) => ({
        ...p,
        url: await getFileUrl(p.cloudStoragePath, p.isPublic),
      }))
    );
    return NextResponse.json({ photos: photosWithUrls });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Failed" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = (session.user as any)?.id;
    const data = await req.json();
    const photo = await prisma.progressPhoto.create({
      data: {
        userId,
        cloudStoragePath: data.cloudStoragePath,
        isPublic: data.isPublic ?? false,
        label: data.label ?? null,
        date: data.date ? new Date(data.date) : new Date(),
      },
    });
    return NextResponse.json({ photo });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Failed" }, { status: 500 });
  }
}
