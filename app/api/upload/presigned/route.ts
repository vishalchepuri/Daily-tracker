export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { generatePresignedUploadUrl } from "@/lib/s3";
import {
  MAX_PRIVATE_UPLOAD_BYTES,
  PRIVATE_UPLOAD_CONTENT_TYPES,
  safeUploadFileName,
  userUploadFolder,
} from "@/lib/upload-security";

export async function POST(req: Request) {
  try {
    const user = await requireCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { fileName, contentType, size } = await req.json();
    const cleanFileName = safeUploadFileName(fileName);
    const cleanContentType = String(contentType ?? "").toLowerCase();
    if (!cleanFileName || !cleanContentType) {
      return NextResponse.json({ error: "fileName and contentType are required" }, { status: 400 });
    }
    if (!PRIVATE_UPLOAD_CONTENT_TYPES.has(cleanContentType)) {
      return NextResponse.json({ error: "Unsupported file type" }, { status: 400 });
    }
    if (size != null && (!Number.isFinite(Number(size)) || Number(size) <= 0 || Number(size) > MAX_PRIVATE_UPLOAD_BYTES)) {
      return NextResponse.json({ error: "File is too large" }, { status: 400 });
    }
    const result = await generatePresignedUploadUrl(cleanFileName, cleanContentType, false, userUploadFolder(user.id));
    return NextResponse.json({ ...result, isPublic: false, maxBytes: MAX_PRIVATE_UPLOAD_BYTES });
  } catch (error: any) {
    return NextResponse.json({ error: process.env.NODE_ENV === "production" ? "Failed" : error?.message ?? "Failed" }, { status: 500 });
  }
}
