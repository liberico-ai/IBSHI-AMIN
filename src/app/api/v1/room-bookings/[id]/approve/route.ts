import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canApproveRoomVehicle } from "@/lib/access";
import { canUser } from "@/lib/permission-catalog";
import { resolveScope, scopeAllowsDept } from "@/lib/data-scope.server";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const employeeCode = (session.user as any).employeeCode;
  const userId = (session.user as any).id;

  const { id } = await params;
  const b = await prisma.roomBooking.findUnique({
    where: { id },
    include: { requester: { select: { departmentId: true } } },
  });
  if (!b) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });

  // Duyệt được khi: (a) allowlist/role cũ, HOẶC (b) có quyền ma trận m10.phonghop.dat:approve
  //  và phiếu thuộc PHẠM VI dữ liệu của người duyệt.
  let canApprove = canApproveRoomVehicle(employeeCode, (session.user as any).role);
  if (!canApprove && canUser(session.user as any, "m10.phonghop.dat:approve")) {
    const scope = await resolveScope(userId, (session.user as any).role, "m10.phonghop.dat");
    canApprove = scopeAllowsDept(scope, b.requester?.departmentId);
  }
  if (!canApprove)
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Bạn không có quyền duyệt phiếu đặt phòng họp" } }, { status: 403 });

  if (b.status !== "PENDING_APPROVAL")
    return NextResponse.json({ error: { code: "INVALID_STATE" } }, { status: 400 });

  // Khi duyệt, phải check không có booking APPROVED khác overlap (đã có cùng phòng từ phiếu khác đã được duyệt trước)
  const conflict = await prisma.roomBooking.findFirst({
    where: {
      id: { not: id },
      roomId: b.roomId,
      status: "APPROVED",
      startTime: { lt: b.endTime },
      endTime: { gt: b.startTime },
    },
    select: { title: true },
  });
  if (conflict) return NextResponse.json({
    error: { code: "CONFLICT", message: `Phòng đã có lịch APPROVED khác trong khung giờ: "${conflict.title}"` },
  }, { status: 409 });

  const data = await prisma.roomBooking.update({
    where: { id },
    data: { status: "APPROVED", approvedById: userId, approvedAt: new Date() },
  });
  return NextResponse.json({ data });
}
