import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";

const ApproveSchema = z.object({
  directorComments: z.string().optional().nullable(),
});

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const userRole = (session.user as any).role;
  if (userRole !== "BOM") {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Chỉ BGĐ duyệt được" } }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = ApproveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", issues: parsed.error.issues } }, { status: 422 });
  }

  const director = await prisma.employee.findFirst({
    where: { userId: (session.user as any).id },
    select: { id: true, fullName: true },
  });
  if (!director) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Không tìm thấy hồ sơ BGĐ" } }, { status: 404 });

  const evalRec = await prisma.probationEvaluation.findUnique({
    where: { id: params.id },
    include: { employee: { select: { id: true, fullName: true, userId: true } } },
  });
  if (!evalRec) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  if (evalRec.status !== "PENDING_DIRECTOR") {
    return NextResponse.json({ error: { code: "INVALID_STATE", message: "Chỉ duyệt khi đang ở trạng thái chờ duyệt" } }, { status: 409 });
  }

  const updated = await prisma.probationEvaluation.update({
    where: { id: params.id },
    data: {
      status: "APPROVED",
      directorApprovedBy: director.id,
      directorApprovedAt: new Date(),
      directorComments: parsed.data.directorComments ?? null,
    },
  });

  // Notify HCNS (HR_ADMIN) — đến phiên HCNS in HĐ + xin chữ ký NV
  const hrUsers = await prisma.user.findMany({ where: { role: "HR_ADMIN", isActive: true }, select: { id: true } });
  if (hrUsers.length > 0) {
    await prisma.notification.createMany({
      data: hrUsers.map((u) => ({
        userId: u.id,
        title: "Đánh giá thử việc đã được BGĐ duyệt",
        message: `BGĐ đã duyệt đánh giá cho NV ${evalRec.employee.fullName}. Vui lòng in HĐ + xin chữ ký NV.`,
        type: "APPROVED",
        referenceType: "probation_evaluation",
        referenceId: updated.id,
      })),
    });
  }

  return NextResponse.json({ data: updated });
}
