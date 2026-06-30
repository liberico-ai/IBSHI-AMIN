import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";

const Schema = z
  .object({ odoStart: z.number().int().min(0), odoEnd: z.number().int().min(0) })
  .refine((d) => d.odoEnd > d.odoStart, { message: "Odo lúc về phải lớn hơn odo lúc đi", path: ["odoEnd"] });

// POST — LÁI XE được chỉ định tự XÁC NHẬN HOÀN THÀNH chuyến + nhập odo đi/về.
//   Quyền: chỉ NV có họ tên === booking.driverName. Mỗi phiếu (kể cả từng buổi của lịch cố định) xác nhận độc lập.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const userId = (session.user as any).id;
  const emp = await prisma.employee.findFirst({ where: { userId }, select: { fullName: true } });
  const driverName = emp?.fullName;

  const { id } = await params;
  const booking = await prisma.vehicleBooking.findUnique({
    where: { id },
    include: { vehicle: { select: { id: true, currentMileage: true } } },
  });
  if (!booking) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });

  if (!driverName || booking.driverName !== driverName) {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Chỉ lái xe được chỉ định mới xác nhận được chuyến này" } }, { status: 403 });
  }
  if (booking.status !== "APPROVED" || booking.completedAt) {
    return NextResponse.json({ error: { code: "CONFLICT", message: "Chuyến chưa được duyệt hoặc đã hoàn thành" } }, { status: 409 });
  }

  const body = await request.json();
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message, issues: parsed.error.issues } }, { status: 422 });
  }
  const { odoStart, odoEnd } = parsed.data;

  await prisma.$transaction([
    prisma.vehicleBooking.update({
      where: { id },
      data: { status: "COMPLETED", odoStart, odoEnd, actualKm: odoEnd - odoStart, completedAt: new Date() },
    }),
    prisma.vehicle.update({ where: { id: booking.vehicle.id }, data: { currentMileage: odoEnd } }),
  ]);

  const warning =
    odoStart < booking.vehicle.currentMileage
      ? `Odo lúc đi (${odoStart.toLocaleString("vi-VN")}) nhỏ hơn số km hiện tại của xe (${booking.vehicle.currentMileage.toLocaleString("vi-VN")}). Đã lưu nhưng vui lòng kiểm tra lại.`
      : null;

  return NextResponse.json({ data: { id, odoStart, odoEnd, actualKm: odoEnd - odoStart }, warning });
}
