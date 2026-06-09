import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

// Xác nhận đã nhận đủ VPP — chuyển sang COMPLETED + trừ tồn kho.
// Người ĐỀ XUẤT (requester) bấm Xác nhận sau khi phiếu đã APPROVED (BOM/HR_ADMIN xác nhận thay được).
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const userId = (session.user as any).id;
  const { id } = await params;

  const req = await prisma.stationeryRequest.findUnique({
    where: { id },
    include: { items: true },
  });
  if (!req) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  if (req.status !== "APPROVED")
    return NextResponse.json({ error: { code: "INVALID_STATE", message: "Phiếu chưa được duyệt" } }, { status: 400 });

  // Chỉ NGƯỜI ĐỀ XUẤT (requester) được xác nhận đã nhận đủ VPP. BOM/HR_ADMIN xác nhận thay (admin).
  const meEmp = await prisma.employee.findFirst({ where: { userId }, select: { id: true } });
  const isRequester = !!meEmp && meEmp.id === req.requesterEmployeeId;
  if (!isRequester && !["HR_ADMIN", "BOM"].includes((session.user as any).role))
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Chỉ người đề xuất mới được xác nhận đã nhận VPP" } }, { status: 403 });

  // Validate tồn kho tại thời điểm hoàn thành (có thể đã đổi từ lúc tạo)
  for (const it of req.items) {
    const item = await prisma.stationeryItem.findUnique({ where: { id: it.itemId } });
    if (!item || item.currentStock < it.quantity) {
      return NextResponse.json({
        error: {
          code: "INSUFFICIENT_STOCK",
          message: `"${item?.name ?? "?"}" tồn ${item?.currentStock ?? 0}, yêu cầu ${it.quantity}`,
        },
      }, { status: 400 });
    }
  }

  const data = await prisma.$transaction(async (tx) => {
    for (const it of req.items) {
      await tx.stationeryItem.update({
        where: { id: it.itemId },
        data: { currentStock: { decrement: it.quantity } },
      });
    }
    return tx.stationeryRequest.update({
      where: { id },
      data: { status: "COMPLETED", completedById: userId, completedAt: new Date() },
    });
  });

  return NextResponse.json({ data });
}
