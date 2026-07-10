import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canDo } from "@/lib/permissions";
import { canUser } from "@/lib/permission-catalog";
import { z } from "zod";

const UpdateSchema = z.object({
  fullName: z.string().min(1).optional(),
  relationship: z.string().min(1).optional(),
  dateOfBirth: z.string().optional().nullable(),
  taxCode: z.string().optional().nullable(),
  documentUrls: z.array(z.string()).optional(),
  declaration: z.string().optional().nullable(),
  registeredAt: z.string().optional().nullable(),
  stoppedAt: z.string().optional().nullable(), // set = dừng NPT; null = bật lại
});

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string; depId: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  if (!canUser(session.user as any, "m1.npt:edit")) {
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
  if (parsed.data.documentUrls !== undefined) data.documentUrls = parsed.data.documentUrls;
  if (parsed.data.declaration !== undefined) data.declaration = parsed.data.declaration?.trim() || null;
  if (parsed.data.registeredAt !== undefined) data.registeredAt = parsed.data.registeredAt ? new Date(parsed.data.registeredAt) : null;
  if (parsed.data.stoppedAt !== undefined) data.stoppedAt = parsed.data.stoppedAt ? new Date(parsed.data.stoppedAt) : null;

  const updated = await prisma.dependent.update({ where: { id: depId }, data });

  // Nếu đổi trạng thái dừng/bật lại → sync lại counter NPT đang hiệu lực (M7 thuế TNCN).
  if (parsed.data.stoppedAt !== undefined) {
    const { id: employeeId } = await params;
    const count = await prisma.dependent.count({ where: { employeeId, stoppedAt: null } });
    await prisma.employee.update({ where: { id: employeeId }, data: { dependents: count } });
  }

  return NextResponse.json({ data: updated });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; depId: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  if (!canUser(session.user as any, "m1.npt:edit")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const { id: employeeId, depId } = await params;
  await prisma.dependent.delete({ where: { id: depId } });

  // Sync counter — chỉ đếm NPT đang hiệu lực (chưa dừng).
  const count = await prisma.dependent.count({ where: { employeeId, stoppedAt: null } });
  await prisma.employee.update({ where: { id: employeeId }, data: { dependents: count } });

  return NextResponse.json({ data: { ok: true } });
}
