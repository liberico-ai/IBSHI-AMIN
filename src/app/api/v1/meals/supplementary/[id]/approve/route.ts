import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canUser } from "@/lib/permission-catalog";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const userId = (session.user as any).id;
  if (!canUser(session.user as any, "m10.nhaan:approve"))
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Không có quyền duyệt suất ăn bổ sung" } }, { status: 403 });

  const { id } = await params;
  const req = await prisma.mealSupplementaryRequest.findUnique({ where: { id } });
  if (!req) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  if (req.status !== "PENDING")
    return NextResponse.json({ error: { code: "INVALID_STATE", message: `Phiếu đang ở trạng thái ${req.status}` } }, { status: 400 });

  const data = await prisma.mealSupplementaryRequest.update({
    where: { id },
    data: { status: "APPROVED", approvedBy: userId, approvedAt: new Date(), rejectedReason: null },
  });
  return NextResponse.json({ data });
}
