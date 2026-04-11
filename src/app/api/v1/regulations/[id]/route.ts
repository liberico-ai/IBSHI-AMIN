import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canDo } from "@/lib/permissions";
import { z } from "zod";

const UpdateSchema = z.object({
  title: z.string().min(2).optional(),
  category: z.enum(["GATE_SECURITY", "DISCIPLINE", "EQUIPMENT", "SEAL", "UNIFORM", "GENERAL"]).optional(),
  content: z.string().optional(),
  effectiveDate: z.string().optional(),
  fileUrl: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const userRole = (session.user as any).role;
  if (!canDo(userRole, "regulations", "create")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const { id } = await params;
  const regulation = await prisma.regulation.findUnique({ where: { id } });
  if (!regulation) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });

  const body = await request.json();
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", issues: parsed.error.issues } }, { status: 422 });
  }

  const updateData: any = { ...parsed.data };
  if (parsed.data.effectiveDate) updateData.effectiveDate = new Date(parsed.data.effectiveDate);

  const updated = await prisma.regulation.update({ where: { id }, data: updateData });
  return NextResponse.json({ data: updated });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const userRole = (session.user as any).role;
  if (!canDo(userRole, "regulations", "delete")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const { id } = await params;
  const regulation = await prisma.regulation.findUnique({ where: { id } });
  if (!regulation) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });

  // Soft delete — set isActive = false
  const updated = await prisma.regulation.update({ where: { id }, data: { isActive: false } });
  return NextResponse.json({ data: updated });
}
