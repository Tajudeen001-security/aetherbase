import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const hasS3 = !!(process.env.S3_ENDPOINT && process.env.S3_ACCESS_KEY && process.env.S3_SECRET_KEY);

let s3: S3Client | null = null;
const BUCKET = process.env.S3_BUCKET || "kotahbase";

if (hasS3) {
  s3 = new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: "auto",
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY!,
      secretAccessKey: process.env.S3_SECRET_KEY!,
    },
    forcePathStyle: true,
  });
  console.log("[Storage] S3 configured");
} else {
  console.log("[Storage] S3 not configured – Storage endpoints will return 503");
}

export async function uploadFile(key: string, body: Buffer | Uint8Array, contentType: string) {
  if (!s3) throw new Error("Storage is not configured. Add S3 environment variables.");

  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: body,
    ContentType: contentType,
  }));

  const publicUrl = process.env.S3_PUBLIC_URL
    ? `${process.env.S3_PUBLIC_URL}/${key}`
    : `${process.env.S3_ENDPOINT}/${BUCKET}/${key}`;

  return { key, url: publicUrl };
}

export async function getFileUrl(key: string, expiresIn = 3600) {
  if (!s3) throw new Error("Storage is not configured");
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  return getSignedUrl(s3, command, { expiresIn });
}

export async function deleteFile(key: string) {
  if (!s3) throw new Error("Storage is not configured");
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

export async function listFiles(prefix = "") {
  if (!s3) throw new Error("Storage is not configured");
  const res = await s3.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: prefix }));
  return res.Contents || [];
}

export { s3, BUCKET, hasS3 };
