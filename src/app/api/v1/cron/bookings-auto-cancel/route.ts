import { NextRequest, NextResponse } from "next/server";
import { autoCancelExpiredBookings } from "@/lib/booking-autocancel";

// POST /api/v1/cron/bookings-auto-cancel
// Tự động hủy phiếu đặt xe / đặt phòng họp chưa duyệt mà đã qua ngày của lịch.
// Chạy daily (gợi ý 00:05 sáng — đầu ngày mới, để hủy các phiếu của ngày hôm trước).
export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-cron-secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }

  const result = await autoCancelExpiredBookings();
  return NextResponse.json({ data: result });
}
