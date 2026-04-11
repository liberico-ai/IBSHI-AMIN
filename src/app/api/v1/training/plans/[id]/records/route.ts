import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canDo } from "@/lib/permissions";
import { z } from "zod";

const UpsertRecordsSchema = z.object({
  records: z.array(
    z.object({
      employeeId: z.string().uuid(),
      attended: z.boolean().default(false),
      score: z.number().int().min(0).max(100).optional().nullable(),
      note: z.string().optional().nullable(),
    })
  ),
});

// GET: list records for a training plan
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const { id } = await params;
  const plan = await prisma.trainingPlan.findUnique({ where: { id } });
  if (!plan) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });

  const records = await prisma.trainingRecord.findMany({
    where: { trainingId: id },
    include: {
      employee: {
        select: { id: true, code: true, fullName: true, department: { select: { name: true } } },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ data: records });
}

// POST: upsert attendance records
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const userRole = (session.user as any).role;
  if (!canDo(userRole, "training", "create")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const { id } = await params;
  const plan = await prisma.trainingPlan.findUnique({ where: { id } });
  if (!plan) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });

  const body = await request.json();
  const parsed = UpsertRecordsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", issues: parsed.error.issues } }, { status: 422 });
  }

  const results = await Promise.all(
    parsed.data.records.map((rec) =>
      prisma.trainingRecord.upsert({
        where: { trainingId_employeeId: { trainingId: id, employeeId: rec.employeeId } },
        create: { trainingId: id, ...rec },
        update: { attended: rec.attended, score: rec.score, note: rec.note },
      })
    )
  );

  return NextResponse.json({ data: results });
}
