import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canDo } from "@/lib/permissions";
import { z } from "zod";

const UpdateSchema = z.object({
  fullName: z.string().min(1).optional(),
  dateOfBirth: z.string().optional().nullable(),
  taxCode: z.string().optional().nullable(),
  idNumber: z.string().optional().nullable(),
  documentUrls: z.array(z.string()).optional(),
});

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string; childId: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const userRole = (session.user as any).role;
  if (!canDo(userRole, "employees", "readAll")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const { childId } = await params;
  const parsed = UpdateSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", issues: parsed.error.issues } }, { status: 422 });
  }

  const data: any = {};
  if (parsed.data.fullName !== undefined) data.fullName = parsed.data.fullName;
  if (parsed.data.dateOfBirth !== undefined) data.dateOfBirth = parsed.data.dateOfBirth ? new Date(parsed.data.dateOfBirth) : null;
  if (parsed.data.taxCode !== undefined) data.taxCode = parsed.data.taxCode?.trim() || null;
  if (parsed.data.idNumber !== undefined) data.idNumber = parsed.data.idNumber?.trim() || null;
  if (parsed.data.documentUrls !== undefined) data.documentUrls = parsed.data.documentUrls;

  const updated = await prisma.child.update({ where: { id: childId }, data });
  return NextResponse.json({ data: updated });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; childId: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const userRole = (session.user as any).role;
  if (!canDo(userRole, "employees", "readAll")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const { childId } = await params;
  await prisma.child.delete({ where: { id: childId } });
  return NextResponse.json({ data: { ok: true } });
}
