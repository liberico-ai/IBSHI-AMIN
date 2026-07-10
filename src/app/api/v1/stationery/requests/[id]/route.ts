import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canUser } from "@/lib/permission-catalog";
import { z } from "zod";

const ItemSchema = z.object({
  itemId: z.string().uuid(),
  quantity: z.number().positive(),
  note: z.string().optional().nullable(),
});
const UpdateSchema = z.object({
  reason: z.string().optional().nullable(),
  fileUrl: z.string().optional().nullable(),
  items: z.array(ItemSchema).min(1).optional(),
});

// Sửa / xóa phiếu đề nghị VPP — CHỈ khi còn CHỜ DUYỆT (tránh rác dữ liệu).
// Quyền: CHỦ PHIẾU (tự sửa/xóa phiếu mình) hoặc người có quyền ma trận m10.vpp.denghi:edit / :delete.
async function loadEditable(id: string) {
  const row = await prisma.stationeryRequest.findUnique({
    where: { id },
    select: { id: true, createdById: true, status: true },
  });
  return row;
}

// PUT — sửa lý do / danh sách VPP của phiếu chờ duyệt.
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const userId = (session.user as any).id;

  const { id } = await params;
  const row = await loadEditable(id);
  if (!row) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  if (row.status !== "PENDING_APPROVAL") {
    return NextResponse.json({ error: { code: "INVALID_STATE", message: "Chỉ sửa được phiếu đang CHỜ DUYỆT" } }, { status: 400 });
  }
  const isOwner = row.createdById === userId;
  if (!isOwner && !canUser(session.user as any, "m10.vpp.denghi:edit")) {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Chỉ chủ phiếu hoặc người có quyền sửa mới sửa được" } }, { status: 403 });
  }

  const body = UpdateSchema.parse(await request.json());

  if (body.items) {
    for (const it of body.items) {
      const item = await prisma.stationeryItem.findUnique({ where: { id: it.itemId }, select: { id: true } });
      if (!item) return NextResponse.json({ error: { code: "ITEM_NOT_FOUND", message: "VPP không tồn tại" } }, { status: 400 });
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (body.items) {
      await tx.stationeryRequestItem.deleteMany({ where: { requestId: id } });
      await tx.stationeryRequestItem.createMany({
        data: body.items.map((it) => ({ requestId: id, itemId: it.itemId, quantity: it.quantity, note: it.note ?? null })),
      });
    }
    return tx.stationeryRequest.update({
      where: { id },
      data: {
        ...(body.reason !== undefined ? { reason: body.reason || "" } : {}),
        ...(body.fileUrl !== undefined ? { fileUrl: body.fileUrl || "" } : {}),
      },
      include: { items: { include: { item: { select: { id: true, name: true, unit: true } } } } },
    });
  });

  return NextResponse.json({ data: updated });
}

// DELETE — xóa hẳn phiếu chờ duyệt (items cascade tự xóa).
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const userId = (session.user as any).id;

  const { id } = await params;
  const row = await loadEditable(id);
  if (!row) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  if (row.status !== "PENDING_APPROVAL") {
    return NextResponse.json({ error: { code: "INVALID_STATE", message: "Chỉ xóa được phiếu đang CHỜ DUYỆT" } }, { status: 400 });
  }
  const isOwner = row.createdById === userId;
  if (!isOwner && !canUser(session.user as any, "m10.vpp.denghi:delete")) {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Chỉ chủ phiếu hoặc người có quyền xóa mới xóa được" } }, { status: 403 });
  }

  await prisma.stationeryRequest.delete({ where: { id } });
  return NextResponse.json({ data: { ok: true } });
}
