import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const role = (session.user as any).role;
  if (role !== "HR_ADMIN" && role !== "BOM")
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Chỉ NV phụ trách phòng họp (HR_ADMIN/BOM) duyệt" } }, { status: 403 });

  const { id } = await params;
  const b = await prisma.roomBooking.findUnique({ where: { id } });
  if (!b) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  if (b.status !== "PENDING_APPROVAL")
    return NextResponse.json({ error: { code: "INVALID_STATE" } }, { status: 400 });

  // Khi duyệt, phải check không có booking APPROVED khác overlap (đã có cùng phòng từ phiếu khác đã được duyệt trước)
  const conflict = await prisma.roomBooking.findFirst({
    where: {
      id: { not: id },
      roomId: b.roomId,
      status: "APPROVED",
      startTime: { lt: b.endTime },
      endTime: { gt: b.startTime },
    },
    select: { title: true },
  });
  if (conflict) return NextResponse.json({
    error: { code: "CONFLICT", message: `Phòng đã có lịch APPROVED khác trong khung giờ: "${conflict.title}"` },
  }, { status: 409 });

  const userId = (session.user as any).id;
  const data = await prisma.roomBooking.update({
    where: { id },
    data: { status: "APPROVED", approvedById: userId, approvedAt: new Date() },
  });
  return NextResponse.json({ data });
}
