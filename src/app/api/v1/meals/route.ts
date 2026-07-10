import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canDo } from "@/lib/permissions";
import { canUser } from "@/lib/permission-catalog";
import { z } from "zod";
import { MEAL_UNIT_PRICE, MEAL_PRICE_EMPLOYEE, MEAL_PRICE_SUBCONTRACTOR, guestMealCost } from "@/lib/constants";
import { computeFifo } from "@/lib/food-inventory";
import { isAfterMealCutoff } from "@/services/meal.service";

const RegisterSchema = z.object({
  departmentId: z.string().uuid(),
  date: z.string(),
  lunchCount: z.number().int().min(0).default(0),
  dinnerCount: z.number().int().min(0).default(0),
  guestCount: z.number().int().min(0).default(0),
  subcontractorCount: z.number().int().min(0).default(0),
  subcontractorName: z.string().optional().nullable(),
  guestUnitPrice: z.number().int().min(0).default(0),
  specialNote: z.string().optional().nullable(),
});

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") || "";

  // ── cost-by-day: gom chi phí suất ăn (regs + supp đã duyệt) + thực phẩm theo từng ngày trong tháng ─
  if (type === "cost-by-day") {
    const month = parseInt(searchParams.get("month") || String(new Date().getMonth() + 1));
    const year = parseInt(searchParams.get("year") || String(new Date().getFullYear()));
    const startOfMonth = new Date(year, month - 1, 1);
    const endOfMonth = new Date(year, month, 0, 23, 59, 59);

    const [regs, supps, allPurchases, visitorMeals, subMeals, allIssues] = await Promise.all([
      prisma.mealRegistration.findMany({
        where: { date: { gte: startOfMonth, lte: endOfMonth }, department: { isActive: true } },
        select: { date: true, lunchCount: true, dinnerCount: true, guestCount: true, subcontractorCount: true, guestUnitPrice: true, guestByPrice: true },
      }),
      prisma.mealSupplementaryRequest.findMany({
        where: { status: "APPROVED", date: { gte: startOfMonth, lte: endOfMonth } },
        select: { date: true, mealType: true, personType: true, quantity: true, guestUnitPrice: true },
      }),
      prisma.foodPurchase.findMany(),  // FIFO cần toàn bộ lịch sử nhập
      prisma.visitorRequest.findMany({
        where: { needsMeal: true, checkedInAt: { gte: startOfMonth, lte: endOfMonth } },
        select: { checkedInAt: true, mealCount: true },
      }),
      prisma.subcontractorMeal.findMany({
        where: { date: { gte: startOfMonth, lte: endOfMonth } },
        select: { date: true, lunchCount: true, dinnerCount: true },
      }),
      prisma.foodIssue.findMany(),     // FIFO cần toàn bộ lịch sử xuất
    ]);
    // Chi phí thực phẩm theo ngày = giá vốn THỰC XUẤT (FIFO), không phải tiền mua.
    const { issueCost } = computeFifo(allPurchases as any, allIssues as any);

    type DayRow = {
      date: string;
      lunchCount: number; dinnerCount: number; guestCount: number; subcontractorCount: number;
      totalMeals: number;
      mealCost: number;
      foodCost: number;
    };
    const byDay = new Map<string, DayRow>();
    const keyOf = (d: Date) => new Date(d).toISOString().slice(0, 10);
    const ensure = (k: string): DayRow => {
      let row = byDay.get(k);
      if (!row) { row = { date: k, lunchCount: 0, dinnerCount: 0, guestCount: 0, subcontractorCount: 0, totalMeals: 0, mealCost: 0, foodCost: 0 }; byDay.set(k, row); }
      return row;
    };

    for (const r of regs) {
      const row = ensure(keyOf(r.date));
      row.lunchCount += r.lunchCount;
      row.dinnerCount += r.dinnerCount;
      row.guestCount += r.guestCount;
      row.subcontractorCount += r.subcontractorCount;
      row.mealCost += (r.lunchCount + r.dinnerCount) * MEAL_PRICE_EMPLOYEE
                   + r.subcontractorCount * MEAL_PRICE_SUBCONTRACTOR
                   + guestMealCost(r);
    }
    for (const s of supps) {
      const row = ensure(keyOf(s.date));
      // Thầu phụ (bổ sung) tính như suất trưa/tối OT — đơn giá thầu phụ (= giá CBNV).
      if (s.personType === "GUEST") { row.guestCount += s.quantity; row.mealCost += s.quantity * (s.guestUnitPrice || MEAL_UNIT_PRICE); }
      else { if (s.mealType === "DINNER") row.dinnerCount += s.quantity; else row.lunchCount += s.quantity; row.mealCost += s.quantity * MEAL_PRICE_EMPLOYEE; }
    }
    for (const m of subMeals) {
      const row = ensure(keyOf(m.date));
      row.lunchCount += m.lunchCount;
      row.dinnerCount += m.dinnerCount;
      row.mealCost += (m.lunchCount + m.dinnerCount) * MEAL_PRICE_SUBCONTRACTOR;
    }
    for (const v of visitorMeals) {
      if (!v.checkedInAt) continue;
      const row = ensure(keyOf(v.checkedInAt));
      row.guestCount += v.mealCount;
      row.mealCost += v.mealCount * MEAL_UNIT_PRICE;
    }
    for (const i of allIssues) {
      if (i.date < startOfMonth || i.date > endOfMonth) continue;
      const row = ensure(keyOf(i.date));
      row.foodCost += issueCost.get(i.id) ?? 0;
    }

    const data = Array.from(byDay.values())
      .map((r) => ({ ...r, totalMeals: r.lunchCount + r.dinnerCount + r.guestCount + r.subcontractorCount, diff: r.mealCost - r.foodCost }))
      .filter((r) => r.totalMeals > 0 || r.foodCost > 0)
      .sort((a, b) => a.date.localeCompare(b.date));

    const totalMealCost = data.reduce((s, r) => s + r.mealCost, 0);
    const totalFoodCost = data.reduce((s, r) => s + r.foodCost, 0);

    return NextResponse.json({
      data,
      meta: { month, year, totalMealCost, totalFoodCost, totalDiff: totalMealCost - totalFoodCost },
    });
  }

  // ── cost-report: aggregate meal counts × unit price per department ─────────
  if (type === "cost-report") {
    const month = parseInt(searchParams.get("month") || String(new Date().getMonth() + 1));
    const year  = parseInt(searchParams.get("year")  || String(new Date().getFullYear()));
    const startOfMonth = new Date(year, month - 1, 1);
    const endOfMonth   = new Date(year, month, 0, 23, 59, 59);

    const regs = await prisma.mealRegistration.findMany({
      where: { date: { gte: startOfMonth, lte: endOfMonth }, department: { isActive: true } },
      include: { department: { select: { id: true, name: true } } },
    });

    // Khóa riêng cho dòng "Thầu phụ" (gom mọi nhà thầu — đăng ký thường + bổ sung).
    const SUB_KEY = "__SUB__";

    // Aggregate per department — đơn giá theo đối tượng:
    //   CBNV (trưa + tối OT) = 20k, Thầu phụ = 20k, Khách = đơn giá nhập tay (guestUnitPrice).
    const deptMap: Record<string, { name: string; lunchCount: number; dinnerCount: number; guestCount: number; subcontractorCount: number; cost: number }> = {};
    for (const r of regs) {
      if (!deptMap[r.departmentId]) {
        deptMap[r.departmentId] = { name: r.department.name, lunchCount: 0, dinnerCount: 0, guestCount: 0, subcontractorCount: 0, cost: 0 };
      }
      const d = deptMap[r.departmentId];
      d.lunchCount += r.lunchCount;
      d.dinnerCount += r.dinnerCount;
      d.guestCount += r.guestCount;
      d.subcontractorCount += r.subcontractorCount;
      d.cost += (r.lunchCount + r.dinnerCount) * MEAL_PRICE_EMPLOYEE
              + r.subcontractorCount * MEAL_PRICE_SUBCONTRACTOR
              + guestMealCost(r);
    }

    // Cộng thêm các phiếu ĐĂNG KÝ BỔ SUNG đã được duyệt (APPROVED) trong tháng.
    const suppApproved = await prisma.mealSupplementaryRequest.findMany({
      where: { status: "APPROVED", date: { gte: startOfMonth, lte: endOfMonth } },
      include: { department: { select: { id: true, name: true } } },
    });
    for (const s of suppApproved) {
      // Thầu phụ (bổ sung) → gom vào dòng "Thầu phụ" và tính như suất trưa/tối OT.
      const key = s.personType === "SUBCONTRACTOR" ? SUB_KEY : s.departmentId;
      if (!deptMap[key]) {
        deptMap[key] = { name: s.personType === "SUBCONTRACTOR" ? "Thầu phụ" : s.department.name, lunchCount: 0, dinnerCount: 0, guestCount: 0, subcontractorCount: 0, cost: 0 };
      }
      const d = deptMap[key];
      if (s.personType === "GUEST") {
        d.guestCount += s.quantity;
        d.cost += s.quantity * (s.guestUnitPrice || MEAL_UNIT_PRICE);
      } else {
        if (s.mealType === "DINNER") d.dinnerCount += s.quantity; else d.lunchCount += s.quantity;
        d.cost += s.quantity * (s.personType === "SUBCONTRACTOR" ? MEAL_PRICE_SUBCONTRACTOR : MEAL_PRICE_EMPLOYEE);
      }
    }

    // Suất ăn thầu phụ ĐĂNG KÝ THƯỜNG (bảng SubcontractorMeal) → cũng gom vào dòng "Thầu phụ".
    const subMealAgg = await prisma.subcontractorMeal.aggregate({
      where: { date: { gte: startOfMonth, lte: endOfMonth } },
      _sum: { lunchCount: true, dinnerCount: true },
    });
    const subLunch = subMealAgg._sum.lunchCount ?? 0;
    const subDinner = subMealAgg._sum.dinnerCount ?? 0;
    if (subLunch + subDinner > 0) {
      if (!deptMap[SUB_KEY]) deptMap[SUB_KEY] = { name: "Thầu phụ", lunchCount: 0, dinnerCount: 0, guestCount: 0, subcontractorCount: 0, cost: 0 };
      deptMap[SUB_KEY].lunchCount += subLunch;
      deptMap[SUB_KEY].dinnerCount += subDinner;
      deptMap[SUB_KEY].cost += (subLunch + subDinner) * MEAL_PRICE_SUBCONTRACTOR;
    }

    const data = Object.entries(deptMap)
      .map(([deptId, d]) => {
        const totalMeals = d.lunchCount + d.dinnerCount + d.guestCount + d.subcontractorCount;
        return {
          departmentId: deptId,
          departmentName: d.name,
          lunchCount: d.lunchCount,
          dinnerCount: d.dinnerCount,
          guestCount: d.guestCount,
          subcontractorCount: d.subcontractorCount,
          totalMeals,
          totalCost: d.cost,
        };
      })
      .sort((a, b) => b.totalCost - a.totalCost);

    // Also aggregate guest meals from VisitorRequest for the same month
    const [guestMealResult, feedbackAgg] = await Promise.all([
      prisma.visitorRequest.aggregate({
        where: { needsMeal: true, checkedInAt: { gte: startOfMonth, lte: endOfMonth } },
        _sum: { mealCount: true },
      }),
      prisma.mealFeedback.aggregate({
        where: { date: { gte: startOfMonth, lte: endOfMonth } },
        _avg: { rating: true },
        _count: { id: true },
      }),
    ]);
    const guestMeals = guestMealResult._sum.mealCount ?? 0;
    const visitorMealCost = guestMeals * MEAL_UNIT_PRICE;

    const grandTotal = data.reduce((s, d) => s + d.totalCost, 0) + visitorMealCost;
    const avgFeedbackRating = feedbackAgg._avg.rating ?? null;
    const feedbackCount = feedbackAgg._count.id;

    return NextResponse.json({
      data,
      meta: {
        grandTotal,
        unitPrice: MEAL_UNIT_PRICE,
        month,
        year,
        guestMeals,
        guestMealCost: visitorMealCost,
        feedback: { avgRating: avgFeedbackRating ? Math.round(avgFeedbackRating * 10) / 10 : null, count: feedbackCount },
      },
    });
  }

  // ── list registrations by date / range ───────────────────────────────────
  const from = searchParams.get("from") || "";
  const to = searchParams.get("to") || "";
  const date = searchParams.get("date") || ""; // backward-compat: date = single day
  const where: any = {};
  if (from || to) {
    const f = from ? new Date(new Date(from).setHours(0, 0, 0, 0)) : undefined;
    const t = to ? new Date(new Date(to).setHours(23, 59, 59, 999)) : undefined;
    where.date = { ...(f && { gte: f }), ...(t && { lte: t }) };
  } else if (date) {
    const d = new Date(date);
    where.date = { gte: new Date(new Date(d).setHours(0, 0, 0, 0)), lte: new Date(new Date(d).setHours(23, 59, 59, 999)) };
  }

  // Chỉ lấy đăng ký của phòng ban THẬT (loại phòng ban ẩn "Thầu phụ" — suất thầu phụ
  // nay lưu ở bảng SubcontractorMeal riêng và hiển thị thành dòng tổng hợp riêng).
  where.department = { isActive: true };

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
  if (!canUser(session.user as any, "m10.nhaan:create")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const body = await request.json();
  const parsed = RegisterSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", issues: parsed.error.issues } }, { status: 422 });
  }

  const { departmentId, date, lunchCount, dinnerCount, guestCount, subcontractorCount, subcontractorName, guestUnitPrice, specialNote } = parsed.data;

  // Đăng ký thường: cho bổ sung quá khứ tối đa 2 ngày (cửa sổ 3 ngày); hôm nay chốt 9h; xa hơn → dùng Đăng ký bổ sung.
  if (isAfterMealCutoff(date)) {
    return NextResponse.json({ error: { code: "MEAL_CUTOFF", message: "Ngoài hạn đăng ký suất ăn (chỉ đăng ký trong 3 ngày gần nhất; hôm nay chốt trước 9h sáng). Vui lòng dùng Đăng ký bổ sung." } }, { status: 403 });
  }

  // MANAGER can only register for their own department
  if (!canUser(session.user as any, "m10.nhaan:edit")) {
    const emp = await prisma.employee.findFirst({ where: { userId }, select: { departmentId: true } });
    if (!emp || emp.departmentId !== departmentId) {
      return NextResponse.json({ error: { code: "FORBIDDEN", message: "Chỉ có thể đăng ký bữa ăn cho phòng ban của mình" } }, { status: 403 });
    }
  }

  const registeredBy = userId;

  // Mỗi lần đăng ký là MỘT đối tượng (trưa / tối OT / khách / thầu phụ) → CỘNG DỒN vào phiếu của
  // phòng ban trong ngày, KHÔNG ghi đè. KHÁCH: cộng dồn theo TỪNG ĐƠN GIÁ vào guestByPrice
  // (vd 5 khách 20k rồi 6 khách 60k → {"20000":5,"60000":6}), KHÔNG để đơn giá sau đè đơn giá trước.
  const existing = await prisma.mealRegistration.findUnique({
    where: { departmentId_date: { departmentId, date: new Date(date) } },
    select: { guestByPrice: true, guestCount: true, guestUnitPrice: true },
  });
  const gbp: Record<string, number> = {};
  if (existing?.guestByPrice && typeof existing.guestByPrice === "object" && Object.keys(existing.guestByPrice as object).length > 0) {
    Object.assign(gbp, existing.guestByPrice as Record<string, number>);
  } else if (existing && (existing.guestCount || 0) > 0 && existing.guestUnitPrice > 0) {
    gbp[String(existing.guestUnitPrice)] = existing.guestCount; // bản ghi CŨ chưa tách giá → khởi tạo tier
  }
  if (guestCount > 0 && guestUnitPrice > 0) {
    gbp[String(guestUnitPrice)] = (gbp[String(guestUnitPrice)] || 0) + guestCount;
  }
  const totalGuest = Object.values(gbp).reduce((s, c) => s + Number(c), 0);
  const hasGuests = Object.keys(gbp).length > 0;

  const reg = await prisma.mealRegistration.upsert({
    where: { departmentId_date: { departmentId, date: new Date(date) } },
    create: { departmentId, date: new Date(date), lunchCount, dinnerCount, guestCount: totalGuest, subcontractorCount, subcontractorName: subcontractorName || null, guestUnitPrice, guestByPrice: hasGuests ? gbp : undefined, specialNote, registeredBy },
    update: {
      lunchCount: { increment: lunchCount },
      dinnerCount: { increment: dinnerCount },
      subcontractorCount: { increment: subcontractorCount },
      // Chỉ đụng vào khách khi lần đăng ký này CÓ khách → set lại theo guestByPrice đã gộp.
      ...(guestCount > 0 ? { guestCount: totalGuest, guestByPrice: gbp, ...(guestUnitPrice ? { guestUnitPrice } : {}) } : {}),
      ...(subcontractorCount > 0 && subcontractorName ? { subcontractorName } : {}),
      ...(specialNote ? { specialNote } : {}),
    },
    include: { department: { select: { id: true, name: true } } },
  });

  return NextResponse.json({ data: reg }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const userRole = (session.user as any).role;
  const userId = (session.user as any).id;
  if (!canUser(session.user as any, "m10.nhaan:create")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const departmentId = searchParams.get("departmentId") || "";
  const date = searchParams.get("date") || "";

  if (!departmentId || !date) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "departmentId and date are required" } }, { status: 400 });
  }

  // MANAGER can only delete registrations for their own department
  if (!canUser(session.user as any, "m10.nhaan:edit")) {
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
