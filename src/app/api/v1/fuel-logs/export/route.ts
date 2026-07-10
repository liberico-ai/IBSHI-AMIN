import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canUser } from "@/lib/permission-catalog";
import { canDo } from "@/lib/permissions";

const vnDate = (d: Date | string) => new Date(d).toISOString().slice(0, 10).split("-").reverse().join("/");

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const userRole = (session.user as { role: string }).role;
  if (!canUser(session.user as any, "m10.xe.nhienlieu:view")) return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const vehicleId = searchParams.get("vehicleId") || "";
  const from = searchParams.get("from") || "";
  const to = searchParams.get("to") || "";

  const where: any = {};
  if (vehicleId) where.vehicleId = vehicleId;
  if (from || to) {
    where.date = {
      ...(from && { gte: new Date(new Date(from).setHours(0, 0, 0, 0)) }),
      ...(to && { lte: new Date(new Date(to).setHours(23, 59, 59, 999)) }),
    };
  }

  const logs = await prisma.fuelLog.findMany({
    where,
    include: { vehicle: { select: { licensePlate: true } } },
    orderBy: { date: "asc" },
  });

  const rows = logs.map((l) => ({
    date: vnDate(l.date),
    vehicle: l.vehicle.licensePlate,
    liters: l.liters,
    cost: l.cost,
    odometerKm: l.odometerKm,
    note: l.note || "",
  }));

  let vehicleLabel = "Tất cả xe";
  if (vehicleId) {
    const v = await prisma.vehicle.findUnique({ where: { id: vehicleId }, select: { licensePlate: true } });
    vehicleLabel = v?.licensePlate || vehicleId;
  }
  const range = from || to ? ` — ${from ? vnDate(from) : "…"} – ${to ? vnDate(to) : "…"}` : "";

  return NextResponse.json({ data: {
    title: `LỊCH SỬ NHIÊN LIỆU (${vehicleLabel})${range}`,
    columns: [
      { header: "Ngày", key: "date", width: 14 },
      { header: "Xe", key: "vehicle", width: 16 },
      { header: "Số lít", key: "liters", width: 12 },
      { header: "Chi phí (đ)", key: "cost", width: 16 },
      { header: "Số km (ODO)", key: "odometerKm", width: 14 },
      { header: "Ghi chú", key: "note", width: 30 },
    ],
    rows,
  } });
}
