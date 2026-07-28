import prisma from "./prisma";

// So khớp giờ KÊ KHAI (phiếu tổ) với giờ MÁY chấm công cho từng NV × ngày của 1 phiếu.
//  - Lệch  → tạo/cập nhật 1 bản ghi OPEN trong AttendanceReconcile (chờ HCNS nhập thời gian thực + 2 bên duyệt).
//  - Khớp  → xóa bản ghi OPEN (nếu có, chưa RESOLVED) vì không còn lệch.
//  - Đã RESOLVED (đã ốp) thì KHÔNG đụng.
// So theo NV × NGÀY. Ngưỡng lệch: chênh > 0.01h.
export async function generateReconcileForLog(log: {
  date: Date;
  departmentId: string;
  departmentName: string;
  entries: { employeeId: string; employeeName: string; hours: number }[];
}) {
  const byEmp = new Map<string, { name: string; declared: number }>();
  for (const e of log.entries) {
    const cur = byEmp.get(e.employeeId) ?? { name: e.employeeName, declared: 0 };
    cur.declared += e.hours;
    if (e.employeeName) cur.name = e.employeeName;
    byEmp.set(e.employeeId, cur);
  }

  const dayStart = new Date(log.date);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  for (const [empId, v] of Array.from(byEmp.entries())) {
    const att = await prisma.attendanceRecord.findFirst({
      where: { employeeId: empId, date: { gte: dayStart, lt: dayEnd } },
      select: { workHours: true },
    });
    const machine = att?.workHours ?? 0;
    const lech = Math.abs(v.declared - machine) > 0.01;
    const existing = await prisma.attendanceReconcile.findUnique({
      where: { employeeId_date: { employeeId: empId, date: dayStart } },
    });

    if (lech) {
      if (existing?.status === "RESOLVED") continue; // đã ốp — giữ nguyên
      if (existing) {
        await prisma.attendanceReconcile.update({
          where: { id: existing.id },
          data: { declaredHours: v.declared, machineHours: machine, employeeName: v.name, departmentId: log.departmentId, departmentName: log.departmentName },
        });
      } else {
        await prisma.attendanceReconcile.create({
          data: { employeeId: empId, employeeName: v.name, date: dayStart, departmentId: log.departmentId, departmentName: log.departmentName, declaredHours: v.declared, machineHours: machine },
        });
      }
    } else if (existing && existing.status !== "RESOLVED") {
      await prisma.attendanceReconcile.delete({ where: { id: existing.id } });
    }
  }
}
