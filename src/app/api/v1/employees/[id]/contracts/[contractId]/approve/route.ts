import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";

// POST — TP HCNS / BOM duyệt hoặc từ chối HĐ (dùng cho HĐ thử việc chờ duyệt).
//   body: { action: "APPROVE" | "REJECT", reason?: string }
const Schema = z.object({ action: z.enum(["APPROVE", "REJECT"]), reason: z.string().optional().nullable() });

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string; contractId: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const role = (session.user as any).role;
  const userId = (session.user as any).id;
  if (!["HR_ADMIN", "BOM", "ADMIN"].includes(role))
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Chỉ TP HCNS / BGĐ được duyệt" } }, { status: 403 });

  const { contractId } = await params;
  const body = Schema.safeParse(await request.json().catch(() => ({})));
  if (!body.success) return NextResponse.json({ error: { code: "VALIDATION_ERROR" } }, { status: 422 });

  const c = await prisma.contract.findUnique({ where: { id: contractId }, include: { employee: { select: { userId: true, fullName: true } } } });
  if (!c) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  if (c.status !== "PENDING_APPROVAL")
    return NextResponse.json({ error: { code: "INVALID_STATE", message: `HĐ đang ở trạng thái ${c.status}` } }, { status: 400 });

  const approve = body.data.action === "APPROVE";
  const updated = await prisma.contract.update({
    where: { id: contractId },
    data: {
      status: approve ? "ACTIVE" : "REJECTED",
      approvedBy: userId,
      approvedAt: new Date(),
      rejectedReason: approve ? null : (body.data.reason || null),
    },
  });

  if (c.employee?.userId) {
    await prisma.notification.create({
      data: {
        userId: c.employee.userId,
        title: approve ? "HĐ thử việc đã được duyệt" : "HĐ thử việc bị từ chối",
        message: approve ? `HĐ thử việc ${c.contractNumber} đã được duyệt.` : `HĐ thử việc ${c.contractNumber} bị từ chối${body.data.reason ? `: ${body.data.reason}` : "."}`,
        type: approve ? "APPROVED" : "REJECTED",
        referenceType: "contract",
        referenceId: contractId,
      },
    }).catch(() => {});
  }

  return NextResponse.json({ data: updated });
}
