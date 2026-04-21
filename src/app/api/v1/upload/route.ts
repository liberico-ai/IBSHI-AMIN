import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getMinioClient, ensureBucket, getFileUrl, BUCKETS } from "@/lib/minio";

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

    // Ensure bucket exists
    await ensureBucket(bucket);

    // Upload to MinIO
    const client = getMinioClient();
    const buffer = Buffer.from(await file.arrayBuffer());
    await client.putObject(bucket, objectName, buffer, buffer.length, {
      "Content-Type": file.type || "application/octet-stream",
    });

    const url = getFileUrl(bucket, objectName);
    return NextResponse.json({ data: { url, bucket, objectName, fileName: file.name } });
  } catch (error: any) {
    console.error("Upload error:", error);
    // If MinIO is not available, return a placeholder URL (dev mode)
    if (error.code === "ECONNREFUSED" || error.message?.includes("connect")) {
      return NextResponse.json({
        error: { code: "MINIO_UNAVAILABLE", message: `Máy chủ lưu trữ file (MinIO) chưa khởi động tại ${process.env.MINIO_ENDPOINT || "localhost"}:${process.env.MINIO_PORT || "9000"}. Vui lòng khởi động MinIO trước khi upload.` }
      }, { status: 503 });
    }
    return NextResponse.json({ error: { code: "UPLOAD_FAILED", message: "Upload thất bại" } }, { status: 500 });
  }
}
