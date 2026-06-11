import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canDo } from "@/lib/permissions";
import { z } from "zod";

const CreateSchema = z.object({
  fullName: z.string().min(1),
  dateOfBirth: z.string().optional().nullable(),
  taxCode: z.string().optional().nullable(),
  idNumber: z.string().optional().nullable(),
  documentUrls: z.array(z.string()).default([]),
});

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const { id: employeeId } = await params;
  const userRole = (session.user as { role: string }).role;
  const userId = (session.user as { id: string }).id;

  // PII con cái: chỉ chính chủ hoặc HR_ADMIN+ xem được.
  if (!canDo(userRole, "employees", "readAll")) {
    const target = await prisma.employee.findUnique({ where: { id: employeeId }, select: { userId: true } });
    if (!target || target.userId !== userId) {
      return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
    }
  }

  const data = await prisma.child.findMany({ where: { employeeId }, orderBy: { dateOfBirth: "asc" } });
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const userRole = (session.user as any).role;
  if (!canDo(userRole, "employees", "readAll")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const { id: employeeId } = await params;
  const parsed = CreateSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", issues: parsed.error.issues } }, { status: 422 });
  }

  const created = await prisma.child.create({
    data: {
      employeeId,
      fullName: parsed.data.fullName,
      dateOfBirth: parsed.data.dateOfBirth ? new Date(parsed.data.dateOfBirth) : null,
      taxCode: parsed.data.taxCode?.trim() || null,
      idNumber: parsed.data.idNumber?.trim() || null,
      documentUrls: parsed.data.documentUrls,
    },
  });
  return NextResponse.json({ data: created }, { status: 201 });
}
