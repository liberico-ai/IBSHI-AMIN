import prisma from "@/lib/prisma";

export async function getAttendanceSummary(date?: Date) {
  const target = date ?? new Date();
  const start = new Date(target);
  start.setHours(0, 0, 0, 0);
  const end = new Date(target);
  end.setDate(end.getDate() + 1);

  const departments = await prisma.department.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
  });

  return Promise.all(
    departments.map(async (dept) => {
      const [total, present] = await Promise.all([
        prisma.employee.count({ where: { departmentId: dept.id, status: "ACTIVE" } }),
        prisma.attendanceRecord.count({
          where: {
            employee: { departmentId: dept.id },
            date: { gte: start, lt: end },
            status: { in: ["PRESENT", "LATE", "HALF_DAY"] },
          },
        }),
      ]);
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
}

export async function bulkUpsertAttendance(
  records: { employeeId: string; date: string; status: string; checkIn?: string; checkOut?: string; otHours?: number; note?: string }[],
  createdBy: string
) {
  return Promise.all(
    records.map((r) =>
      prisma.attendanceRecord.upsert({
        where: { employeeId_date: { employeeId: r.employeeId, date: new Date(r.date) } },
        create: {
          employeeId: r.employeeId,
          date: new Date(r.date),
          status: r.status as any,
          checkIn: r.checkIn ? new Date(r.checkIn) : null,
          checkOut: r.checkOut ? new Date(r.checkOut) : null,
          workHours: r.status === "PRESENT" ? 8 : r.status === "HALF_DAY" ? 4 : 0,
          otHours: r.otHours ?? 0,
          note: r.note,
          createdBy,
        },
        update: { status: r.status as any, otHours: r.otHours ?? 0, note: r.note },
      })
    )
  );
}
