import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canDo } from "@/lib/permissions";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const userRole = (session.user as any).role;
  const { id } = await params;
  const body = await request.json();
  const { action, rejectedReason } = body;

  const req = await prisma.recruitmentRequest.findUnique({
    where: { id },
    include: { department: true },
  });
  if (!req) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });

  if (action === "APPROVE" || action === "REJECT") {
    if (!canDo(userRole, "recruitment", "delete")) {
      return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
    }
    const updated = await prisma.recruitmentRequest.update({
      where: { id },
      data: {
        status: action === "APPROVE" ? "APPROVED" : "REJECTED",
        approvedBy: (session.user as any).id,
        approvedAt: new Date(),
        rejectedReason: action === "REJECT" ? rejectedReason : null,
      },
    });

    // Notify requester
    const requester = await prisma.employee.findUnique({
      where: { id: req.requestedBy },
      include: { user: true },
    });
    if (requester?.user) {
      await prisma.notification.create({
        data: {
          userId: requester.user.id,
          title: action === "APPROVE" ? "Đề xuất tuyển dụng đã được duyệt" : "Đề xuất tuyển dụng bị từ chối",
          message: `Đề xuất tuyển ${req.positionName} cho ${req.department.name} đã ${action === "APPROVE" ? "được BOM duyệt" : `bị từ chối: ${rejectedReason}`}`,
          type: action === "APPROVE" ? "APPROVED" : "REJECTED",
          referenceType: "recruitment",
          referenceId: id,
        },
      });
    }
    return NextResponse.json({ data: updated });
  }

  // HR_ADMIN can update other fields (status=COMPLETED when filled)
  if (!canDo(userRole, "recruitment", "create")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }
  const { status } = body;
  const updated = await prisma.recruitmentRequest.update({
    where: { id },
    data: { status },
  });
  return NextResponse.json({ data: updated });
}
