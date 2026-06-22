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
  if (!canViewPayroll((session.user as any).employeeCode)) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }
  const { id } = await params;
  const period = await prisma.payrollPeriod.findUnique({ where: { id } });
  if (!period) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });

  const teams = await prisma.productionTeam.findMany({
    select: { id: true, name: true, department: { select: { name: true } } },
    orderBy: { name: "asc" },
  });
  const existing = await prisma.pieceRateRecord.findMany({ where: { month: period.month, year: period.year }, select: { teamId: true, totalAmount: true } });
  const exMap = new Map<string, number>();
  for (const e of existing) exMap.set(e.teamId, (exMap.get(e.teamId) || 0) + e.totalAmount);

  const aoa: any[][] = [["Tổ", "Phòng ban", "Lương khoán"]];
  for (const t of teams) aoa.push([t.name, t.department?.name || "", exMap.get(t.id) || 0]);
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 24 }, { wch: 20 }, { wch: 18 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "KhoanTheoTo");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="khoan-theo-to-T${period.month}-${period.year}.xlsx"`,
    },
  });
}

// POST — import Khoán theo Tổ: thay thế toàn bộ khoán của kỳ (idempotent).
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (!canViewPayroll((session.user as any).employeeCode)) {
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
  let hi = -1;
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    if (findCol(rows[i], ["to", "team", "tổ"]) >= 0 && findCol(rows[i], ["khoan", "so tien", "amount"]) >= 0) { hi = i; break; }
  }
  if (hi < 0) return NextResponse.json({ error: { code: "BAD_FORMAT", message: "Không tìm thấy cột 'Tổ' và 'Lương khoán'" } }, { status: 422 });
  const teamCol = findCol(rows[hi], ["to", "team", "tổ"]);
  const khoanCol = findCol(rows[hi], ["khoan", "so tien", "amount"]);

  const teams = await prisma.productionTeam.findMany({ select: { id: true, name: true } });
  const nameToId = new Map(teams.map((t) => [norm(t.name), t.id]));

  const byTeam: Record<string, number> = {};
  const notFound: string[] = [];
  for (let i = hi + 1; i < rows.length; i++) {
    const teamName = String(rows[i][teamCol] ?? "").trim();
    if (!teamName) continue;
    const khoan = toInt(rows[i][khoanCol]);
    const teamId = nameToId.get(norm(teamName));
    if (!teamId) { notFound.push(teamName); continue; }
    byTeam[teamId] = (byTeam[teamId] || 0) + khoan;
  }

  // memberCount cho từng tổ (để hiển thị) — số NV thuộc tổ.
  const counts = await prisma.employee.groupBy({ by: ["teamId"], _count: { _all: true } });
  const countMap = new Map(counts.map((c) => [c.teamId, c._count._all]));

  await prisma.$transaction([
    prisma.pieceRateRecord.deleteMany({ where: { month: period.month, year: period.year } }),
    prisma.pieceRateRecord.createMany({
      data: Object.entries(byTeam).map(([teamId, amount]) => ({
        teamId, month: period.month, year: period.year,
        projectCode: "IMPORT-KHOAN", totalHours: 0, unitPrice: 0, completionRate: 1,
        totalAmount: amount, memberCount: countMap.get(teamId) || 0,
      })),
    }),
  ]);

  return NextResponse.json({ data: { imported: Object.keys(byTeam).length, notFound: notFound.length, notFoundNames: notFound.slice(0, 20) } });
}
