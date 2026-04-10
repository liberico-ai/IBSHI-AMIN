import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

// GET /api/v1/attendance/summary — per-department attendance summary for today
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const departments = await prisma.department.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
  });

  const data = await Promise.all(
    departments.map(async (dept) => {
      const total = await prisma.employee.count({ where: { departmentId: dept.id, status: "ACTIVE" } });
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

  const totalPresent = data.reduce((s, d) => s + d.present, 0);
  const totalEmployees = data.reduce((s, d) => s + d.total, 0);

  return NextResponse.json({
    data,
    meta: {
      date: today.toISOString().slice(0, 10),
      totalPresent,
      totalEmployees,
      overallRate: totalEmployees > 0 ? Math.round((totalPresent / totalEmployees) * 100) : 0,
    },
  });
}
