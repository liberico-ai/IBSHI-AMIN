import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canUser } from "@/lib/permission-catalog";
import { resolveScope, scopeAllowsDept } from "@/lib/data-scope.server";

// Huỷ lịch: chủ phiếu tự huỷ; admin (HR/BGĐ) huỷ; HOẶC có quyền Xóa ma trận (m10.phonghop.dat:delete)
//  và lịch thuộc Phạm vi được cấp.
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const userId = (session.user as any).id;
  const role = (session.user as any).role;

  const { id } = await params;
  const b = await prisma.roomBooking.findUnique({
    where: { id },
    include: { requester: { include: { user: { select: { id: true } } } } },
  });
  if (!b) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  if (b.status === "CANCELLED" || b.status === "REJECTED")
    return NextResponse.json({ error: { code: "INVALID_STATE" } }, { status: 400 });

  const isOwner = b.requester.user?.id === userId;
  const isAdmin = role === "HR_ADMIN" || role === "BOM" || role === "ADMIN";
  let byMatrix = false;
  if (!isOwner && !isAdmin && canUser(session.user as any, "m10.phonghop.dat:delete")) {
    const scope = await resolveScope(userId, role, "m10.phonghop.dat");
    byMatrix = scopeAllowsDept(scope, b.requester.departmentId);
  }
  if (!isOwner && !isAdmin && !byMatrix)
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Chỉ chủ phiếu, admin, hoặc người có quyền Xóa (trong phạm vi) được huỷ" } }, { status: 403 });

  const data = await prisma.roomBooking.update({ where: { id }, data: { status: "CANCELLED" } });
  return NextResponse.json({ data });
}
