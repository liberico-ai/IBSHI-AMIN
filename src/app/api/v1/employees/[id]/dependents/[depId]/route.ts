import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canDo } from "@/lib/permissions";
import { z } from "zod";

const UpdateSchema = z.object({
  fullName: z.string().min(1).optional(),
  relationship: z.string().min(1).optional(),
  dateOfBirth: z.string().optional().nullable(),
  taxCode: z.string().optional().nullable(),
});

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string; depId: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const userRole = (session.user as any).role;
  if (!canDo(userRole, "employees", "readAll")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const { depId } = await params;
  const body = await req.json();
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", issues: parsed.error.issues } }, { status: 422 });
  }

  const data: any = {};
  if (parsed.data.fullName !== undefined) data.fullName = parsed.data.fullName;
  if (parsed.data.relationship !== undefined) data.relationship = parsed.data.relationship;
  if (parsed.data.dateOfBirth !== undefined) data.dateOfBirth = parsed.data.dateOfBirth ? new Date(parsed.data.dateOfBirth) : null;
  if (parsed.data.taxCode !== undefined) data.taxCode = parsed.data.taxCode;

  const updated = await prisma.dependent.update({ where: { id: depId }, data });
  return NextResponse.json({ data: updated });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; depId: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const userRole = (session.user as any).role;
  if (!canDo(userRole, "employees", "readAll")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const { id: employeeId, depId } = await params;
  await prisma.dependent.delete({ where: { id: depId } });

  // Sync counter
  const count = await prisma.dependent.count({ where: { employeeId } });
  await prisma.employee.update({ where: { id: employeeId }, data: { dependents: count } });

  return NextResponse.json({ data: { ok: true } });
}
