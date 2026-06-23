import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";

const RejectSchema = z.object({
  directorComments: z.string().min(5, "Cần ghi rõ lý do trả lại (≥5 ký tự)"),
});

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const userRole = (session.user as any).role;
  if (userRole !== "BOM" && userRole !== "ADMIN") {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Chỉ BGĐ trả lại được" } }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = RejectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", issues: parsed.error.issues } }, { status: 422 });
  }

  const director = await prisma.employee.findFirst({
    where: { userId: (session.user as any).id },
    select: { id: true, fullName: true },
  });
  if (!director) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });

  const evalRec = await prisma.probationEvaluation.findUnique({
    where: { id: params.id },
    include: { employee: { select: { fullName: true } } },
  });
  if (!evalRec) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  if (evalRec.status !== "PENDING_DIRECTOR") {
    return NextResponse.json({ error: { code: "INVALID_STATE" } }, { status: 409 });
  }

  const updated = await prisma.probationEvaluation.update({
    where: { id: params.id },
    data: {
      status: "REJECTED",
      directorRejectedAt: new Date(),
      directorComments: parsed.data.directorComments,
    },
  });

  // Notify người đánh giá (TP) — đến phiên TP đánh giá lại
  if (evalRec.evaluatedBy) {
    const tp = await prisma.employee.findUnique({
      where: { id: evalRec.evaluatedBy },
      select: { userId: true },
    });
    if (tp?.userId) {
      await prisma.notification.create({
        data: {
          userId: tp.userId,
          title: "Đánh giá thử việc bị trả lại",
          message: `BGĐ trả lại đánh giá NV ${evalRec.employee.fullName}. Lý do: ${parsed.data.directorComments}`,
          type: "REJECTED",
          referenceType: "probation_evaluation",
          referenceId: updated.id,
        },
      });
    }
  }

  return NextResponse.json({ data: updated });
}
