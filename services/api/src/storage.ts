import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const endpoint = process.env.S3_ENDPOINT || "https://af.storage.naijacloud.app";
const accessKey = process.env.S3_ACCESS_KEY || "NCD87D6568732637603D59CB034EB922C58";
const secretKey = process.env.S3_SECRET_KEY || "nc_live_WPXtujjmlipYo1T3f1pH6xXPTgEP1um_7ha10j6F21Y";
const bucket = process.env.S3_BUCKET || "kotahbase-files";
const publicBase = process.env.S3_PUBLIC_URL || "https://af.storage.naijacloud.app/kotahbase-files";

const hasS3 = !!(endpoint && accessKey && secretKey);

let s3: S3Client | null = null;

if (hasS3) {
  s3 = new S3Client({
    endpoint,
    region: "af-west",
    credentials: {
      accessKeyId: accessKey,
      secretAccessKey: secretKey,
    },
    forcePathStyle: true,
  });
  console.log("[Storage] Naijacloud connected →", endpoint);
} else {
  console.log("[Storage] Not configured");
}

export async function uploadFile(key: string, body: Buffer | Uint8Array, contentType: string) {
  if (!s3) throw new Error("Storage is not configured");

  await s3.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: body,
    ContentType: contentType,
  }));

  return {
    key,
    url: `${publicBase}/${key}`,
    bucket
  };
}

export async function getFileUrl(key: string, expiresIn = 3600) {
  if (!s3) throw new Error("Storage is not configured");
  const command = new GetObjectCommand({ Bucket: bucket, Key: key });
  return getSignedUrl(s3, command, { expiresIn });
}

export async function deleteFile(key: string) {
  if (!s3) throw new Error("Storage is not configured");
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

export async function listFiles(prefix = "") {
  if (!s3) throw new Error("Storage is not configured");
  const res = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix }));
  return (res.Contents || []).map(obj => ({
    key: obj.Key,
    size: obj.Size,
    lastModified: obj.LastModified,
    url: `${publicBase}/${obj.Key}`
  }));
}

export { s3, bucket, hasS3 };
