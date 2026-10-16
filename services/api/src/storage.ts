import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Credentials must come only from deployment environment variables.
// Never commit provider keys or ship credentials with source code.
const endpoint = process.env.S3_ENDPOINT || "";
const accessKey = process.env.S3_ACCESS_KEY || "";
const secretKey = process.env.S3_SECRET_KEY || "";
const bucket = process.env.S3_BUCKET || "kotahbase-files";
const publicBase = (process.env.S3_PUBLIC_URL || "").replace(/\/$/, "");

export const hasS3 = Boolean(endpoint && accessKey && secretKey && bucket);
export const s3: S3Client | null = hasS3
  ? new S3Client({
      endpoint,
      region: process.env.S3_REGION || "af-west",
      credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
      forcePathStyle: true,
    })
  : null;

if (hasS3) console.log("[Storage] S3-compatible provider configured");
else console.log("[Storage] Not configured; set S3_ENDPOINT, S3_ACCESS_KEY, S3_SECRET_KEY and S3_BUCKET");

function safeKey(key: string) {
  const normalized = key.replace(/^\/+/, "");
  if (!normalized || normalized.split("/").some((part) => part === "..")) {
    throw new Error("Invalid storage object key");
  }
  return normalized;
}

export async function uploadFile(key: string, body: Buffer | Uint8Array, contentType: string) {
  if (!s3) throw new Error("Storage is not configured");
  const objectKey = safeKey(key);
  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: objectKey, Body: body, ContentType: contentType }));
  return { key: objectKey, url: publicBase ? `${publicBase}/${objectKey}` : null, bucket };
}

export async function getFileUrl(key: string, expiresIn = 3600) {
  if (!s3) throw new Error("Storage is not configured");
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: safeKey(key) }), { expiresIn });
}

export async function deleteFile(key: string) {
  if (!s3) throw new Error("Storage is not configured");
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: safeKey(key) }));
}

export async function listFiles(prefix = "") {
  if (!s3) throw new Error("Storage is not configured");
  const res = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix }));
  return (res.Contents || []).map((obj) => ({
    key: obj.Key,
    size: obj.Size,
    lastModified: obj.LastModified,
    url: publicBase && obj.Key ? `${publicBase}/${obj.Key}` : null
  }));
}

export { bucket };
