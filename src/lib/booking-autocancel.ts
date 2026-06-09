import prisma from "@/lib/prisma";

// Tự động HỦY các phiếu đặt xe / đặt phòng họp CHƯA DUYỆT mà đã qua ngày của lịch.
// Quy tắc: hết ngày của startDate mà vẫn ở trạng thái chờ duyệt → chuyển CANCELLED.
// So sánh theo giờ địa phương của server (khớp cách lưu startDate khi tạo phiếu):
// phiếu có startDate < 00:00 hôm nay = ngày của lịch đã qua → hủy.
export async function autoCancelExpiredBookings() {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const REASON = "Tự động hủy: hết ngày mà chưa được duyệt";

  const [v, r] = await Promise.all([
    prisma.vehicleBooking.updateMany({
      where: { status: "PENDING", startDate: { lt: startOfToday } },
      data: { status: "CANCELLED", rejectedReason: REASON },
    }),
    prisma.roomBooking.updateMany({
      where: { status: "PENDING_APPROVAL", startTime: { lt: startOfToday } },
      data: { status: "CANCELLED", rejectReason: REASON },
    }),
  ]);

  return { vehicleCancelled: v.count, roomCancelled: r.count };
}
