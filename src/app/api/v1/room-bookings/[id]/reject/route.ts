import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { canApproveRoomVehicle } from "@/lib/access";
import { canUser } from "@/lib/permission-catalog";
import { resolveScope, scopeAllowsDept } from "@/lib/data-scope.server";

const Schema = z.object({ reason: z.string().min(1) });

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const employeeCode = (session.user as any).employeeCode;
  const userId = (session.user as any).id;

  const { id } = await params;
  const body = Schema.parse(await request.json());
  const b = await prisma.roomBooking.findUnique({
    where: { id },
    include: { requester: { select: { departmentId: true } } },
  });
  if (!b) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });

  // Từ chối được khi: allowlist/role cũ HOẶC có quyền ma trận approve và phiếu thuộc phạm vi.
  let canApprove = canApproveRoomVehicle(employeeCode, (session.user as any).role);
  if (!canApprove && canUser(session.user as any, "m10.phonghop.dat:approve")) {
    const scope = await resolveScope(userId, (session.user as any).role, "m10.phonghop.dat");
    canApprove = scopeAllowsDept(scope, b.requester?.departmentId);
  }
  if (!canApprove)
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Bạn không có quyền duyệt/từ chối phiếu đặt phòng họp" } }, { status: 403 });

  if (b.status !== "PENDING_APPROVAL")
    return NextResponse.json({ error: { code: "INVALID_STATE" } }, { status: 400 });
  const data = await prisma.roomBooking.update({
    where: { id },
    data: { status: "REJECTED", approvedById: userId, approvedAt: new Date(), rejectReason: body.reason },
  });
  return NextResponse.json({ data });
}
