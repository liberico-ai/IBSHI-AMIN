import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canUser } from "@/lib/permission-catalog";

// PUT /api/v1/documents/incoming/[id] — sửa công văn đến (quyền m10.congvan:edit)
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (!canUser(session.user as any, "m10.congvan:edit")) {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Không có quyền sửa công văn" } }, { status: 403 });
  }
  const { id } = await params;
  const existing = await prisma.incomingDocument.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });

  const body = await req.json();
  const recipientType = body.recipientType ?? existing.recipientType;
  const isCaNhan = recipientType === "CA_NHAN";
  if (isCaNhan && !body.routedEmployeeId && !body.routedDepartmentId && !existing.routedEmployeeId && !existing.routedDepartmentId) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Vui lòng chọn nơi nhận (cá nhân / phòng ban)" } }, { status: 400 });
  }

  const updated = await prisma.incomingDocument.update({
    where: { id },
    data: {
      docDate: body.docDate !== undefined ? (body.docDate ? new Date(body.docDate) : null) : existing.docDate,
      docNumber: body.docNumber !== undefined ? (body.docNumber?.trim() || null) : existing.docNumber,
      subject: body.subject !== undefined ? (body.subject?.trim() || existing.subject) : existing.subject,
      recipientType: isCaNhan ? "CA_NHAN" : "CONG_TY",
      fromEntity: isCaNhan ? null : (body.fromEntity !== undefined ? (body.fromEntity?.trim() || null) : existing.fromEntity),
      routedTo: isCaNhan ? (body.routedTo?.trim() ?? existing.routedTo ?? null) : null,
      routedEmployeeId: isCaNhan ? (body.routedEmployeeId ?? existing.routedEmployeeId ?? null) : null,
      routedDepartmentId: isCaNhan ? (body.routedDepartmentId ?? existing.routedDepartmentId ?? null) : null,
      ...(body.scanFileUrl ? { scanFileUrl: body.scanFileUrl } : {}),
    },
  });
  return NextResponse.json({ data: updated });
}

// DELETE /api/v1/documents/incoming/[id]
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (!canUser(session.user as any, "m10.congvan:delete")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }
  const { id } = await params;
  await prisma.incomingDocument.delete({ where: { id } });
  return NextResponse.json({ data: { ok: true } });
}
