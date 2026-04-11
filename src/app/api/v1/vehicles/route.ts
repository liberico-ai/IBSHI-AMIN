import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canDo } from "@/lib/permissions";
import { z } from "zod";

const CreateSchema = z.object({
  licensePlate: z.string().min(5),
  model: z.string().min(2),
  type: z.enum(["CAR", "VAN", "TRUCK", "MOTORBIKE"]),
  seats: z.number().int().min(1).default(5),
  driverName: z.string().optional().nullable(),
  nextMaintenanceDate: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") || "";

  const where: any = { isActive: true };
  if (status) where.status = status;

  const data = await prisma.vehicle.findMany({ where, orderBy: { licensePlate: "asc" } });
  return NextResponse.json({ data });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const userRole = (session.user as any).role;
  if (!canDo(userRole, "vehicleBookings", "approve2")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const body = await request.json();
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", issues: parsed.error.issues } }, { status: 422 });
  }

  const existing = await prisma.vehicle.findUnique({ where: { licensePlate: parsed.data.licensePlate } });
  if (existing) return NextResponse.json({ error: { code: "DUPLICATE", message: "Biển số đã tồn tại" } }, { status: 409 });

  const vehicle = await prisma.vehicle.create({
    data: {
      ...parsed.data,
      nextMaintenanceDate: parsed.data.nextMaintenanceDate ? new Date(parsed.data.nextMaintenanceDate) : null,
    },
  });
  return NextResponse.json({ data: vehicle }, { status: 201 });
}
