import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { MEAL_UNIT_PRICE, MEAL_PRICE_EMPLOYEE, MEAL_PRICE_SUBCONTRACTOR, guestMealCost } from "@/lib/constants";
import { computeFifo } from "@/lib/food-inventory";

// Xuất dữ liệu module Nhà ăn theo khoảng ngày. Trả {title, columns, rows} để client dựng Excel.
const vnDate = (d: Date | string) => new Date(d).toISOString().slice(0, 10).split("-").reverse().join("/");

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") || "";
  const fromStr = searchParams.get("from") || "";
  const toStr = searchParams.get("to") || "";
  const subcontractorId = searchParams.get("subcontractorId") || "";
  if (!fromStr || !toStr) return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Cần from và to" } }, { status: 400 });

  // Chi phí thực phẩm / chi phí / thầu phụ: chỉ HCNS (HR_ADMIN/BOM) được export.
  const role = (session.user as any).role;
  const HCNS_ONLY = ["food-purchases", "food-issues", "cost", "subcontractor"];
  if (HCNS_ONLY.includes(type) && !(role === "HR_ADMIN" || role === "BOM" || role === "ADMIN")) {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Chỉ P. HCNS được export dữ liệu này" } }, { status: 403 });
  }

  const from = new Date(new Date(fromStr).setHours(0, 0, 0, 0));
  const to = new Date(new Date(toStr).setHours(23, 59, 59, 999));
  const rangeLabel = `${vnDate(from)} – ${vnDate(to)}`;

  // ── Đăng ký suất ăn (phòng ban + thầu phụ) ─────────────────────────────────
  if (type === "registrations" || type === "registrations-emp") {
    // registrations-emp = CHỈ nhân viên phòng ban (KHÔNG gồm thầu phụ).
    const empOnly = type === "registrations-emp";
    const [regs, subMeals] = await Promise.all([
      prisma.mealRegistration.findMany({
        where: { date: { gte: from, lte: to }, department: { isActive: true } },
        include: { department: { select: { name: true } } },
        orderBy: [{ date: "asc" }],
      }),
      empOnly ? Promise.resolve([] as { date: Date; lunchCount: number; dinnerCount: number; subcontractor: { name: string } }[]) : prisma.subcontractorMeal.findMany({
        where: { date: { gte: from, lte: to } },
        include: { subcontractor: { select: { name: true } } },
        orderBy: [{ date: "asc" }],
      }),
    ]);
    const rows = [
      ...regs.map((r) => ({ date: vnDate(r.date), target: r.department.name, lunch: r.lunchCount, dinner: r.dinnerCount, guest: r.guestCount, guestUnitPrice: r.guestUnitPrice, guestByPrice: r.guestByPrice as Record<string, number> | null, total: r.lunchCount + r.dinnerCount + r.guestCount })),
      ...subMeals.map((m) => ({ date: vnDate(m.date), target: `Thầu phụ: ${m.subcontractor.name}`, lunch: m.lunchCount, dinner: m.dinnerCount, guest: 0, guestUnitPrice: 0, guestByPrice: null as Record<string, number> | null, total: m.lunchCount + m.dinnerCount })),
    ].sort((a, b) => a.date.localeCompare(b.date));
    return NextResponse.json({ data: {
      title: `${empOnly ? "ĐĂNG KÝ SUẤT ĂN NHÂN VIÊN (KHÔNG THẦU PHỤ)" : "ĐĂNG KÝ SUẤT ĂN"} — ${rangeLabel}`,
      columns: [
        { header: "Ngày", key: "date", width: 14 },
        { header: "Đối tượng", key: "target", width: 28 },
        { header: "Trưa", key: "lunch", width: 10 },
        { header: "Tối OT", key: "dinner", width: 10 },
        { header: "Khách", key: "guest", width: 10 },
        { header: "Tổng", key: "total", width: 10 },
      ],
      rows,
    } });
  }

  // ── Đăng ký bổ sung ────────────────────────────────────────────────────────
  if (type === "supplementary") {
    const supps = await prisma.mealSupplementaryRequest.findMany({
      where: { date: { gte: from, lte: to } },
      include: { department: { select: { name: true } }, requester: { select: { email: true, employee: { select: { fullName: true } } } } },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    });
    const personLabel = (p: string) => p === "GUEST" ? "Khách" : p === "SUBCONTRACTOR" ? "Thầu phụ" : "CBNV";
    const statusLabel = (s: string) => s === "APPROVED" ? "Đã duyệt" : s === "REJECTED" ? "Từ chối" : "Chờ duyệt";
    const rows = supps.map((s) => ({
      date: vnDate(s.date), department: s.department.name,
      meal: s.mealType === "DINNER" ? "Tối OT" : "Trưa", target: personLabel(s.personType),
      quantity: s.quantity, status: statusLabel(s.status),
      sub: s.subcontractorName || "", reason: s.reason,
      requester: s.requester.employee?.fullName || s.requester.email,
    }));
    return NextResponse.json({ data: {
      title: `ĐĂNG KÝ BỔ SUNG — ${rangeLabel}`,
      columns: [
        { header: "Ngày", key: "date", width: 14 },
        { header: "Phòng ban", key: "department", width: 20 },
        { header: "Bữa", key: "meal", width: 10 },
        { header: "Đối tượng", key: "target", width: 12 },
        { header: "Số suất", key: "quantity", width: 10 },
        { header: "Trạng thái", key: "status", width: 12 },
        { header: "Nhà thầu", key: "sub", width: 20 },
        { header: "Lý do", key: "reason", width: 30 },
        { header: "Người ĐK", key: "requester", width: 20 },
      ],
      rows,
    } });
  }

  // ── Lịch sử mua thực phẩm ──────────────────────────────────────────────────
  if (type === "food-purchases") {
    const data = await prisma.foodPurchase.findMany({ where: { date: { gte: from, lte: to } }, orderBy: [{ date: "asc" }, { createdAt: "asc" }] });
    const rows = data.map((r) => ({ date: vnDate(r.date), name: r.name, unit: r.unit, quantity: r.quantity, unitPrice: r.unitPrice, total: Math.round(r.quantity * r.unitPrice) }));
    return NextResponse.json({ data: {
      title: `LỊCH SỬ MUA THỰC PHẨM — ${rangeLabel}`,
      columns: [
        { header: "Ngày", key: "date", width: 14 },
        { header: "Tên thực phẩm", key: "name", width: 26 },
        { header: "ĐVT", key: "unit", width: 8 },
        { header: "Số lượng", key: "quantity", width: 12 },
        { header: "Đơn giá", key: "unitPrice", width: 14 },
        { header: "Thành tiền", key: "total", width: 16 },
      ],
      rows,
    } });
  }

  // ── Lịch sử xuất thực kho (FIFO) ───────────────────────────────────────────
  if (type === "food-issues") {
    const [allPurchases, allIssues] = await Promise.all([prisma.foodPurchase.findMany(), prisma.foodIssue.findMany()]);
    const { issueCost } = computeFifo(allPurchases as any, allIssues as any);
    const rows = allIssues
      .filter((i) => i.date >= from && i.date <= to)
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .map((i) => ({ date: vnDate(i.date), name: i.name, unit: i.unit, quantity: i.quantity, cost: issueCost.get(i.id) ?? 0 }));
    return NextResponse.json({ data: {
      title: `LỊCH SỬ XUẤT THỰC KHO (FIFO) — ${rangeLabel}`,
      columns: [
        { header: "Ngày", key: "date", width: 14 },
        { header: "Tên thực phẩm", key: "name", width: 26 },
        { header: "ĐVT", key: "unit", width: 8 },
        { header: "Thực xuất", key: "quantity", width: 12 },
        { header: "Giá vốn (FIFO)", key: "cost", width: 16 },
      ],
      rows,
    } });
  }

  // ── Chi phí ăn theo ngày (suất ăn vs thực phẩm thực xuất) ───────────────────
  if (type === "cost") {
    const [regs, supps, subMeals, visitorMeals, allPurchases, allIssues] = await Promise.all([
      prisma.mealRegistration.findMany({ where: { date: { gte: from, lte: to }, department: { isActive: true } }, select: { date: true, lunchCount: true, dinnerCount: true, guestCount: true, guestUnitPrice: true, guestByPrice: true } }),
      prisma.mealSupplementaryRequest.findMany({ where: { status: "APPROVED", date: { gte: from, lte: to } }, select: { date: true, mealType: true, personType: true, quantity: true, guestUnitPrice: true } }),
      prisma.subcontractorMeal.findMany({ where: { date: { gte: from, lte: to } }, select: { date: true, lunchCount: true, dinnerCount: true } }),
      prisma.visitorRequest.findMany({ where: { needsMeal: true, checkedInAt: { gte: from, lte: to } }, select: { checkedInAt: true, mealCount: true } }),
      prisma.foodPurchase.findMany(),
      prisma.foodIssue.findMany(),
    ]);
    const { issueCost } = computeFifo(allPurchases as any, allIssues as any);
    type Row = { date: string; lunch: number; dinner: number; guest: number; sub: number; totalMeals: number; mealCost: number; foodCost: number; diff: number };
    const byDay = new Map<string, Row>();
    const ens = (d: Date | string): Row => { const k = vnDate(d); let r = byDay.get(k); if (!r) { r = { date: k, lunch: 0, dinner: 0, guest: 0, sub: 0, totalMeals: 0, mealCost: 0, foodCost: 0, diff: 0 }; byDay.set(k, r); } return r; };
    for (const r of regs) { const row = ens(r.date); row.lunch += r.lunchCount; row.dinner += r.dinnerCount; row.guest += r.guestCount; row.mealCost += (r.lunchCount + r.dinnerCount) * MEAL_PRICE_EMPLOYEE + guestMealCost(r); }
    for (const s of supps) { const row = ens(s.date); if (s.personType === "GUEST") { row.guest += s.quantity; row.mealCost += s.quantity * (s.guestUnitPrice || MEAL_UNIT_PRICE); } else if (s.personType === "SUBCONTRACTOR") { row.sub += s.quantity; row.mealCost += s.quantity * MEAL_PRICE_SUBCONTRACTOR; } else { if (s.mealType === "DINNER") row.dinner += s.quantity; else row.lunch += s.quantity; row.mealCost += s.quantity * MEAL_PRICE_EMPLOYEE; } }
    for (const m of subMeals) { const row = ens(m.date); row.sub += m.lunchCount + m.dinnerCount; row.mealCost += (m.lunchCount + m.dinnerCount) * MEAL_PRICE_SUBCONTRACTOR; }
    for (const v of visitorMeals) { if (!v.checkedInAt) continue; const row = ens(v.checkedInAt); row.guest += v.mealCount; row.mealCost += v.mealCount * MEAL_UNIT_PRICE; }
    for (const i of allIssues) { if (i.date < from || i.date > to) continue; const row = ens(i.date); row.foodCost += issueCost.get(i.id) ?? 0; }
    const rows = Array.from(byDay.values())
      .map((r) => ({ ...r, totalMeals: r.lunch + r.dinner + r.guest + r.sub, diff: r.mealCost - r.foodCost }))
      .sort((a, b) => a.date.localeCompare(b.date));
    return NextResponse.json({ data: {
      title: `CHI PHÍ ĂN — ${rangeLabel}`,
      columns: [
        { header: "Ngày", key: "date", width: 14 },
        { header: "Trưa", key: "lunch", width: 8 },
        { header: "Tối OT", key: "dinner", width: 8 },
        { header: "Khách", key: "guest", width: 8 },
        { header: "Thầu phụ", key: "sub", width: 10 },
        { header: "Tổng suất", key: "totalMeals", width: 10 },
        { header: "Chi phí suất ăn", key: "mealCost", width: 16 },
        { header: "TP thực xuất", key: "foodCost", width: 16 },
        { header: "Chênh lệch", key: "diff", width: 16 },
      ],
      rows,
    } });
  }

  // ── Thầu phụ riêng (chọn nhà thầu + khoảng ngày): số suất + chi phí ─────────
  if (type === "subcontractor") {
    const subMeals = await prisma.subcontractorMeal.findMany({
      where: { date: { gte: from, lte: to }, ...(subcontractorId ? { subcontractorId } : {}) },
      include: { subcontractor: { select: { name: true, companyName: true } } },
      orderBy: [{ date: "asc" }],
    });
    const rows = subMeals.map((m) => {
      const total = m.lunchCount + m.dinnerCount;
      return { date: vnDate(m.date), name: m.subcontractor.name, company: m.subcontractor.companyName, lunch: m.lunchCount, dinner: m.dinnerCount, total, cost: total * MEAL_PRICE_SUBCONTRACTOR };
    });
    const subLabel = subcontractorId && rows.length ? rows[0].name : "Tất cả nhà thầu";
    return NextResponse.json({ data: {
      title: `THẦU PHỤ (${subLabel}) — ${rangeLabel}`,
      columns: [
        { header: "Ngày", key: "date", width: 14 },
        { header: "Nhà thầu", key: "name", width: 24 },
        { header: "Công ty", key: "company", width: 34 },
        { header: "Trưa", key: "lunch", width: 8 },
        { header: "Tối OT", key: "dinner", width: 8 },
        { header: "Tổng suất", key: "total", width: 10 },
        { header: "Chi phí", key: "cost", width: 16 },
      ],
      rows,
    } });
  }

  return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "type không hợp lệ" } }, { status: 400 });
}
