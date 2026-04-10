import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { checkPermission } from "@/lib/permissions";

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

  // TEAM_LEAD can approve, but only for their own team — checked below
  // MANAGER+ can approve any
  if (!checkPermission(userRole, "TEAM_LEAD")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const { id } = await params;
  const otRequest = await prisma.oTRequest.findUnique({
    where: { id },
    include: { employee: true },
  });

  if (!otRequest) {
    return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  }

  if (otRequest.status !== "PENDING") {
    return NextResponse.json(
      { error: { code: "INVALID_STATE", message: "Đề xuất này đã được xử lý" } },
      { status: 400 }
    );
  }

  // TEAM_LEAD: can only approve OT for employees in the same team
  if (userRole === "TEAM_LEAD") {
    const approverEmployee = await prisma.employee.findFirst({
      where: { userId },
      select: { teamId: true },
    });
    if (
      !approverEmployee?.teamId ||
      approverEmployee.teamId !== otRequest.employee.teamId
    ) {
      return NextResponse.json(
        { error: { code: "FORBIDDEN", message: "Tổ trưởng chỉ có thể duyệt OT cho thành viên trong tổ mình" } },
        { status: 403 }
      );
    }
  }

  const body = await request.json();
  const { action, note } = body as { action: "APPROVE" | "REJECT"; note?: string };

  const updated = await prisma.oTRequest.update({
    where: { id },
    data: {
      status: action === "APPROVE" ? "APPROVED" : "REJECTED",
      approvedBy: userId,
    },
  });

  await prisma.notification.create({
    data: {
      userId: otRequest.employee.userId,
      title: action === "APPROVE" ? "Đề xuất OT được duyệt" : "Đề xuất OT bị từ chối",
      message:
        action === "APPROVE"
          ? `Đề xuất OT ${otRequest.hours.toFixed(1)} giờ của bạn đã được phê duyệt.`
          : `Đề xuất OT của bạn bị từ chối${note ? `: ${note}` : "."}`,
      type: action === "APPROVE" ? "APPROVED" : "REJECTED",
      referenceType: "ot_request",
      referenceId: id,
    },
  });

  return NextResponse.json({ data: updated });
}
