import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canDo } from "@/lib/permissions";
import { z } from "zod";
import { tierToContractType, calcContractEndDate } from "@/lib/probation-eval";

const SignSchema = z.object({
  contractNumber: z.string().min(3, "Cần số HĐ"),
  startDate: z.string().datetime(),
  baseSalary: z.number().int().min(0),
  signedContractUrl: z.string().min(1, "Cần upload file scan HĐ đã ký"),
});

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const userRole = (session.user as any).role;
  if (!canDo(userRole, "recruitment", "update")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const body = await request.json();
  const parsed = SignSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", issues: parsed.error.issues } }, { status: 422 });
  }

  const hr = await prisma.employee.findFirst({
    where: { userId: (session.user as any).id },
    select: { id: true },
  });
  if (!hr) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Không tìm thấy hồ sơ HCNS" } }, { status: 404 });

  const evalRec = await prisma.probationEvaluation.findUnique({
    where: { id: params.id },
    include: { employee: { select: { id: true, fullName: true, userId: true } } },
  });
  if (!evalRec) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  if (evalRec.status !== "APPROVED") {
    return NextResponse.json({ error: { code: "INVALID_STATE", message: "Chỉ ký được sau khi BGĐ duyệt" } }, { status: 409 });
  }

  const tier = evalRec.selectedTier || evalRec.recommendedTier;
  const contractType = tierToContractType(tier);
  if (!contractType) {
    return NextResponse.json({ error: { code: "INVALID_TIER", message: "Tier hiện tại là FAIL, không thể ký HĐ" } }, { status: 400 });
  }

  const startDate = new Date(parsed.data.startDate);
  const endDate = calcContractEndDate(tier, startDate);

  // Transaction: create Contract + update Employee.status + update Evaluation status
  const result = await prisma.$transaction(async (tx) => {
    const contract = await tx.contract.create({
      data: {
        employeeId: evalRec.employeeId,
        contractNumber: parsed.data.contractNumber,
        contractType,
        startDate,
        endDate,
        baseSalary: parsed.data.baseSalary,
        status: "ACTIVE",
        fileUrl: parsed.data.signedContractUrl,
      },
    });

    await tx.employee.update({
      where: { id: evalRec.employeeId },
      data: { status: "ACTIVE" },
    });

    const updatedEval = await tx.probationEvaluation.update({
      where: { id: params.id },
      data: {
        status: "SIGNED",
        hrSignedBy: hr.id,
        hrSignedAt: new Date(),
        signedContractUrl: parsed.data.signedContractUrl,
        signedContractId: contract.id,
        contractStartDate: startDate,
        contractEndDate: endDate,
      },
    });

    return { contract, evaluation: updatedEval };
  });

  // Notify NV chính thức
  if (evalRec.employee.userId) {
    await prisma.notification.create({
      data: {
        userId: evalRec.employee.userId,
        title: "Chúc mừng bạn đã chính thức trở thành NV",
        message: `HĐLĐ số ${parsed.data.contractNumber} đã được ký. Loại: ${tier}.`,
        type: "SYSTEM",
        referenceType: "contract",
        referenceId: result.contract.id,
      },
    });
  }

  return NextResponse.json({ data: result });
}
