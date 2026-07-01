import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

// GET — các chuyến xe của LÁI XE đang đăng nhập (nhận diện qua họ tên NV === VehicleBooking.driverName).
//   pending  : đã duyệt, ngày đi ≤ hết hôm nay (giờ VN), chưa hoàn thành → cần xác nhận (gồm cả quá hạn).
//   completed: đã hoàn thành — kèm odo để xem lại (mới nhất trước, tối đa 50).
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const userId = (session.user as any).id;
  const emp = await prisma.employee.findFirst({ where: { userId }, select: { fullName: true } });
  const driverName = emp?.fullName;
  if (!driverName) return NextResponse.json({ data: { driverName: null, pending: [], completed: [] } });

  // Cuối ngày HÔM NAY theo giờ VN (server có thể chạy UTC) → mốc lọc chuyến "đến hạn".
  const todayVN = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }); // YYYY-MM-DD
  const endOfTodayVN = new Date(`${todayVN}T23:59:59.999+07:00`);

  const select = {
    id: true, startDate: true, endDate: true, origin: true, destination: true,
    purpose: true, passengers: true, status: true, driverName: true, priority: true,
    returnTime: true, odoStart: true, odoEnd: true, actualKm: true, completedAt: true, seriesId: true,
    vehicle: { select: { licensePlate: true, model: true, currentMileage: true } },
  } as const;

  const [pending, completed] = await Promise.all([
    prisma.vehicleBooking.findMany({
      where: { driverName, status: "APPROVED", completedAt: null, startDate: { lte: endOfTodayVN } },
      select, orderBy: { startDate: "asc" },
    }),
    prisma.vehicleBooking.findMany({
      where: { driverName, status: "COMPLETED" },
      select, orderBy: { completedAt: "desc" }, take: 50,
    }),
  ]);

  return NextResponse.json({ data: { driverName, pending, completed } });
}
