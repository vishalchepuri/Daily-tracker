export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { createProgressPhotoMetadata, listProgressPhotoMetadata } from "@/lib/firestore-app-data";
import { getFileUrl } from "@/lib/s3";

export async function GET() {
  try {
    const user = await requireCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = user.id;
    const photos = await listProgressPhotoMetadata(userId);
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
    const user = await requireCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = user.id;
    const data = await req.json();
    const photo = await createProgressPhotoMetadata(userId, data);
    return NextResponse.json({ photo });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Failed" }, { status: 500 });
  }
}
