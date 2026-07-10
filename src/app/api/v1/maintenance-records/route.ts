import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canDo } from "@/lib/permissions";
import { canUser } from "@/lib/permission-catalog";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  if (!canUser(session.user as any, "m10.xe.baotri:view")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const vehicleId = searchParams.get("vehicleId") || "";
  const from = searchParams.get("from") || "";
  const to = searchParams.get("to") || "";

  const where: any = {};
  if (vehicleId) where.vehicleId = vehicleId;
  if (from || to) {
    where.startDate = {
      ...(from && { gte: new Date(new Date(from).setHours(0, 0, 0, 0)) }),
      ...(to && { lte: new Date(new Date(to).setHours(23, 59, 59, 999)) }),
    };
  }

  const records = await prisma.maintenanceRecord.findMany({
    where,
    include: { vehicle: { select: { licensePlate: true, model: true } } },
    orderBy: { startDate: "desc" },
  });

  const totalCost = records.reduce((s, r) => s + r.cost, 0);

  return NextResponse.json({ data: records, meta: { totalCost, count: records.length } });
}
