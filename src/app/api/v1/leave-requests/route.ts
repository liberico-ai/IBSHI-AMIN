import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { leaveRequiresProof, proofDeadlineFrom } from "@/lib/leave-proof";

const CreateLeaveSchema = z.object({
  leaveType: z.enum(["ANNUAL", "SICK", "PERSONAL", "WEDDING", "FUNERAL", "MATERNITY", "PATERNITY", "UNPAID", "WORK_ACCIDENT", "STUDY"]),
  startDate: z.string().transform((s) => new Date(s)),
  endDate: z.string().transform((s) => new Date(s)),
  reason: z.string().min(5, "Lý do phải ít nhất 5 ký tự"),
  proofUrls: z.array(z.string()).optional(),
  halfDay: z.boolean().optional(),   // Nghỉ NỬA NGÀY (0,5 công) — chỉ áp dụng cho 1 ngày.
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

  const { leaveType, startDate, endDate, reason, proofUrls, halfDay } = parsed.data;

  if (halfDay && startDate.getTime() !== endDate.getTime()) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Nghỉ nửa ngày chỉ áp dụng cho 1 ngày (ngày bắt đầu = ngày kết thúc)" } },
      { status: 422 }
    );
  }

  if (endDate < startDate) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Ngày kết thúc phải sau ngày bắt đầu" } },
      { status: 400 }
    );
  }

  // Cho phép tạo đơn cho ngày trong QUÁ KHỨ, nhưng tối đa tới hết MÙNG 10 của tháng SAU
  // tháng nghỉ (theo ngày bắt đầu). VD nghỉ trong tháng 6 → tạo đơn được đến hết 10/7.
  // Áp dụng cho MỌI loại nghỉ.
  const dl = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth() + 1, 10)); // mùng 10 tháng sau
  const nowVN = new Date(Date.now() + 7 * 3600 * 1000);
  const todayNum = nowVN.getUTCFullYear() * 10000 + (nowVN.getUTCMonth() + 1) * 100 + nowVN.getUTCDate();
  const dlNum = dl.getUTCFullYear() * 10000 + (dl.getUTCMonth() + 1) * 100 + dl.getUTCDate();
  if (todayNum > dlNum) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: `Quá hạn tạo đơn cho ngày nghỉ này. Chỉ được tạo đơn đến hết mùng 10 tháng sau (hạn: ${dl.getUTCDate()}/${dl.getUTCMonth() + 1}/${dl.getUTCFullYear()}).` } },
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

  // Tính số ngày nghỉ: tính cả 2 đầu mút (30/5→30/5 = 1 ngày, 30/5→31/5 = 2 ngày),
  // chỉ KHÔNG tính Chủ Nhật (IBS làm việc cả Thứ 7).
  let totalDays = 0;
  if (halfDay) {
    totalDays = 0.5; // nghỉ nửa ngày = 0,5 công (1 ngày duy nhất)
  } else {
    const cur = new Date(startDate);
    while (cur <= endDate) {
      if (cur.getDay() !== 0) totalDays += 1; // 0 = Chủ Nhật
      cur.setDate(cur.getDate() + 1);
    }
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

  // Phép năm cộng dồn theo tháng: đến tháng N chỉ được nghỉ tối đa số ngày đã tích luỹ.
  //   accrued = (quota/12) × tháng hiện tại  (vd quota 12 → tháng 6 = 6 ngày).
  if (leaveType === "ANNUAL") {
    // NV thử việc chưa có phép năm
    if (employee.status === "PROBATION") {
      return NextResponse.json(
        { error: { code: "PROBATION_NO_LEAVE", message: "Nhân viên thử việc chưa có phép năm." } },
        { status: 400 }
      );
    }
    const year = new Date().getFullYear();
    const month = new Date().getMonth() + 1;
    const balance = await prisma.leaveBalance.findFirst({ where: { employeeId: employee.id, year } });
    const quota = balance?.totalDays ?? 12;
    const accrued = Math.floor((quota / 12) * month);

    // Tổng ngày phép năm đã đăng ký trong năm (đang chờ duyệt + đã duyệt) — không tính đơn bị từ chối.
    const booked = await prisma.leaveRequest.aggregate({
      where: {
        employeeId: employee.id,
        leaveType: "ANNUAL",
        status: { in: ["PENDING", "APPROVED"] },
        startDate: { gte: new Date(year, 0, 1), lte: new Date(year, 11, 31, 23, 59, 59) },
      },
      _sum: { totalDays: true },
    });
    const used = booked._sum.totalDays ?? 0;

    if (used + totalDays > accrued) {
      const remain = Math.max(0, accrued - used);
      return NextResponse.json(
        {
          error: {
            code: "LEAVE_ACCRUAL_EXCEEDED",
            message: `Số ngày quá quy định. Bạn chỉ được phép nghỉ phép tối đa ${remain} ngày.`,
          },
        },
        { status: 400 }
      );
    }
  }

  // Loại nghỉ cần giấy tờ chứng minh → đặt hạn bổ sung (ngày nghỉ cuối + 7 ngày).
  const needsProof = leaveRequiresProof(leaveType);
  const submittedProof = (proofUrls?.length ?? 0) > 0;

  const leaveRequest = await prisma.leaveRequest.create({
    data: {
      employeeId: employee.id,
      leaveType,
      startDate,
      endDate,
      totalDays,
      reason,
      status: "PENDING",
      proofUrls: proofUrls ?? [],
      proofDeadline: needsProof ? proofDeadlineFrom(endDate) : null,
      proofSubmittedAt: needsProof && submittedProof ? new Date() : null,
    },
    include: { employee: { include: { department: true } } },
  });

  // Nhắc bổ sung giấy tờ qua chuông cho chính NV nghỉ (nếu chưa nộp).
  if (needsProof && !submittedProof && employee.userId) {
    const hanStr = proofDeadlineFrom(endDate).toLocaleDateString("vi-VN");
    await prisma.notification.create({
      data: {
        userId: employee.userId,
        title: "Cần bổ sung giấy tờ chứng minh nghỉ",
        message: `Đơn nghỉ (${new Date(startDate).toLocaleDateString("vi-VN")} - ${new Date(endDate).toLocaleDateString("vi-VN")}) cần bổ sung giấy tờ chứng minh trước ${hanStr} (7 ngày kể từ ngày nghỉ cuối).`,
        type: "EXPIRY_WARNING",
        referenceType: "leave_request",
        referenceId: leaveRequest.id,
      },
    });
  }

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
