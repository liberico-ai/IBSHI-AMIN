import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { parseStoredFileUrl, getHrMinioClient, getMinioClient } from "@/lib/minio";

// GET /api/v1/files/view?url=<encoded>[&download=1]
// Stream file từ MinIO private bucket qua backend.
// User chỉ cần đang login là xem được; URL endpoint vĩnh viễn (không expire).
//
// Dùng cho:
//   - <a href> để "Xem" file (mở tab mới, browser tự render theo Content-Type)
//   - <img src>, <iframe src> để hiển thị inline
//   - <a download> để tải về (thêm &download=1)
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }

  const url = req.nextUrl.searchParams.get("url");
  const download = req.nextUrl.searchParams.get("download") === "1";
  if (!url) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Thiếu tham số url" } },
      { status: 400 }
    );
  }

  const parsed = parseStoredFileUrl(url);
  if (!parsed) {
    return NextResponse.json(
      { error: { code: "INVALID_URL", message: "URL không hợp lệ" } },
      { status: 400 }
    );
  }

  const client = parsed.source === "hr" ? getHrMinioClient() : getMinioClient();

  try {
    const stat = await client.statObject(parsed.bucket, parsed.objectName);
    const stream = await client.getObject(parsed.bucket, parsed.objectName);

    const contentType =
      stat.metaData?.["content-type"] ||
      guessContentType(parsed.objectName) ||
      "application/octet-stream";
    const fileName = parsed.objectName.split("/").pop() || "file";

    // ReadableStream<Uint8Array> từ Node stream
    const webStream = new ReadableStream<Uint8Array>({
      start(controller) {
        stream.on("data", (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)));
        stream.on("end", () => controller.close());
        stream.on("error", (err) => controller.error(err));
      },
      cancel() {
        stream.destroy();
      },
    });

    const headers: Record<string, string> = {
      "Content-Type": contentType,
      "Content-Length": String(stat.size),
      "Cache-Control": "private, max-age=300",
    };
    if (download) {
      headers["Content-Disposition"] = `attachment; filename="${asciiSafe(fileName)}"`;
    } else {
      headers["Content-Disposition"] = `inline; filename="${asciiSafe(fileName)}"`;
    }

    return new NextResponse(webStream as any, { status: 200, headers });
  } catch (e: any) {
    console.error("[files/view] Error:", e);
    if (e?.code === "NoSuchKey" || e?.code === "NotFound") {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "File không tồn tại trên kho lưu trữ" } },
        { status: 404 }
      );
    }
    return NextResponse.json(
      { error: { code: "VIEW_FAILED", message: e?.message || "Không tải được file" } },
      { status: 500 }
    );
  }
}

function guessContentType(name: string): string | null {
  const ext = name.split(".").pop()?.toLowerCase();
  if (!ext) return null;
  const map: Record<string, string> = {
    pdf: "application/pdf",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
    txt: "text/plain; charset=utf-8",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  };
  return map[ext] || null;
}

function asciiSafe(s: string): string {
  return s.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "");
}
