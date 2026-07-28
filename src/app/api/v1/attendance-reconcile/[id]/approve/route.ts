import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canUser } from "@/lib/permission-catalog";

// POST — duyệt 1 phía mục đối soát (quyền m3.doisoat:approve). Cần CẢ 2 phía:
//   - Người thuộc ĐÚNG phòng ban của mục  → duyệt phía XƯỞNG (phụ trách Xưởng).
//   - Người KHÁC phòng (TP HCNS/HR)        → duyệt phía HCNS.
// Đủ 2 phía + đã có "thời gian thực" → RESOLVED + ỐP vào AttendanceRecord.reconciledHours (KHÔNG đè giờ máy).
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (!canUser(session.user as any, "m3.doisoat:approve")) return NextResponse.json({ error: { code: "FORBIDDEN", message: "Không có quyền duyệt đối soát" } }, { status: 403 });
  const userId = (session.user as any).id;
  const { id } = await params;

  const row = await prisma.attendanceReconcile.findUnique({ where: { id } });
  if (!row) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  if (row.status === "RESOLVED") return NextResponse.json({ error: { code: "INVALID_STATE", message: "Mục đã đối soát xong" } }, { status: 400 });
  if (row.actualHours === null || row.actualHours === undefined)
    return NextResponse.json({ error: { code: "NO_ACTUAL", message: "HCNS chưa nhập Thời gian thực" } }, { status: 400 });

  // Xác định phía duyệt theo phòng ban của người duyệt.
  const emp = await prisma.employee.findFirst({ where: { userId }, select: { departmentId: true } });
  const isXuong = !!emp?.departmentId && emp.departmentId === row.departmentId;

  const patch: any = isXuong
    ? { xuongApproved: true, xuongApprovedById: userId }
    : { hcnsApproved: true, hcnsApprovedById: userId };

  const hcns = isXuong ? row.hcnsApproved : true;
  const xuong = isXuong ? true : row.xuongApproved;
  const bothDone = hcns && xuong;

  const updated = await prisma.$transaction(async (tx) => {
    const r = await tx.attendanceReconcile.update({
      where: { id },
      data: { ...patch, ...(bothDone ? { status: "RESOLVED" } : {}) },
    });
    if (bothDone) {
      // ỐP vào chấm công: ghi reconciledHours cho đúng NV × ngày (KHÔNG đụng workHours máy).
      const dayStart = new Date(r.date); dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate() + 1);
      const att = await tx.attendanceRecord.findFirst({ where: { employeeId: r.employeeId, date: { gte: dayStart, lt: dayEnd } }, select: { id: true } });
      if (att) {
        await tx.attendanceRecord.update({ where: { id: att.id }, data: { reconciledHours: r.actualHours } });
      } else {
        await tx.attendanceRecord.create({
          data: { employeeId: r.employeeId, date: dayStart, workHours: r.machineHours, reconciledHours: r.actualHours, status: "PRESENT", createdBy: userId },
        });
      }
    }
    return r;
  });

  return NextResponse.json({ data: updated });
}
