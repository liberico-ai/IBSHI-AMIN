import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";

const VehiclePurposeEnum = z.enum(["DELIVERY", "CLIENT_PICKUP", "BUSINESS_TRIP", "PROCUREMENT", "OTHER"]);

const CreateSchema = z.object({
  vehicleId: z.string().uuid(),
  startDate: z.string(),
  endDate: z.string(),
  destination: z.string().min(2),
  purpose: VehiclePurposeEnum,
  passengers: z.number().int().min(1).default(1),
  notes: z.string().optional().nullable(),
});

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") || "";
  const vehicleId = searchParams.get("vehicleId") || "";

  const where: any = {};
  if (status) where.status = status;
  if (vehicleId) where.vehicleId = vehicleId;

  const data = await prisma.vehicleBooking.findMany({
    where,
    include: {
      vehicle: { select: { id: true, licensePlate: true, model: true, type: true } },
      requester: { select: { id: true, code: true, fullName: true, department: { select: { name: true } } } },
    },
    orderBy: { startDate: "desc" },
  });

  return NextResponse.json({ data });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const body = await request.json();
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", issues: parsed.error.issues } }, { status: 422 });
  }

  const emp = await prisma.employee.findFirst({ where: { userId: (session.user as any).id } });
  if (!emp) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });

  const startDate = new Date(parsed.data.startDate);
  const endDate = new Date(parsed.data.endDate);

  // Check vehicle availability
  const conflict = await prisma.vehicleBooking.findFirst({
    where: {
      vehicleId: parsed.data.vehicleId,
      status: { in: ["APPROVED", "PENDING"] },
      AND: [{ startDate: { lte: endDate } }, { endDate: { gte: startDate } }],
    },
  });
  if (conflict) {
    return NextResponse.json({ error: { code: "CONFLICT", message: "Xe đã được đặt trong khoảng thời gian này" } }, { status: 409 });
  }

  const booking = await prisma.vehicleBooking.create({
    data: { ...parsed.data, startDate, endDate, requestedBy: emp.id, status: "PENDING" },
    include: { vehicle: true, requester: { select: { id: true, fullName: true } } },
  });

  // Notify HR_ADMIN
  const admins = await prisma.user.findMany({ where: { role: { in: ["HR_ADMIN"] }, isActive: true } });
  await Promise.all(admins.map((u) =>
    prisma.notification.create({
      data: {
        userId: u.id,
        title: "Yêu cầu đặt xe",
        message: `${emp.fullName} đặt xe đến ${parsed.data.destination} (${parsed.data.startDate} → ${parsed.data.endDate})`,
        type: "APPROVAL_REQUIRED",
        referenceType: "vehicle_booking",
        referenceId: booking.id,
      },
    })
  ));

  return NextResponse.json({ data: booking }, { status: 201 });
}
