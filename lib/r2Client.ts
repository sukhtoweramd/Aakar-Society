import { S3Client } from "@aws-sdk/client-s3";

export function getR2() {
  const accountId = process.env.R2_ACCOUNT_ID || process.env.CLOUDFLARE_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET_NAME || "aakar-vault";
  const publicUrl = (process.env.R2_PUBLIC_URL || process.env.CLOUDFLARE_R2_PUBLIC_URL || "").replace(/\/$/, "");
  if (!accountId || !accessKeyId || !secretAccessKey || !publicUrl) return null;
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
  return { client, bucket, publicUrl };
}

export const MAX_FILE_BYTES = 4 * 1024 * 1024; // Vercel limits request bodies to ~4.5 MB
export const ALLOWED_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
};
