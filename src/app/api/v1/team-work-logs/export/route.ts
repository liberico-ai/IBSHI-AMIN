import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canUser } from "@/lib/permission-catalog";

// Xuất kê khai tổ theo khoảng ngày → trả {title, columns, rows} để client dựng Excel.
// Định dạng khớp mẫu: mỗi dòng = 1 NV×dự án; NV có nhiều dự án thì các dòng sau bỏ trống Ngày/Mã NV/Tên/Tổ.
const vnDate = (d: Date | string) => new Date(d).toISOString().slice(0, 10).replace(/-/g, "/"); // YYYY/MM/DD

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (!canUser(session.user as any, "m3.phieuto:view")) return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const fromStr = searchParams.get("from") || "";
  const toStr = searchParams.get("to") || "";
  if (!fromStr || !toStr) return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Cần from và to" } }, { status: 400 });

  const from = new Date(new Date(fromStr).setHours(0, 0, 0, 0));
  const to = new Date(new Date(toStr).setHours(23, 59, 59, 999));

  // Quyền xem: HR/BGĐ/ADMIN xem tất cả; còn lại chỉ phiếu MÌNH tạo (khớp GET danh sách).
  const role = (session.user as any).role;
  const userId = (session.user as any).id;
  const where: any = { date: { gte: from, lte: to }, status: { not: "DRAFT" } };
  if (!["HR_ADMIN", "BOM", "ADMIN"].includes(role)) where.createdById = userId;

  const logs = await prisma.teamWorkLog.findMany({
    where, include: { entries: true }, orderBy: [{ date: "asc" }, { departmentName: "asc" }],
  });

  const rows: Record<string, unknown>[] = [];
  for (const log of logs) {
    // Gom entries theo NV giữ thứ tự xuất hiện.
    const order: string[] = [];
    const byEmp = new Map<string, typeof log.entries>();
    for (const e of log.entries) {
      if (!byEmp.has(e.employeeId)) { byEmp.set(e.employeeId, [] as any); order.push(e.employeeId); }
      (byEmp.get(e.employeeId) as any).push(e);
    }
    for (const empId of order) {
      const es = byEmp.get(empId)!;
      es.forEach((e, i) => {
        const firstRow = i === 0;
        rows.push({
          date: firstRow ? vnDate(log.date) : "",
          code: firstRow ? (e.employeeCode || "") : "",
          name: firstRow ? e.employeeName : "",
          dept: firstRow ? log.departmentName : "",
          project: e.projectCode,
          hours: e.hours,
          workCode: e.workCode || "",
          categoryCode: e.categoryCode || "",
          reinforce: e.reinforce || "",
          content: e.category || "",
        });
      });
    }
  }

  return NextResponse.json({ data: {
    title: `KÊ KHAI TỔ — ${vnDate(from)} đến ${vnDate(to)}`,
    columns: [
      { header: "Ngày", key: "date", width: 13 },
      { header: "Mã NV", key: "code", width: 11 },
      { header: "Tên nhân viên", key: "name", width: 22 },
      { header: "Tổ", key: "dept", width: 18 },
      { header: "Mã dự án", key: "project", width: 14 },
      { header: "Hành chính", key: "hours", width: 11 },
      { header: "Mã CV", key: "workCode", width: 9 },
      { header: "Mã chủng loại", key: "categoryCode", width: 13 },
      { header: "Tăng cường", key: "reinforce", width: 16 },
      { header: "Nội dung công việc", key: "content", width: 30 },
    ],
    rows,
  } });
}
