export const MAX_PRIVATE_UPLOAD_BYTES = 10 * 1024 * 1024;

export const PRIVATE_UPLOAD_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
]);

export function safeUploadFileName(value: unknown) {
  const fileName = String(value ?? "").trim();
  const baseName = fileName.split(/[\\/]/).pop() ?? "";
  return baseName.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 120);
}

export function userUploadFolder(userId: string) {
  return `uploads/users/${userId}`;
}

function storageFolderPrefixes() {
  return [
    process.env.FIREBASE_STORAGE_PREFIX ?? "",
    process.env.AWS_FOLDER_PREFIX ?? "",
    "",
  ].map((prefix) => {
    const clean = prefix.replace(/^\/+/, "").replace(/\/+$/, "");
    return clean ? `${clean}/` : "";
  });
}

export function isUserScopedUploadPath(userId: string, value: unknown) {
  const path = String(value ?? "").trim().replace(/^\/+/, "");
  if (!path || path.includes("..")) return false;
  const folder = `${userUploadFolder(userId)}/`;
  return storageFolderPrefixes().some((prefix) => path.startsWith(`${prefix}${folder}`));
}
