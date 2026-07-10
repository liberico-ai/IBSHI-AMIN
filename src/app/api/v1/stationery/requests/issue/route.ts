import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canManageVpp } from "@/lib/access";
import { canUser } from "@/lib/permission-catalog";
import { z } from "zod";

// POST — "Cấp phát" chọn lọc: cấp 1 phần/đủ cho từng VPP. Phân bổ số lượng cấp vào các
// dòng yêu cầu (theo thứ tự cũ→mới, FIFO). Yêu cầu nào cấp đủ TẤT CẢ item → COMPLETED.
const Schema = z.object({
  items: z.array(z.object({ itemId: z.string().uuid(), quantity: z.number().positive() })).min(1),
});

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (!canUser(session.user as any, "m10.vpp:approve")) {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Không có quyền cấp VPP" } }, { status: 403 });
  }
  const body = Schema.parse(await request.json());

  // Chỉ CẤP PHÁT (set issuedQuantity). KHÔNG tự chuyển COMPLETED —
  // phiếu chỉ hoàn tất khi NGƯỜI YÊU CẦU bấm "Xác nhận đã nhận" (xem complete route).
  await prisma.$transaction(async (tx) => {
    for (const { itemId, quantity } of body.items) {
      // Các dòng yêu cầu của VPP này còn thiếu (chưa cấp đủ), thuộc phiếu chưa hoàn thành — cũ trước
      const lines = await tx.stationeryRequestItem.findMany({
        where: { itemId, request: { status: "APPROVED" } },
        include: { request: { select: { id: true, createdAt: true } } },
        orderBy: { request: { createdAt: "asc" } },
      });
      let toIssue = quantity;
      for (const line of lines) {
        if (toIssue <= 0) break;
        const remaining = line.quantity - line.issuedQuantity;
        if (remaining <= 0) continue;
        const give = Math.min(remaining, toIssue);
        await tx.stationeryRequestItem.update({ where: { id: line.id }, data: { issuedQuantity: line.issuedQuantity + give } });
        toIssue -= give;
      }
    }
  });

  return NextResponse.json({ data: { ok: true } });
}
