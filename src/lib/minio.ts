import * as Minio from "minio";
import { BUCKETS } from "@/lib/minio-constants";

export { BUCKETS };

const MINIO_ENDPOINT = process.env.MINIO_ENDPOINT || "localhost";
const MINIO_PORT = parseInt(process.env.MINIO_PORT || "9000");
const MINIO_USE_SSL = process.env.MINIO_USE_SSL === "true";
const MINIO_ACCESS_KEY = process.env.MINIO_ACCESS_KEY || "minioadmin";
const MINIO_SECRET_KEY = process.env.MINIO_SECRET_KEY || "minioadmin";

let minioClient: Minio.Client | null = null;

export function getMinioClient(): Minio.Client {
  if (!minioClient) {
    minioClient = new Minio.Client({
      endPoint: MINIO_ENDPOINT,
      port: MINIO_PORT,
      useSSL: MINIO_USE_SSL,
      accessKey: MINIO_ACCESS_KEY,
      secretKey: MINIO_SECRET_KEY,
    });
  }
  return minioClient;
}

export async function ensureBucket(bucketName: string): Promise<void> {
  const client = getMinioClient();
  try {
    const exists = await client.bucketExists(bucketName);
    if (!exists) {
      await client.makeBucket(bucketName, "us-east-1");
      // Set public read policy
      const policy = JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Principal: { AWS: ["*"] },
            Action: ["s3:GetObject"],
            Resource: [`arn:aws:s3:::${bucketName}/*`],
          },
        ],
      });
      await client.setBucketPolicy(bucketName, policy);
    }
  } catch {
    // Silently fail if MinIO is not available (dev without docker)
  }
}

export function getFileUrl(bucket: string, objectName: string): string {
  const protocol = MINIO_USE_SSL ? "https" : "http";
  return `${protocol}://${MINIO_ENDPOINT}:${MINIO_PORT}/${bucket}/${objectName}`;
}

// ── MinIO RIÊNG cho HR_DOCUMENTS (HĐ + phụ lục + offer + scan) ────────────────
const HR_MINIO_ENDPOINT = process.env.HR_MINIO_ENDPOINT || "";
const HR_MINIO_PORT = parseInt(process.env.HR_MINIO_PORT || "443");
const HR_MINIO_USE_SSL = process.env.HR_MINIO_USE_SSL !== "false";
const HR_MINIO_ACCESS_KEY = process.env.HR_MINIO_ACCESS_KEY || "";
const HR_MINIO_SECRET_KEY = process.env.HR_MINIO_SECRET_KEY || "";
export const HR_BUCKET = process.env.HR_MINIO_BUCKET || "ibshi";
// Bucket logic của hệ thống vẫn tham chiếu BUCKETS.HR_DOCUMENTS, nhưng trên MinIO riêng
// chỉ có 1 bucket vật lý (HR_BUCKET = "ibshi") nên upload sẽ remap.
export const HR_BUCKET_LOGICAL = BUCKETS.HR_DOCUMENTS;

let hrMinioClient: Minio.Client | null = null;
export function getHrMinioClient(): Minio.Client {
  if (!HR_MINIO_ENDPOINT) throw new Error("Chưa cấu hình HR_MINIO_ENDPOINT");
  if (!hrMinioClient) {
    hrMinioClient = new Minio.Client({
      endPoint: HR_MINIO_ENDPOINT,
      port: HR_MINIO_PORT,
      useSSL: HR_MINIO_USE_SSL,
      accessKey: HR_MINIO_ACCESS_KEY,
      secretKey: HR_MINIO_SECRET_KEY,
    });
  }
  return hrMinioClient;
}

export function getHrFileUrl(objectName: string): string {
  const protocol = HR_MINIO_USE_SSL ? "https" : "http";
  const portPart = (HR_MINIO_USE_SSL && HR_MINIO_PORT === 443) || (!HR_MINIO_USE_SSL && HR_MINIO_PORT === 80) ? "" : `:${HR_MINIO_PORT}`;
  return `${protocol}://${HR_MINIO_ENDPOINT}${portPart}/${HR_BUCKET}/${objectName}`;
}

// Routing: HR_DOCUMENTS bucket → MinIO mới; các bucket khác → MinIO local
export function isHrBucket(bucket: string): boolean {
  return bucket === BUCKETS.HR_DOCUMENTS;
}

// ── Parse stored file URL → {bucket, objectName, source} ──────────────────────
// URL có dạng: http(s)://<endpoint>(:port)/<bucket>/<object...>
// Trả về null nếu không nhận diện được.
export function parseStoredFileUrl(
  url: string
): { source: "hr" | "local"; bucket: string; objectName: string } | null {
  try {
    const u = new URL(url);
    const parts = u.pathname.replace(/^\/+/, "").split("/");
    if (parts.length < 2) return null;
    const bucket = parts[0];
    const objectName = parts.slice(1).join("/");
    if (!objectName) return null;

    if (HR_MINIO_ENDPOINT && u.hostname === HR_MINIO_ENDPOINT) {
      return { source: "hr", bucket, objectName };
    }
    if (u.hostname === MINIO_ENDPOINT) {
      return { source: "local", bucket, objectName };
    }
    // Fallback: nếu bucket trùng tên HR_BUCKET thì coi như HR
    if (bucket === HR_BUCKET) return { source: "hr", bucket, objectName };
    return { source: "local", bucket, objectName };
  } catch {
    return null;
  }
}

// Tạo presigned GET URL (mặc định 1 giờ).
export async function presignFileUrl(url: string, expirySeconds = 3600): Promise<string | null> {
  const parsed = parseStoredFileUrl(url);
  if (!parsed) return null;
  const client = parsed.source === "hr" ? getHrMinioClient() : getMinioClient();
  return client.presignedGetObject(parsed.bucket, parsed.objectName, expirySeconds);
}
