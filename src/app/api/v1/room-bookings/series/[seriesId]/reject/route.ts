import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { canApproveRoomVehicle } from "@/lib/access";
import { canUser } from "@/lib/permission-catalog";
import { resolveScope, scopeAllowsDept } from "@/lib/data-scope.server";

const Schema = z.object({ reason: z.string().min(1) });

// POST /api/v1/room-bookings/series/[seriesId]/reject
// Từ chối tất cả PENDING_APPROVAL trong series.
export async function POST(request: NextRequest, { params }: { params: Promise<{ seriesId: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const employeeCode = (session.user as any).employeeCode;
  const role = (session.user as any).role;
  const userId = (session.user as any).id;
  const { seriesId } = await params;

  const sample = await prisma.roomBooking.findFirst({ where: { seriesId }, include: { requester: { select: { departmentId: true } } } });
  if (!sample) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  let allowed = canApproveRoomVehicle(employeeCode, role);
  if (!allowed && canUser(session.user as any, "m10.phonghop.dat:approve")) {
    const scope = await resolveScope(userId, role, "m10.phonghop.dat");
    allowed = scopeAllowsDept(scope, sample.requester?.departmentId);
  }
  if (!allowed)
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Bạn không có quyền từ chối phiếu đặt phòng họp" } }, { status: 403 });

  const body = Schema.parse(await request.json());

  const result = await prisma.roomBooking.updateMany({
    where: { seriesId, status: "PENDING_APPROVAL" },
    data: { status: "REJECTED", approvedById: userId, approvedAt: new Date(), rejectReason: body.reason },
  });

  return NextResponse.json({ data: { seriesId, rejected: result.count } });
}
