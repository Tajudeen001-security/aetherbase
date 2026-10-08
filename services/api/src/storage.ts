import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT || "http://localhost:9000",
  region: "us-east-1",
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY || "kotah",
    secretAccessKey: process.env.S3_SECRET_KEY || "kotah_secret_key",
  },
  forcePathStyle: true, // needed for MinIO
});

const BUCKET = process.env.S3_BUCKET || "kotahbase";

export async function uploadFile(key: string, body: Buffer | Uint8Array, contentType: string) {
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: body,
    ContentType: contentType,
  }));
  return { key, url: `${process.env.S3_PUBLIC_URL || "http://localhost:9000"}/${BUCKET}/${key}` };
}

export async function getFileUrl(key: string, expiresIn = 3600) {
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  return getSignedUrl(s3, command, { expiresIn });
}

export async function deleteFile(key: string) {
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

export async function listFiles(prefix = "") {
  const res = await s3.send(new ListObjectsV2Command({
    Bucket: BUCKET,
    Prefix: prefix,
  }));
  return res.Contents || [];
}

export { s3, BUCKET };
