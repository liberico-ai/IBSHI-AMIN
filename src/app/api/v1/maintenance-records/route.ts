import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const records = await prisma.maintenanceRecord.findMany({
    include: { vehicle: { select: { licensePlate: true, model: true } } },
    orderBy: { startDate: "desc" },
  });

  return NextResponse.json({ data: records });
}
