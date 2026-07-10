import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canUser } from "@/lib/permission-catalog";

// PUT /api/v1/documents/outgoing/[id] — sửa công văn đi (quyền m10.congvan:edit)
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (!canUser(session.user as any, "m10.congvan:edit")) {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Không có quyền sửa công văn" } }, { status: 403 });
  }
  const { id } = await params;
  const existing = await prisma.outgoingDocument.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });

  const body = await req.json();
  // docNumber unique → nếu đổi thì kiểm tra trùng (bỏ qua chính nó).
  const newDocNumber = body.docNumber?.trim();
  if (newDocNumber && newDocNumber !== existing.docNumber) {
    const dup = await prisma.outgoingDocument.findUnique({ where: { docNumber: newDocNumber } });
    if (dup) return NextResponse.json({ error: { code: "DUPLICATE", message: `Mã công văn "${newDocNumber}" đã tồn tại` } }, { status: 409 });
  }

  const updated = await prisma.outgoingDocument.update({
    where: { id },
    data: {
      docDate: body.docDate !== undefined ? (body.docDate ? new Date(body.docDate) : existing.docDate) : existing.docDate,
      docNumber: newDocNumber || existing.docNumber,
      subject: body.subject !== undefined ? (body.subject?.trim() || existing.subject) : existing.subject,
      toEntity: body.toEntity !== undefined ? (body.toEntity?.trim() || null) : existing.toEntity,
      senderType: body.senderType !== undefined ? (body.senderType === "CA_NHAN" ? "CA_NHAN" : "CONG_TY") : existing.senderType,
      senderName: body.senderName !== undefined ? (body.senderName?.trim() || null) : existing.senderName,
      transportMethod: body.transportMethod !== undefined ? (body.transportMethod?.trim() || null) : existing.transportMethod,
      transportUnit: body.transportUnit !== undefined ? (body.transportUnit?.trim() || null) : existing.transportUnit,
      ...(body.scanFileUrl ? { scanUrl: body.scanFileUrl } : {}),
    },
  });
  return NextResponse.json({ data: updated });
}

// DELETE /api/v1/documents/outgoing/[id]
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (!canUser(session.user as any, "m10.congvan:delete")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }
  const { id } = await params;
  await prisma.outgoingDocument.delete({ where: { id } });
  return NextResponse.json({ data: { ok: true } });
}
