import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { checkPermission } from "@/lib/permissions";
import { z } from "zod";

const CreateSchema = z.object({
  employeeId: z.string().uuid(),
  conductedBy: z.string().min(2),
  inductionDate: z.string(),
  passed: z.boolean().default(false),
  score: z.number().int().min(0).max(100).optional().nullable(),
  nextDueDate: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const employeeId = searchParams.get("employeeId") || "";

  const where: any = {};
  if (employeeId) where.employeeId = employeeId;

  const data = await prisma.hSEInduction.findMany({
    where,
    include: { employee: { select: { id: true, code: true, fullName: true, department: { select: { name: true } } } } },
    orderBy: { inductionDate: "desc" },
  });

  return NextResponse.json({ data });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const userRole = (session.user as any).role;
  if (!checkPermission(userRole, "HR_ADMIN")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const body = await request.json();
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", issues: parsed.error.issues } }, { status: 422 });
  }

  const induction = await prisma.hSEInduction.create({
    data: {
      ...parsed.data,
      inductionDate: new Date(parsed.data.inductionDate),
      nextDueDate: parsed.data.nextDueDate ? new Date(parsed.data.nextDueDate) : null,
    },
    include: { employee: { select: { id: true, code: true, fullName: true } } },
  });

  return NextResponse.json({ data: induction }, { status: 201 });
}
