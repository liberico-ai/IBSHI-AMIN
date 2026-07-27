import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { isStationeryApprover } from "@/lib/stationery";
import { canUser } from "@/lib/permission-catalog";
import { canActOnDeptScope } from "@/lib/data-scope.server";

const Schema = z.object({ reason: z.string().min(1) });

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const userId = (session.user as any).id;
  const userRole = (session.user as any).role;

  const { id } = await params;
  const body = Schema.parse(await request.json());
  const req = await prisma.stationeryRequest.findUnique({ where: { id }, include: { requester: { select: { departmentId: true } } } });
  if (!req) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  // Từ chối: đầu mối HCNS/BOM (allowlist) HOẶC có quyền Duyệt (tickbox) VÀ phiếu thuộc phạm vi.
  const isCentral = await isStationeryApprover(userId);
  const byScope = canUser(session.user as any, "m10.vpp.denghi:approve") && await canActOnDeptScope(userId, userRole, "m10.vpp.denghi", req.requester?.departmentId ?? "");
  if (!isCentral && !byScope)
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Không có quyền từ chối phiếu này (ngoài phạm vi được cấp)" } }, { status: 403 });

  if (req.status !== "PENDING_APPROVAL")
    return NextResponse.json({ error: { code: "INVALID_STATE" } }, { status: 400 });

  const data = await prisma.stationeryRequest.update({
    where: { id },
    data: { status: "REJECTED", approvedById: userId, approvedAt: new Date(), rejectedReason: body.reason },
  });
  return NextResponse.json({ data });
}
