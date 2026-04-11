import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canDo } from "@/lib/permissions";
import { z } from "zod";

const CreateSchema = z.object({
  templateId: z.string().uuid(),
  employeeId: z.string().uuid().optional().nullable(),
  departmentId: z.string().uuid().optional().nullable(),
  period: z.number().int().min(1).max(12),
  year: z.number().int(),
  actualValue: z.number(),
  notes: z.string().optional().nullable(),
});

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const templateId = searchParams.get("templateId") || "";
  const employeeId = searchParams.get("employeeId") || "";
  const departmentId = searchParams.get("departmentId") || "";
  const year = searchParams.get("year");
  const period = searchParams.get("period");

  const where: any = {};
  if (templateId) where.templateId = templateId;
  if (employeeId) where.employeeId = employeeId;
  if (departmentId) where.departmentId = departmentId;
  if (year) where.year = parseInt(year);
  if (period) where.period = parseInt(period);

  const data = await prisma.kPIRecord.findMany({
    where,
    include: {
      template: { select: { title: true, unit: true, target: true } },
      employee: { select: { id: true, code: true, fullName: true } },
    },
    orderBy: [{ year: "desc" }, { period: "desc" }],
  });

  return NextResponse.json({ data });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const userRole = (session.user as any).role;
  if (!canDo(userRole, "kpi", "calculate")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const body = await request.json();
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", issues: parsed.error.issues } }, { status: 422 });
  }

  // Calculate score based on target
  const template = await prisma.kPITemplate.findUnique({ where: { id: parsed.data.templateId } });
  const score = template ? Math.min(100, Math.round((parsed.data.actualValue / template.target) * 100)) : null;

  const existing = await prisma.kPIRecord.findFirst({
    where: {
      templateId: parsed.data.templateId,
      employeeId: parsed.data.employeeId ?? null,
      departmentId: parsed.data.departmentId ?? null,
      period: parsed.data.period,
      year: parsed.data.year,
    },
  });

  let record;
  if (existing) {
    record = await prisma.kPIRecord.update({
      where: { id: existing.id },
      data: {
        actualValue: parsed.data.actualValue,
        score,
        notes: parsed.data.notes,
        reviewedBy: (session.user as any).id,
      },
    });
  } else {
    record = await prisma.kPIRecord.create({
      data: {
        ...parsed.data,
        score,
        reviewedBy: (session.user as any).id,
      },
    });
  }

  return NextResponse.json({ data: record }, { status: 201 });
}
