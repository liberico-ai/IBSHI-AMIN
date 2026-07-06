import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canViewPayroll } from "@/lib/access";
import * as XLSX from "xlsx";

// Module Lương khoán (chốt 2026-06-22): import KHOÁN THEO TỔ → PieceRateRecord.
// Khi "Tính lại lương", hệ thống chia khoán cho từng NV theo công thức:
//   Lương SP NV = (Khoán tổ − Σ lương-thời-gian-OT tổ) ÷ Σ công-quy-đổi tổ × công-quy-đổi NV.

const norm = (v: any) =>
  (v ?? "").toString().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/\s+/g, " ").trim();

const toInt = (v: any) => { const n = Number(String(v ?? "").replace(/[^\d.-]/g, "")); return isFinite(n) ? Math.round(n) : 0; };

function findCol(header: any[], keywords: string[]): number {
  for (let i = 0; i < header.length; i++) {
    const v = norm(header[i]);
    if (v && keywords.some((k) => v.includes(k))) return i;
  }
  return -1;
}

// GET — tải template: Tổ | Phòng ban | Lương khoán (liệt kê các tổ).
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (!canViewPayroll((session.user as any).employeeCode, (session.user as any).role)) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }
  const { id } = await params;
  const period = await prisma.payrollPeriod.findUnique({ where: { id } });
  if (!period) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });

  const existing = await prisma.pieceRateRecord.findMany({ where: { month: period.month, year: period.year }, select: { teamId: true, departmentId: true, totalAmount: true } });
  const exMap = new Map<string, number>(); // key: "dept:<id>" | "team:<id>"
  const exDeptIds = new Set<string>(), exTeamIds = new Set<string>();
  for (const e of existing) {
    const key = e.departmentId ? `dept:${e.departmentId}` : e.teamId ? `team:${e.teamId}` : null;
    if (!key) continue;
    exMap.set(key, (exMap.get(key) || 0) + e.totalAmount);
    if (e.departmentId) exDeptIds.add(e.departmentId); else if (e.teamId) exTeamIds.add(e.teamId);
  }
  // Khoán từ T7/2026 tính theo XƯỞNG (phòng ban tên "Xưởng ..."). Kèm tổ/xưởng CŨ có khoán kỳ này (xem lịch sử).
  const xuong = await prisma.department.findMany({
    where: { OR: [{ name: { startsWith: "Xưởng" }, isActive: true }, { id: { in: Array.from(exDeptIds) } }] },
    select: { id: true, name: true }, orderBy: { name: "asc" },
  });
  const oldTeams = exTeamIds.size
    ? await prisma.productionTeam.findMany({ where: { id: { in: Array.from(exTeamIds) } }, select: { id: true, name: true }, orderBy: { name: "asc" } })
    : [];

  const aoa: any[][] = [["Xưởng", "Lương khoán"]];
  for (const x of xuong) aoa.push([x.name, exMap.get(`dept:${x.id}`) || 0]);
  for (const t of oldTeams) aoa.push([t.name, exMap.get(`team:${t.id}`) || 0]);
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 26 }, { wch: 18 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "KhoanTheoXuong");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="khoan-theo-xuong-T${period.month}-${period.year}.xlsx"`,
    },
  });
}

// POST — import Khoán theo Tổ: thay thế toàn bộ khoán của kỳ (idempotent).
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (!canViewPayroll((session.user as any).employeeCode, (session.user as any).role)) {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Không có quyền" } }, { status: 403 });
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
    wb = XLSX.read(Buffer.from(await file.arrayBuffer()), { type: "buffer" });
  } catch (e: any) {
    return NextResponse.json({ error: { code: "PARSE_ERROR", message: `Không đọc được file: ${e.message}` } }, { status: 400 });
  }

  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "" }) as any[][];
  const NAME_KW = ["xuong", "to", "team", "tổ"]; // cột tên nhóm: Xưởng (T7+) hoặc Tổ (cũ)
  let hi = -1;
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    if (findCol(rows[i], NAME_KW) >= 0 && findCol(rows[i], ["khoan", "so tien", "amount"]) >= 0) { hi = i; break; }
  }
  if (hi < 0) return NextResponse.json({ error: { code: "BAD_FORMAT", message: "Không tìm thấy cột 'Xưởng/Tổ' và 'Lương khoán'" } }, { status: 422 });
  const nameCol = findCol(rows[hi], NAME_KW);
  const khoanCol = findCol(rows[hi], ["khoan", "so tien", "amount"]);

  // Khớp tên: ưu tiên XƯỞNG (phòng ban) → rồi TỔ cũ (để re-import kỳ lịch sử vẫn được).
  const xuong = await prisma.department.findMany({ where: { name: { startsWith: "Xưởng" }, isActive: true }, select: { id: true, name: true } });
  const teams = await prisma.productionTeam.findMany({ select: { id: true, name: true } });
  const deptByName = new Map(xuong.map((d) => [norm(d.name), d.id]));
  const teamByName = new Map(teams.map((t) => [norm(t.name), t.id]));

  const byDept: Record<string, number> = {}, byTeam: Record<string, number> = {};
  const notFound: string[] = [];
  for (let i = hi + 1; i < rows.length; i++) {
    const name = String(rows[i][nameCol] ?? "").trim();
    if (!name) continue;
    const khoan = toInt(rows[i][khoanCol]);
    const dId = deptByName.get(norm(name));
    if (dId) { byDept[dId] = (byDept[dId] || 0) + khoan; continue; }
    const tId = teamByName.get(norm(name));
    if (tId) { byTeam[tId] = (byTeam[tId] || 0) + khoan; continue; }
    notFound.push(name);
  }

  // memberCount (hiển thị) — số NV thuộc Xưởng / Tổ.
  const dCounts = await prisma.employee.groupBy({ by: ["departmentId"], _count: { _all: true } });
  const dCountMap = new Map(dCounts.map((c) => [c.departmentId, c._count._all]));
  const tCounts = await prisma.employee.groupBy({ by: ["teamId"], _count: { _all: true } });
  const tCountMap = new Map(tCounts.map((c) => [c.teamId, c._count._all]));

  await prisma.$transaction([
    prisma.pieceRateRecord.deleteMany({ where: { month: period.month, year: period.year } }),
    prisma.pieceRateRecord.createMany({
      data: [
        ...Object.entries(byDept).map(([departmentId, amount]) => ({
          departmentId, teamId: null, month: period.month, year: period.year,
          projectCode: "IMPORT-KHOAN", totalHours: 0, unitPrice: 0, completionRate: 1,
          totalAmount: amount, memberCount: dCountMap.get(departmentId) || 0,
        })),
        ...Object.entries(byTeam).map(([teamId, amount]) => ({
          teamId, month: period.month, year: period.year,
          projectCode: "IMPORT-KHOAN", totalHours: 0, unitPrice: 0, completionRate: 1,
          totalAmount: amount, memberCount: tCountMap.get(teamId) || 0,
        })),
      ],
    }),
  ]);

  return NextResponse.json({ data: { imported: Object.keys(byDept).length + Object.keys(byTeam).length, notFound: notFound.length, notFoundNames: notFound.slice(0, 20) } });
}
