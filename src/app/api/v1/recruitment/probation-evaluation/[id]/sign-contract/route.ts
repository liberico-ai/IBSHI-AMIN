import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canDo } from "@/lib/permissions";
import { canUser } from "@/lib/permission-catalog";
import { z } from "zod";

// Xác nhận đã ký HĐ: từ CONTRACT_ISSUED (đã soạn + phát hành) → upload bản scan đã ký →
// tạo Contract chính thức + Employee.status = ACTIVE + đánh dấu SIGNED.
const SignSchema = z.object({
  signedContractUrl: z.string().min(1, "Cần upload file scan HĐ đã ký"),
});

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const userRole = (session.user as any).role;
  if (!canUser(session.user as any, "m4.thuviec:edit")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const body = await request.json();
  const parsed = SignSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", issues: parsed.error.issues } }, { status: 422 });
  }

  const hr = await prisma.employee.findFirst({ where: { userId: (session.user as any).id }, select: { id: true } });
  if (!hr) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Không tìm thấy hồ sơ HCNS" } }, { status: 404 });

  const evalRec = await prisma.probationEvaluation.findUnique({
    where: { id: params.id },
    include: { employee: { select: { id: true, fullName: true, userId: true } } },
  });
  if (!evalRec) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  if (evalRec.status !== "CONTRACT_ISSUED") {
    return NextResponse.json({ error: { code: "INVALID_STATE", message: "Chỉ xác nhận ký sau khi đã phát hành (soạn thảo) HĐ" } }, { status: 409 });
  }
  const d: any = evalRec.contractDraft;
  if (!d) return NextResponse.json({ error: { code: "NO_DRAFT", message: "Thiếu nội dung HĐ đã soạn" } }, { status: 409 });

  const startDate = d.startDate ? new Date(d.startDate) : new Date();
  const endDate = d.endDate ? new Date(d.endDate) : null;
  // Tổng thu nhập = lương chính + phụ cấp + KPI (đưa vào allowance để engine M7 dùng)
  const allowanceTotal = (d.allowance || 0) + (d.kpi || 0);

  const result = await prisma.$transaction(async (tx) => {
    // Khi ký HĐ chính thức → HĐ thử việc cũ (ACTIVE) phải chuyển sang EXPIRED ("Hết hạn"),
    // ngày kết thúc thực = ngày trước khi HĐ mới bắt đầu (nếu hợp lệ).
    const probEnd = new Date(startDate); probEnd.setDate(probEnd.getDate() - 1);
    const oldProb = await tx.contract.findMany({
      where: { employeeId: evalRec.employeeId, contractType: "PROBATION", status: "ACTIVE" },
      select: { id: true, startDate: true, endDate: true },
    });
    for (const p of oldProb) {
      const setEnd = probEnd >= new Date(p.startDate) && (!p.endDate || new Date(p.endDate) > probEnd);
      await tx.contract.update({
        where: { id: p.id },
        data: { status: "EXPIRED", ...(setEnd ? { endDate: probEnd } : {}) },
      });
    }

    const contract = await tx.contract.create({
      data: {
        employeeId: evalRec.employeeId,
        contractNumber: d.contractNumber,
        contractType: d.contractType,
        startDate,
        endDate,
        baseSalary: d.baseSalary,
        insuranceSalary: d.baseSalary,
        allowance: allowanceTotal,
        allowances: { kpi: d.kpi || 0, phone: 0, fuel: 0, housing: 0 },
        position: d.jobTitle ?? undefined,
        status: "ACTIVE",
        fileUrl: parsed.data.signedContractUrl,
      },
    });

    await tx.employee.update({ where: { id: evalRec.employeeId }, data: { status: "ACTIVE" } });

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

  if (evalRec.employee.userId) {
    await prisma.notification.create({
      data: {
        userId: evalRec.employee.userId,
        title: "Chúc mừng bạn đã chính thức trở thành nhân viên",
        message: `HĐLĐ số ${d.contractNumber} đã được ký kết. Loại HĐ: ${d.contractType}.`,
        type: "SYSTEM",
        referenceType: "contract",
        referenceId: result.contract.id,
      },
    });
  }

  return NextResponse.json({ data: result });
}
