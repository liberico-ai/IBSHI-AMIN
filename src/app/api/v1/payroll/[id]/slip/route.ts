import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

// GET /api/v1/payroll/:periodId/slip  — returns the current user's slip for this period
// HR_ADMIN can pass ?employeeId=xxx to see any employee's slip
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const { id: periodId } = await params;
  const userRole = (session.user as any).role;
  const userId = (session.user as any).id;

  const { searchParams } = new URL(request.url);
  const requestedEmployeeId = searchParams.get("employeeId");

  // Determine which employee's slip to show
  let employeeId: string | undefined;
  const isHR = ["HR_ADMIN", "BOM"].includes(userRole);

  if (requestedEmployeeId && isHR) {
    employeeId = requestedEmployeeId;
  } else {
    // Find the current user's employee record
    const myEmployee = await prisma.employee.findFirst({
      where: { userId },
      select: { id: true },
    });
    if (!myEmployee) {
      return NextResponse.json({ error: { code: "NOT_FOUND", message: "Không tìm thấy hồ sơ nhân viên" } }, { status: 404 });
    }
    employeeId = myEmployee.id;
  }

  const record = await prisma.payrollRecord.findFirst({
    where: { periodId, employeeId },
    include: {
      period: { select: { month: true, year: true, status: true } },
      employee: {
        select: {
          code: true,
          fullName: true,
          bankAccount: true,
          bankName: true,
          taxCode: true,
          department: { select: { name: true } },
          position: { select: { name: true } },
        },
      },
    },
  });

  if (!record) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "Không tìm thấy slip lương" } }, { status: 404 });
  }

  return NextResponse.json({ data: record });
}
