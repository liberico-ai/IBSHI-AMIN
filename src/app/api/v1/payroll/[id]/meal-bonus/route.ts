import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canUser } from "@/lib/permission-catalog";
import { canViewPayroll } from "@/lib/access";
import * as XLSX from "xlsx";

// Import "Bổ sung tiền ăn" → PayrollManualInput.mealBonus.
// CỘNG THÊM (+/-) vào cột "Tiền ăn ca thêm giờ" tự tính từ chấm công. Chịu thuế (nằm trong Gross).
// Cho phép tổng tiền ăn xuống ÂM khi truy thu (trừ thẳng vào Gross → giảm thực lĩnh).

const toInt = (v: any) => { const n = Number(String(v ?? "").replace(/[^\d.-]/g, "")); return isFinite(n) ? Math.round(n) : 0; };
function findCol(header: any[], keywords: string[]): number {
  for (let i = 0; i < header.length; i++) {
    const v = String(header[i] || "").trim().toLowerCase();
    if (v && keywords.some((k) => v.includes(k))) return i;
  }
  return -1;
}

async function employeesWithAttendance(month: number, year: number) {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0, 23, 59, 59));
  const att = await prisma.attendanceRecord.findMany({ where: { date: { gte: start, lte: end } }, select: { employeeId: true } });
  const ids = Array.from(new Set(att.map((a) => a.employeeId)));
  return prisma.employee.findMany({
    where: { id: { in: ids }, status: { in: ["ACTIVE", "PROBATION"] } },
    select: { id: true, code: true, fullName: true, department: { select: { name: true } } },
    orderBy: { fullName: "asc" },
  });
}

// GET — template: Mã NV | Họ tên | Phòng ban | Bổ sung tiền ăn
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (!canUser(session.user as any, "m7.luong:view")) return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  const { id } = await params;
  const period = await prisma.payrollPeriod.findUnique({ where: { id } });
  if (!period) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });

  const emps = await employeesWithAttendance(period.month, period.year);
  const existing = await prisma.payrollManualInput.findMany({ where: { month: period.month, year: period.year }, select: { employeeId: true, mealBonus: true } });
  const exMap = new Map(existing.map((e) => [e.employeeId, e.mealBonus]));
  const aoa: any[][] = [["Mã NV", "Họ tên", "Phòng ban", "Bổ sung tiền ăn"]];
  for (const e of emps) { aoa.push([e.code, e.fullName, e.department?.name || "", exMap.get(e.id) || 0]); }
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 10 }, { wch: 26 }, { wch: 22 }, { wch: 16 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "BoSungTienAn");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="bo-sung-tien-an-T${period.month}-${period.year}.xlsx"`,
    },
  });
}

// POST — import: thay thế toàn bộ bổ sung tiền ăn của kỳ (idempotent, không đụng adjustment/pieceRate).
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (!canUser(session.user as any, "m7.luong:view")) return NextResponse.json({ error: { code: "FORBIDDEN", message: "Không có quyền" } }, { status: 403 });
  const { id } = await params;
  const period = await prisma.payrollPeriod.findUnique({ where: { id } });
  if (!period) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  if (period.status === "APPROVED" || period.status === "PAID") {
    return NextResponse.json({ error: { code: "INVALID_STATE", message: "Kỳ lương đã duyệt/đã trả — không nhập được" } }, { status: 409 });
  }

  let wb: XLSX.WorkBook;
  try {
    const fd = await request.formData();
    const file = fd.get("file") as File | null;
    if (!file) return NextResponse.json({ error: { code: "NO_FILE", message: "Chưa chọn file" } }, { status: 400 });
    wb = XLSX.read(Buffer.from(await file.arrayBuffer()), { type: "buffer" });
  } catch (e: any) {
    return NextResponse.json({ error: { code: "PARSE_ERROR", message: `Không đọc được file: ${e.message}` } }, { status: 400 });
  }

  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "" }) as any[][];
  let hi = -1;
  for (let i = 0; i < Math.min(rows.length, 15); i++) if (findCol(rows[i], ["mã nv", "mã nhân", "manv", "ma nv"]) >= 0) { hi = i; break; }
  if (hi < 0) return NextResponse.json({ error: { code: "BAD_FORMAT", message: "Không tìm thấy cột 'Mã NV'" } }, { status: 422 });
  const codeCol = findCol(rows[hi], ["mã nv", "mã nhân", "manv", "ma nv"]);
  const valCol = findCol(rows[hi], ["tiền ăn", "tien an", "bổ sung", "bo sung", "số tiền", "so tien"]);
  if (valCol < 0) return NextResponse.json({ error: { code: "BAD_FORMAT", message: "Không tìm thấy cột 'Bổ sung tiền ăn'" } }, { status: 422 });

  const allEmps = await prisma.employee.findMany({ select: { id: true, code: true } });
  const codeToId = new Map(allEmps.map((e) => [e.code, e.id]));
  // Gộp theo Mã NV: 1 người có nhiều dòng → CỘNG DỒN tiền ăn.
  const agg = new Map<string, number>();
  const notFound = new Set<string>();
  for (let i = hi + 1; i < rows.length; i++) {
    const code = String(rows[i][codeCol] || "").trim();
    if (!code) continue;
    const empId = codeToId.get(code);
    if (!empId) { notFound.add(code); continue; }
    const mealBonus = toInt(rows[i][valCol]);
    agg.set(empId, (agg.get(empId) || 0) + mealBonus);
  }
  const records = Array.from(agg.entries())
    .filter(([, v]) => v !== 0)
    .map(([employeeId, mealBonus]) => ({ employeeId, month: period.month, year: period.year, mealBonus }));

  await prisma.$transaction([
    // Reset CHỈ field tiền ăn của kỳ (không xoá row → giữ adjustment/note/pieceRate).
    prisma.payrollManualInput.updateMany({ where: { month: period.month, year: period.year }, data: { mealBonus: 0 } }),
    ...records.map((r) =>
      prisma.payrollManualInput.upsert({
        where: { employeeId_month_year: { employeeId: r.employeeId, month: r.month, year: r.year } },
        update: { mealBonus: r.mealBonus },
        create: { employeeId: r.employeeId, month: r.month, year: r.year, mealBonus: r.mealBonus },
      })
    ),
  ]);

  return NextResponse.json({ data: { imported: records.length, notFound: notFound.size, notFoundCodes: Array.from(notFound).slice(0, 20) } });
}
