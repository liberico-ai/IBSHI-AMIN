import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";

const RejectSchema = z.object({
  rejectComments: z.string().min(5, "Cần ghi rõ lý do (≥5 ký tự)"),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const userRole = (session.user as any).role;
  if (!["MANAGER", "HR_ADMIN", "BOM", "ADMIN"].includes(userRole)) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = RejectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", issues: parsed.error.issues } }, { status: 422 });
  }

  const rejecter = await prisma.employee.findFirst({
    where: { userId: (session.user as any).id },
    select: { id: true },
  });
  if (!rejecter) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });

  const offer = await prisma.offerLetter.findUnique({
    where: { id: params.id },
    include: { candidate: { select: { fullName: true } } },
  });
  if (!offer) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  if (offer.status !== "PENDING_HR_MGR") {
    return NextResponse.json({ error: { code: "INVALID_STATE" } }, { status: 409 });
  }

  const updated = await prisma.offerLetter.update({
    where: { id: params.id },
    data: {
      status: "REJECTED",
      rejectedBy: rejecter.id,
      rejectedAt: new Date(),
      rejectComments: parsed.data.rejectComments,
    },
  });

  // Notify HR người tạo
  if (offer.createdBy) {
    const creator = await prisma.employee.findUnique({
      where: { id: offer.createdBy },
      select: { userId: true },
    });
    if (creator?.userId) {
      await prisma.notification.create({
        data: {
          userId: creator.userId,
          title: "Thư mời bị trả lại",
          message: `Thư mời ${offer.letterNumber} cho ${offer.candidate.fullName} bị trả lại. Lý do: ${parsed.data.rejectComments}`,
          type: "REJECTED",
          referenceType: "offer_letter",
          referenceId: updated.id,
        },
      });
    }
  }

  return NextResponse.json({ data: updated });
}
