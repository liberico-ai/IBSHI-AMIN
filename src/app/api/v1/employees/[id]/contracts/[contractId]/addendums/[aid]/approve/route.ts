import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";

const Schema = z.object({ action: z.enum(["APPROVE", "REJECT"]), reason: z.string().optional().nullable() });

// POST — TP HCNS / BOM Duyệt / Từ chối phụ lục HĐ.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string; contractId: string; aid: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const role = (session.user as any).role;
  const userId = (session.user as any).id;
  if (!["HR_ADMIN", "BOM"].includes(role))
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Chỉ TP HCNS / BGĐ được duyệt" } }, { status: 403 });

  const { aid } = await params;
  const body = Schema.safeParse(await request.json().catch(() => ({})));
  if (!body.success) return NextResponse.json({ error: { code: "VALIDATION_ERROR" } }, { status: 422 });

  const a = await prisma.contractAddendum.findUnique({ where: { id: aid }, include: { contract: { include: { employee: { select: { userId: true } } } } } });
  if (!a) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  if (a.status !== "PENDING_APPROVAL")
    return NextResponse.json({ error: { code: "INVALID_STATE", message: `Phụ lục đang ở trạng thái ${a.status}` } }, { status: 400 });

  const approve = body.data.action === "APPROVE";
  const updated = await prisma.contractAddendum.update({
    where: { id: aid },
    data: { status: approve ? "APPROVED" : "REJECTED", approvedBy: userId, approvedAt: new Date(), rejectedReason: approve ? null : (body.data.reason || null) },
  });

  if (a.contract.employee?.userId) {
    await prisma.notification.create({
      data: {
        userId: a.contract.employee.userId,
        title: approve ? "Phụ lục HĐ đã được duyệt" : "Phụ lục HĐ bị từ chối",
        message: approve ? `Phụ lục ${a.addendumNumber} đã được duyệt. Vui lòng in và ký để hoàn tất.` : `Phụ lục ${a.addendumNumber} bị từ chối${body.data.reason ? `: ${body.data.reason}` : "."}`,
        type: approve ? "APPROVED" : "REJECTED",
        referenceType: "contract_addendum",
        referenceId: aid,
      },
    }).catch(() => {});
  }

  return NextResponse.json({ data: updated });
}
