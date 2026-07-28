import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { canApproveRoomVehicle } from "@/lib/access";
import { canUser } from "@/lib/permission-catalog";
import { resolveScope, scopeAllowsDept } from "@/lib/data-scope.server";

const Schema = z.object({
  action: z.enum(["APPROVE", "REJECT", "CANCEL"]),
  rejectedReason: z.string().optional(),
});

// PUT /api/v1/vehicles/bookings/series/[seriesId]
// Duyệt / từ chối / huỷ toàn bộ series.
export async function PUT(request: NextRequest, { params }: { params: Promise<{ seriesId: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const userId = (session.user as any).id;
  const employeeCode = (session.user as any).employeeCode;

  const { seriesId } = await params;
  const body = Schema.parse(await request.json());

  // Lấy 1 phiếu để xác định owner + phòng ban (series cùng 1 người đặt).
  const sample = await prisma.vehicleBooking.findFirst({
    where: { seriesId },
    include: { requester: { select: { userId: true, departmentId: true } } },
  });
  if (!sample) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });

  const role = (session.user as any).role;
  const isOwner = sample.requester?.userId === userId;
  let isApprover = canApproveRoomVehicle(employeeCode, role);
  // Có ô Duyệt ma trận + series thuộc Phạm vi → cũng là approver.
  if (!isApprover && (canUser(session.user as any, "m10.xe.datxe:approve1") || canUser(session.user as any, "m10.xe.datxe:approve2"))) {
    const scope = await resolveScope(userId, role, "m10.xe.datxe");
    isApprover = scopeAllowsDept(scope, sample.requester?.departmentId);
  }
  // Huỷ: chủ phiếu, approver, hoặc ô Xóa ma trận + trong Phạm vi.
  let canDelete = isOwner || isApprover;
  if (!canDelete && canUser(session.user as any, "m10.xe.datxe:delete")) {
    const scope = await resolveScope(userId, role, "m10.xe.datxe");
    canDelete = scopeAllowsDept(scope, sample.requester?.departmentId);
  }

  if (body.action === "CANCEL") {
    if (!canDelete) {
      return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
    }
    const r = await prisma.vehicleBooking.updateMany({
      where: { seriesId, status: { in: ["PENDING", "APPROVED"] } },
      data: { status: "CANCELLED" },
    });
    return NextResponse.json({ data: { seriesId, cancelled: r.count } });
  }

  // APPROVE / REJECT — chỉ approver
  if (!isApprover) {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Bạn không có quyền duyệt phiếu đặt xe" } }, { status: 403 });
  }

  if (body.action === "REJECT") {
    if (!body.rejectedReason) {
      return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Cần lý do từ chối" } }, { status: 400 });
    }
    const r = await prisma.vehicleBooking.updateMany({
      where: { seriesId, status: "PENDING" },
      data: { status: "REJECTED", approvedBy: userId, approvedAt: new Date(), rejectedReason: body.rejectedReason },
    });
    return NextResponse.json({ data: { seriesId, rejected: r.count } });
  }

  // APPROVE
  const pending = await prisma.vehicleBooking.findMany({
    where: { seriesId, status: "PENDING" },
    orderBy: { startDate: "asc" },
  });
  if (pending.length === 0) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "Series không có phiếu chờ duyệt" } }, { status: 404 });
  }

  // Tối ưu: gộp còn 2 query (thay vì N query/phiếu — chậm 30s–1p với DB từ xa).
  const pendingIds = new Set(pending.map((b) => b.id));
  const vehicleIds = Array.from(new Set(pending.map((b) => b.vehicleId)));
  let minStart = pending[0].startDate, maxEnd = pending[0].endDate;
  for (const b of pending) {
    if (b.startDate < minStart) minStart = b.startDate;
    if (b.endDate > maxEnd) maxEnd = b.endDate;
  }

  const approvedOthers = (await prisma.vehicleBooking.findMany({
    where: {
      vehicleId: { in: vehicleIds },
      status: "APPROVED",
      startDate: { lt: maxEnd },
      endDate: { gt: minStart },
    },
    select: { id: true, vehicleId: true, startDate: true, endDate: true, destination: true },
  })).filter((o) => !pendingIds.has(o.id));

  const toApprove: string[] = [];
  const conflicts: { id: string; date: string; conflictDestination: string }[] = [];
  for (const b of pending) {
    const c = approvedOthers.find((o) => o.vehicleId === b.vehicleId && o.startDate < b.endDate && o.endDate > b.startDate);
    if (c) {
      conflicts.push({ id: b.id, date: b.startDate.toISOString().slice(0, 10), conflictDestination: c.destination });
      continue;
    }
    toApprove.push(b.id);
  }

  if (toApprove.length > 0) {
    await prisma.vehicleBooking.updateMany({
      where: { id: { in: toApprove } },
      data: { status: "APPROVED", approvedBy: userId, approvedAt: new Date() },
    });
  }

  return NextResponse.json({ data: { seriesId, approved: toApprove.length, skipped: conflicts.length, conflicts } });
}
