import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canDo } from "@/lib/permissions";
import { z } from "zod";
import { isAfterMealCutoff } from "@/services/meal.service";

// Đăng ký suất ăn thầu phụ — lưu theo TỪNG nhà thầu / ngày (để diễn giải chi tiết).
const RegisterSchema = z.object({
  subcontractorId: z.string().uuid(),
  date: z.string(),
  mealType: z.enum(["LUNCH", "DINNER"]).default("LUNCH"),
  count: z.number().int().min(1),
  specialNote: z.string().optional().nullable(),
});

function dayRange(from: string, to: string) {
  const f = from ? new Date(new Date(from).setHours(0, 0, 0, 0)) : undefined;
  const t = to ? new Date(new Date(to).setHours(23, 59, 59, 999)) : undefined;
  return { ...(f && { gte: f }), ...(t && { lte: t }) };
}

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from") || "";
  const to = searchParams.get("to") || "";
  const where: any = {};
  if (from || to) where.date = dayRange(from, to);

  const data = await prisma.subcontractorMeal.findMany({
    where,
    include: { subcontractor: { select: { id: true, name: true, companyName: true } } },
    orderBy: [{ date: "desc" }, { subcontractor: { name: "asc" } }],
  });
  return NextResponse.json({ data });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const userRole = (session.user as any).role;
  const userId = (session.user as any).id;
  if (!canDo(userRole, "meals", "register")) return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });

  const parsed = RegisterSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: { code: "VALIDATION_ERROR", issues: parsed.error.issues } }, { status: 422 });
  const { subcontractorId, date, mealType, count, specialNote } = parsed.data;

  // Chốt 9h: sau 9h (hoặc ngày đã qua) KHÓA đăng ký thường với TẤT CẢ → dùng Đăng ký bổ sung.
  if (isAfterMealCutoff(date)) {
    return NextResponse.json({ error: { code: "MEAL_CUTOFF", message: "Đã quá giờ đăng ký suất ăn (chốt 9h sáng). Sau 9h vui lòng dùng Đăng ký bổ sung." } }, { status: 403 });
  }

  const lunch = mealType === "LUNCH" ? count : 0;
  const dinner = mealType === "DINNER" ? count : 0;

  // Cộng dồn vào phiếu của nhà thầu trong ngày (không ghi đè).
  const data = await prisma.subcontractorMeal.upsert({
    where: { subcontractorId_date: { subcontractorId, date: new Date(date) } },
    create: { subcontractorId, date: new Date(date), lunchCount: lunch, dinnerCount: dinner, specialNote: specialNote || null, registeredBy: userId },
    update: {
      lunchCount: { increment: lunch },
      dinnerCount: { increment: dinner },
      ...(specialNote ? { specialNote } : {}),
    },
    include: { subcontractor: { select: { id: true, name: true, companyName: true } } },
  });
  return NextResponse.json({ data }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const userRole = (session.user as any).role;
  if (!canDo(userRole, "meals", "register")) return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const date = searchParams.get("date");
  const subcontractorId = searchParams.get("subcontractorId");

  if (id) {
    await prisma.subcontractorMeal.delete({ where: { id } });
  } else if (subcontractorId && date) {
    await prisma.subcontractorMeal.deleteMany({ where: { subcontractorId, date: dayRange(date, date) } });
  } else if (date) {
    await prisma.subcontractorMeal.deleteMany({ where: { date: dayRange(date, date) } });
  } else {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Cần id, hoặc date" } }, { status: 400 });
  }
  return NextResponse.json({ data: { ok: true } });
}
