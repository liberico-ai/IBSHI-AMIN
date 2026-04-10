import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { checkPermission } from "@/lib/permissions";
import { z } from "zod";
import { MEAL_UNIT_PRICE } from "@/lib/constants";

const RegisterSchema = z.object({
  departmentId: z.string().uuid(),
  date: z.string(),
  lunchCount: z.number().int().min(0).default(0),
  dinnerCount: z.number().int().min(0).default(0),
  guestCount: z.number().int().min(0).default(0),
  specialNote: z.string().optional().nullable(),
});

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") || "";

  // ── cost-report: aggregate meal counts × unit price per department ─────────
  if (type === "cost-report") {
    const month = parseInt(searchParams.get("month") || String(new Date().getMonth() + 1));
    const year  = parseInt(searchParams.get("year")  || String(new Date().getFullYear()));
    const startOfMonth = new Date(year, month - 1, 1);
    const endOfMonth   = new Date(year, month, 0, 23, 59, 59);

    const regs = await prisma.mealRegistration.findMany({
      where: { date: { gte: startOfMonth, lte: endOfMonth } },
      include: { department: { select: { id: true, name: true } } },
    });

    // Aggregate per department
    const deptMap: Record<string, { name: string; lunchCount: number; dinnerCount: number; guestCount: number }> = {};
    for (const r of regs) {
      if (!deptMap[r.departmentId]) {
        deptMap[r.departmentId] = { name: r.department.name, lunchCount: 0, dinnerCount: 0, guestCount: 0 };
      }
      deptMap[r.departmentId].lunchCount += r.lunchCount;
      deptMap[r.departmentId].dinnerCount += r.dinnerCount;
      deptMap[r.departmentId].guestCount += r.guestCount;
    }

    const data = Object.entries(deptMap)
      .map(([deptId, d]) => {
        const totalMeals = d.lunchCount + d.dinnerCount + d.guestCount;
        return {
          departmentId: deptId,
          departmentName: d.name,
          lunchCount: d.lunchCount,
          dinnerCount: d.dinnerCount,
          guestCount: d.guestCount,
          totalMeals,
          totalCost: totalMeals * MEAL_UNIT_PRICE,
          unitPrice: MEAL_UNIT_PRICE,
        };
      })
      .sort((a, b) => b.totalCost - a.totalCost);

    // Also aggregate guest meals from VisitorRequest for the same month
    const guestMealResult = await prisma.visitorRequest.aggregate({
      where: {
        needsMeal: true,
        checkedInAt: { gte: startOfMonth, lte: endOfMonth },
      },
      _sum: { mealCount: true },
    });
    const guestMeals = guestMealResult._sum.mealCount ?? 0;
    const guestMealCost = guestMeals * MEAL_UNIT_PRICE;

    const grandTotal = data.reduce((s, d) => s + d.totalCost, 0) + guestMealCost;
    return NextResponse.json({ data, meta: { grandTotal, unitPrice: MEAL_UNIT_PRICE, month, year, guestMeals, guestMealCost } });
  }

  // ── list registrations by date ────────────────────────────────────────────
  const date = searchParams.get("date") || "";
  const where: any = {};
  if (date) {
    const d = new Date(date);
    where.date = { gte: new Date(new Date(d).setHours(0, 0, 0, 0)), lte: new Date(new Date(d).setHours(23, 59, 59, 999)) };
  }

  const data = await prisma.mealRegistration.findMany({
    where,
    include: { department: { select: { id: true, name: true } } },
    orderBy: [{ date: "desc" }, { department: { name: "asc" } }],
  });

  return NextResponse.json({ data });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const userRole = (session.user as any).role;
  const userId = (session.user as any).id;
  if (!checkPermission(userRole, "MANAGER")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const body = await request.json();
  const parsed = RegisterSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", issues: parsed.error.issues } }, { status: 422 });
  }

  const { departmentId, date, lunchCount, dinnerCount, guestCount, specialNote } = parsed.data;

  // MANAGER can only register for their own department
  if (!checkPermission(userRole, "HR_ADMIN")) {
    const emp = await prisma.employee.findFirst({ where: { userId }, select: { departmentId: true } });
    if (!emp || emp.departmentId !== departmentId) {
      return NextResponse.json({ error: { code: "FORBIDDEN", message: "Chỉ có thể đăng ký bữa ăn cho phòng ban của mình" } }, { status: 403 });
    }
  }

  const registeredBy = userId;

  const reg = await prisma.mealRegistration.upsert({
    where: { departmentId_date: { departmentId, date: new Date(date) } },
    create: { departmentId, date: new Date(date), lunchCount, dinnerCount, guestCount, specialNote, registeredBy },
    update: { lunchCount, dinnerCount, guestCount, specialNote },
    include: { department: { select: { id: true, name: true } } },
  });

  return NextResponse.json({ data: reg }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const userRole = (session.user as any).role;
  const userId = (session.user as any).id;
  if (!checkPermission(userRole, "MANAGER")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const departmentId = searchParams.get("departmentId") || "";
  const date = searchParams.get("date") || "";

  if (!departmentId || !date) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "departmentId and date are required" } }, { status: 400 });
  }

  // MANAGER can only delete registrations for their own department
  if (!checkPermission(userRole, "HR_ADMIN")) {
    const emp = await prisma.employee.findFirst({ where: { userId }, select: { departmentId: true } });
    if (!emp || emp.departmentId !== departmentId) {
      return NextResponse.json({ error: { code: "FORBIDDEN", message: "Chỉ có thể xóa bữa ăn của phòng ban mình" } }, { status: 403 });
    }
  }

  await prisma.mealRegistration.deleteMany({
    where: { departmentId, date: new Date(date) },
  });

  return NextResponse.json({ data: { ok: true } });
}
