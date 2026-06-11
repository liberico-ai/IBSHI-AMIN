import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canDo } from "@/lib/permissions";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const userRole = (session.user as { role: string }).role;
  if (!canDo(userRole, "vehicleBookings", "readAll")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

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
    include: { vehicle: { select: { licensePlate: true, model: true } } },
    orderBy: { date: "desc" },
  });

  const totalLiters = logs.reduce((s, l) => s + l.liters, 0);
  const totalCost = logs.reduce((s, l) => s + l.cost, 0);

  return NextResponse.json({ data: logs, meta: { totalLiters, totalCost, count: logs.length } });
}
