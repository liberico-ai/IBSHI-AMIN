import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFDocument = require("pdfkit");

function fmt(n: number) {
  return n.toLocaleString("vi-VN") + " ₫";
}

// GET /api/v1/payroll/:periodId/slip/pdf
// Returns PDF phiếu lương for the current user (HR_ADMIN can pass ?employeeId=xxx)
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
  const isHR = ["HR_ADMIN", "BOM"].includes(userRole);

  let employeeId: string | undefined;
  if (requestedEmployeeId && isHR) {
    employeeId = requestedEmployeeId;
  } else {
    const myEmp = await prisma.employee.findFirst({ where: { userId }, select: { id: true } });
    if (!myEmp) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
    employeeId = myEmp.id;
  }

  const record = await prisma.payrollRecord.findFirst({
    where: { periodId, employeeId },
    include: {
      period: { select: { month: true, year: true } },
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

  if (!record) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });

  const { employee: emp, period } = record;

  // ── Build PDF ──────────────────────────────────────────────────────────────
  const doc = new PDFDocument({ size: "A4", margin: 50 });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));

  await new Promise<void>((resolve) => {
    doc.on("end", resolve);

    // ── Header ──
    doc
      .fontSize(18)
      .font("Helvetica-Bold")
      .text("PHIẾU LƯƠNG", { align: "center" });
    doc
      .fontSize(13)
      .font("Helvetica")
      .text(`Tháng ${period.month}/${period.year}`, { align: "center" });

    doc.moveDown(0.5);
    doc
      .moveTo(50, doc.y)
      .lineTo(545, doc.y)
      .strokeColor("#0D47A1")
      .lineWidth(2)
      .stroke();
    doc.moveDown(0.8);

    // ── Employee info ──
    const labelColor = "#555555";
    const lineH = 20;

    function row(label: string, value: string) {
      const y = doc.y;
      doc.fontSize(10).fillColor(labelColor).text(label, 50, y, { width: 160 });
      doc.fontSize(10).fillColor("#000000").text(value, 210, y, { width: 335 });
      doc.y = y + lineH;
    }

    row("Mã nhân viên:", emp.code ?? "—");
    row("Họ và tên:", emp.fullName);
    row("Phòng ban:", emp.department?.name ?? "—");
    row("Chức vụ:", emp.position?.name ?? "—");
    row("Mã số thuế:", emp.taxCode ?? "—");
    row("Ngân hàng:", emp.bankName ?? "—");
    row("Số tài khoản:", emp.bankAccount ?? "—");

    doc.moveDown(0.6);
    doc
      .moveTo(50, doc.y)
      .lineTo(545, doc.y)
      .strokeColor("#CCCCCC")
      .lineWidth(1)
      .stroke();
    doc.moveDown(0.8);

    // ── Salary breakdown ──
    doc.fontSize(12).font("Helvetica-Bold").fillColor("#0D47A1").text("CHI TIẾT LƯƠNG");
    doc.font("Helvetica").fillColor("#000000");
    doc.moveDown(0.4);

    function salRow(label: string, value: number, bold = false, color = "#000000") {
      const y = doc.y;
      doc
        .fontSize(10)
        .font(bold ? "Helvetica-Bold" : "Helvetica")
        .fillColor(color)
        .text(label, 50, y, { width: 320 });
      doc
        .fontSize(10)
        .font(bold ? "Helvetica-Bold" : "Helvetica")
        .fillColor(color)
        .text(fmt(value), 370, y, { width: 175, align: "right" });
      doc.y = y + lineH;
    }

    salRow("Lương cơ bản", record.baseSalary);
    // workDays is informational — display as text
    {
      const y = doc.y;
      doc.fontSize(10).fillColor(labelColor).text("Ngày công thực tế", 50, y, { width: 320 });
      doc.fontSize(10).fillColor("#000000").text(`${record.workDays} / ${record.standardDays} ngày`, 370, y, { width: 175, align: "right" });
      doc.y = y + lineH;
    }

    if (record.otPay > 0) salRow("Lương tăng ca", record.otPay);
    if (record.pieceRateSalary > 0) salRow("Lương sản phẩm", record.pieceRateSalary);
    if (record.hazardAllowance > 0) salRow("Phụ cấp độc hại", record.hazardAllowance);
    if (record.responsibilityAllow > 0) salRow("Phụ cấp trách nhiệm", record.responsibilityAllow);
    if (record.mealAllowance > 0) salRow("Phụ cấp bữa ăn", record.mealAllowance);
    if (record.otherIncome > 0) salRow("Thu nhập khác", record.otherIncome);

    doc.moveDown(0.3);
    salRow("TỔNG THU NHẬP GỘP", record.grossSalary, true);

    doc.moveDown(0.3);
    if ((record.bhxh as number) > 0) salRow("  BHXH (8%)", record.bhxh as number, false, "#CC0000");
    if ((record.bhyt as number) > 0) salRow("  BHYT (1.5%)", record.bhyt as number, false, "#CC0000");
    if ((record.bhtn as number) > 0) salRow("  BHTN (1%)", record.bhtn as number, false, "#CC0000");
    if ((record.tncn as number) > 0) salRow("  Thuế TNCN", record.tncn as number, false, "#CC0000");
    if ((record.deductions as number) > 0) salRow("  Khấu trừ khác", record.deductions as number, false, "#CC0000");

    doc.moveDown(0.3);
    doc
      .moveTo(50, doc.y)
      .lineTo(545, doc.y)
      .strokeColor("#0D47A1")
      .lineWidth(1.5)
      .stroke();
    doc.moveDown(0.4);

    salRow("LƯƠNG THỰC NHẬN", record.netSalary, true, "#0D47A1");

    // ── Notes ──
    if (record.notes) {
      doc.moveDown(0.8);
      doc.fontSize(9).fillColor(labelColor).text(`Ghi chú: ${record.notes}`);
    }

    // ── Footer ──
    doc.moveDown(2);
    doc
      .moveTo(50, doc.y)
      .lineTo(545, doc.y)
      .strokeColor("#CCCCCC")
      .lineWidth(0.5)
      .stroke();
    doc.moveDown(0.4);
    doc
      .fontSize(8)
      .fillColor(labelColor)
      .text(
        `Phiếu lương được tạo tự động bởi IBS ONE Platform — ${new Date().toLocaleDateString("vi-VN")}`,
        { align: "center" }
      );

    doc.end();
  });

  const pdfBuffer = Buffer.concat(chunks);
  const filename = `phieu-luong-T${period.month}-${period.year}-${emp.code ?? emp.fullName.replace(/\s+/g, "-")}.pdf`;

  return new NextResponse(pdfBuffer, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
