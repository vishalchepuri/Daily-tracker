export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { generatePresignedUploadUrl } from "@/lib/s3";

const ALLOWED_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
]);

function safeFileName(value: unknown) {
  const fileName = String(value ?? "").trim();
  const baseName = fileName.split(/[\\/]/).pop() ?? "";
  return baseName.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 120);
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { fileName, contentType, isPublic } = await req.json();
    const cleanFileName = safeFileName(fileName);
    const cleanContentType = String(contentType ?? "").toLowerCase();
    if (!cleanFileName || !cleanContentType) {
      return NextResponse.json({ error: "fileName and contentType are required" }, { status: 400 });
    }
    if (!ALLOWED_CONTENT_TYPES.has(cleanContentType)) {
      return NextResponse.json({ error: "Unsupported file type" }, { status: 400 });
    }
    const result = await generatePresignedUploadUrl(cleanFileName, cleanContentType, Boolean(isPublic));
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Failed" }, { status: 500 });
  }
}
