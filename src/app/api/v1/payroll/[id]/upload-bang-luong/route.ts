// POST /api/v1/payroll/[id]/upload-bang-luong
//
// Upload file Excel "Bảng lương" của HR + parse 2 sheet:
//   - Chi tiết lương: AT (lương khoán), AZ (tiền ăn TG), BE (BS điều chỉnh) cho từng NV
//   - Thêm giờ:       giờ OT từng ngày cho từng NV
//
// 2 modes:
//   ?mode=preview   → chỉ parse + trả về JSON, KHÔNG ghi DB
//   ?mode=confirm   → ghi vào PayrollManualInput + tạo/xoá OTRequest cho ngày CN+Lễ
//                     (idempotent: xoá hết PayrollManualInput + OTRequest đã import của kỳ này, ghi mới)

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canViewPayroll } from "@/lib/access";
import { parseHRBangLuong, classifyDay } from "@/lib/hr-excel-parser";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OT_REQUEST_REASON_TAG = "HR Excel import";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (!canViewPayroll((session.user as any).employeeCode)) {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Bạn không có quyền truy cập mục Lương" } }, { status: 403 });
  }

  const { id } = await params;
  const period = await prisma.payrollPeriod.findUnique({ where: { id } });
  if (!period) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Không tìm thấy kỳ lương" } }, { status: 404 });

  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("mode") || "preview";
  if (!["preview", "confirm"].includes(mode)) {
    return NextResponse.json({ error: { code: "BAD_REQUEST", message: "mode phải là 'preview' hoặc 'confirm'" } }, { status: 400 });
  }

  // Parse multipart form-data
  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: { code: "NO_FILE", message: "Thiếu file Excel" } }, { status: 400 });
  const buf = await file.arrayBuffer();

  let parsed;
  try {
    parsed = parseHRBangLuong(buf, period.month);
  } catch (e: any) {
    return NextResponse.json({ error: { code: "PARSE_ERROR", message: e.message || "Không parse được file Excel" } }, { status: 422 });
  }

  // Match Mã NV với Employee.code trong DB
  const codes = parsed.rows.map((r) => r.code);
  const employees = await prisma.employee.findMany({
    where: { code: { in: codes } },
    select: { id: true, code: true, fullName: true },
  });
  const empByCode = new Map(employees.map((e) => [e.code, e]));

  // Tính số liệu để preview
  const matched: any[] = [];
  const notFound: { code: string; name: string }[] = [];
  let totalOTRequests = 0;

  for (const r of parsed.rows) {
    const emp = empByCode.get(r.code);
    if (!emp) {
      notFound.push({ code: r.code, name: r.name });
      continue;
    }
    // Đếm số OTRequest sẽ tạo cho NV này
    let otRequestCount = 0;
    let otRequestHours = 0;
    for (const day of Object.keys(r.otByDate).map(Number)) {
      const cls = classifyDay(period.year, period.month, day);
      if (cls.importToOTRequest) {
        otRequestCount++;
        otRequestHours += r.otByDate[day];
      }
    }
    matched.push({
      code: r.code, fullName: emp.fullName,
      pieceRate: r.pieceRate, mealBonus: r.mealBonus, adjustment: r.adjustment,
      otRequestCount, otRequestHours,
    });
    totalOTRequests += otRequestCount;
  }

  if (mode === "preview") {
    return NextResponse.json({
      data: {
        period: { month: period.month, year: period.year, status: period.status },
        summary: {
          totalNVs: parsed.totalNVs,
          matchedNVs: matched.length,
          notFoundNVs: notFound.length,
          totalPieceRate: parsed.totalPieceRate,
          totalMealBonus: parsed.totalMealBonus,
          totalAdjustment: parsed.totalAdjustment,
          totalOtHoursInExcel: parsed.totalOtHours,
          totalOTRequestsWillCreate: totalOTRequests,
        },
        matched: matched.slice(0, 50),  // preview 50 NV đầu
        matchedTotalCount: matched.length,
        notFound,
      },
    });
  }

  // ── mode = confirm ──
  // Idempotent: xoá hết PayrollManualInput cũ + OTRequest cũ của kỳ này, rồi ghi mới
  const start = new Date(Date.UTC(period.year, period.month - 1, 1));
  const end = new Date(Date.UTC(period.year, period.month, 0, 23, 59, 59));

  let createdMI = 0, createdOT = 0;

  // Lấy attendance cho tất cả NV — để tránh double count OTRequest với attendance ngày CN/Lễ
  const empIds = matched.map((m) => empByCode.get(m.code)!.id);
  const allAtt = await prisma.attendanceRecord.findMany({
    where: { employeeId: { in: empIds }, date: { gte: start, lte: end } },
    select: { employeeId: true, date: true, workHours: true, otHours: true },
  });
  const attendanceCovered = new Set<string>();
  for (const a of allAtt) {
    if ((a.workHours || 0) + (a.otHours || 0) > 0) {
      const ymd = a.date.toISOString().slice(0, 10);
      attendanceCovered.add(`${a.employeeId}|${ymd}`);
    }
  }

  await prisma.$transaction(async (tx) => {
    // 1. Xoá manual input cũ
    await tx.payrollManualInput.deleteMany({ where: { month: period.month, year: period.year } });
    // 2. Xoá OTRequest đã import cũ
    await tx.oTRequest.deleteMany({
      where: { date: { gte: start, lte: end }, reason: { contains: OT_REQUEST_REASON_TAG } },
    });

    // 3. Ghi mới
    for (const r of parsed.rows) {
      const emp = empByCode.get(r.code);
      if (!emp) continue;
      // PayrollManualInput
      if (r.pieceRate || r.mealBonus || r.adjustment) {
        await tx.payrollManualInput.create({
          data: {
            employeeId: emp.id, month: period.month, year: period.year,
            pieceRate: r.pieceRate, mealBonus: r.mealBonus, adjustment: r.adjustment,
            note: `${OT_REQUEST_REASON_TAG} ${period.month}/${period.year}`,
          },
        });
        createdMI++;
      }
      // OTRequest cho ngày CN/Lễ — skip nếu attendance đã có wh+oh > 0 (tránh double count)
      for (const dayStr of Object.keys(r.otByDate)) {
        const day = Number(dayStr);
        const hours = r.otByDate[day];
        const cls = classifyDay(period.year, period.month, day);
        if (!cls.importToOTRequest) continue;
        const ymd = `${period.year}-${String(period.month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        if (attendanceCovered.has(`${emp.id}|${ymd}`)) continue;
        await tx.oTRequest.create({
          data: {
            employeeId: emp.id,
            date: new Date(Date.UTC(period.year, period.month - 1, day, 12, 0, 0)),
            startTime: "17:00", endTime: "21:00",
            hours, otRate: cls.otRate,
            reason: `${OT_REQUEST_REASON_TAG} ${period.month}/${period.year} (ngày ${day})`,
            status: "APPROVED",
            approvedBy: (session.user as any).id,
          },
        });
        createdOT++;
      }
    }
  }, { timeout: 60_000 });

  return NextResponse.json({
    data: {
      period: { month: period.month, year: period.year },
      imported: { manualInputs: createdMI, otRequests: createdOT },
      notFound,
    },
  });
}
