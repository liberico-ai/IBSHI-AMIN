import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canDo } from "@/lib/permissions";
import { z } from "zod";

const MaintenanceSchema = z.object({
  type: z.string().min(1),
  description: z.string().min(1),
  cost: z.number().int().min(0),
  startDate: z.string(),
  endDate: z.string().optional().nullable(),
});

// GET /api/v1/vehicles/:id/maintenance
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const { id: vehicleId } = await params;

  const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId }, select: { id: true } });
  if (!vehicle) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });

  const records = await prisma.maintenanceRecord.findMany({
    where: { vehicleId },
    orderBy: { startDate: "desc" },
  });

  const totalCost = records.reduce((s, r) => s + r.cost, 0);
  return NextResponse.json({ data: records, meta: { totalCost, count: records.length } });
}

// POST /api/v1/vehicles/:id/maintenance
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const userRole = (session.user as any).role;
  if (!canDo(userRole, "vehicleBookings", "approve2")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const { id: vehicleId } = await params;

  const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId } });
  if (!vehicle) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });

  const body = await request.json();
  const parsed = MaintenanceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", issues: parsed.error.issues } }, { status: 422 });
  }

  const record = await prisma.maintenanceRecord.create({
    data: {
      vehicleId,
      type: parsed.data.type,
      description: parsed.data.description,
      cost: parsed.data.cost,
      startDate: new Date(parsed.data.startDate),
      endDate: parsed.data.endDate ? new Date(parsed.data.endDate) : null,
    },
  });

  return NextResponse.json({ data: record }, { status: 201 });
}
