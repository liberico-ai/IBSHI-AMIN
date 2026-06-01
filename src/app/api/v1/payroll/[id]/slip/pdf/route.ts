import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canViewPayroll } from "@/lib/access";
import { renderPayslipPdf } from "@/lib/payslip-pdf";

// GET /api/v1/payroll/:periodId/slip/pdf
// Trả PDF phiếu lương chi tiết. HR_ADMIN/BOM truyền ?employeeId=xxx; còn lại lấy NV của chính mình.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (!canViewPayroll((session.user as any).employeeCode)) {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Bạn không có quyền truy cập mục Lương" } }, { status: 403 });
  }

  const { id: periodId } = await params;
  const userRole = (session.user as any).role;
  const userId = (session.user as any).id;

  const { searchParams } = new URL(request.url);
  const requestedEmployeeId = searchParams.get("employeeId");
  const isHR = ["HR_ADMIN", "BOM"].includes(userRole);

  let employeeId: string | undefined;
  if (requestedEmployeeId && isHR) {
    employeeId = requestedEmployeeId;
  } else {
    const myEmp = await prisma.employee.findFirst({ where: { userId }, select: { id: true } });
    if (!myEmp) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
    employeeId = myEmp.id;
  }

  const record = await prisma.payrollRecord.findFirst({
    where: { periodId, employeeId },
    include: {
      period: { select: { month: true, year: true } },
      employee: {
        select: {
          code: true, fullName: true, bankAccount: true, bankName: true, taxCode: true,
          jobRole: true,
          department: { select: { name: true } },
          position: { select: { name: true } },
        },
      },
    },
  });

  if (!record) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  if (!record.detail) {
    return NextResponse.json(
      { error: { code: "NO_DETAIL", message: "Phiếu lương chưa có dữ liệu chi tiết. Vui lòng chạy lại Tính lương cho kỳ này." } },
      { status: 409 }
    );
  }

  const { employee: emp, period } = record;
  const pdf = await renderPayslipPdf({
    month: period.month,
    year: period.year,
    employee: {
      code: emp.code,
      fullName: emp.fullName,
      departmentName: emp.department?.name,
      jobTitle: (emp as any).jobRole || emp.position?.name,
      taxCode: emp.taxCode,
      bankName: emp.bankName,
      bankAccount: emp.bankAccount,
    },
    detail: record.detail,
  });

  const filename = `phieu-luong-T${period.month}-${period.year}-${emp.code ?? emp.fullName.replace(/\s+/g, "-")}.pdf`;
  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
