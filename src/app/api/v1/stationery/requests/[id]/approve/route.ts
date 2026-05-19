import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { isApprover } from "../../route";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const userId = (session.user as any).id;
  if (!(await isApprover(userId)))
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Chỉ TP HCNS / BOM được duyệt" } }, { status: 403 });

  const { id } = await params;
  const req = await prisma.stationeryRequest.findUnique({ where: { id } });
  if (!req) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  if (req.status !== "PENDING_APPROVAL")
    return NextResponse.json({ error: { code: "INVALID_STATE", message: `Phiếu đang ở trạng thái ${req.status}` } }, { status: 400 });
  if (req.createdById === userId)
    return NextResponse.json({ error: { code: "SELF_APPROVE", message: "Không tự duyệt phiếu mình tạo" } }, { status: 400 });

  const data = await prisma.stationeryRequest.update({
    where: { id },
    data: { status: "APPROVED", approvedById: userId, approvedAt: new Date() },
  });
  return NextResponse.json({ data });
}
