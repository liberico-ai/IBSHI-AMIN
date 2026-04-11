import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canDo } from "@/lib/permissions";
import ExcelJS from "exceljs";

// GET /api/v1/payroll/:periodId/export — download all payroll records as Excel
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const userRole = (session.user as any).role;
  if (!canDo(userRole, "payroll", "readAll")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const { id } = await params;
  const period = await prisma.payrollPeriod.findUnique({
    where: { id },
    include: {
      records: {
        include: {
          employee: {
            select: {
              code: true,
              fullName: true,
              department: { select: { name: true } },
              position: { select: { name: true } },
              bankName: true,
              bankAccount: true,
            },
          },
        },
        orderBy: { employee: { fullName: "asc" } },
      },
    },
  });

  if (!period) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });

  const wb = new ExcelJS.Workbook();
  wb.creator = "IBS ONE Platform";
  wb.created = new Date();

  const ws = wb.addWorksheet(`Bảng lương T${period.month}/${period.year}`);

  // Header row
  ws.columns = [
    { header: "STT", key: "stt", width: 6 },
    { header: "Mã NV", key: "code", width: 12 },
    { header: "Họ tên", key: "fullName", width: 28 },
    { header: "Phòng ban", key: "department", width: 18 },
    { header: "Chức vụ", key: "position", width: 18 },
    { header: "Lương cơ bản", key: "baseSalary", width: 16 },
    { header: "Công đã làm", key: "workDays", width: 14 },
    { header: "Tổng lương gộp", key: "grossSalary", width: 18 },
    { header: "BHXH/YT/TN", key: "socialInsurance", width: 16 },
    { header: "TNCN", key: "tncn", width: 14 },
    { header: "Lương thực nhận", key: "netSalary", width: 18 },
    { header: "Ngân hàng", key: "bankName", width: 18 },
    { header: "Số tài khoản", key: "bankAccount", width: 20 },
  ];

  // Style header row
  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true, size: 11, color: { argb: "FFFFFFFF" } };
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0D47A1" } };
  headerRow.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  headerRow.height = 30;

  // Data rows
  period.records.forEach((rec, idx) => {
    const row = ws.addRow({
      stt: idx + 1,
      code: rec.employee.code,
      fullName: rec.employee.fullName,
      department: rec.employee.department?.name ?? "",
      position: rec.employee.position?.name ?? "",
      baseSalary: rec.baseSalary,
      workDays: rec.workDays,
      grossSalary: rec.grossSalary,
      socialInsurance: (rec.bhxh ?? 0) + (rec.bhyt ?? 0) + (rec.bhtn ?? 0),
      tncn: rec.tncn ?? 0,
      netSalary: rec.netSalary,
      bankName: rec.employee.bankName ?? "",
      bankAccount: rec.employee.bankAccount ?? "",
    });

    // Alternate row color
    if (idx % 2 === 1) {
      row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F5F5" } };
    }

    // Number format for currency columns
    ["baseSalary", "grossSalary", "socialInsurance", "tncn", "netSalary"].forEach((col) => {
      const cell = row.getCell(col);
      cell.numFmt = '#,##0';
      cell.alignment = { horizontal: "right" };
    });
  });

  // Summary row
  const totalRow = ws.addRow({
    stt: "",
    code: "",
    fullName: "TỔNG CỘNG",
    department: "",
    position: "",
    baseSalary: "",
    workDays: "",
    grossSalary: period.records.reduce((s, r) => s + r.grossSalary, 0),
    socialInsurance: period.records.reduce((s, r) => s + (r.bhxh ?? 0) + (r.bhyt ?? 0) + (r.bhtn ?? 0), 0),
    tncn: period.records.reduce((s, r) => s + (r.tncn ?? 0), 0),
    netSalary: period.records.reduce((s, r) => s + r.netSalary, 0),
    bankName: "",
    bankAccount: "",
  });
  totalRow.font = { bold: true };
  totalRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF9C4" } };
  ["grossSalary", "socialInsurance", "tncn", "netSalary"].forEach((col) => {
    totalRow.getCell(col).numFmt = '#,##0';
    totalRow.getCell(col).alignment = { horizontal: "right" };
  });

  // Freeze header
  ws.views = [{ state: "frozen", ySplit: 1 }];

  // Auto-filter
  ws.autoFilter = { from: "A1", to: "M1" };

  // Add title above
  ws.spliceRows(1, 0, []);
  ws.getRow(1).values = [`BẢNG LƯƠNG THÁNG ${period.month}/${period.year} — Trạng thái: ${period.status}`];
  ws.getRow(1).font = { bold: true, size: 13 };
  ws.mergeCells("A1:M1");
  ws.getRow(1).alignment = { horizontal: "center" };
  ws.getRow(1).height = 24;

  const buffer = await wb.xlsx.writeBuffer();

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="bang-luong-T${period.month}-${period.year}.xlsx"`,
    },
  });
}
