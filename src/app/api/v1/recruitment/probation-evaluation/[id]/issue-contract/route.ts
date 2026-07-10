import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canDo } from "@/lib/permissions";
import { canUser } from "@/lib/permission-catalog";
import { z } from "zod";
import { tierToContractType, calcContractEndDate } from "@/lib/probation-eval";

// Soạn thảo + PHÁT HÀNH hợp đồng: lưu nội dung HĐ, chuyển trạng thái APPROVED → CONTRACT_ISSUED (Đợi ký).
const IssueSchema = z.object({
  contractNumber: z.string().min(3, "Cần số HĐ"),
  startDate: z.string().min(1),
  baseSalary: z.number().int().min(0),
  allowance: z.number().int().min(0).optional().default(0),
  kpi: z.number().int().min(0).optional().default(0),
  jobTitle: z.string().optional().nullable(),
  workLocation: z.string().optional().nullable(),
  terms: z.string().optional().nullable(),
  contractHtml: z.string().optional().nullable(), // nội dung văn bản HĐ đã soạn/sửa (để in PDF/Word)
});

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const userRole = (session.user as any).role;
  if (!canUser(session.user as any, "m4.thuviec:edit")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const body = await request.json();
  const parsed = IssueSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", issues: parsed.error.issues } }, { status: 422 });
  }

  const evalRec = await prisma.probationEvaluation.findUnique({
    where: { id: params.id },
    include: { employee: { select: { id: true, fullName: true } } },
  });
  if (!evalRec) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  if (evalRec.status !== "APPROVED") {
    return NextResponse.json({ error: { code: "INVALID_STATE", message: "Chỉ soạn thảo HĐ sau khi BGĐ duyệt" } }, { status: 409 });
  }

  const tier = evalRec.selectedTier || evalRec.recommendedTier;
  const contractType = tierToContractType(tier);
  if (!contractType) {
    return NextResponse.json({ error: { code: "INVALID_TIER", message: "Tier hiện tại là FAIL, không thể soạn HĐ" } }, { status: 400 });
  }

  const startDate = new Date(parsed.data.startDate);
  const endDate = calcContractEndDate(tier, startDate);

  const contractDraft = {
    contractNumber: parsed.data.contractNumber,
    contractType,
    startDate: startDate.toISOString(),
    endDate: endDate ? endDate.toISOString() : null,
    baseSalary: parsed.data.baseSalary,
    allowance: parsed.data.allowance ?? 0,
    kpi: parsed.data.kpi ?? 0,
    jobTitle: parsed.data.jobTitle ?? null,
    workLocation: parsed.data.workLocation ?? null,
    terms: parsed.data.terms ?? null,
    contractHtml: parsed.data.contractHtml ?? null,
  };

  const updated = await prisma.probationEvaluation.update({
    where: { id: params.id },
    data: {
      status: "CONTRACT_ISSUED",
      contractDraft,
      contractIssuedAt: new Date(),
      contractStartDate: startDate,
      contractEndDate: endDate,
    },
  });

  return NextResponse.json({ data: updated });
}
