import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canUser } from "@/lib/permission-catalog";

// DELETE — xóa phiếu đăng ký suất ăn BỔ SUNG khi còn CHỜ DUYỆT (chống rác).
// Quyền: CHỦ PHIẾU (tự xóa phiếu mình) hoặc người có quyền ma trận m10.nhaan.dangky:delete.
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const userId = (session.user as any).id;

  const { id } = await params;
  const req = await prisma.mealSupplementaryRequest.findUnique({
    where: { id },
    select: { requestedBy: true, status: true },
  });
  if (!req) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  if (req.status !== "PENDING") {
    return NextResponse.json({ error: { code: "INVALID_STATE", message: "Chỉ xóa được phiếu đang CHỜ DUYỆT" } }, { status: 400 });
  }
  const isOwner = req.requestedBy === userId;
  if (!isOwner && !canUser(session.user as any, "m10.nhaan.dangky:delete")) {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Chỉ chủ phiếu hoặc người có quyền xóa mới xóa được" } }, { status: 403 });
  }

  await prisma.mealSupplementaryRequest.delete({ where: { id } });
  return NextResponse.json({ data: { ok: true } });
}
