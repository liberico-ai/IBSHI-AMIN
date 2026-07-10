import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canDo } from "@/lib/permissions";
import { canUser } from "@/lib/permission-catalog";

type RecordInput = {
  employeeCode: string;
  date: string;
  workHours: number;        // HC N — công hành chính ca ngày
  otHours: number;          // Thêm giờ N — tăng ca ca ngày
  nightHours?: number;      // HC Đ — công hành chính ca đêm
  otNightHours?: number;    // Thêm giờ Đ — tăng ca ca đêm
  status?: string;
  paidLeaveDays?: number;   // ngày nghỉ phép có lương (AL) trong ngày: 0/0.5/1
  leaveCode?: string | null; // mã nghỉ gốc (AL/UL/SL/ML/MC/L...)
};

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

    if (!canUser(session.user as any, "m3.bangcong:edit")) {
      return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
    }

    const body = await request.json();
    const { month, year, records } = body as { month: number; year: number; records: RecordInput[] };

    if (!Array.isArray(records) || records.length === 0 || !month || !year) {
      return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Dữ liệu không hợp lệ" } }, { status: 400 });
    }

    // Defensive: từ chối record có workHours hoặc otHours bất thường (1 ngày max 24h)
    // Bảo vệ DB khỏi lỗi parse Excel nhầm cột (vd mã NV / Excel-date-serial bị đẩy vào workHours).
    const bad = records.filter((r) => {
      const vals = [r.workHours, r.otHours, r.nightHours ?? 0, r.otNightHours ?? 0].map(Number);
      return vals.some((v) => !Number.isFinite(v) || v < 0 || v > 24);
    });
    if (bad.length > 0) {
      const sample = bad.slice(0, 3).map((r) => `${r.employeeCode} ngày ${r.date} (work=${r.workHours}, ot=${r.otHours})`).join("; ");
      return NextResponse.json(
        {
          error: {
            code: "INVALID_HOURS",
            message: `Phát hiện ${bad.length}/${records.length} dòng có giờ làm bất thường (>24h hoặc âm). File Excel có thể bị nhầm cột. Mẫu: ${sample}`,
          },
        },
        { status: 400 }
      );
    }

    // Resolve employee codes → IDs
    // Excel uses ERP numeric codes (e.g. "190342").
    // DB lookup order: User.erpCode (direct match) → User.employeeCode nv-prefixed match
    const codes = Array.from(new Set(records.map((r) => r.employeeCode)));
    const nvCodes = codes.map((c) => `nv${c}`);

    const employees = await prisma.employee.findMany({
      where: {
        user: {
          OR: [
            { erpCode: { in: codes } },            // erpCode direct match (primary)
            { employeeCode: { in: codes } },        // employeeCode exact match
            { employeeCode: { in: nvCodes } },      // employeeCode nv-prefixed match
          ],
        },
      },
      select: { id: true, user: { select: { employeeCode: true, erpCode: true } } },
    });

    // Map original code → employee ID
    const codeToId = new Map<string, string>();
    for (const emp of employees) {
      const erpCode = emp.user?.erpCode;
      const empCode = emp.user?.employeeCode ?? "";
      if (erpCode) codeToId.set(erpCode, emp.id);
      const numericCode = empCode.startsWith("nv") ? empCode.slice(2) : empCode;
      codeToId.set(numericCode, emp.id);
      codeToId.set(empCode, emp.id);
    }

    const missingCodes = codes.filter((c) => !codeToId.has(c));
    const skippedRecords = records.filter((r) => !codeToId.has(r.employeeCode)).length;

    const createdBy = (session.user as any).id;
    let created = 0;

    // ── XOÁ dữ liệu chấm công CŨ của tháng (chỉ các NV CÓ trong file) trước khi nạp lại ──
    // Tránh dữ liệu rác từ lần import trước: nếu file mới bỏ bớt 1 ngày (vd xoá 1 chủ nhật OT),
    // bản ghi cũ ngày đó vẫn nằm lại nếu chỉ upsert. Xoá theo employeeId trong file →
    // không ảnh hưởng NV của file khác (trực tiếp / gián tiếp nhập riêng).
    const empIdsInFile = Array.from(new Set(
      records.map((r) => codeToId.get(r.employeeCode)).filter((x): x is string => !!x)
    ));
    if (empIdsInFile.length > 0) {
      const monthStart = new Date(Date.UTC(year, month - 1, 1));
      const monthEnd = new Date(Date.UTC(year, month, 1));
      await prisma.attendanceRecord.deleteMany({
        where: { employeeId: { in: empIdsInFile }, date: { gte: monthStart, lt: monthEnd } },
      });
    }

    // Batch upserts (10 at a time)
    for (let i = 0; i < records.length; i += 10) {
      const chunk = records.slice(i, i + 10);
      await Promise.all(
        chunk.map(async (r) => {
          const employeeId = codeToId.get(r.employeeCode);
          if (!employeeId) return;

          const date = new Date(r.date);
          const paidLeaveDays = r.paidLeaveDays ?? 0;
          const nightHours = r.nightHours ?? 0;
          const otNightHours = r.otNightHours ?? 0;
          // Trạng thái theo TỔNG giờ hành chính ngày + đêm (NV ca đêm có workHours=0 nhưng nightHours>0).
          //   >=7h → PRESENT; >0 → HALF_DAY; có nghỉ phép có lương → ABSENT_APPROVED(_HALF); còn lại = vắng không phép.
          const presentHours = (r.workHours || 0) + nightHours;
          const status = r.status ?? (
            presentHours >= 7 ? "PRESENT"
            : presentHours > 0 ? "HALF_DAY"
            : paidLeaveDays >= 1 ? "ABSENT_APPROVED"
            : paidLeaveDays > 0 ? "ABSENT_APPROVED_HALF"
            : "ABSENT_UNAPPROVED"
          );

          await prisma.attendanceRecord.upsert({
            where: { employeeId_date: { employeeId, date } },
            create: { employeeId, date, status: status as any, workHours: r.workHours, otHours: r.otHours, nightHours, otNightHours, paidLeaveDays, leaveCode: r.leaveCode ?? null, createdBy },
            update: { status: status as any, workHours: r.workHours, otHours: r.otHours, nightHours, otNightHours, paidLeaveDays, leaveCode: r.leaveCode ?? null },
          });
          created++;
        })
      );
    }

    return NextResponse.json({
      created,
      skipped: skippedRecords,
      missingCodes: missingCodes.length > 0 ? missingCodes : undefined,
    });
  } catch (err) {
    console.error("POST /api/v1/attendance/import-office error:", err);
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: String(err) } }, { status: 500 });
  }
}
