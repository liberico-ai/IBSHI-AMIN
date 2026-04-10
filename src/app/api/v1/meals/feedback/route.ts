import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";

const FeedbackSchema = z.object({
  employeeId: z.string().uuid(),
  date: z.string(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().optional().nullable(),
});

// GET /api/v1/meals/feedback?date=YYYY-MM-DD
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const dateStr = searchParams.get("date");

  const where: any = {};
  if (dateStr) {
    const d = new Date(dateStr);
    where.date = {
      gte: new Date(new Date(d).setHours(0, 0, 0, 0)),
      lte: new Date(new Date(d).setHours(23, 59, 59, 999)),
    };
  }

  const feedbacks = await prisma.mealFeedback.findMany({
    where,
    include: { employee: { select: { code: true, fullName: true } } },
    orderBy: { createdAt: "desc" },
  });

  const totalRating = feedbacks.reduce((sum, f) => sum + f.rating, 0);
  const avgRating = feedbacks.length > 0 ? Math.round((totalRating / feedbacks.length) * 10) / 10 : null;
  const distribution = [1, 2, 3, 4, 5].map((star) => ({
    star,
    count: feedbacks.filter((f) => f.rating === star).length,
  }));

  return NextResponse.json({ data: feedbacks, meta: { total: feedbacks.length, avgRating, distribution } });
}

// POST /api/v1/meals/feedback
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const body = await request.json();
  const parsed = FeedbackSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", issues: parsed.error.issues } }, { status: 422 });
  }

  const dateObj = new Date(parsed.data.date);
  dateObj.setHours(12, 0, 0, 0); // Normalize to noon to avoid timezone edge cases

  // Upsert: one feedback per employee per day
  const feedback = await prisma.mealFeedback.upsert({
    where: { employeeId_date: { employeeId: parsed.data.employeeId, date: dateObj } },
    create: {
      employeeId: parsed.data.employeeId,
      date: dateObj,
      rating: parsed.data.rating,
      comment: parsed.data.comment ?? null,
    },
    update: {
      rating: parsed.data.rating,
      comment: parsed.data.comment ?? null,
    },
  });

  return NextResponse.json({ data: feedback }, { status: 201 });
}
