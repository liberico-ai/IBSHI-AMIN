import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canDo } from "@/lib/permissions";
import { canUser } from "@/lib/permission-catalog";
import { z } from "zod";
import { calcScore, type EvaluationScores } from "@/lib/probation-eval";

const RatingEnum = z.enum(["SATISFACTORY", "NEEDS_IMPROVEMENT", "UNACCEPTABLE", "NA"]);

const ScoresSchema = z.object({
  ratings: z.record(z.string(), RatingEnum),
  q9PerformsWell: z.boolean(),
  q10SignContract: z.boolean(),
});

const CreateSchema = z.object({
  employeeId: z.string().uuid(),
  scores: ScoresSchema,
  selectedTier: z.enum(["INDEFINITE", "DEFINITE_24M", "DEFINITE_12M", "FAIL"]).optional(),
  comments: z.string().optional().nullable(),
  saveAsDraft: z.boolean().default(false),
});

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const userRole = (session.user as any).role;
  if (!canUser(session.user as any, "m4.thuviec:view")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") || undefined;

  const data = await prisma.probationEvaluation.findMany({
    where: status ? { status } : {},
    include: {
      employee: {
        select: {
          id: true, code: true, fullName: true, photo: true, status: true, startDate: true,
          department: { select: { id: true, name: true } },
          jobRole: true,
          position: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ data });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const userRole = (session.user as any).role;
  if (!canUser(session.user as any, "m4.thuviec:create")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const body = await request.json();
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", issues: parsed.error.issues } }, { status: 422 });
  }

  const evaluator = await prisma.employee.findFirst({
    where: { userId: (session.user as any).id },
    select: { id: true, fullName: true },
  });
  if (!evaluator) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Không tìm thấy hồ sơ NV của người đánh giá" } }, { status: 404 });

  // Tính score
  const result = calcScore(parsed.data.scores as EvaluationScores);
  const selectedTier = parsed.data.selectedTier || result.recommendedTier;

  const created = await prisma.probationEvaluation.create({
    data: {
      employeeId: parsed.data.employeeId,
      evaluatedBy: evaluator.id,
      scores: parsed.data.scores as any,
      totalScore: result.score10,
      recommendedTier: result.recommendedTier,
      selectedTier,
      comments: parsed.data.comments ?? null,
      status: parsed.data.saveAsDraft ? "DRAFT" : "PENDING_DIRECTOR",
    },
    include: {
      employee: {
        select: {
          id: true, code: true, fullName: true,
          department: { select: { name: true } },
          jobRole: true,
          position: { select: { name: true } },
        },
      },
    },
  });

  // Notify BOM (BGĐ) khi submit (không phải draft)
  if (!parsed.data.saveAsDraft) {
    const bomUsers = await prisma.user.findMany({ where: { role: "BOM", isActive: true }, select: { id: true } });
    if (bomUsers.length > 0) {
      await prisma.notification.createMany({
        data: bomUsers.map((u) => ({
          userId: u.id,
          title: "Đánh giá thử việc chờ duyệt",
          message: `${evaluator.fullName} vừa nộp đánh giá thử việc cho NV ${created.employee.fullName} (${created.employee.position.name})`,
          type: "APPROVAL_REQUIRED",
          referenceType: "probation_evaluation",
          referenceId: created.id,
        })),
      });
    }
  }

  return NextResponse.json({ data: created }, { status: 201 });
}
