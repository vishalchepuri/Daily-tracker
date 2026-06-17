import { App, cert, getApps, initializeApp } from "firebase-admin/app";
import { getStorage } from "firebase-admin/storage";
import { existsSync, readFileSync } from "fs";

function parseServiceAccount() {
  let raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON ?? "";

  if (!raw && process.env.FIREBASE_SERVICE_ACCOUNT_PATH && process.env.NODE_ENV !== "production") {
    const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
    raw = existsSync(serviceAccountPath) ? readFileSync(serviceAccountPath, "utf8") : "";
  }

  if (!raw) return null;

  const parsed = JSON.parse(raw);
  if (parsed.private_key) {
    parsed.private_key = String(parsed.private_key).replace(/\\n/g, "\n");
  }
  return parsed;
}

export function getFirebaseAdminApp(): App {
  if (!getApps().length) {
    const serviceAccount = parseServiceAccount();
    if (!serviceAccount && process.env.NODE_ENV === "production") {
      throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is required in production");
    }
    initializeApp({
      ...(serviceAccount ? { credential: cert(serviceAccount) } : {}),
      ...(process.env.FIREBASE_STORAGE_BUCKET ? { storageBucket: process.env.FIREBASE_STORAGE_BUCKET } : {}),
    });
  }

  return getApps()[0];
}

function getFirebaseBucket() {
  const bucketName = process.env.FIREBASE_STORAGE_BUCKET;
  if (!bucketName) throw new Error("FIREBASE_STORAGE_BUCKET is not configured");

  getFirebaseAdminApp();
  return getStorage().bucket(bucketName);
}

export async function generateFirebaseUploadUrl(fileName: string, contentType: string, isPublic = false, folder?: string) {
  const folderPrefix = process.env.FIREBASE_STORAGE_PREFIX ?? "";
  const prefix = folder || (isPublic ? "public/uploads" : "uploads");
  const cloud_storage_path = `${folderPrefix}${prefix}/${Date.now()}-${fileName}`;
  const file = getFirebaseBucket().file(cloud_storage_path);
  const [uploadUrl] = await file.getSignedUrl({
    action: "write",
    contentType,
    expires: Date.now() + 60 * 60 * 1000,
  });
  return { uploadUrl, cloud_storage_path };
}

export async function uploadFirebaseBuffer(fileName: string, contentType: string, buffer: Buffer, folder = "uploads/chat") {
  const folderPrefix = process.env.FIREBASE_STORAGE_PREFIX ?? "";
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]+/g, "-");
  const cloud_storage_path = `${folderPrefix}${folder}/${Date.now()}-${safeName}`;
  await getFirebaseBucket().file(cloud_storage_path).save(buffer, {
    contentType,
    resumable: false,
    metadata: { cacheControl: "private, max-age=3600" },
  });
  return cloud_storage_path;
}

export async function getFirebaseFileUrl(cloud_storage_path: string, isPublic: boolean) {
  const bucket = getFirebaseBucket();
  const file = bucket.file(cloud_storage_path);
  if (isPublic) {
    const encodedPath = cloud_storage_path.split("/").map(encodeURIComponent).join("/");
    return `https://storage.googleapis.com/${bucket.name}/${encodedPath}`;
  }
  const [url] = await file.getSignedUrl({
    action: "read",
    expires: Date.now() + 60 * 60 * 1000,
  });
  return url;
}

export async function deleteFirebaseFile(cloud_storage_path: string) {
  await getFirebaseBucket().file(cloud_storage_path).delete({ ignoreNotFound: true });
}
