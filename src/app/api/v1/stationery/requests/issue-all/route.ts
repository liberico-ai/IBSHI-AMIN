import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canManageVpp } from "@/lib/access";
import { canUser } from "@/lib/permission-catalog";

// POST — "Cấp phát toàn bộ": cấp đủ TẤT CẢ yêu cầu ĐÃ DUYỆT (issuedQuantity = quantity).
// KHÔNG tự chuyển COMPLETED — phiếu chỉ hoàn tất khi NGƯỜI YÊU CẦU bấm "Xác nhận đã nhận".
// HCNS không quản lý tồn kho nên KHÔNG trừ tồn.
export async function POST(_req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (!canUser(session.user as any, "m10.vpp.denghi:approve")) {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Không có quyền cấp VPP" } }, { status: 403 });
  }

  const result = await prisma.$transaction(async (tx) => {
    const pending = await tx.stationeryRequest.findMany({ where: { status: "APPROVED" }, select: { id: true } });
    const ids = pending.map((p) => p.id);
    if (ids.length === 0) return { issued: 0 };
    // Cấp đủ toàn bộ: issuedQuantity = quantity cho mọi dòng còn thiếu. Giữ nguyên trạng thái APPROVED.
    await tx.$executeRaw`UPDATE "StationeryRequestItem" SET "issuedQuantity" = "quantity" WHERE "requestId" = ANY(${ids}::text[]) AND "issuedQuantity" < "quantity"`;
    return { issued: ids.length };
  });

  return NextResponse.json({ data: result });
}
