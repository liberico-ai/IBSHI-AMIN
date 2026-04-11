import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canDo } from "@/lib/permissions";

// GET /api/v1/salary/slips
// HR_ADMIN/BOM: all records (filterable by month, year, employeeId)
// Others: own records only
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const userRole = (session.user as any).role;
  const userId = (session.user as any).id;
  const isHR = canDo(userRole, "payroll", "readAll");

  const { searchParams } = new URL(request.url);
  const month = searchParams.get("month") ? Number(searchParams.get("month")) : undefined;
  const year = searchParams.get("year") ? Number(searchParams.get("year")) : undefined;
  const employeeIdParam = searchParams.get("employeeId");

  const where: any = {};

  if (isHR && employeeIdParam) {
    where.employeeId = employeeIdParam;
  } else if (!isHR) {
    const myEmployee = await prisma.employee.findFirst({ where: { userId }, select: { id: true } });
    if (!myEmployee) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
    where.employeeId = myEmployee.id;
  }

  if (month || year) {
    where.period = {};
    if (month) where.period.month = month;
    if (year) where.period.year = year;
  }

  const data = await prisma.payrollRecord.findMany({
    where,
    include: {
      period: { select: { id: true, month: true, year: true, status: true } },
      employee: {
        select: {
          id: true, code: true, fullName: true,
          department: { select: { name: true } },
          position: { select: { name: true } },
        },
      },
    },
    orderBy: [{ period: { year: "desc" } }, { period: { month: "desc" } }],
  });

  return NextResponse.json({ data, meta: { total: data.length } });
}
