import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { checkPermission } from "@/lib/permissions";
import { z } from "zod";

const UpdateSchema = z.object({
  isCompleted: z.boolean().optional(),
  note: z.string().optional().nullable(),
  assignedTo: z.string().uuid().optional().nullable(),
});

// PUT /api/v1/events/:id/checklist/:itemId
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const userRole = (session.user as any).role;
  if (!checkPermission(userRole, "MANAGER")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const { itemId } = await params;
  const item = await prisma.auditChecklist.findUnique({ where: { id: itemId } });
  if (!item) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });

  const body = await request.json();
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", issues: parsed.error.issues } }, { status: 422 });
  }

  const updateData: any = { ...parsed.data };
  if (parsed.data.isCompleted === true && !item.isCompleted) {
    updateData.completedAt = new Date();
  } else if (parsed.data.isCompleted === false) {
    updateData.completedAt = null;
  }

  const updated = await prisma.auditChecklist.update({ where: { id: itemId }, data: updateData });
  return NextResponse.json({ data: updated });
}

// DELETE /api/v1/events/:id/checklist/:itemId
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const userRole = (session.user as any).role;
  if (!checkPermission(userRole, "HR_ADMIN")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const { itemId } = await params;
  await prisma.auditChecklist.delete({ where: { id: itemId } });
  return NextResponse.json({ data: { deleted: true } });
}
