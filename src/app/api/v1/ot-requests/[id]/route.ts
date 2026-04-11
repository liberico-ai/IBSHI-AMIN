import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canDo } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";

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

  // Minimum role: TEAM_LEAD (can approve for their own team)
  if (!canDo(userRole, "otRequests", "approveTeam")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const { id } = await params;
  const otRequest = await prisma.oTRequest.findUnique({
    where: { id },
    include: { employee: { include: { user: true } } },
  });

  if (!otRequest) {
    return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  }

  const body = await request.json();
  const { action, note } = body as { action: "APPROVE" | "REJECT"; note?: string };

  // ── REJECT ───────────────────────────────────────────────────────────────
  if (action === "REJECT") {
    if (otRequest.status !== "PENDING" && otRequest.status !== "PENDING_HR") {
      return NextResponse.json({ error: { code: "INVALID_STATE" } }, { status: 400 });
    }
    const updated = await prisma.oTRequest.update({
      where: { id },
      data: { status: "REJECTED", approvedBy: userId },
    });
    await prisma.notification.create({
      data: {
        userId: otRequest.employee.userId,
        title: "Đề xuất OT bị từ chối",
        message: `Đề xuất OT của bạn bị từ chối${note ? `: ${note}` : "."}`,
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
    const isHrOrAbove = canDo(userRole, "otRequests", "approve2");

    // ── Level-1: TEAM_LEAD / MANAGER approve PENDING → PENDING_HR ──────
    if (otRequest.status === "PENDING" && !isHrOrAbove) {
      // Scope checks
      if (userRole === "TEAM_LEAD") {
        // TEAM_LEAD: only their team
        const approver = await prisma.employee.findFirst({ where: { userId }, select: { teamId: true } });
        if (!approver?.teamId || approver.teamId !== otRequest.employee.teamId) {
          return NextResponse.json(
            { error: { code: "FORBIDDEN", message: "Tổ trưởng chỉ có thể duyệt OT cho thành viên trong tổ mình" } },
            { status: 403 }
          );
        }
      } else if (userRole === "MANAGER") {
        // MANAGER: only their department
        const approver = await prisma.employee.findFirst({ where: { userId }, select: { departmentId: true } });
        if (!approver || approver.departmentId !== otRequest.employee.departmentId) {
          return NextResponse.json(
            { error: { code: "FORBIDDEN", message: "Trưởng phòng chỉ có thể duyệt OT cho nhân viên phòng mình" } },
            { status: 403 }
          );
        }
      }

      const hrAdmins = await prisma.user.findMany({
        where: { role: "HR_ADMIN", isActive: true },
        select: { id: true },
      });

      const updated = await prisma.oTRequest.update({
        where: { id },
        data: { status: "PENDING_HR", approvedBy: userId },
      });

      await Promise.all(
        hrAdmins.map((u) =>
          prisma.notification.create({
            data: {
              userId: u.id,
              title: "Đề xuất OT chờ HC duyệt",
              message: `${otRequest.employee.fullName} đề xuất OT ${otRequest.hours.toFixed(1)}h ngày ${new Date(otRequest.date).toLocaleDateString("vi-VN")} — Tổ trưởng/TP đã duyệt.`,
              type: "APPROVAL_REQUIRED",
              referenceType: "ot_request",
              referenceId: id,
            },
          })
        )
      );

      logAudit({ userId, action: "APPROVE", entityType: "OTRequest", entityId: id, newValue: { status: "PENDING_HR" } });
      return NextResponse.json({ data: updated, message: "Đã chuyển HC duyệt cấp 2" });
    }

    // ── Level-2: HR_ADMIN finalizes PENDING_HR → APPROVED ──────────────
    if (otRequest.status === "PENDING_HR" && isHrOrAbove) {
      const updated = await prisma.oTRequest.update({
        where: { id },
        data: { status: "APPROVED", approvedBy: userId },
      });
      await prisma.notification.create({
        data: {
          userId: otRequest.employee.userId,
          title: "Đề xuất OT được duyệt",
          message: `Đề xuất OT ${otRequest.hours.toFixed(1)} giờ ngày ${new Date(otRequest.date).toLocaleDateString("vi-VN")} đã được HC phê duyệt.`,
          type: "APPROVED",
          referenceType: "ot_request",
          referenceId: id,
        },
      });
      logAudit({ userId, action: "APPROVE", entityType: "OTRequest", entityId: id, newValue: { status: "APPROVED" } });
      return NextResponse.json({ data: updated, message: "Đề xuất OT đã được duyệt hoàn tất" });
    }

    // HR can also directly approve PENDING in one step (for urgent cases)
    if (otRequest.status === "PENDING" && isHrOrAbove) {
      const updated = await prisma.oTRequest.update({
        where: { id },
        data: { status: "APPROVED", approvedBy: userId },
      });
      await prisma.notification.create({
        data: {
          userId: otRequest.employee.userId,
          title: "Đề xuất OT được duyệt",
          message: `Đề xuất OT ${otRequest.hours.toFixed(1)} giờ của bạn đã được phê duyệt.`,
          type: "APPROVED",
          referenceType: "ot_request",
          referenceId: id,
        },
      });
      logAudit({ userId, action: "APPROVE", entityType: "OTRequest", entityId: id, newValue: { status: "APPROVED" } });
      return NextResponse.json({ data: updated, message: "Đề xuất OT đã được duyệt" });
    }

    return NextResponse.json(
      { error: { code: "INVALID_STATE", message: "Trạng thái không hợp lệ để duyệt" } },
      { status: 400 }
    );
  }

  return NextResponse.json({ error: { code: "BAD_REQUEST" } }, { status: 400 });
}
