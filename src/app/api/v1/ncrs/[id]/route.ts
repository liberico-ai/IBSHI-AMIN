import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { checkPermission } from "@/lib/permissions";
import { z } from "zod";

const UpdateSchema = z.object({
  status: z.enum(["OPEN", "IN_PROGRESS", "PENDING_REVIEW", "CLOSED", "OVERDUE"]).optional(),
  rootCause: z.string().optional().nullable(),
  correctiveAction: z.string().optional().nullable(),
  assignedToId: z.string().uuid().optional().nullable(),
  dueDate: z.string().optional(),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const userRole = (session.user as any).role;
  if (!checkPermission(userRole, "HR_ADMIN")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const { id } = await params;
  const ncr = await prisma.nCR.findUnique({ where: { id } });
  if (!ncr) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });

  const body = await request.json();
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", issues: parsed.error.issues } }, { status: 422 });
  }

  const updateData: any = { ...parsed.data };
  if (parsed.data.dueDate) updateData.dueDate = new Date(parsed.data.dueDate);
  if (parsed.data.status === "CLOSED") updateData.closedAt = new Date();

  const updated = await prisma.nCR.update({
    where: { id },
    data: updateData,
    include: { assignedTo: { select: { id: true, fullName: true } } },
  });

  return NextResponse.json({ data: updated });
}
