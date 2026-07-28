import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canUser } from "@/lib/permission-catalog";
import { generateReconcileForLog } from "@/lib/attendance-reconcile";

// POST — kê khai (gửi) phiếu NHÁP → tự so khớp chấm công (chủ phiếu hoặc người có quyền sửa).
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const userId = (session.user as any).id;
  const { id } = await params;

  const log = await prisma.teamWorkLog.findUnique({ where: { id }, include: { entries: true } });
  if (!log) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  if (log.status !== "DRAFT") return NextResponse.json({ error: { code: "INVALID_STATE", message: "Chỉ gửi được phiếu đang NHÁP" } }, { status: 400 });
  if (log.createdById !== userId && !canUser(session.user as any, "m3.phieuto:edit"))
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });

  const data = await prisma.teamWorkLog.update({ where: { id }, data: { status: "PENDING" } });
  await generateReconcileForLog({
    date: log.date, departmentId: log.departmentId, departmentName: log.departmentName,
    entries: log.entries.map((e) => ({ employeeId: e.employeeId, employeeName: e.employeeName, hours: e.hours })),
  });
  return NextResponse.json({ data });
}
