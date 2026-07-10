import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canDo } from "@/lib/permissions";
import { canUser } from "@/lib/permission-catalog";
import { z } from "zod";

const UpdateSchema = z.object({
  attachmentUrl: z.string().optional().nullable(),
  isCompleted: z.boolean().optional(),
  note: z.string().optional().nullable(),
  title: z.string().optional(),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string; itemId: string } }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const userRole = (session.user as any).role;
  if (!canUser(session.user as any, "m4.tuyendung:edit")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const body = await request.json();
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", issues: parsed.error.issues } }, { status: 422 });
  }

  const data: any = {};
  if (parsed.data.attachmentUrl !== undefined) data.attachmentUrl = parsed.data.attachmentUrl;
  if (parsed.data.note !== undefined) data.note = parsed.data.note;
  if (parsed.data.title !== undefined) data.title = parsed.data.title;
  if (parsed.data.isCompleted !== undefined) {
    data.isCompleted = parsed.data.isCompleted;
    data.completedAt = parsed.data.isCompleted ? new Date() : null;
  }

  const updated = await prisma.checklistItem.update({
    where: { id: params.itemId },
    data,
  });

  // Auto mark checklist completed nếu tất cả item đều xong
  if (parsed.data.isCompleted === true) {
    const remaining = await prisma.checklistItem.count({
      where: { checklistId: params.id, isCompleted: false },
    });
    if (remaining === 0) {
      await prisma.onboardingChecklist.update({
        where: { id: params.id },
        data: { status: "COMPLETED", completedAt: new Date() },
      });
    }
  } else if (parsed.data.isCompleted === false) {
    // Nếu untick và checklist đang ở COMPLETED → revert về IN_PROGRESS
    await prisma.onboardingChecklist.updateMany({
      where: { id: params.id, status: "COMPLETED" },
      data: { status: "IN_PROGRESS", completedAt: null },
    });
  }

  return NextResponse.json({ data: updated });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string; itemId: string } }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const userRole = (session.user as any).role;
  if (!canUser(session.user as any, "m4.tuyendung:edit")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  await prisma.checklistItem.delete({ where: { id: params.itemId } });
  return NextResponse.json({ data: { ok: true } });
}
