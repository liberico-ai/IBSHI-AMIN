import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canDo } from "@/lib/permissions";
import { z } from "zod";

const ZoneSchema = z.object({
  name: z.string().min(2),
  location: z.string().optional().nullable(),
  frequency: z.string().optional(),
  assignedTo: z.string().uuid().optional().nullable(),
});

const ScheduleSchema = z.object({
  zoneId: z.string().uuid(),
  scheduledDate: z.string(),
  notes: z.string().optional().nullable(),
});

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") || "zones";

  if (type === "schedules") {
    const date = searchParams.get("date") || "";
    const where: any = {};
    if (date) {
      const d = new Date(date);
      where.scheduledDate = { gte: new Date(d.setHours(0,0,0,0)), lte: new Date(d.setHours(23,59,59,999)) };
    }
    const data = await prisma.cleaningSchedule.findMany({
      where,
      include: { zone: true },
      orderBy: { scheduledDate: "asc" },
    });
    return NextResponse.json({ data });
  }

  const data = await prisma.cleaningZone.findMany({
    where: { isActive: true },
    include: {
      schedules: {
        orderBy: { scheduledDate: "desc" },
        take: 5,
      },
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({ data });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const userRole = (session.user as any).role;
  if (!canDo(userRole, "cleaning", "manage")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const body = await request.json();

  if (body.scheduledDate) {
    // Create schedule
    const parsed = ScheduleSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: { code: "VALIDATION_ERROR", issues: parsed.error.issues } }, { status: 422 });
    const schedule = await prisma.cleaningSchedule.create({
      data: { ...parsed.data, scheduledDate: new Date(parsed.data.scheduledDate) },
      include: { zone: true },
    });
    return NextResponse.json({ data: schedule }, { status: 201 });
  }

  // Create zone
  const parsed = ZoneSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: { code: "VALIDATION_ERROR", issues: parsed.error.issues } }, { status: 422 });
  const zone = await prisma.cleaningZone.create({ data: parsed.data });
  return NextResponse.json({ data: zone }, { status: 201 });
}
