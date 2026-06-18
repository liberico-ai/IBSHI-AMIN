import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canManageVpp } from "@/lib/access";

// POST — "Cấp VPP": cấp phát tất cả yêu cầu ĐÃ DUYỆT (APPROVED) → COMPLETED.
// HCNS không quản lý tồn kho nên KHÔNG trừ tồn, chỉ đánh dấu đã cấp.
export async function POST(_req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (!canManageVpp((session.user as any).role, (session.user as any).employeeCode)) {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Không có quyền cấp VPP" } }, { status: 403 });
  }
  const userId = (session.user as any).id;

  const result = await prisma.$transaction(async (tx) => {
    const pending = await tx.stationeryRequest.findMany({ where: { status: "APPROVED" }, select: { id: true } });
    const ids = pending.map((p) => p.id);
    if (ids.length === 0) return { issued: 0 };
    // Cấp đủ toàn bộ: issuedQuantity = quantity cho mọi dòng còn thiếu
    await tx.$executeRaw`UPDATE "StationeryRequestItem" SET "issuedQuantity" = "quantity" WHERE "requestId" = ANY(${ids}::text[]) AND "issuedQuantity" < "quantity"`;
    const r = await tx.stationeryRequest.updateMany({ where: { id: { in: ids } }, data: { status: "COMPLETED", completedById: userId, completedAt: new Date() } });
    return { issued: r.count };
  });

  return NextResponse.json({ data: result });
}
