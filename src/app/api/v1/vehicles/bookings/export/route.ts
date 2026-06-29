import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

// Xuất lịch sử đặt xe theo xe + khoảng ngày. Trả {title, columns, rows} để client dựng Excel.
// Mọi giờ/ngày hiển thị theo GIỜ VN (Asia/Ho_Chi_Minh) — KHÔNG phụ thuộc múi giờ máy chủ (có thể UTC).
const vnPart = (d: Date | string) => {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(d));
  const o: Record<string, string> = {};
  for (const p of parts) o[p.type] = p.value;
  return o;
};
const vnDate = (d: Date | string) => { const p = vnPart(d); return `${p.day}/${p.month}/${p.year}`; };
const hm = (d: Date) => { const p = vnPart(d); return `${p.hour}:${p.minute}`; };
const dm = (d: Date) => { const p = vnPart(d); return `${p.day}/${p.month}`; };

const PURPOSE_LABEL: Record<string, string> = {
  DELIVERY: "Giao hàng", CLIENT_PICKUP: "Đón khách", BUSINESS_TRIP: "Công tác", PROCUREMENT: "Mua vật tư", OTHER: "Khác",
};
const STATUS_LABEL: Record<string, string> = {
  PENDING: "Chờ duyệt", APPROVED: "Đã duyệt", REJECTED: "Từ chối", COMPLETED: "Hoàn thành", CANCELLED: "Đã huỷ",
};
const PRIORITY_LABEL: Record<string, string> = { NONE: "Không", NORMAL: "Bình thường", PRIORITY: "Ưu tiên" };

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const vehicleId = searchParams.get("vehicleId") || "";
  const fromStr = searchParams.get("from") || "";
  const toStr = searchParams.get("to") || "";
  if (!fromStr || !toStr) return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Cần from và to" } }, { status: 400 });

  const from = new Date(new Date(fromStr).setHours(0, 0, 0, 0));
  const to = new Date(new Date(toStr).setHours(23, 59, 59, 999));

  const bookings = await prisma.vehicleBooking.findMany({
    where: { startDate: { gte: from, lte: to }, ...(vehicleId ? { vehicleId } : {}) },
    include: {
      vehicle: { select: { licensePlate: true, model: true } },
      requester: { select: { fullName: true, department: { select: { name: true } } } },
    },
    orderBy: { startDate: "asc" },
  });

  const rows = bookings.map((b) => {
    const s = new Date(b.startDate), e = new Date(b.endDate);
    const sameDay = vnDate(s) === vnDate(e);
    return {
      date: vnDate(b.startDate),
      time: sameDay ? `${hm(s)} → ${hm(e)}` : `${hm(s)} ${dm(s)} → ${hm(e)} ${dm(e)}`,
      vehicle: b.vehicle.licensePlate,
      route: `${b.origin ? b.origin + " → " : ""}${b.destination}`,
      purpose: PURPOSE_LABEL[b.purpose] || b.purpose,
      passengers: b.passengers,
      priority: PRIORITY_LABEL[b.priority] || b.priority,
      type: b.seriesId ? "Lịch cố định" : "Đơn lẻ",
      requester: b.requester.fullName,
      department: b.requester.department?.name || "",
      driver: b.driverName || "",
      status: STATUS_LABEL[b.status] || b.status,
    };
  });

  let vehicleLabel = "Tất cả xe";
  if (vehicleId) {
    const v = await prisma.vehicle.findUnique({ where: { id: vehicleId }, select: { licensePlate: true } });
    vehicleLabel = v?.licensePlate || vehicleId;
  }

  return NextResponse.json({ data: {
    title: `LỊCH SỬ ĐẶT XE (${vehicleLabel}) — ${vnDate(from)} – ${vnDate(to)}`,
    columns: [
      { header: "Ngày", key: "date", width: 14 },
      { header: "Giờ đi → về", key: "time", width: 20 },
      { header: "Xe", key: "vehicle", width: 16 },
      { header: "Hành trình", key: "route", width: 28 },
      { header: "Mục đích", key: "purpose", width: 14 },
      { header: "Số HK", key: "passengers", width: 8 },
      { header: "Mức ưu tiên", key: "priority", width: 14 },
      { header: "Kiểu đặt", key: "type", width: 14 },
      { header: "Người đặt", key: "requester", width: 22 },
      { header: "Phòng ban", key: "department", width: 22 },
      { header: "Lái xe", key: "driver", width: 20 },
      { header: "Trạng thái", key: "status", width: 12 },
    ],
    rows,
  } });
}
