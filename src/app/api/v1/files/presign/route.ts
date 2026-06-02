import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { presignFileUrl } from "@/lib/minio";

// GET /api/v1/files/presign?url=<encoded-url>
// Trả về URL tạm thời (1 giờ) cho phép GET file từ MinIO private bucket.
// Yêu cầu user đã login — endpoint không kiểm tra phân quyền chi tiết theo file,
// nhưng vì link có chữ ký + thời hạn ngắn, chỉ user đã login mới xin được.
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }

  const url = req.nextUrl.searchParams.get("url");
  if (!url) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Thiếu tham số url" } },
      { status: 400 }
    );
  }

  // Nếu URL không phải MinIO (vd ảnh public CDN), trả lại nguyên
  if (!url.includes("/")) {
    return NextResponse.json({ data: { url } });
  }

  try {
    const signed = await presignFileUrl(url, 3600);
    if (!signed) {
      // Không parse được → trả nguyên URL gốc (có thể đã là public)
      return NextResponse.json({ data: { url } });
    }
    return NextResponse.json({ data: { url: signed, expiresIn: 3600 } });
  } catch (e: any) {
    console.error("[files/presign] Error:", e);
    return NextResponse.json(
      { error: { code: "PRESIGN_FAILED", message: e?.message || "Không tạo được link xem file" } },
      { status: 500 }
    );
  }
}
