import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canDo } from "@/lib/permissions";
import { z } from "zod";

const FuelSchema = z.object({
  date: z.string(),
  liters: z.number().positive(),
  cost: z.number().int().positive(),
  odometerKm: z.number().int().min(0),
  note: z.string().optional().nullable(),
});

// GET /api/v1/vehicles/:id/fuel
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const { id: vehicleId } = await params;
  const logs = await prisma.fuelLog.findMany({
    where: { vehicleId },
    orderBy: { date: "desc" },
  });

  const totalLiters = logs.reduce((s, l) => s + l.liters, 0);
  const totalCost = logs.reduce((s, l) => s + l.cost, 0);

  return NextResponse.json({ data: logs, meta: { totalLiters, totalCost } });
}

// POST /api/v1/vehicles/:id/fuel
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
  const parsed = FuelSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", issues: parsed.error.issues } }, { status: 422 });
  }

  const log = await prisma.fuelLog.create({
    data: {
      vehicleId,
      date: new Date(parsed.data.date),
      liters: parsed.data.liters,
      cost: parsed.data.cost,
      odometerKm: parsed.data.odometerKm,
      note: parsed.data.note ?? null,
    },
  });

  return NextResponse.json({ data: log }, { status: 201 });
}
