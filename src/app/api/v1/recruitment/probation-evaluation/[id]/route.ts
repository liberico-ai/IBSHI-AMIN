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

const UpdateSchema = z.object({
  scores: ScoresSchema.optional(),
  selectedTier: z.enum(["INDEFINITE", "DEFINITE_24M", "DEFINITE_12M", "FAIL"]).optional(),
  comments: z.string().optional().nullable(),
  submit: z.boolean().optional(),
});

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const userRole = (session.user as any).role;
  if (!canUser(session.user as any, "m4.thuviec:view")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const data = await prisma.probationEvaluation.findUnique({
    where: { id: params.id },
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
  });
  if (!data) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  return NextResponse.json({ data });
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const userRole = (session.user as any).role;
  if (!canUser(session.user as any, "m4.thuviec:edit")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const body = await request.json();
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", issues: parsed.error.issues } }, { status: 422 });
  }

  const existing = await prisma.probationEvaluation.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });

  if (existing.status !== "DRAFT" && existing.status !== "REJECTED") {
    return NextResponse.json({ error: { code: "INVALID_STATE", message: "Chỉ sửa được khi ở trạng thái DRAFT hoặc REJECTED" } }, { status: 409 });
  }

  const data: any = {};
  if (parsed.data.scores) {
    const result = calcScore(parsed.data.scores as EvaluationScores);
    data.scores = parsed.data.scores;
    data.totalScore = result.score10;
    data.recommendedTier = result.recommendedTier;
    if (!parsed.data.selectedTier) data.selectedTier = result.recommendedTier;
  }
  if (parsed.data.selectedTier !== undefined) data.selectedTier = parsed.data.selectedTier;
  if (parsed.data.comments !== undefined) data.comments = parsed.data.comments;
  if (parsed.data.submit) data.status = "PENDING_DIRECTOR";

  const updated = await prisma.probationEvaluation.update({
    where: { id: params.id },
    data,
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

  // Notify BOM if submitted (từ DRAFT hoặc REJECTED gửi lại)
  if (parsed.data.submit) {
    const bomUsers = await prisma.user.findMany({ where: { role: "BOM", isActive: true }, select: { id: true } });
    if (bomUsers.length > 0) {
      await prisma.notification.createMany({
        data: bomUsers.map((u) => ({
          userId: u.id,
          title: "Đánh giá thử việc chờ duyệt (re-submit)",
          message: `Đánh giá thử việc cho ${updated.employee.fullName} đã được gửi lại để duyệt`,
          type: "APPROVAL_REQUIRED",
          referenceType: "probation_evaluation",
          referenceId: updated.id,
        })),
      });
    }
  }

  return NextResponse.json({ data: updated });
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const userRole = (session.user as any).role;
  if (!canUser(session.user as any, "m4.thuviec:delete")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  await prisma.probationEvaluation.delete({ where: { id: params.id } });
  return NextResponse.json({ data: { ok: true } });
}
