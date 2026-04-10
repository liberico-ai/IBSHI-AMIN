import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { checkPermission } from "@/lib/permissions";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const month = parseInt(searchParams.get("month") || String(new Date().getMonth() + 1));
  const year = parseInt(searchParams.get("year") || String(new Date().getFullYear()));
  const departmentId = searchParams.get("departmentId") || "";
  const employeeId = searchParams.get("employeeId") || "";
  const summary = searchParams.get("summary") === "true";

  const userRole = (session.user as any).role;
  const userId = (session.user as any).id;

  // Date range for the month
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59);

  if (summary) {
    // Return attendance summary per department for dashboard
    const departments = await prisma.department.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const results = await Promise.all(
      departments.map(async (dept) => {
        const total = await prisma.employee.count({
          where: { departmentId: dept.id, status: "ACTIVE" },
        });
        const present = await prisma.attendanceRecord.count({
          where: {
            employee: { departmentId: dept.id },
            date: { gte: today, lt: tomorrow },
            status: { in: ["PRESENT", "LATE", "HALF_DAY"] },
          },
        });
        return {
          departmentId: dept.id,
          departmentName: dept.name,
          present,
          total,
          rate: total > 0 ? Math.round((present / total) * 100) : 0,
          hasData: present > 0,
        };
      })
    );

    return NextResponse.json({ data: results });
  }

  // Full attendance records
  const where: Record<string, unknown> = {
    date: { gte: startDate, lte: endDate },
  };

  if (userRole === "EMPLOYEE" || userRole === "TEAM_LEAD") {
    const emp = await prisma.employee.findFirst({ where: { userId } });
    if (emp) where.employeeId = emp.id;
  } else if (userRole === "MANAGER") {
    const emp = await prisma.employee.findFirst({ where: { userId } });
    if (emp) {
      where.employee = { departmentId: emp.departmentId };
    }
  }

  if (departmentId && checkPermission(userRole, "MANAGER")) {
    where.employee = { departmentId };
  }
  if (employeeId) where.employeeId = employeeId;

  const records = await prisma.attendanceRecord.findMany({
    where,
    include: {
      employee: {
        include: { department: true },
      },
    },
    orderBy: [{ employee: { code: "asc" } }, { date: "asc" }],
  });

  return NextResponse.json({ data: records });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }
  const userRole = (session.user as any).role;
  if (!checkPermission(userRole, "HR_ADMIN")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const body = await request.json();
  const { records } = body;

  if (!Array.isArray(records)) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR" } }, { status: 400 });
  }

  const created = await Promise.all(
    records.map((r: { employeeId: string; date: string; status: string; checkIn?: string; checkOut?: string; otHours?: number; note?: string }) =>
      prisma.attendanceRecord.upsert({
        where: { employeeId_date: { employeeId: r.employeeId, date: new Date(r.date) } },
        create: {
          employeeId: r.employeeId,
          date: new Date(r.date),
          status: r.status as any,
          checkIn: r.checkIn ? new Date(r.checkIn) : null,
          checkOut: r.checkOut ? new Date(r.checkOut) : null,
          workHours: r.status === "PRESENT" ? 8 : r.status === "HALF_DAY" ? 4 : 0,
          otHours: r.otHours || 0,
          note: r.note,
          createdBy: (session.user as any).id,
        },
        update: {
          status: r.status as any,
          otHours: r.otHours || 0,
          note: r.note,
        },
      })
    )
  );

  return NextResponse.json({ data: created }, { status: 201 });
}
