import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { isInPast } from "@/lib/validation";

const CreateOTSchema = z.object({
  date: z.string().transform((s) => new Date(s)),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, "Giờ bắt đầu không hợp lệ (HH:mm)"),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, "Giờ kết thúc không hợp lệ (HH:mm)"),
  reason: z.string().min(5, "Lý do phải ít nhất 5 ký tự"),
  otRate: z.number().optional(),
});

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }

  const userRole = (session.user as any).role;
  const userId = (session.user as any).id;
  const { searchParams } = new URL(request.url);
  const statusFilter = searchParams.get("status") || "";

  const where: Record<string, unknown> = {};

  if (userRole === "EMPLOYEE" || userRole === "TEAM_LEAD") {
    const emp = await prisma.employee.findFirst({ where: { userId } });
    if (emp) where.employeeId = emp.id;
  } else if (userRole === "MANAGER") {
    const emp = await prisma.employee.findFirst({ where: { userId } });
    if (emp) where.employee = { departmentId: emp.departmentId };
  }

  if (statusFilter) where.status = statusFilter;

  const data = await prisma.oTRequest.findMany({
    where,
    include: { employee: { include: { department: true } } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json({ data });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }

  const userId = (session.user as any).id;
  const body = await request.json();
  const parsed = CreateOTSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", details: parsed.error.issues } },
      { status: 400 }
    );
  }

  const { date, startTime, endTime, reason, otRate } = parsed.data;

  if (timeToMinutes(endTime) <= timeToMinutes(startTime)) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Giờ kết thúc phải sau giờ bắt đầu" } },
      { status: 400 }
    );
  }

  // Allow OT submission up to 3 days in the past (grace period for missed submissions)
  const threeDaysAgo = new Date();
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
  threeDaysAgo.setHours(0, 0, 0, 0);
  if (date < threeDaysAgo) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Chỉ được kê khai OT trong vòng 3 ngày trước" } },
      { status: 400 }
    );
  }

  const employee = await prisma.employee.findFirst({ where: { userId }, include: { department: true } });
  if (!employee) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "Không tìm thấy nhân viên" } }, { status: 404 });
  }

  // Duplicate OT check — same employee, same date, overlapping time
  const existingOT = await prisma.oTRequest.findFirst({
    where: {
      employeeId: employee.id,
      date,
      status: { not: "REJECTED" },
    },
  });
  if (existingOT) {
    return NextResponse.json(
      { error: { code: "DUPLICATE", message: `Đã có đơn OT cho ngày ${date.toLocaleDateString("vi-VN")} chưa bị từ chối` } },
      { status: 409 }
    );
  }

  const hours = (timeToMinutes(endTime) - timeToMinutes(startTime)) / 60;

  // Determine OT rate: weekend = 2.0, normal = 1.5
  const dayOfWeek = date.getDay();
  const rate = otRate || (dayOfWeek === 0 || dayOfWeek === 6 ? 2.0 : 1.5);

  const otRequest = await prisma.oTRequest.create({
    data: {
      employeeId: employee.id,
      date,
      startTime,
      endTime,
      hours,
      reason,
      otRate: rate,
      status: "PENDING",
    },
    include: { employee: { include: { department: true } } },
  });

  // Notify manager
  const manager = await prisma.employee.findFirst({
    where: { departmentId: employee.departmentId, position: { level: "MANAGER" } },
    include: { user: true },
  });
  if (manager?.user) {
    await prisma.notification.create({
      data: {
        userId: manager.user.id,
        title: "Đề xuất OT chờ duyệt",
        message: `${employee.fullName} đề xuất OT ${hours.toFixed(1)} giờ ngày ${date.toLocaleDateString("vi-VN")}`,
        type: "APPROVAL_REQUIRED",
        referenceType: "ot_request",
        referenceId: otRequest.id,
      },
    });
  }

  return NextResponse.json({ data: otRequest }, { status: 201 });
}
