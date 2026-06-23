import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

// NV tự huỷ phiếu của mình (Q5 — anh sontt confirm cho phép).
// Approver (HR_ADMIN/BOM) cũng huỷ được.
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const userId = (session.user as any).id;
  const role = (session.user as any).role;

  const { id } = await params;
  const b = await prisma.roomBooking.findUnique({
    where: { id },
    include: { requester: { include: { user: { select: { id: true } } } } },
  });
  if (!b) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  if (b.status === "CANCELLED" || b.status === "REJECTED")
    return NextResponse.json({ error: { code: "INVALID_STATE" } }, { status: 400 });

  const isOwner = b.requester.user?.id === userId;
  const isAdmin = role === "HR_ADMIN" || role === "BOM" || role === "ADMIN";
  if (!isOwner && !isAdmin)
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Chỉ chủ phiếu hoặc admin được huỷ" } }, { status: 403 });

  const data = await prisma.roomBooking.update({ where: { id }, data: { status: "CANCELLED" } });
  return NextResponse.json({ data });
}
