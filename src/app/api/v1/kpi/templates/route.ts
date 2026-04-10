import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { checkPermission } from "@/lib/permissions";
import { z } from "zod";

const CreateSchema = z.object({
  title: z.string().min(2),
  description: z.string().optional().nullable(),
  unit: z.string().min(1),
  target: z.number(),
  weight: z.number().default(1.0),
  departmentId: z.string().uuid().optional().nullable(),
  periodType: z.enum(["MONTHLY", "QUARTERLY", "YEARLY"]).default("MONTHLY"),
});

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const departmentId = searchParams.get("departmentId") || "";

  const where: any = { isActive: true };
  if (departmentId) where.departmentId = departmentId;

  const data = await prisma.kPITemplate.findMany({
    where,
    include: { department: { select: { name: true } } },
    orderBy: { title: "asc" },
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

  const template = await prisma.kPITemplate.create({
    data: parsed.data,
    include: { department: { select: { name: true } } },
  });

  return NextResponse.json({ data: template }, { status: 201 });
}
