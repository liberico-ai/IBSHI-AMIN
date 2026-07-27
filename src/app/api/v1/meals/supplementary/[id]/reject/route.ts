import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { canUser } from "@/lib/permission-catalog";
import { canActOnDeptScope } from "@/lib/data-scope.server";

const Schema = z.object({ reason: z.string().optional().nullable() });

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const userId = (session.user as any).id;
  const userRole = (session.user as any).role;
  if (!canUser(session.user as any, "m10.nhaan.dangky:approve"))
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Không có quyền duyệt suất ăn bổ sung" } }, { status: 403 });

  const { id } = await params;
  const body = Schema.safeParse(await request.json().catch(() => ({})));
  const reason = body.success ? (body.data.reason || null) : null;

  const req = await prisma.mealSupplementaryRequest.findUnique({ where: { id } });
  if (!req) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  // Phạm vi bọc cả quyền Duyệt — chỉ từ chối được đơn của phòng trong phạm vi được cấp.
  if (!(await canActOnDeptScope(userId, userRole, "m10.nhaan.dangky", req.departmentId)))
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Đơn này ngoài phạm vi được cấp" } }, { status: 403 });
  if (req.status !== "PENDING")
    return NextResponse.json({ error: { code: "INVALID_STATE", message: `Phiếu đang ở trạng thái ${req.status}` } }, { status: 400 });

  const data = await prisma.mealSupplementaryRequest.update({
    where: { id },
    data: { status: "REJECTED", approvedBy: userId, approvedAt: new Date(), rejectedReason: reason },
  });
  return NextResponse.json({ data });
}
