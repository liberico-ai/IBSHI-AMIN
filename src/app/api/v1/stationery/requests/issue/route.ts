import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";

// POST — "Cấp phát" chọn lọc: cấp 1 phần/đủ cho từng VPP. Phân bổ số lượng cấp vào các
// dòng yêu cầu (theo thứ tự cũ→mới, FIFO). Yêu cầu nào cấp đủ TẤT CẢ item → COMPLETED.
const Schema = z.object({
  items: z.array(z.object({ itemId: z.string().uuid(), quantity: z.number().positive() })).min(1),
});

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const role = (session.user as any).role;
  if (!["HR_ADMIN", "BOM"].includes(role)) {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Chỉ HCNS được cấp VPP" } }, { status: 403 });
  }
  const userId = (session.user as any).id;
  const body = Schema.parse(await request.json());

  const affectedRequestIds = new Set<string>();

  await prisma.$transaction(async (tx) => {
    for (const { itemId, quantity } of body.items) {
      // Các dòng yêu cầu của VPP này còn thiếu (chưa cấp đủ), thuộc phiếu chưa hoàn thành — cũ trước
      const lines = await tx.stationeryRequestItem.findMany({
        where: { itemId, request: { status: { in: ["PENDING_APPROVAL", "APPROVED"] } } },
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
        affectedRequestIds.add(line.requestId);
      }
    }

    // Phiếu nào đã cấp đủ TẤT CẢ item → COMPLETED
    for (const reqId of Array.from(affectedRequestIds)) {
      const items = await tx.stationeryRequestItem.findMany({ where: { requestId: reqId }, select: { quantity: true, issuedQuantity: true } });
      const allIssued = items.every((i) => i.issuedQuantity >= i.quantity);
      if (allIssued) {
        await tx.stationeryRequest.update({ where: { id: reqId }, data: { status: "COMPLETED", completedById: userId, completedAt: new Date() } });
      }
    }
  });

  return NextResponse.json({ data: { ok: true } });
}
