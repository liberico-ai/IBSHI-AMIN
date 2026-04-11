import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { isInPast } from "@/lib/validation";

const CreateLeaveSchema = z.object({
  leaveType: z.enum(["ANNUAL", "SICK", "PERSONAL", "WEDDING", "FUNERAL", "MATERNITY", "PATERNITY", "UNPAID"]),
  startDate: z.string().transform((s) => new Date(s)),
  endDate: z.string().transform((s) => new Date(s)),
  reason: z.string().min(5, "Lý do phải ít nhất 5 ký tự"),
});

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const statusFilter = searchParams.get("status") || "";
  const userRole = (session.user as any).role;
  const userId = (session.user as any).id;

  const where: Record<string, unknown> = {};

  if (userRole === "EMPLOYEE" || userRole === "TEAM_LEAD") {
    const emp = await prisma.employee.findFirst({ where: { userId } });
    if (emp) where.employeeId = emp.id;
  } else if (userRole === "MANAGER") {
    const emp = await prisma.employee.findFirst({ where: { userId } });
    if (emp) {
      where.employee = { departmentId: emp.departmentId };
    }
  }

  if (statusFilter) where.status = statusFilter;

  const data = await prisma.leaveRequest.findMany({
    where,
    include: {
      employee: { include: { department: true } },
    },
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

  const body = await request.json();
  const parsed = CreateLeaveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Dữ liệu không hợp lệ", details: parsed.error.issues } },
      { status: 400 }
    );
  }

  const { leaveType, startDate, endDate, reason } = parsed.data;

  if (endDate < startDate) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Ngày kết thúc phải sau ngày bắt đầu" } },
      { status: 400 }
    );
  }

  if (isInPast(startDate)) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Ngày bắt đầu không được là ngày trong quá khứ" } },
      { status: 400 }
    );
  }

  const userId = (session.user as any).id;
  const employee = await prisma.employee.findFirst({
    where: { userId },
    include: { department: true },
  });

  if (!employee) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "Không tìm thấy nhân viên" } }, { status: 404 });
  }

  // Calculate total days (exclude weekends)
  let totalDays = 0;
  const cur = new Date(startDate);
  while (cur <= endDate) {
    const day = cur.getDay();
    if (day !== 0 && day !== 6) totalDays += 1;
    cur.setDate(cur.getDate() + 1);
  }

  // Check overlapping approved leave requests
  const overlapping = await prisma.leaveRequest.findFirst({
    where: {
      employeeId: employee.id,
      status: "APPROVED",
      startDate: { lte: endDate },
      endDate: { gte: startDate },
    },
  });
  if (overlapping) {
    return NextResponse.json(
      {
        error: {
          code: "OVERLAP",
          message: `Bạn đã có đơn nghỉ phép được duyệt trùng ngày (${new Date(overlapping.startDate).toLocaleDateString("vi-VN")} - ${new Date(overlapping.endDate).toLocaleDateString("vi-VN")})`,
        },
      },
      { status: 409 }
    );
  }

  // Check annual leave balance
  if (leaveType === "ANNUAL") {
    const balance = await prisma.leaveBalance.findFirst({
      where: { employeeId: employee.id, year: new Date().getFullYear() },
    });
    if (balance && balance.remainingDays < totalDays) {
      return NextResponse.json(
        { error: { code: "INSUFFICIENT_LEAVE", message: `Không đủ phép năm. Còn ${balance.remainingDays} ngày.` } },
        { status: 400 }
      );
    }
  }

  const leaveRequest = await prisma.leaveRequest.create({
    data: {
      employeeId: employee.id,
      leaveType,
      startDate,
      endDate,
      totalDays,
      reason,
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
        title: "Đơn nghỉ phép chờ duyệt",
        message: `${employee.fullName} đã gửi đơn nghỉ ${totalDays} ngày (${startDate.toLocaleDateString("vi-VN")} - ${endDate.toLocaleDateString("vi-VN")})`,
        type: "APPROVAL_REQUIRED",
        referenceType: "leave_request",
        referenceId: leaveRequest.id,
      },
    });
  }

  return NextResponse.json({ data: leaveRequest }, { status: 201 });
}
