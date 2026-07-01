import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ĐÃ BỎ (chốt 2026-07-01): BHXH nay hệ thống TỰ TÍNH theo Lương đóng BHXH — KHÔNG import nữa.
// Giữ endpoint để không vỡ route cũ; mọi lời gọi trả 410.
export async function POST() {
  return NextResponse.json(
    { error: { code: "DEPRECATED", message: "Đã bỏ import BHXH. Hệ thống tự tính BHXH theo Lương đóng BHXH khi tính lương." } },
    { status: 410 },
  );
}
