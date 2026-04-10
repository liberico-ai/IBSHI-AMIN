import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";

const EVAL_CRITERIA = ["leadership", "teamwork", "technical", "communication", "punctuality"];

const CreateSchema = z.object({
  employeeId: z.string().uuid(),
  period: z.string().min(3), // "Q1/2026"
  relationship: z.enum(["SELF", "MANAGER", "PEER", "SUBORDINATE"]),
  scores: z.record(z.string(), z.number().int().min(1).max(5)),
  comment: z.string().max(1000).optional(),
});

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const userId = (session.user as any).id;
  const userRole = (session.user as any).role;

  const { searchParams } = new URL(request.url);
  const period = searchParams.get("period") ?? undefined;
  const employeeId = searchParams.get("employeeId") ?? undefined;

  // Employees can only see their own evaluations
  // HR_ADMIN+ can see any employee's evaluations
  let where: any = {};
  if (period) where.period = period;

  const isHR = ["HR_ADMIN", "BOM"].includes(userRole);

  if (employeeId && isHR) {
    where.employeeId = employeeId;
  } else {
    // Find this user's employee record
    const myEmployee = await prisma.employee.findFirst({
      where: { userId },
      select: { id: true },
    });
    if (!myEmployee) return NextResponse.json({ data: [] });
    where.employeeId = myEmployee.id;
  }

  const evaluations = await prisma.evaluation360.findMany({
    where,
    include: {
      evaluator: { select: { id: true, fullName: true, position: { select: { name: true } } } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ data: evaluations });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const userId = (session.user as any).id;

  const body = await request.json();
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", issues: parsed.error.issues } }, { status: 422 });
  }

  // Find evaluator's employee record
  const evaluator = await prisma.employee.findFirst({
    where: { userId },
    select: { id: true },
  });
  if (!evaluator) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "Không tìm thấy hồ sơ nhân viên" } }, { status: 404 });
  }

  const { employeeId, period, relationship, scores, comment } = parsed.data;

  // Self evaluation: evaluatorId must equal employeeId
  if (relationship === "SELF" && evaluator.id !== employeeId) {
    return NextResponse.json({
      error: { code: "VALIDATION_ERROR", message: "Chỉ có thể tự đánh giá bản thân" },
    }, { status: 422 });
  }

  // Check for duplicate submission
  const existing = await prisma.evaluation360.findUnique({
    where: { employeeId_evaluatorId_period: { employeeId, evaluatorId: evaluator.id, period } },
  });
  if (existing) {
    return NextResponse.json({
      error: { code: "CONFLICT", message: "Bạn đã đánh giá nhân viên này trong kỳ này rồi" },
    }, { status: 409 });
  }

  const evaluation = await prisma.evaluation360.create({
    data: {
      employeeId,
      evaluatorId: evaluator.id,
      period,
      relationship,
      scores,
      comment,
    },
    include: {
      employee: { select: { fullName: true } },
      evaluator: { select: { fullName: true } },
    },
  });

  return NextResponse.json({ data: evaluation }, { status: 201 });
}
