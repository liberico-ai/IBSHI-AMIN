import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canDo } from "@/lib/permissions";
import { canUser } from "@/lib/permission-catalog";
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

  // PII con cái: chỉ chính chủ hoặc người có quyền xem hồ sơ (m1.hoso:view) mới xem được.
  if (!canUser(session.user as any, "m1.hoso:view")) {
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

  if (!canUser(session.user as any, "m1.hoso:edit")) {
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
