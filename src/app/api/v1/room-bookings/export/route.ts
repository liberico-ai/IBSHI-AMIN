import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

// Xuất lịch sử đặt phòng theo phòng + khoảng ngày. Trả {title, columns, rows} để client dựng Excel.
const vnDate = (d: Date | string) => new Date(d).toISOString().slice(0, 10).split("-").reverse().join("/");
const pad2 = (n: number) => String(n).padStart(2, "0");

const STATUS_LABEL: Record<string, string> = {
  PENDING_APPROVAL: "Chờ duyệt",
  APPROVED: "Đã duyệt",
  REJECTED: "Từ chối",
  CANCELLED: "Đã huỷ",
};

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const roomId = searchParams.get("roomId") || "";
  const fromStr = searchParams.get("from") || "";
  const toStr = searchParams.get("to") || "";
  if (!fromStr || !toStr) return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Cần from và to" } }, { status: 400 });

  const from = new Date(new Date(fromStr).setHours(0, 0, 0, 0));
  const to = new Date(new Date(toStr).setHours(23, 59, 59, 999));

  const bookings = await prisma.roomBooking.findMany({
    where: { startTime: { gte: from, lte: to }, ...(roomId ? { roomId } : {}) },
    include: {
      room: { select: { name: true } },
      requester: { select: { fullName: true, code: true, department: { select: { name: true } } } },
    },
    orderBy: { startTime: "asc" },
  });

  const rows = bookings.map((b) => {
    const s = new Date(b.startTime), e = new Date(b.endTime);
    return {
      date: vnDate(b.startTime),
      time: `${pad2(s.getHours())}:${pad2(s.getMinutes())}–${pad2(e.getHours())}:${pad2(e.getMinutes())}`,
      room: b.room.name,
      title: b.title,
      type: b.seriesId ? "Lịch cố định" : "Đơn lẻ",
      requester: b.requester.fullName,
      department: b.requester.department?.name || "",
      status: STATUS_LABEL[b.status] || b.status,
    };
  });

  let roomLabel = "Tất cả phòng";
  if (roomId) {
    const r = await prisma.meetingRoom.findUnique({ where: { id: roomId }, select: { name: true } });
    roomLabel = r?.name || roomId;
  }

  return NextResponse.json({ data: {
    title: `LỊCH SỬ ĐẶT PHÒNG (${roomLabel}) — ${vnDate(from)} – ${vnDate(to)}`,
    columns: [
      { header: "Ngày", key: "date", width: 14 },
      { header: "Giờ", key: "time", width: 14 },
      { header: "Phòng", key: "room", width: 20 },
      { header: "Tiêu đề", key: "title", width: 30 },
      { header: "Kiểu đặt", key: "type", width: 14 },
      { header: "Người đặt", key: "requester", width: 22 },
      { header: "Phòng ban", key: "department", width: 22 },
      { header: "Trạng thái", key: "status", width: 12 },
    ],
    rows,
  } });
}
