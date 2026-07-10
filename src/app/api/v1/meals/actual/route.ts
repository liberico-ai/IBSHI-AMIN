import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { canUser } from "@/lib/permission-catalog";

// Con số suất ăn THỰC TẾ bếp phục vụ — đối soát Kế hoạch (đăng ký) vs Thực tế theo ngày.
// Đọc: ai đăng nhập cũng xem được. Nhập/sửa: theo ma trận (m10.nhaan:edit).
function canManage(role: string): boolean {
  return role === "HR_ADMIN" || role === "BOM" || role === "ADMIN";
}
void canManage;

const SaveSchema = z.object({
  date: z.string(),
  lunchActual: z.number().int().min(0).default(0),
  dinnerActual: z.number().int().min(0).default(0),
  guestActual: z.number().int().min(0).default(0),
  subActual: z.number().int().min(0).default(0),
  note: z.string().optional().nullable(),
});

const keyOf = (d: Date) => new Date(d).toISOString().slice(0, 10);

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const month = parseInt(searchParams.get("month") || String(new Date().getMonth() + 1));
  const year = parseInt(searchParams.get("year") || String(new Date().getFullYear()));
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0, 23, 59, 59);

  const [regs, supps, subMeals, actuals] = await Promise.all([
    prisma.mealRegistration.findMany({
      where: { date: { gte: start, lte: end }, department: { isActive: true } },
      select: { date: true, lunchCount: true, dinnerCount: true, guestCount: true },
    }),
    prisma.mealSupplementaryRequest.findMany({
      where: { status: "APPROVED", date: { gte: start, lte: end } },
      select: { date: true, mealType: true, personType: true, quantity: true },
    }),
    prisma.subcontractorMeal.findMany({
      where: { date: { gte: start, lte: end } },
      select: { date: true, lunchCount: true, dinnerCount: true },
    }),
    prisma.mealActual.findMany({ where: { date: { gte: start, lte: end } } }),
  ]);

  type Row = {
    date: string;
    planLunch: number; planDinner: number; planGuest: number; planSub: number;
    actLunch: number; actDinner: number; actGuest: number; actSub: number;
    hasActual: boolean; note: string | null;
  };
  const byDay = new Map<string, Row>();
  const ensure = (k: string): Row => {
    let r = byDay.get(k);
    if (!r) { r = { date: k, planLunch: 0, planDinner: 0, planGuest: 0, planSub: 0, actLunch: 0, actDinner: 0, actGuest: 0, actSub: 0, hasActual: false, note: null }; byDay.set(k, r); }
    return r;
  };

  // Kế hoạch (đăng ký)
  for (const r of regs) {
    const row = ensure(keyOf(r.date));
    row.planLunch += r.lunchCount; row.planDinner += r.dinnerCount; row.planGuest += r.guestCount;
  }
  for (const s of supps) {
    const row = ensure(keyOf(s.date));
    if (s.personType === "GUEST") row.planGuest += s.quantity;
    else if (s.personType === "SUBCONTRACTOR") row.planSub += s.quantity;
    else { if (s.mealType === "DINNER") row.planDinner += s.quantity; else row.planLunch += s.quantity; }
  }
  for (const m of subMeals) {
    const row = ensure(keyOf(m.date));
    row.planSub += m.lunchCount + m.dinnerCount;
  }
  // Thực tế (HCNS nhập)
  for (const a of actuals) {
    const row = ensure(keyOf(a.date));
    row.actLunch = a.lunchActual; row.actDinner = a.dinnerActual; row.actGuest = a.guestActual; row.actSub = a.subActual;
    row.hasActual = true; row.note = a.note;
  }

  const data = Array.from(byDay.values())
    .filter((r) => r.planLunch + r.planDinner + r.planGuest + r.planSub > 0 || r.hasActual)
    .sort((a, b) => a.date.localeCompare(b.date));

  return NextResponse.json({ data, meta: { month, year, canManage: canUser(session.user as any, "m10.nhaan:edit") } });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const role = (session.user as any).role;
  const userId = (session.user as any).id;
  if (!canUser(session.user as any, "m10.nhaan:edit")) return NextResponse.json({ error: { code: "FORBIDDEN", message: "Không có quyền nhập con số thực tế" } }, { status: 403 });

  const parsed = SaveSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: { code: "VALIDATION_ERROR", issues: parsed.error.issues } }, { status: 422 });
  const b = parsed.data;
  const date = new Date(b.date);

  const data = await prisma.mealActual.upsert({
    where: { date },
    create: { date, lunchActual: b.lunchActual, dinnerActual: b.dinnerActual, guestActual: b.guestActual, subActual: b.subActual, note: b.note || null, recordedBy: userId },
    update: { lunchActual: b.lunchActual, dinnerActual: b.dinnerActual, guestActual: b.guestActual, subActual: b.subActual, note: b.note || null, recordedBy: userId },
  });
  return NextResponse.json({ data }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const role = (session.user as any).role;
  if (!canUser(session.user as any, "m10.nhaan:edit")) return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");
  if (!date) return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Cần date" } }, { status: 400 });
  await prisma.mealActual.deleteMany({ where: { date: new Date(date) } });
  return NextResponse.json({ data: { ok: true } });
}
