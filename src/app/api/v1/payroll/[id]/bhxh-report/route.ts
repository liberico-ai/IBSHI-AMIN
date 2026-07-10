import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canUser } from "@/lib/permission-catalog";
import { canViewPayroll } from "@/lib/access";
import { computeBhxh } from "@/lib/constants";

// GET — Dữ liệu bảng BHXH của kỳ lương (để client dựng Excel giống mẫu).
//   Chỉ liệt kê NV ĐÓNG BHXH kỳ đó (bhxh > 0). Mức cũ/mới = so Lương đóng BHXH với kỳ liền trước.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (!canUser(session.user as any, "m7.luong:view")) {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Bạn không có quyền truy cập mục Lương" } }, { status: 403 });
  }

  const { id } = await params;
  const period = await prisma.payrollPeriod.findUnique({ where: { id }, select: { month: true, year: true } });
  if (!period) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Không tìm thấy kỳ lương" } }, { status: 404 });

  // Kỳ liền trước → so Lương đóng BHXH (mức cũ/mới khi tăng lương).
  const prevMonth = period.month === 1 ? 12 : period.month - 1;
  const prevYear = period.month === 1 ? period.year - 1 : period.year;
  const prevPeriod = await prisma.payrollPeriod.findFirst({ where: { month: prevMonth, year: prevYear }, select: { id: true } });
  const prevMap: Record<string, number> = {};
  if (prevPeriod) {
    const prev = await prisma.payrollRecord.findMany({ where: { periodId: prevPeriod.id }, select: { employeeId: true, detail: true } });
    for (const p of prev) prevMap[p.employeeId] = ((p.detail as any)?.insuranceSalary as number) || 0;
  }

  const records = await prisma.payrollRecord.findMany({
    where: { periodId: id },
    select: {
      employeeId: true, bhxh: true, detail: true,
      employee: { select: { code: true, fullName: true, insuranceNumber: true, team: { select: { name: true } }, department: { select: { name: true } } } },
    },
    orderBy: { employee: { code: "asc" } },
  });

  const rows = records
    .filter((r) => (r.bhxh || 0) > 0) // chỉ NV ĐÓNG BHXH
    .map((r) => {
      const ins = ((r.detail as any)?.insuranceSalary as number) || 0;
      const bh = computeBhxh(ins);
      const prevIns = prevMap[r.employeeId] || 0;
      const changed = prevIns > 0 && prevIns !== ins;
      return {
        code: r.employee.code,
        fullName: r.employee.fullName,
        insuranceNumber: r.employee.insuranceNumber || "",
        department: r.employee.department?.name || "",
        phanLoai: r.employee.team ? "Trực tiếp" : "Quản lý chung",
        mucCu: changed ? prevIns : null,
        mucMoi: changed ? ins : null,
        mucHienTai: ins,
        bhxh8: bh.bhxh8, bhyt15: bh.bhyt15, bhtn1: bh.bhtn1, congNLD: bh.employee,
        empSocial: bh.empSocial, empHealth: bh.empHealth, empUnemp: bh.empUnemp, congCty: bh.employer,
        tong: bh.total,
      };
    });

  return NextResponse.json({ data: rows, month: period.month, year: period.year });
}
