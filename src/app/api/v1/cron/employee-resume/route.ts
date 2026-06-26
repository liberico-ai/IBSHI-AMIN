import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// POST /api/v1/cron/employee-resume
// NV "Tạm nghỉ" (ON_LEAVE) đã QUA ngày kết thúc tạm nghỉ (suspendedTo) → tự chuyển về "Đang làm việc" (ACTIVE).
// Chạy daily (gợi ý 00:30 hoặc 07:00 sáng).
export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-cron-secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }

  // Mốc 00:00 hôm nay (UTC) — "qua ngày kết thúc" = suspendedTo < đầu ngày hôm nay.
  const now = new Date();
  const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));

  const due = await prisma.employee.findMany({
    where: { status: "ON_LEAVE", suspendedTo: { not: null, lt: startOfToday } },
    select: { id: true, code: true, fullName: true, suspendedTo: true },
  });

  if (due.length === 0) return NextResponse.json({ data: { resumed: 0 } });

  await prisma.employee.updateMany({
    where: { status: "ON_LEAVE", suspendedTo: { not: null, lt: startOfToday } },
    data: { status: "ACTIVE", suspendedFrom: null, suspendedTo: null },
  });

  return NextResponse.json({
    data: { resumed: due.length, employees: due.map((e) => ({ code: e.code, fullName: e.fullName })) },
  });
}
