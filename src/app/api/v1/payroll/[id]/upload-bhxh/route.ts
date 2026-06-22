// POST /api/v1/payroll/[id]/upload-bhxh?mode=preview|confirm
//
// Import file BHXH (HCNS tính ngoài). Mỗi NV 1 dòng: BHXH 8% / BHYT 1.5% / BHTN 1% / BHXH công ty 21.5%.
//   ?mode=preview → parse + đối chiếu Mã NV, KHÔNG ghi DB.
//   ?mode=confirm → xoá hết PayrollBhxhInput của kỳ (month/year) rồi ghi mới (idempotent).
// Sau khi import xong phải bấm "Tính lương lại" để áp BHXH vào kết quả.

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canViewPayroll } from "@/lib/access";
import { parseBhxhExcel } from "@/lib/bhxh-excel-parser";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (!canViewPayroll((session.user as any).employeeCode, (session.user as any).role)) {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Bạn không có quyền truy cập mục Lương" } }, { status: 403 });
  }

  const { id } = await params;
  const period = await prisma.payrollPeriod.findUnique({ where: { id } });
  if (!period) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Không tìm thấy kỳ lương" } }, { status: 404 });
  if (period.status === "APPROVED") {
    return NextResponse.json({ error: { code: "PERIOD_APPROVED", message: "Kỳ lương đã duyệt — không thể import" } }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("mode") || "preview";
  if (!["preview", "confirm"].includes(mode)) {
    return NextResponse.json({ error: { code: "BAD_REQUEST", message: "mode phải là 'preview' hoặc 'confirm'" } }, { status: 400 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: { code: "NO_FILE", message: "Thiếu file Excel" } }, { status: 400 });
  const buf = await file.arrayBuffer();

  let rows;
  try {
    rows = parseBhxhExcel(buf);
  } catch (e: any) {
    return NextResponse.json({ error: { code: "PARSE_ERROR", message: e.message || "Không parse được file Excel" } }, { status: 422 });
  }

  // Đối chiếu Mã NV với Employee.code
  const codes = rows.map((r) => r.code);
  const employees = await prisma.employee.findMany({ where: { code: { in: codes } }, select: { id: true, code: true, fullName: true } });
  const empByCode = new Map(employees.map((e) => [e.code, e]));

  const matched: any[] = [];
  const notFound: { code: string }[] = [];
  for (const r of rows) {
    const emp = empByCode.get(r.code);
    if (!emp) { notFound.push({ code: r.code }); continue; }
    const employeeTotal = r.bhxh8 + r.bhyt15 + r.bhtn1;
    matched.push({ employeeId: emp.id, fullName: emp.fullName, ...r, employeeTotal });
  }

  const summary = {
    totalRows: rows.length,
    matched: matched.length,
    notFound: notFound.length,
    totalBhxh8: matched.reduce((s, m) => s + m.bhxh8, 0),
    totalBhyt15: matched.reduce((s, m) => s + m.bhyt15, 0),
    totalBhtn1: matched.reduce((s, m) => s + m.bhtn1, 0),
    totalEmployee: matched.reduce((s, m) => s + m.employeeTotal, 0),
    totalEmployer: matched.reduce((s, m) => s + m.bhxhEmployer, 0),
  };

  if (mode === "preview") {
    return NextResponse.json({
      data: {
        summary,
        notFound: notFound.slice(0, 30),
        matched: matched.slice(0, 50),
      },
    });
  }

  // confirm — idempotent: xoá hết BHXH import của kỳ rồi ghi mới
  await prisma.$transaction(async (tx) => {
    await tx.payrollBhxhInput.deleteMany({ where: { month: period.month, year: period.year } });
    await tx.payrollBhxhInput.createMany({
      data: matched.map((m) => ({
        employeeId: m.employeeId,
        month: period.month,
        year: period.year,
        bhxh8: m.bhxh8,
        bhyt15: m.bhyt15,
        bhtn1: m.bhtn1,
        bhxhEmployer: m.bhxhEmployer,
      })),
    });
  });

  return NextResponse.json({ data: { imported: matched.length, notFound: notFound.length } });
}
