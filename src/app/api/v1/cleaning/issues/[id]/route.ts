import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canDo } from "@/lib/permissions";
import { z } from "zod";

const UpdateSchema = z.object({
  status: z.enum(["REPORTED", "IN_PROGRESS", "RESOLVED"]).optional(),
  assignedTo: z.string().optional().nullable(),
});

// PUT /api/v1/cleaning/issues/:id
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const userRole = (session.user as any).role;
  if (!canDo(userRole, "cleaning", "read")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const { id } = await params;
  const issue = await prisma.cleaningIssue.findUnique({ where: { id } });
  if (!issue) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });

  const body = await request.json();
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", issues: parsed.error.issues } }, { status: 422 });
  }

  const updateData: any = { ...parsed.data };
  if (parsed.data.status === "RESOLVED" && issue.status !== "RESOLVED") {
    updateData.resolvedAt = new Date();
  } else if (parsed.data.status && parsed.data.status !== "RESOLVED") {
    updateData.resolvedAt = null;
  }

  const updated = await prisma.cleaningIssue.update({ where: { id }, data: updateData });
  return NextResponse.json({ data: updated });
}
