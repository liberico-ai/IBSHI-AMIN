import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canDo } from "@/lib/permissions";
import { canUser } from "@/lib/permission-catalog";
import { canActOnDeptScope } from "@/lib/data-scope.server";
// (canUser đã import ở trên)
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

  // Duyệt/từ chối OT khi: Giám đốc KHỐI phụ trách (luồng cũ), HOẶC ADMIN, HOẶC người có quyền Duyệt
  //  (tickbox m3.tangca:approve) VÀ đơn thuộc PHẠM VI được cấp (mặc định = phòng mình).
  const isKhoiDirector = await isDirectorOfDepartment(userId, otRequest.employee.departmentId);
  const byScope = canUser(session.user as any, "m3.tangca:approve")
    && await canActOnDeptScope(userId, userRole, "m3.tangca", otRequest.employee.departmentId);
  if (!isKhoiDirector && userRole !== "ADMIN" && !byScope) {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "Bạn không có quyền duyệt/từ chối đơn tăng ca này (ngoài phạm vi được cấp)." } },
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
async function canManageOT(user: any, userRole: string, userId: string, reqDeptId: string, matrixAction: string): Promise<boolean> {
  if (canDo(userRole, "otRequests", "approve2")) return true; // HR_ADMIN / ADMIN / BOM
  if (userRole === "MANAGER") {
    const mgr = await prisma.employee.findFirst({ where: { userId }, select: { departmentId: true } });
    if (!!mgr && mgr.departmentId === reqDeptId) return true;
  }
  // Tick ma trận (Sửa/Xóa) + đơn thuộc PHẠM VI được cấp.
  if (canUser(user, matrixAction)) return await canActOnDeptScope(userId, userRole, "m3.tangca", reqDeptId);
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
  if (!(await canManageOT(session.user as any, userRole, userId, ot.employee.departmentId, "m3.tangca:edit"))) {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Bạn không có quyền sửa đơn OT này (ngoài phạm vi)" } }, { status: 403 });
  }

  const body = await request.json();
  const { date, startTime, endTime, reason, memberProjects } = body as {
    date?: string; startTime?: string; endTime?: string; reason?: string;
    // Chi tiết NV × dự án × giờ × lý do — nếu gửi thì THAY TOÀN BỘ danh sách cũ.
    memberProjects?: { employeeId: string; employeeName?: string | null; projectCode: string; hours: number; reason?: string | null }[];
  };
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

  // Nếu client gửi chi tiết → validate + thay toàn bộ rows + đồng bộ memberIds/memberNames + lý do gộp.
  let replaceMembers: { employeeId: string; employeeName: string; projectCode: string; hours: number; reason: string | null }[] | null = null;
  if (Array.isArray(memberProjects)) {
    if (memberProjects.length === 0) {
      return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Đơn phải có ít nhất 1 dòng nhân sự × dự án" } }, { status: 400 });
    }
    replaceMembers = [];
    for (const mp of memberProjects) {
      if (!mp.employeeId) return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Thiếu nhân viên ở một dòng" } }, { status: 400 });
      if (!mp.projectCode) return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Thiếu dự án ở một dòng" } }, { status: 400 });
      if (!(mp.hours > 0)) return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Số giờ phải > 0 ở một dòng" } }, { status: 400 });
      replaceMembers.push({
        employeeId: mp.employeeId,
        employeeName: mp.employeeName || "",
        projectCode: mp.projectCode,
        hours: mp.hours,
        reason: mp.reason?.trim() || null,
      });
    }
    // Đồng bộ danh sách NV (dedupe) + lý do cấp đơn = gộp các lý do khác nhau.
    const byEmp = new Map<string, string>();
    for (const r of replaceMembers) if (!byEmp.has(r.employeeId)) byEmp.set(r.employeeId, r.employeeName);
    data.memberIds = Array.from(byEmp.keys());
    data.memberNames = Array.from(byEmp.values());
    const merged = Array.from(new Set(replaceMembers.map((r) => (r.reason || "").trim()).filter(Boolean))).join(" | ");
    if (merged) data.reason = merged;
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (replaceMembers) {
      await tx.oTMemberProject.deleteMany({ where: { otRequestId: id } });
      await tx.oTMemberProject.createMany({
        data: replaceMembers.map((r) => ({ otRequestId: id, ...r })),
      });
    }
    return tx.oTRequest.update({
      where: { id }, data,
      include: { employee: { include: { department: true } }, memberProjects: true },
    });
  });
  logAudit({ userId, action: "UPDATE", entityType: "OTRequest", entityId: id, newValue: { ...data, memberProjects: replaceMembers?.length } });
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
  if (!(await canManageOT(session.user as any, userRole, userId, ot.employee.departmentId, "m3.tangca:delete"))) {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Bạn không có quyền xoá đơn OT này (ngoài phạm vi)" } }, { status: 403 });
  }

  await prisma.oTRequest.delete({ where: { id } });
  logAudit({ userId, action: "DELETE", entityType: "OTRequest", entityId: id });
  return NextResponse.json({ data: { success: true } });
}
