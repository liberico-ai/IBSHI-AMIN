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
          // If caller didn't supply a status, derive from workHours.
          // <4h with no explicit status is ambiguous (could be partial half-day, could be absent);
          // default to HALF_DAY rather than PRESENT so it doesn't silently overstate attendance.
          const status = r.status ?? (r.workHours >= 8 ? "PRESENT" : r.workHours > 0 ? "HALF_DAY" : "ABSENT_UNAPPROVED");

          await prisma.attendanceRecord.upsert({
            where: { employeeId_date: { employeeId, date } },
            create: { employeeId, date, status: status as any, workHours: r.workHours, otHours: r.otHours, createdBy },
            update: { status: status as any, workHours: r.workHours, otHours: r.otHours },
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
