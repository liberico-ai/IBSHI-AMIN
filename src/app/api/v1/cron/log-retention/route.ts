import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// POST /api/v1/cron/log-retention
// Tự động XÓA nhật ký hoạt động (AuditLog) quá 90 ngày. Chạy daily (gợi ý 03:00 sáng).
// Bảo vệ bằng header x-cron-secret = CRON_SECRET (như các cron khác).
// Thêm ?dryRun=1 để CHỈ ĐẾM số bản ghi sẽ xóa (không xóa) — xem trước.
const RETENTION_DAYS = 90;
const BATCH = 5000;

export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-cron-secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }

  const dryRun = ["1", "true"].includes(request.nextUrl.searchParams.get("dryRun") || "");
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);

  if (dryRun) {
    const count = await prisma.auditLog.count({ where: { createdAt: { lt: cutoff } } });
    return NextResponse.json({ data: { dryRun: true, retentionDays: RETENTION_DAYS, cutoff: cutoff.toISOString(), willDelete: count } });
  }

  // Xóa theo lô để tránh khóa bảng lâu khi log lớn.
  let deleted = 0;
  for (;;) {
    const ids = await prisma.auditLog.findMany({ where: { createdAt: { lt: cutoff } }, select: { id: true }, take: BATCH });
    if (ids.length === 0) break;
    const r = await prisma.auditLog.deleteMany({ where: { id: { in: ids.map((x) => x.id) } } });
    deleted += r.count;
    if (ids.length < BATCH) break;
  }

  return NextResponse.json({ data: { dryRun: false, retentionDays: RETENTION_DAYS, cutoff: cutoff.toISOString(), deleted } });
}
