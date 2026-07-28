import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canUser } from "@/lib/permission-catalog";
import { canActOnEmployeeScope } from "@/lib/data-scope.server";

// GET /api/v1/leave-requests/balance?employeeId=<id?>
//   Trả quỹ PHÉP NĂM (ANNUAL) còn lại của 1 NV để hiển thị trong form đặt đơn:
//     accrued = floor(quota/12 × tháng hiện tại)  (phép năm cộng dồn theo tháng)
//     used    = tổng ngày ANNUAL đã đăng ký năm nay (PENDING + APPROVED)
//     remain  = max(0, accrued − used)
//   Mặc định là chính mình; truyền employeeId (đăng ký HỘ) cần quyền m3.nghiphep:proxy + trong phạm vi.
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const userId = (session.user as any).id;
  const userRole = (session.user as any).role;
  const self = await prisma.employee.findFirst({ where: { userId }, select: { id: true } });

  const { searchParams } = new URL(request.url);
  const targetId = searchParams.get("employeeId") || "";

  let employeeId = self?.id || "";
  if (targetId && targetId !== self?.id) {
    // Xem quỹ phép của NGƯỜI KHÁC (đăng ký hộ) → cần quyền proxy + trong phạm vi được cấp.
    if (!canUser(session.user as any, "m3.nghiphep:proxy")) {
      return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
    }
    if (!(await canActOnEmployeeScope(userId, userRole, "m3.nghiphep", targetId))) {
      return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
    }
    employeeId = targetId;
  }

  if (!employeeId) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Không tìm thấy nhân viên" } }, { status: 404 });

  const emp = await prisma.employee.findUnique({ where: { id: employeeId }, select: { status: true } });
  // NV thử việc chưa có phép năm.
  if (emp?.status === "PROBATION") {
    return NextResponse.json({ data: { accrued: 0, used: 0, remain: 0, probation: true } });
  }

  const year = new Date().getFullYear();
  const month = new Date().getMonth() + 1;
  const balance = await prisma.leaveBalance.findFirst({ where: { employeeId, year } });
  const quota = balance?.totalDays ?? 12;
  const accrued = Math.floor((quota / 12) * month);

  const booked = await prisma.leaveRequest.aggregate({
    where: {
      employeeId,
      leaveType: "ANNUAL",
      status: { in: ["PENDING", "APPROVED"] },
      startDate: { gte: new Date(year, 0, 1), lte: new Date(year, 11, 31, 23, 59, 59) },
    },
    _sum: { totalDays: true },
  });
  const used = booked._sum.totalDays ?? 0;
  const remain = Math.max(0, accrued - used);

  return NextResponse.json({ data: { accrued, used, remain, quota, probation: false } });
}
