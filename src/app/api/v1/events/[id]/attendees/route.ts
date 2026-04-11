import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

// GET /api/v1/events/:id/attendees — list enrollments
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const { id } = await params;
  const event = await prisma.companyEvent.findUnique({ where: { id } });
  if (!event) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });

  const attendees = await prisma.eventAttendee.findMany({
    where: { eventId: id },
    include: {
      employee: {
        select: { id: true, code: true, fullName: true, department: { select: { name: true } } },
      },
    },
    orderBy: { enrolledAt: "asc" },
  });

  return NextResponse.json({ data: attendees });
}

// POST /api/v1/events/:id/attendees — enroll current user
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const { id } = await params;
  const event = await prisma.companyEvent.findUnique({ where: { id } });
  if (!event) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  if (event.status === "CANCELLED" || event.status === "COMPLETED") {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Không thể đăng ký sự kiện đã kết thúc hoặc bị hủy" } },
      { status: 409 }
    );
  }

  const userId = (session.user as any).id;
  const employee = await prisma.employee.findFirst({ where: { userId } });
  if (!employee) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "Không tìm thấy nhân viên" } }, { status: 404 });
  }

  const existing = await prisma.eventAttendee.findUnique({
    where: { eventId_employeeId: { eventId: id, employeeId: employee.id } },
  });
  if (existing) {
    return NextResponse.json(
      { error: { code: "DUPLICATE", message: "Bạn đã đăng ký sự kiện này rồi" } },
      { status: 409 }
    );
  }

  const enrollment = await prisma.eventAttendee.create({
    data: { eventId: id, employeeId: employee.id },
    include: {
      employee: {
        select: { id: true, code: true, fullName: true, department: { select: { name: true } } },
      },
    },
  });

  return NextResponse.json({ data: enrollment }, { status: 201 });
}
