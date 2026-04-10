import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { checkPermission } from "@/lib/permissions";
import { z } from "zod";

const UpdateSchema = z.object({
  title: z.string().min(2).optional(),
  type: z.enum(["SAFETY", "TECHNICAL", "QUALITY", "MANAGEMENT", "ONBOARDING"]).optional(),
  departmentId: z.string().uuid().optional().nullable(),
  scheduledDate: z.string().optional(),
  trainer: z.string().min(2).optional(),
  maxParticipants: z.number().int().min(1).optional(),
  description: z.string().optional().nullable(),
  status: z.enum(["PLANNING", "PREPARING", "READY", "IN_PROGRESS", "COMPLETED", "CANCELLED"]).optional(),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const { id } = await params;
  const plan = await prisma.trainingPlan.findUnique({
    where: { id },
    include: {
      department: true,
      records: {
        include: { employee: { select: { id: true, code: true, fullName: true } } },
      },
    },
  });

  if (!plan) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  return NextResponse.json({ data: plan });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const userRole = (session.user as any).role;
  if (!checkPermission(userRole, "HR_ADMIN")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const { id } = await params;
  const plan = await prisma.trainingPlan.findUnique({ where: { id } });
  if (!plan) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });

  const body = await request.json();
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", issues: parsed.error.issues } }, { status: 422 });
  }

  const updateData: any = { ...parsed.data };
  if (parsed.data.scheduledDate) updateData.scheduledDate = new Date(parsed.data.scheduledDate);

  const updated = await prisma.trainingPlan.update({
    where: { id },
    data: updateData,
    include: { department: true },
  });

  return NextResponse.json({ data: updated });
}
