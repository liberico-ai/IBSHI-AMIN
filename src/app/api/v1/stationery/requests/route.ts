import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { isStationeryApprover } from "@/lib/stationery";

const ItemSchema = z.object({
  itemId: z.string().uuid(),
  quantity: z.number().positive(),
  note: z.string().optional().nullable(),
});

const CreateSchema = z.object({
  requesterEmployeeId: z.string().uuid(),
  reason: z.string().min(1),
  fileUrl: z.string().min(1), // bắt buộc đính kèm file Đề nghị VPP
  items: z.array(ItemSchema).min(1),
});

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const userId = (session.user as any).id;
  const canApprove = await isStationeryApprover(userId);

  // Mặc định: HCNS staff chỉ thấy phiếu mình tạo. TP HCNS / BOM thấy tất cả.
  const where = canApprove ? {} : { createdById: userId };

  const data = await prisma.stationeryRequest.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      requester: { select: { id: true, code: true, fullName: true, department: { select: { name: true } }, position: { select: { name: true } } } },
      items: { include: { item: { select: { id: true, name: true, unit: true, currentStock: true } } } },
    },
  });
  return NextResponse.json({ data, canApprove });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (!["HR_ADMIN", "BOM"].includes((session.user as any).role))
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });

  const body = CreateSchema.parse(await request.json());
  const userId = (session.user as any).id;

  // Validate đủ tồn cho mỗi item (Q1 chọn A: báo lỗi nếu xuất quá tồn)
  for (const it of body.items) {
    const item = await prisma.stationeryItem.findUnique({ where: { id: it.itemId } });
    if (!item) return NextResponse.json({ error: { code: "ITEM_NOT_FOUND", message: "Item không tồn tại" } }, { status: 400 });
    if (item.currentStock < it.quantity) {
      return NextResponse.json({
        error: {
          code: "INSUFFICIENT_STOCK",
          message: `"${item.name}" chỉ còn ${item.currentStock} ${item.unit} (yêu cầu ${it.quantity})`,
        },
      }, { status: 400 });
    }
  }

  const req = await prisma.stationeryRequest.create({
    data: {
      requesterEmployeeId: body.requesterEmployeeId,
      reason: body.reason,
      fileUrl: body.fileUrl,
      createdById: userId,
      items: { create: body.items.map((it) => ({ itemId: it.itemId, quantity: it.quantity, note: it.note ?? null })) },
    },
  });
  return NextResponse.json({ data: req }, { status: 201 });
}

