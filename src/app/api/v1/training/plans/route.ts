import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canDo } from "@/lib/permissions";
import { z } from "zod";

const CreateSchema = z.object({
  title: z.string().min(2),
  type: z.enum(["SAFETY", "TECHNICAL", "QUALITY", "MANAGEMENT", "ONBOARDING"]),
  departmentId: z.string().uuid().optional().nullable(),
  scheduledDate: z.string(),
  trainer: z.string().min(2),
  maxParticipants: z.number().int().min(1).default(30),
  description: z.string().optional().nullable(),
  materialUrl: z.string().optional().nullable(),
});

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") || "";
  const status = searchParams.get("status") || "";
  const departmentId = searchParams.get("departmentId") || "";

  const where: any = {};
  if (type) where.type = type;
  if (status) where.status = status;
  if (departmentId) where.departmentId = departmentId;

  const data = await prisma.trainingPlan.findMany({
    where,
    include: {
      department: true,
      records: { select: { id: true, attended: true, employeeId: true } },
    },
    orderBy: { scheduledDate: "desc" },
  });

  return NextResponse.json({ data });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const userRole = (session.user as any).role;
  if (!canDo(userRole, "training", "create")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const body = await request.json();
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", issues: parsed.error.issues } }, { status: 422 });
  }

  const plan = await prisma.trainingPlan.create({
    data: {
      ...parsed.data,
      scheduledDate: new Date(parsed.data.scheduledDate),
      status: "PLANNING",
    },
    include: { department: true },
  });

  return NextResponse.json({ data: plan }, { status: 201 });
}
