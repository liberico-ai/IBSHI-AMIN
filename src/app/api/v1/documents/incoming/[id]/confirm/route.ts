import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

// POST /api/v1/documents/incoming/[id]/confirm
// Xác nhận đã nhận công văn đến (đích danh cá nhân/phòng ban). Ghi lại ai + lúc nào.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const userId = (session.user as any).id;
  const { id } = await params;

  const doc = await prisma.incomingDocument.findUnique({ where: { id } });
  if (!doc) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  if (doc.recipientType !== "CA_NHAN")
    return NextResponse.json({ error: { code: "INVALID_STATE", message: "Chỉ công văn đích danh cá nhân/phòng ban mới cần xác nhận" } }, { status: 400 });
  if (doc.confirmedAt)
    return NextResponse.json({ error: { code: "ALREADY_CONFIRMED", message: "Công văn đã được xác nhận" } }, { status: 400 });

  // Chỉ đúng cá nhân / phòng ban được gửi (hoặc HCNS) mới xác nhận được.
  const role = (session.user as any).role;
  const isHCNS = role === "HR_ADMIN" || role === "BOM" || role === "ADMIN";
  const emp = await prisma.employee.findFirst({ where: { userId }, select: { id: true, departmentId: true, fullName: true, code: true } });
  const isRecipient = !!emp && (
    (doc.routedEmployeeId && emp.id === doc.routedEmployeeId) ||
    (doc.routedDepartmentId && emp.departmentId === doc.routedDepartmentId)
  );
  if (!isRecipient && !isHCNS) {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Chỉ đúng nơi nhận mới được xác nhận công văn này" } }, { status: 403 });
  }

  const name = emp ? `${emp.fullName}${emp.code ? ` (${emp.code})` : ""}` : ((session.user as any).name || "—");

  const updated = await prisma.incomingDocument.update({
    where: { id },
    data: { confirmedAt: new Date(), confirmedById: userId, confirmedByName: name },
  });
  return NextResponse.json({ data: updated });
}
