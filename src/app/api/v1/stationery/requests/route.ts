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
  requesterEmployeeId: z.string().uuid().optional(),  // bỏ trống = NV đang đăng nhập tự yêu cầu
  reason: z.string().optional().nullable(),
  fileUrl: z.string().optional().nullable(),           // không còn bắt buộc file đề nghị
  items: z.array(ItemSchema).min(1),
});

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const userId = (session.user as any).id;
  const canApprove = await isStationeryApprover(userId);

  // Toàn quyền (3 người chỉ định + BGĐ) → thấy TẤT CẢ.
  // Nhân sự thường → chỉ thấy yêu cầu + lịch sử của PHÒNG mình (theo phòng của người yêu cầu).
  let where: any = {};
  if (!canApprove) {
    const meEmp = await prisma.employee.findFirst({ where: { userId }, select: { departmentId: true } });
    where = meEmp?.departmentId
      ? { requester: { departmentId: meEmp.departmentId } }
      : { createdById: userId }; // không có phòng → chỉ thấy phiếu của mình
  }

  // Filter theo trạng thái + khoảng ngày (createdAt).
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  if (status) where.status = status;
  if (from || to) {
    where.createdAt = {
      ...(from && { gte: new Date(new Date(from).setHours(0, 0, 0, 0)) }),
      ...(to && { lte: new Date(new Date(to).setHours(23, 59, 59, 999)) }),
    };
  }

  const data = await prisma.stationeryRequest.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      requester: { select: { id: true, code: true, fullName: true, department: { select: { name: true } }, position: { select: { name: true } } } },
      items: { include: { item: { select: { id: true, name: true, unit: true, note: true, currentStock: true } } } },
    },
  });
  return NextResponse.json({ data, canApprove });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const body = CreateSchema.parse(await request.json());
  const userId = (session.user as any).id;

  // Người yêu cầu: nếu không truyền → NV của user đang đăng nhập (user phòng ban tự tạo)
  let requesterEmployeeId = body.requesterEmployeeId;
  if (!requesterEmployeeId) {
    const me = await prisma.employee.findFirst({ where: { userId }, select: { id: true } });
    if (!me) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Không tìm thấy hồ sơ nhân viên của bạn" } }, { status: 404 });
    requesterEmployeeId = me.id;
  }

  // HCNS không quản lý tồn kho → KHÔNG chặn theo tồn. Chỉ kiểm tra item tồn tại.
  for (const it of body.items) {
    const item = await prisma.stationeryItem.findUnique({ where: { id: it.itemId }, select: { id: true } });
    if (!item) return NextResponse.json({ error: { code: "ITEM_NOT_FOUND", message: "VPP không tồn tại" } }, { status: 400 });
  }

  const req = await prisma.stationeryRequest.create({
    data: {
      requesterEmployeeId,
      reason: body.reason || "",
      fileUrl: body.fileUrl || "",
      createdById: userId,
      items: { create: body.items.map((it) => ({ itemId: it.itemId, quantity: it.quantity, note: it.note ?? null })) },
    },
  });
  return NextResponse.json({ data: req }, { status: 201 });
}

