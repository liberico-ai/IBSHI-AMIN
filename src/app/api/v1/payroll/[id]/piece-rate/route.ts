import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canDo } from "@/lib/permissions";
import { canViewPayroll } from "@/lib/access";
import * as XLSX from "xlsx";

// Lấy danh sách NV có chấm công trong kỳ (để dựng template + map mã→id)
async function employeesWithAttendance(month: number, year: number) {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0, 23, 59, 59));
  const att = await prisma.attendanceRecord.findMany({
    where: { date: { gte: start, lte: end } },
    select: { employeeId: true },
  });
  const ids = Array.from(new Set(att.map((a) => a.employeeId)));
  return prisma.employee.findMany({
    where: { id: { in: ids }, status: { in: ["ACTIVE", "PROBATION"] } },
    select: { id: true, code: true, fullName: true, department: { select: { name: true } } },
    orderBy: { fullName: "asc" },
  });
}

// GET — tải template Excel (Mã NV | Họ tên | Phòng ban | Lương sản phẩm | Điều chỉnh) cho NV trong kỳ
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (!canViewPayroll((session.user as any).employeeCode)) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }
  const { id } = await params;
  const period = await prisma.payrollPeriod.findUnique({ where: { id } });
  if (!period) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });

  const emps = await employeesWithAttendance(period.month, period.year);
  const existing = await prisma.payrollManualInput.findMany({
    where: { month: period.month, year: period.year },
    select: { employeeId: true, pieceRate: true, adjustment: true },
  });
  const exMap = new Map(existing.map((e) => [e.employeeId, e]));

  const aoa: any[][] = [["Mã NV", "Họ tên", "Phòng ban", "Lương sản phẩm"]];
  for (const e of emps) {
    const ex = exMap.get(e.id);
    aoa.push([e.code, e.fullName, e.department?.name || "", (ex?.pieceRate || 0) + (ex?.adjustment || 0)]);
  }
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 10 }, { wch: 26 }, { wch: 22 }, { wch: 16 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "LuongSanPham");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="luong-san-pham-T${period.month}-${period.year}.xlsx"`,
    },
  });
}

// Tìm cột theo từ khoá trong hàng header
function findCol(header: any[], keywords: string[]): number {
  for (let i = 0; i < header.length; i++) {
    const v = String(header[i] || "").trim().toLowerCase();
    if (v && keywords.some((k) => v.includes(k))) return i;
  }
  return -1;
}

// POST — import file Lương sản phẩm: thay thế toàn bộ dữ liệu nhập tay của kỳ
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const role = (session.user as any).role;
  if (!canViewPayroll((session.user as any).employeeCode) || !canDo(role, "payroll", "calculate")) {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Bạn không có quyền nhập lương sản phẩm" } }, { status: 403 });
  }
  const { id } = await params;
  const period = await prisma.payrollPeriod.findUnique({ where: { id } });
  if (!period) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  if (period.status === "APPROVED" || period.status === "PAID") {
    return NextResponse.json({ error: { code: "INVALID_STATE", message: "Kỳ lương đã duyệt/đã trả — không nhập được" } }, { status: 409 });
  }

  let wb: XLSX.WorkBook;
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: { code: "NO_FILE", message: "Chưa chọn file" } }, { status: 400 });
    const buf = Buffer.from(await file.arrayBuffer());
    wb = XLSX.read(buf, { type: "buffer" });
  } catch (e: any) {
    return NextResponse.json({ error: { code: "PARSE_ERROR", message: `Không đọc được file: ${e.message}` } }, { status: 400 });
  }

  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as any[][];
  // tìm hàng header (có "mã nv"/"mã nhân viên")
  let hi = -1;
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    if (findCol(rows[i], ["mã nv", "mã nhân", "manv", "ma nv"]) >= 0) { hi = i; break; }
  }
  if (hi < 0) return NextResponse.json({ error: { code: "BAD_FORMAT", message: "Không tìm thấy cột 'Mã NV' trong file" } }, { status: 422 });

  const codeCol = findCol(rows[hi], ["mã nv", "mã nhân", "manv", "ma nv"]);
  const pieceCol = findCol(rows[hi], ["lương sản phẩm", "luong san pham", "sản phẩm", "san pham", "khoán", "khoan", "số tiền", "so tien"]);
  if (pieceCol < 0) return NextResponse.json({ error: { code: "BAD_FORMAT", message: "Không tìm thấy cột 'Lương sản phẩm'" } }, { status: 422 });

  // map mã NV → employeeId (chỉ NV trong hệ thống)
  const allEmps = await prisma.employee.findMany({ select: { id: true, code: true } });
  const codeToId = new Map(allEmps.map((e) => [e.code, e.id]));

  const num = (v: any) => { const n = Number(String(v).replace(/[^\d.-]/g, "")); return isFinite(n) ? Math.round(n) : 0; };
  const records: { employeeId: string; month: number; year: number; pieceRate: number; adjustment: number }[] = [];
  const notFound: string[] = [];
  for (let i = hi + 1; i < rows.length; i++) {
    const code = String(rows[i][codeCol] || "").trim();
    if (!code) continue;
    const empId = codeToId.get(code);
    if (!empId) { notFound.push(code); continue; }
    const pieceRate = num(rows[i][pieceCol]);
    if (pieceRate === 0) continue;
    records.push({ employeeId: empId, month: period.month, year: period.year, pieceRate, adjustment: 0 });
  }

  // Thay thế toàn bộ dữ liệu nhập tay của kỳ này
  await prisma.$transaction([
    prisma.payrollManualInput.deleteMany({ where: { month: period.month, year: period.year } }),
    ...(records.length ? [prisma.payrollManualInput.createMany({ data: records })] : []),
  ]);

  return NextResponse.json({
    data: { imported: records.length, notFound: notFound.length, notFoundCodes: notFound.slice(0, 20) },
  });
}
