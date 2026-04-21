import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canDo } from "@/lib/permissions";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const userRole = (session.user as { role: string }).role;
  if (!canDo(userRole, "vehicleBookings", "readAll")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const logs = await prisma.fuelLog.findMany({
    include: { vehicle: { select: { licensePlate: true, model: true } } },
    orderBy: { date: "desc" },
  });

  return NextResponse.json({ data: logs });
}
