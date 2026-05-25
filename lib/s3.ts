import { PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createS3Client, getBucketConfig } from "./aws-config";
import { deleteFirebaseFile, generateFirebaseUploadUrl, getFirebaseFileUrl, uploadFirebaseBuffer } from "./firebase-storage";

const s3 = createS3Client();

function useFirebaseStorage() {
  return process.env.STORAGE_PROVIDER?.toLowerCase() === "firebase";
}

export async function generatePresignedUploadUrl(
  fileName: string,
  contentType: string,
  isPublic: boolean = false
) {
  if (useFirebaseStorage()) {
    return generateFirebaseUploadUrl(fileName, contentType, isPublic);
  }

  const { bucketName, folderPrefix } = getBucketConfig();
  const prefix = isPublic ? "public/uploads" : "uploads";
  const cloud_storage_path = `${folderPrefix}${prefix}/${Date.now()}-${fileName}`;

  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: cloud_storage_path,
    ContentType: contentType,
    ContentDisposition: isPublic ? "attachment" : undefined,
  });

  const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });
  return { uploadUrl, cloud_storage_path };
}

export async function uploadBuffer(
  fileName: string,
  contentType: string,
  buffer: Buffer,
  folder: string = "uploads/chat"
) {
  if (useFirebaseStorage()) {
    return uploadFirebaseBuffer(fileName, contentType, buffer, folder);
  }

  const { bucketName, folderPrefix } = getBucketConfig();
  if (!bucketName) throw new Error("AWS bucket is not configured");
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]+/g, "-");
  const cloud_storage_path = `${folderPrefix}${folder}/${Date.now()}-${safeName}`;

  await s3.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: cloud_storage_path,
      ContentType: contentType,
      Body: buffer,
    })
  );

  return cloud_storage_path;
}

export async function getFileUrl(cloud_storage_path: string, isPublic: boolean) {
  if (useFirebaseStorage()) {
    return getFirebaseFileUrl(cloud_storage_path, isPublic);
  }

  const { bucketName } = getBucketConfig();
  if (isPublic) {
    const region = process.env.AWS_REGION ?? "us-east-1";
    return `https://${bucketName}.s3.${region}.amazonaws.com/${cloud_storage_path}`;
  }
  const command = new GetObjectCommand({
    Bucket: bucketName,
    Key: cloud_storage_path,
    ResponseContentDisposition: "attachment",
  });
  return getSignedUrl(s3, command, { expiresIn: 3600 });
}

export async function deleteFile(cloud_storage_path: string) {
  if (useFirebaseStorage()) {
    await deleteFirebaseFile(cloud_storage_path);
    return;
  }

  const { bucketName } = getBucketConfig();
  await s3.send(
    new DeleteObjectCommand({
      Bucket: bucketName,
      Key: cloud_storage_path,
    })
  );
}
