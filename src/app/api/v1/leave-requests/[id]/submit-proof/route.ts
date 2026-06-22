import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";

const Schema = z.object({ proofUrls: z.array(z.string()).min(1, "Vui lòng đính kèm giấy tờ") });

// POST — bổ sung giấy tờ chứng minh cho đơn nghỉ (chính chủ hoặc HCNS).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const userId = (session.user as any).id;
  const role = (session.user as any).role;
  const { id } = await params;

  const parsed = Schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", issues: parsed.error.issues } }, { status: 422 });
  }

  const leave = await prisma.leaveRequest.findUnique({
    where: { id },
    include: { employee: { select: { userId: true } } },
  });
  if (!leave) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });

  const isOwner = leave.employee?.userId === userId;
  const isHR = ["HR_ADMIN", "BOM", "MANAGER", "ADMIN"].includes(role);
  if (!isOwner && !isHR) {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Chỉ chính chủ hoặc HCNS bổ sung được" } }, { status: 403 });
  }

  const updated = await prisma.leaveRequest.update({
    where: { id },
    data: {
      proofUrls: parsed.data.proofUrls,
      proofSubmittedAt: new Date(),
    },
  });
  return NextResponse.json({ data: updated });
}
