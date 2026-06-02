import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getMinioClient, ensureBucket, getFileUrl, BUCKETS, getHrMinioClient, getHrFileUrl, HR_BUCKET, isHrBucket } from "@/lib/minio";

const ALLOWED_BUCKETS = Object.values(BUCKETS);
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const bucket = (formData.get("bucket") as string) || BUCKETS.HR_DOCUMENTS;
    const folder = (formData.get("folder") as string) || "misc";

    if (!file) {
      return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Không có file" } }, { status: 400 });
    }
    if (!ALLOWED_BUCKETS.includes(bucket as any)) {
      return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Bucket không hợp lệ" } }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: { code: "FILE_TOO_LARGE", message: "File không được vượt quá 10MB" } }, { status: 413 });
    }

    // Sanitize filename
    const ext = file.name.split(".").pop()?.toLowerCase() || "bin";
    const safeName = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const objectName = folder ? `${folder}/${safeName}` : safeName;

    const buffer = Buffer.from(await file.arrayBuffer());
    const contentType = file.type || "application/octet-stream";

    // Routing: HR_DOCUMENTS → MinIO RIÊNG (bucket "ibshi"); các bucket khác → MinIO local
    if (isHrBucket(bucket)) {
      // Pre-check env vars để báo lỗi rõ ràng
      if (!process.env.HR_MINIO_ENDPOINT || !process.env.HR_MINIO_ACCESS_KEY || !process.env.HR_MINIO_SECRET_KEY) {
        const missing = [
          !process.env.HR_MINIO_ENDPOINT && "HR_MINIO_ENDPOINT",
          !process.env.HR_MINIO_ACCESS_KEY && "HR_MINIO_ACCESS_KEY",
          !process.env.HR_MINIO_SECRET_KEY && "HR_MINIO_SECRET_KEY",
        ].filter(Boolean).join(", ");
        return NextResponse.json({
          error: { code: "HR_MINIO_NOT_CONFIGURED", message: `Server chưa cấu hình HR MinIO. Thiếu biến môi trường: ${missing}` },
        }, { status: 503 });
      }
      const hrClient = getHrMinioClient();
      const hrObjectName = `${BUCKETS.HR_DOCUMENTS}/${objectName}`;
      try {
        await hrClient.putObject(HR_BUCKET, hrObjectName, buffer, buffer.length, { "Content-Type": contentType });
      } catch (e: any) {
        console.error("[upload HR] putObject failed:", e);
        return NextResponse.json({
          error: {
            code: "HR_MINIO_UPLOAD_FAILED",
            message: `Upload lên HR MinIO (${process.env.HR_MINIO_ENDPOINT}) thất bại: ${e?.code || ""} ${e?.message || e}`.trim(),
          },
        }, { status: 502 });
      }
      const url = getHrFileUrl(hrObjectName);
      return NextResponse.json({ data: { url, bucket: HR_BUCKET, objectName: hrObjectName, fileName: file.name } });
    }

    await ensureBucket(bucket);
    const client = getMinioClient();
    await client.putObject(bucket, objectName, buffer, buffer.length, { "Content-Type": contentType });
    const url = getFileUrl(bucket, objectName);
    return NextResponse.json({ data: { url, bucket, objectName, fileName: file.name } });
  } catch (error: any) {
    console.error("Upload error:", error);
    if (error.code === "ECONNREFUSED" || error.message?.includes("connect")) {
      return NextResponse.json({
        error: { code: "MINIO_UNAVAILABLE", message: `Không kết nối được máy chủ lưu trữ file (MinIO). Chi tiết: ${error.code || error.message}` },
      }, { status: 503 });
    }
    return NextResponse.json({
      error: { code: "UPLOAD_FAILED", message: `Upload thất bại: ${error?.code || ""} ${error?.message || error}`.trim() },
    }, { status: 500 });
  }
}
