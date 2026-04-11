import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canDo } from "@/lib/permissions";
import { rangesOverlap } from "@/lib/validation";
import { z } from "zod";

const CreateSchema = z.object({
  title: z.string().min(2),
  type: z.enum(["AUDIT_INTERNAL", "AUDIT_EXTERNAL", "MEETING", "TRAINING_EVENT", "CELEBRATION", "OTHER"]).default("OTHER"),
  startDate: z.string(),
  endDate: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  organizer: z.string().min(2),
  description: z.string().optional().nullable(),
  attendees: z.string().optional().nullable(),
});

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") || "";
  const status = searchParams.get("status") || "";

  const where: any = {};
  if (type) where.type = type;
  if (status) where.status = status;

  const data = await prisma.companyEvent.findMany({
    where,
    orderBy: { startDate: "desc" },
  });

  return NextResponse.json({ data });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const userRole = (session.user as any).role;
  if (!canDo(userRole, "events", "create")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const body = await request.json();
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", issues: parsed.error.issues } }, { status: 422 });
  }

  const startDate = new Date(parsed.data.startDate);
  const endDate = parsed.data.endDate ? new Date(parsed.data.endDate) : startDate;

  // Check for overlapping events at the same location
  if (parsed.data.location) {
    const existing = await prisma.companyEvent.findMany({
      where: {
        location: parsed.data.location,
        status: { notIn: ["CANCELLED"] },
        startDate: { lte: endDate },
      },
      select: { id: true, title: true, startDate: true, endDate: true },
    });
    const overlap = existing.find((e) =>
      rangesOverlap(startDate, endDate, e.startDate, e.endDate ?? e.startDate)
    );
    if (overlap) {
      return NextResponse.json({
        error: {
          code: "TIME_CONFLICT",
          message: `Địa điểm "${parsed.data.location}" đã có sự kiện "${overlap.title}" trong khung thời gian này`,
        },
      }, { status: 409 });
    }
  }

  const event = await prisma.companyEvent.create({
    data: {
      ...parsed.data,
      startDate,
      endDate: parsed.data.endDate ? endDate : null,
      status: "PLANNING",
    },
  });

  return NextResponse.json({ data: event }, { status: 201 });
}
