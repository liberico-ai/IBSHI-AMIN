import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canDo } from "@/lib/permissions";
import { canUser } from "@/lib/permission-catalog";

// Sau khi BGĐ approved 1 eval với tier=FAIL → HCNS xác nhận chấm dứt thử việc
// → Employee.status = TERMINATED + eval.status = FAILED
export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const userRole = (session.user as any).role;
  if (!canUser(session.user as any, "m4.tuyendung:edit")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const evalRec = await prisma.probationEvaluation.findUnique({
    where: { id: params.id },
    include: { employee: { select: { id: true, userId: true, fullName: true } } },
  });
  if (!evalRec) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  if (evalRec.status !== "APPROVED") {
    return NextResponse.json({ error: { code: "INVALID_STATE" } }, { status: 409 });
  }

  const tier = evalRec.selectedTier || evalRec.recommendedTier;
  if (tier !== "FAIL") {
    return NextResponse.json({ error: { code: "INVALID_TIER", message: "Chỉ áp dụng khi tier = FAIL" } }, { status: 400 });
  }

  const result = await prisma.$transaction(async (tx) => {
    const updatedEval = await tx.probationEvaluation.update({
      where: { id: params.id },
      data: { status: "FAILED" },
    });
    await tx.employee.update({
      where: { id: evalRec.employeeId },
      data: { status: "TERMINATED" },
    });
    return updatedEval;
  });

  return NextResponse.json({ data: result });
}
