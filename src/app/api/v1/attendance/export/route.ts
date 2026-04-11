import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canDo } from "@/lib/permissions";
import ExcelJS from "exceljs";

const STATUS_LABELS: Record<string, string> = {
  PRESENT: "Có mặt",
  ABSENT: "Vắng",
  LATE: "Đi trễ",
  HALF_DAY: "Nửa ngày",
  LEAVE: "Nghỉ phép",
  HOLIDAY: "Nghỉ lễ",
  WFH: "WFH",
};

// GET /api/v1/attendance/export?month=4&year=2026&departmentId=xxx
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const userRole = (session.user as any).role;
  if (!canDo(userRole, "attendance", "bulkUpsert")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const month = parseInt(searchParams.get("month") || String(new Date().getMonth() + 1));
  const year = parseInt(searchParams.get("year") || String(new Date().getFullYear()));
  const departmentId = searchParams.get("departmentId") || "";

  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59);
  const daysInMonth = new Date(year, month, 0).getDate();

  const employeeWhere: any = { status: { in: ["ACTIVE", "PROBATION"] } };
  if (departmentId) employeeWhere.departmentId = departmentId;

  const employees = await prisma.employee.findMany({
    where: employeeWhere,
    include: {
      department: { select: { name: true } },
      position: { select: { name: true } },
      attendanceRecords: {
        where: { date: { gte: startDate, lte: endDate } },
        select: { date: true, status: true, checkIn: true, checkOut: true },
      },
    },
    orderBy: [{ department: { name: "asc" } }, { fullName: "asc" }],
  });

  const wb = new ExcelJS.Workbook();
  wb.creator = "IBS ONE Platform";
  const ws = wb.addWorksheet(`Chấm công T${month}/${year}`);

  // Build dynamic columns: STT, Mã NV, Họ tên, Phòng ban, then day 1..N, then summary cols
  const fixedCols: Partial<ExcelJS.Column>[] = [
    { header: "STT", key: "stt", width: 5 },
    { header: "Mã NV", key: "code", width: 11 },
    { header: "Họ tên", key: "fullName", width: 26 },
    { header: "Phòng ban", key: "department", width: 16 },
  ];

  const dayCols: Partial<ExcelJS.Column>[] = Array.from({ length: daysInMonth }, (_, i) => ({
    header: String(i + 1),
    key: `d${i + 1}`,
    width: 5,
  }));

  const summaryCols: Partial<ExcelJS.Column>[] = [
    { header: "Ngày CĐ", key: "workDays", width: 10 },
    { header: "Đi trễ", key: "lateDays", width: 9 },
    { header: "Vắng", key: "absentDays", width: 8 },
    { header: "Nghỉ phép", key: "leaveDays", width: 10 },
  ];

  ws.columns = [...fixedCols, ...dayCols, ...summaryCols];

  // Title row
  ws.spliceRows(1, 0, []);
  ws.getRow(1).values = [`BẢNG CHẤM CÔNG THÁNG ${month}/${year}${departmentId ? "" : " — TẤT CẢ PHÒNG BAN"}`];
  ws.getRow(1).font = { bold: true, size: 13 };
  ws.mergeCells(`A1:${String.fromCharCode(65 + fixedCols.length + daysInMonth + summaryCols.length - 1)}1`);
  ws.getRow(1).alignment = { horizontal: "center" };
  ws.getRow(1).height = 24;

  // Style header (now row 2)
  const hRow = ws.getRow(2);
  hRow.font = { bold: true, size: 10, color: { argb: "FFFFFFFF" } };
  hRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1565C0" } };
  hRow.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  hRow.height = 28;

  // Freeze first 4 columns and header rows
  ws.views = [{ state: "frozen", xSplit: 4, ySplit: 2 }];

  const statusSymbol: Record<string, string> = {
    PRESENT: "P", ABSENT: "V", LATE: "T", HALF_DAY: "N/2",
    LEAVE: "NP", HOLIDAY: "L", WFH: "WFH",
  };

  employees.forEach((emp, idx) => {
    const byDay: Record<number, string> = {};
    emp.attendanceRecords.forEach((rec) => {
      const day = new Date(rec.date).getDate();
      byDay[day] = rec.status;
    });

    const workDays = Object.values(byDay).filter((s) => ["PRESENT", "WFH"].includes(s)).length +
      Object.values(byDay).filter((s) => s === "HALF_DAY").length * 0.5;
    const lateDays = Object.values(byDay).filter((s) => s === "LATE").length;
    const absentDays = Object.values(byDay).filter((s) => s === "ABSENT").length;
    const leaveDays = Object.values(byDay).filter((s) => s === "LEAVE").length;

    const dayData: Record<string, string> = {};
    for (let d = 1; d <= daysInMonth; d++) {
      dayData[`d${d}`] = byDay[d] ? statusSymbol[byDay[d]] ?? byDay[d] : "";
    }

    const row = ws.addRow({
      stt: idx + 1,
      code: emp.code,
      fullName: emp.fullName,
      department: emp.department?.name ?? "",
      ...dayData,
      workDays,
      lateDays,
      absentDays,
      leaveDays,
    });

    if (idx % 2 === 1) {
      row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F5F5" } };
    }

    // Color code absence/late cells
    for (let d = 1; d <= daysInMonth; d++) {
      const cell = row.getCell(`d${d}`);
      cell.alignment = { horizontal: "center" };
      const status = byDay[d];
      if (status === "ABSENT") cell.font = { color: { argb: "FFEF5350" } };
      else if (status === "LATE") cell.font = { color: { argb: "FFFF9800" } };
      else if (status === "PRESENT" || status === "WFH") cell.font = { color: { argb: "FF4CAF50" } };
    }
  });

  // Legend sheet
  const legendWs = wb.addWorksheet("Chú giải");
  legendWs.addRow(["Ký hiệu", "Ý nghĩa"]);
  legendWs.getRow(1).font = { bold: true };
  Object.entries(STATUS_LABELS).forEach(([k, v]) => {
    legendWs.addRow([statusSymbol[k] ?? k, v]);
  });
  legendWs.columns = [{ width: 12 }, { width: 24 }];

  const buffer = await wb.xlsx.writeBuffer();

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="cham-cong-T${month}-${year}.xlsx"`,
    },
  });
}
