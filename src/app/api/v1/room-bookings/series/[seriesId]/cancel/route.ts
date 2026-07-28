import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canApproveRoomVehicle } from "@/lib/access";
import { canUser } from "@/lib/permission-catalog";
import { resolveScope, scopeAllowsDept } from "@/lib/data-scope.server";

// POST /api/v1/room-bookings/series/[seriesId]/cancel
// Huỷ tất cả phiếu PENDING_APPROVAL + APPROVED trong series.
// Quyền: chủ phiếu; allowlist duyệt cũ; HOẶC có quyền Xóa ma trận (m10.phonghop.dat:delete) + trong Phạm vi.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ seriesId: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const userId = (session.user as any).id;
  const role = (session.user as any).role;
  const employeeCode = (session.user as any).employeeCode;

  const { seriesId } = await params;

  // Lấy 1 phiếu để xác định owner + phòng ban.
  const sample = await prisma.roomBooking.findFirst({
    where: { seriesId },
    include: { requester: { select: { userId: true, departmentId: true } } },
  });
  if (!sample) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });

  const isOwner = sample.requester?.userId === userId;
  const isApprover = canApproveRoomVehicle(employeeCode, role);
  let byMatrix = false;
  if (!isOwner && !isApprover && canUser(session.user as any, "m10.phonghop.dat:delete")) {
    const scope = await resolveScope(userId, role, "m10.phonghop.dat");
    byMatrix = scopeAllowsDept(scope, sample.requester?.departmentId);
  }
  if (!isOwner && !isApprover && !byMatrix) {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Bạn không có quyền huỷ series này" } }, { status: 403 });
  }

  const result = await prisma.roomBooking.updateMany({
    where: { seriesId, status: { in: ["PENDING_APPROVAL", "APPROVED"] } },
    data: { status: "CANCELLED" },
  });
  return NextResponse.json({ data: { seriesId, cancelled: result.count } });
}
