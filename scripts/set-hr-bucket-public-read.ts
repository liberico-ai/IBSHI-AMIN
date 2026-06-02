import * as Minio from "minio";

const endpoint = process.env.HR_MINIO_ENDPOINT || "minio.lab.liberico.com.vn";
const port = parseInt(process.env.HR_MINIO_PORT || "443", 10);
const useSSL = (process.env.HR_MINIO_USE_SSL || "true") === "true";
const accessKey = process.env.HR_MINIO_ACCESS_KEY!;
const secretKey = process.env.HR_MINIO_SECRET_KEY!;
const bucket = process.env.HR_MINIO_BUCKET || "ibshi";

if (!accessKey || !secretKey) {
  console.error("Thiếu HR_MINIO_ACCESS_KEY / HR_MINIO_SECRET_KEY trong .env");
  process.exit(1);
}

const client = new Minio.Client({ endPoint: endpoint, port, useSSL, accessKey, secretKey });

// Policy public-read: ai cũng được GetObject + ListBucket
const policy = {
  Version: "2012-10-17",
  Statement: [
    {
      Effect: "Allow",
      Principal: { AWS: ["*"] },
      Action: ["s3:GetBucketLocation", "s3:ListBucket"],
      Resource: [`arn:aws:s3:::${bucket}`],
    },
    {
      Effect: "Allow",
      Principal: { AWS: ["*"] },
      Action: ["s3:GetObject"],
      Resource: [`arn:aws:s3:::${bucket}/*`],
    },
  ],
};

(async () => {
  console.log(`→ Bucket: ${bucket} @ ${endpoint}`);
  try {
    const existing = await client.getBucketPolicy(bucket).catch(() => null);
    console.log("→ Policy hiện tại:", existing || "(chưa có)");
  } catch {}
  await client.setBucketPolicy(bucket, JSON.stringify(policy));
  console.log(`✓ Đã set policy public-read cho bucket "${bucket}"`);
  const after = await client.getBucketPolicy(bucket);
  console.log("→ Policy mới:", after);
})().catch((e) => {
  console.error("✗ Lỗi:", e.message || e);
  if (e.code === "AccessDenied") {
    console.error("\nAccess key hiện tại KHÔNG có quyền admin trên bucket.");
    console.error("Cần dùng access key của user admin (không phải service account).");
    console.error("Vào MinIO Console → Identity → Access Keys → tạo mới với policy 'consoleAdmin'.");
  }
  process.exit(1);
});
