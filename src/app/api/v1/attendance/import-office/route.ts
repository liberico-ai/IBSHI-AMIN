import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canDo } from "@/lib/permissions";

type RecordInput = {
  employeeCode: string;
  date: string;
  workHours: number;
  otHours: number;
  status?: string;
  paidLeaveDays?: number;   // ngày nghỉ phép có lương (AL) trong ngày: 0/0.5/1
  leaveCode?: string | null; // mã nghỉ gốc (AL/UL/SL/ML/L)
};

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

    const userRole = (session.user as any).role;
    if (!canDo(userRole, "attendance", "bulkUpsert")) {
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
      const wh = Number(r.workHours);
      const oh = Number(r.otHours);
      return !Number.isFinite(wh) || !Number.isFinite(oh) || wh < 0 || oh < 0 || wh > 24 || oh > 24;
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

    // Batch upserts (10 at a time)
    for (let i = 0; i < records.length; i += 10) {
      const chunk = records.slice(i, i + 10);
      await Promise.all(
        chunk.map(async (r) => {
          const employeeId = codeToId.get(r.employeeCode);
          if (!employeeId) return;

          const date = new Date(r.date);
          const paidLeaveDays = r.paidLeaveDays ?? 0;
          // Derive status:
          //   >=7h → PRESENT; >0 → HALF_DAY; nếu không làm nhưng có nghỉ phép có lương → ABSENT_APPROVED(_HALF);
          //   còn lại = vắng không phép. (Ngưỡng 7h vì file ghi 7.5–7.95h cho ngày đủ.)
          const status = r.status ?? (
            r.workHours >= 7 ? "PRESENT"
            : r.workHours > 0 ? "HALF_DAY"
            : paidLeaveDays >= 1 ? "ABSENT_APPROVED"
            : paidLeaveDays > 0 ? "ABSENT_APPROVED_HALF"
            : "ABSENT_UNAPPROVED"
          );

          await prisma.attendanceRecord.upsert({
            where: { employeeId_date: { employeeId, date } },
            create: { employeeId, date, status: status as any, workHours: r.workHours, otHours: r.otHours, paidLeaveDays, leaveCode: r.leaveCode ?? null, createdBy },
            update: { status: status as any, workHours: r.workHours, otHours: r.otHours, paidLeaveDays, leaveCode: r.leaveCode ?? null },
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
