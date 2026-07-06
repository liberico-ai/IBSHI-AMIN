import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canDo } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { isDirectorOfDepartment } from "@/lib/ot-khoi";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }

  const userRole = (session.user as any).role;
  const userId = (session.user as any).id;

  const { id } = await params;
  const otRequest = await prisma.oTRequest.findUnique({
    where: { id },
    include: { employee: { include: { user: true, department: true } } },
  });

  if (!otRequest) {
    return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  }

  const body = await request.json();
  const { action, note } = body as { action: "APPROVE" | "REJECT"; note?: string };

  // ── Luồng A (chốt 2026-07-06): CHỈ Giám đốc KHỐI phụ trách phòng ban của đơn (hoặc ADMIN) mới duyệt/từ chối.
  //    Tổ trưởng/TP chỉ ĐỀ XUẤT, không duyệt nữa. Đơn duyệt 1 bước: PENDING → APPROVED.
  //    1 khối có thể nhiều GĐ → BẤT KỲ GĐ nào của khối đều duyệt được.
  const isKhoiDirector = await isDirectorOfDepartment(userId, otRequest.employee.departmentId);
  if (!isKhoiDirector && userRole !== "ADMIN") {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "Chỉ Giám đốc khối phụ trách mới được duyệt/từ chối đơn tăng ca này." } },
      { status: 403 }
    );
  }

  if (otRequest.status !== "PENDING") {
    return NextResponse.json(
      { error: { code: "INVALID_STATE", message: "Đơn tăng ca không ở trạng thái chờ duyệt." } },
      { status: 400 }
    );
  }

  const dayStr = new Date(otRequest.date).toLocaleDateString("vi-VN");

  // ── REJECT ───────────────────────────────────────────────────────────────
  if (action === "REJECT") {
    const updated = await prisma.oTRequest.update({
      where: { id },
      data: { status: "REJECTED", approvedBy: userId },
    });
    await prisma.notification.create({
      data: {
        userId: otRequest.employee.userId,
        title: "Đề xuất OT bị từ chối",
        message: `Đề xuất OT ngày ${dayStr} bị Giám đốc khối từ chối${note ? `: ${note}` : "."}`,
        type: "REJECTED",
        referenceType: "ot_request",
        referenceId: id,
      },
    });
    logAudit({ userId, action: "REJECT", entityType: "OTRequest", entityId: id, newValue: { status: "REJECTED", note } });
    return NextResponse.json({ data: updated });
  }

  // ── APPROVE ──────────────────────────────────────────────────────────────
  if (action === "APPROVE") {
    const updated = await prisma.oTRequest.update({
      where: { id },
      data: { status: "APPROVED", approvedBy: userId },
    });
    await prisma.notification.create({
      data: {
        userId: otRequest.employee.userId,
        title: "Đề xuất OT được duyệt",
        message: `Đề xuất OT ${otRequest.hours.toFixed(1)} giờ ngày ${dayStr} đã được Giám đốc khối phê duyệt.`,
        type: "APPROVED",
        referenceType: "ot_request",
        referenceId: id,
      },
    });
    logAudit({ userId, action: "APPROVE", entityType: "OTRequest", entityId: id, newValue: { status: "APPROVED" } });
    return NextResponse.json({ data: updated, message: "Đề xuất OT đã được duyệt" });
  }

  return NextResponse.json({ error: { code: "BAD_REQUEST" } }, { status: 400 });
}

// Quyền quản lý (sửa/xoá) đơn OT: HC/ADMIN/BOM toàn quyền; MANAGER chỉ phòng mình.
async function canManageOT(userRole: string, userId: string, reqDeptId: string): Promise<boolean> {
  if (canDo(userRole, "otRequests", "approve2")) return true; // HR_ADMIN / ADMIN / BOM
  if (userRole === "MANAGER") {
    const mgr = await prisma.employee.findFirst({ where: { userId }, select: { departmentId: true } });
    return !!mgr && mgr.departmentId === reqDeptId;
  }
  return false;
}

const toMin = (t: string) => { const [h, m] = (t || "0:0").split(":").map(Number); return (h || 0) * 60 + (m || 0); };

// PATCH — Trưởng phòng (hoặc HC+) SỬA đơn OT CHƯA DUYỆT của phòng mình (ngày / giờ / lý do).
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const userRole = (session.user as any).role;
  const userId = (session.user as any).id;

  const { id } = await params;
  const ot = await prisma.oTRequest.findUnique({ where: { id }, include: { employee: { select: { departmentId: true } } } });
  if (!ot) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  if (ot.status !== "PENDING") {
    return NextResponse.json({ error: { code: "INVALID_STATE", message: "Chỉ sửa được đơn tăng ca CHƯA duyệt" } }, { status: 400 });
  }
  if (!(await canManageOT(userRole, userId, ot.employee.departmentId))) {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Trưởng phòng chỉ sửa được đơn OT của phòng mình" } }, { status: 403 });
  }

  const body = await request.json();
  const { date, startTime, endTime, reason } = body as { date?: string; startTime?: string; endTime?: string; reason?: string };
  const data: any = {};
  if (date) {
    const d = new Date(date);
    data.date = d;
    const dow = d.getDay();
    data.otRate = dow === 0 || dow === 6 ? 2.0 : 1.5;
  }
  if (startTime !== undefined) data.startTime = startTime;
  if (endTime !== undefined) data.endTime = endTime;
  if (reason !== undefined) data.reason = reason;
  if (startTime !== undefined || endTime !== undefined) {
    const st = startTime ?? ot.startTime, et = endTime ?? ot.endTime;
    const h = (toMin(et) - toMin(st)) / 60;
    if (h <= 0) return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Giờ kết thúc phải sau giờ bắt đầu" } }, { status: 400 });
    data.hours = h;
  }

  const updated = await prisma.oTRequest.update({
    where: { id }, data,
    include: { employee: { include: { department: true } } },
  });
  logAudit({ userId, action: "UPDATE", entityType: "OTRequest", entityId: id, newValue: data });
  return NextResponse.json({ data: updated });
}

// DELETE — Trưởng phòng (hoặc HC+) XOÁ đơn OT CHƯA DUYỆT của phòng mình.
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const userRole = (session.user as any).role;
  const userId = (session.user as any).id;

  const { id } = await params;
  const ot = await prisma.oTRequest.findUnique({ where: { id }, include: { employee: { select: { departmentId: true } } } });
  if (!ot) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  if (ot.status !== "PENDING") {
    return NextResponse.json({ error: { code: "INVALID_STATE", message: "Chỉ xoá được đơn tăng ca CHƯA duyệt" } }, { status: 400 });
  }
  if (!(await canManageOT(userRole, userId, ot.employee.departmentId))) {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Trưởng phòng chỉ xoá được đơn OT của phòng mình" } }, { status: 403 });
  }

  await prisma.oTRequest.delete({ where: { id } });
  logAudit({ userId, action: "DELETE", entityType: "OTRequest", entityId: id });
  return NextResponse.json({ data: { success: true } });
}
