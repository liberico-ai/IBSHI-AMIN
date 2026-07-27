import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { isStationeryApprover } from "@/lib/stationery";
import { canUser } from "@/lib/permission-catalog";
import { canActOnDeptScope } from "@/lib/data-scope.server";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const userId = (session.user as any).id;
  const userRole = (session.user as any).role;

  const { id } = await params;
  const req = await prisma.stationeryRequest.findUnique({ where: { id }, include: { requester: { select: { departmentId: true } } } });
  if (!req) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  // Duyệt được khi: đầu mối HCNS/BOM (allowlist cũ) HOẶC có quyền Duyệt (tickbox) VÀ phiếu thuộc PHẠM VI được cấp.
  const isCentral = await isStationeryApprover(userId);
  const byScope = canUser(session.user as any, "m10.vpp.denghi:approve") && await canActOnDeptScope(userId, userRole, "m10.vpp.denghi", req.requester?.departmentId ?? "");
  if (!isCentral && !byScope)
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Không có quyền duyệt phiếu này (ngoài phạm vi được cấp)" } }, { status: 403 });

  if (req.status !== "PENDING_APPROVAL")
    return NextResponse.json({ error: { code: "INVALID_STATE", message: `Phiếu đang ở trạng thái ${req.status}` } }, { status: 400 });
  // BGĐ (BOM) là cấp cao nhất → được tự duyệt phiếu mình tạo. Người khác thì không.
  if (req.createdById === userId && (session.user as any).role !== "BOM" && (session.user as any).role !== "ADMIN")
    return NextResponse.json({ error: { code: "SELF_APPROVE", message: "Không tự duyệt phiếu mình tạo" } }, { status: 400 });

  const data = await prisma.stationeryRequest.update({
    where: { id },
    data: { status: "APPROVED", approvedById: userId, approvedAt: new Date() },
  });
  return NextResponse.json({ data });
}
