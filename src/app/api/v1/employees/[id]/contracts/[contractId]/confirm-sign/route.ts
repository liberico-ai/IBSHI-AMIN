import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canDo } from "@/lib/permissions";
import { z } from "zod";

const Schema = z.object({ fileUrl: z.string().min(1, "Cần upload bản scan hợp đồng đã ký") });

// POST — XÁC NHẬN ĐÃ KÝ hợp đồng đang ở trạng thái "Đợi ký" (WAITING_SIGN):
//   upload bản scan HĐ đã ký → HĐ thành HIỆU LỰC (ACTIVE) + gia hạn HĐ cũ (ACTIVE/EXPIRING_SOON) → RENEWED.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; contractId: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const userRole = (session.user as any).role;
  if (!canDo(userRole, "employees", "readAll")) return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });

  const { id: employeeId, contractId } = await params;
  const body = await req.json();
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message, issues: parsed.error.issues } }, { status: 422 });
  }

  const contract = await prisma.contract.findFirst({ where: { id: contractId, employeeId }, select: { id: true, status: true, startDate: true } });
  if (!contract) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  if (contract.status !== "WAITING_SIGN") {
    return NextResponse.json({ error: { code: "CONFLICT", message: "Hợp đồng không ở trạng thái Đợi ký." } }, { status: 409 });
  }

  // Ngày kết thúc HĐ cũ = ngày bắt đầu HĐ mới − 1 ngày.
  const supersedeEnd = new Date(contract.startDate);
  supersedeEnd.setDate(supersedeEnd.getDate() - 1);

  await prisma.$transaction(async (tx) => {
    // Gia hạn HĐ cũ đang hiệu lực (TRỪ chính HĐ này) → RENEWED.
    const oldActive = await tx.contract.findMany({
      where: { employeeId, status: { in: ["ACTIVE", "EXPIRING_SOON"] }, id: { not: contractId } },
      select: { id: true, startDate: true, endDate: true },
    });
    for (const old of oldActive) {
      const setEnd = supersedeEnd >= new Date(old.startDate) && (!old.endDate || new Date(old.endDate) > supersedeEnd);
      await tx.contract.update({ where: { id: old.id }, data: { status: "RENEWED", ...(setEnd ? { endDate: supersedeEnd } : {}) } });
    }
    await tx.contract.update({ where: { id: contractId }, data: { status: "ACTIVE", fileUrl: parsed.data.fileUrl } });
    await tx.auditLog.create({
      data: { userId: (session.user as any).id, action: "UPDATE", entityType: "Contract", entityId: contractId, newValue: JSON.stringify({ confirmSigned: true, supersededCount: oldActive.length }) },
    });
  });

  return NextResponse.json({ data: { id: contractId, status: "ACTIVE" } });
}
