import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canDo } from "@/lib/permissions";
import { z } from "zod";
import { createEmployeeFromCandidate, notifyEmployeeCreated } from "@/lib/employee-from-candidate";

const Schema = z.object({
  result: z.enum(["ACCEPTED", "DECLINED"]),
  candidateNote: z.string().optional().nullable(),
});

// HCNS đánh dấu kết quả phản hồi từ ứng viên (sau khi UV reply email/gọi điện)
// ACCEPTED → AUTO tạo Employee (PROBATION) + User + temp password
// DECLINED → chỉ đổi candidate.status = REJECTED
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const userRole = (session.user as any).role;
  if (!canDo(userRole, "recruitment", "update")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const body = await req.json();
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", issues: parsed.error.issues } }, { status: 422 });
  }

  const offer = await prisma.offerLetter.findUnique({
    where: { id: params.id },
    include: { candidate: { select: { id: true, fullName: true } } },
  });
  if (!offer) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  if (offer.status !== "SENT") {
    return NextResponse.json({ error: { code: "INVALID_STATE", message: "Chỉ đánh dấu khi thư đã gửi" } }, { status: 409 });
  }

  const now = new Date();
  const data: any = {
    status: parsed.data.result,
    candidateNote: parsed.data.candidateNote ?? null,
  };
  if (parsed.data.result === "ACCEPTED") data.acceptedAt = now;
  else data.declinedAt = now;

  if (parsed.data.result === "DECLINED") {
    // Chỉ update offer + candidate trong 1 transaction nhỏ
    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.offerLetter.update({ where: { id: params.id }, data });
      await tx.candidate.update({ where: { id: offer.candidate.id }, data: { status: "REJECTED" } });
      return u;
    });
    return NextResponse.json({ data: updated });
  }

  // ACCEPTED — update offer + candidate ACCEPTED + tạo Employee (PROBATION)
  try {
    const { updatedOffer, created } = await prisma.$transaction(async (tx) => {
      const u = await tx.offerLetter.update({ where: { id: params.id }, data });
      await tx.candidate.update({ where: { id: offer.candidate.id }, data: { status: "ACCEPTED" } });
      const c = await createEmployeeFromCandidate(offer.candidate.id, tx);
      return { updatedOffer: u, created: c };
    });

    await notifyEmployeeCreated(prisma, created.id, offer.candidate.fullName, created.code).catch(() => {});

    return NextResponse.json({ data: { ...updatedOffer, createdEmployee: created } });
  } catch (err: any) {
    console.error("Mark ACCEPTED + create employee failed:", err);
    return NextResponse.json({
      error: { code: "CREATE_EMPLOYEE_FAILED", message: err.message || "Tạo tài khoản NV thất bại" },
    }, { status: 500 });
  }
}
