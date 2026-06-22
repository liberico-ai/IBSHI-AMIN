import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

// Xác nhận đã nhận VPP — chỉ xác nhận phần ĐÃ ĐƯỢC CẤP PHÁT (issuedQuantity), từng phần.
// Người ĐỀ XUẤT (requester) bấm Xác nhận (BOM/HR_ADMIN xác nhận thay được).
// VPP KHÔNG quản lý tồn kho → không check/trừ tồn. Cấp/nhận theo số lượng yêu cầu.
// Phiếu chỉ chuyển COMPLETED khi MỌI item đã cấp đủ (issuedQuantity >= quantity); chưa đủ thì giữ APPROVED.
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

  // Chỉ NGƯỜI ĐỀ XUẤT (requester) được xác nhận đã nhận VPP. BOM/HR_ADMIN xác nhận thay (admin).
  const meEmp = await prisma.employee.findFirst({ where: { userId }, select: { id: true } });
  const isRequester = !!meEmp && meEmp.id === req.requesterEmployeeId;
  if (!isRequester && !["HR_ADMIN", "BOM", "ADMIN"].includes((session.user as any).role))
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Chỉ người đề xuất mới được xác nhận đã nhận VPP" } }, { status: 403 });

  // Phần cần xác nhận của mỗi item = đã cấp − đã xác nhận trước đó (>= 0)
  const toConfirm = req.items.filter((it) => it.issuedQuantity > it.confirmedQuantity);
  if (toConfirm.length === 0)
    return NextResponse.json({ error: { code: "NOTHING_TO_CONFIRM", message: "Chưa có vật phẩm nào được cấp phát để xác nhận" } }, { status: 400 });

  // Đã cấp đủ TẤT CẢ item? (sau khi xác nhận, confirmedQuantity = issuedQuantity)
  const fullyIssued = req.items.every((it) => it.issuedQuantity >= it.quantity);

  const data = await prisma.$transaction(async (tx) => {
    for (const it of toConfirm) {
      await tx.stationeryRequestItem.update({ where: { id: it.id }, data: { confirmedQuantity: it.issuedQuantity } });
    }
    if (fullyIssued) {
      return tx.stationeryRequest.update({
        where: { id },
        data: { status: "COMPLETED", completedById: userId, completedAt: new Date() },
      });
    }
    // Chưa cấp đủ → giữ nguyên trạng thái APPROVED (phiếu vẫn tồn tại để cấp tiếp)
    return tx.stationeryRequest.findUnique({ where: { id } });
  });

  return NextResponse.json({ data, meta: { completed: fullyIssued } });
}
