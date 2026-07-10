import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canUser } from "@/lib/permission-catalog";

// Sửa/Xóa 1 DÒNG KHÁCH theo đơn giá ở mục "CHI TIẾT KHÁCH" — áp dụng cho CẢ NGÀY (mọi phòng).
// Vì khách lưu theo từng phòng (MealRegistration.guestByPrice), thao tác này gộp toàn bộ phòng
// có khách ở đơn giá đó trong ngày.

type Reg = { id: string; guestByPrice: any; guestCount: number; guestUnitPrice: number };

// Đọc bảng khách {đơn giá: số} của 1 phiếu (fallback bản ghi cũ dùng guestUnitPrice+guestCount).
function readTiers(reg: Reg): Record<string, number> {
  const gbp = reg.guestByPrice;
  if (gbp && typeof gbp === "object" && Object.keys(gbp).length > 0) {
    const out: Record<string, number> = {};
    for (const [p, c] of Object.entries(gbp)) out[String(p)] = Number(c) || 0;
    return out;
  }
  if ((reg.guestCount ?? 0) > 0 && reg.guestUnitPrice > 0) return { [String(reg.guestUnitPrice)]: reg.guestCount };
  return {};
}

function dayRange(date: string) {
  const s = new Date(date); s.setUTCHours(0, 0, 0, 0);
  const e = new Date(date); e.setUTCHours(23, 59, 59, 999);
  return { gte: s, lte: e };
}

// PUT — sửa đơn giá (và/hoặc số khách) của 1 dòng khách trong ngày.
export async function PUT(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (!canUser(session.user as any, "m10.nhaan.dangky:edit")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }
  const { date, oldPrice, newPrice, newCount } = (await request.json()) || {};
  if (!date || !oldPrice) return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Thiếu date / oldPrice" } }, { status: 400 });
  const op = Math.round(Number(oldPrice));
  const np = Math.round(Number(newPrice ?? oldPrice));
  const nc = newCount === undefined || newCount === null || newCount === "" ? undefined : Math.max(0, Math.round(Number(newCount)));
  if (np <= 0) return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Đơn giá không hợp lệ" } }, { status: 400 });

  const regs = await prisma.mealRegistration.findMany({ where: { date: dayRange(date) }, select: { id: true, guestByPrice: true, guestCount: true, guestUnitPrice: true } });
  const affected = regs.filter((r) => (readTiers(r as Reg)[String(op)] ?? 0) > 0);
  if (affected.length === 0) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Không tìm thấy dòng khách này" } }, { status: 404 });
  const totalOld = affected.reduce((s, r) => s + readTiers(r as Reg)[String(op)], 0);

  // Đổi SỐ KHÁCH nhưng dòng thuộc NHIỀU PHÒNG → không biết chia phòng nào → chặn, hướng dẫn.
  if (nc !== undefined && nc !== totalOld && affected.length > 1) {
    return NextResponse.json({
      error: { code: "AMBIGUOUS", message: "Dòng khách này gộp nhiều phòng — ở đây chỉ đổi ĐƠN GIÁ được. Muốn đổi SỐ KHÁCH, vui lòng dùng nút Sửa của từng phòng." },
    }, { status: 400 });
  }

  for (const r of affected) {
    const tiers = readTiers(r as Reg);
    const cnt = tiers[String(op)];
    delete tiers[String(op)];
    const addCnt = (nc !== undefined && affected.length === 1) ? nc : cnt; // đổi số chỉ khi 1 phòng; còn lại giữ số, chỉ đổi giá
    if (addCnt > 0) tiers[String(np)] = (tiers[String(np)] ?? 0) + addCnt;
    const totalGuest = Object.values(tiers).reduce((s, c) => s + Number(c), 0);
    await prisma.mealRegistration.update({ where: { id: r.id }, data: { guestByPrice: tiers, guestCount: totalGuest } });
  }
  return NextResponse.json({ data: { ok: true } });
}

// DELETE ?date=&price= — xóa dòng khách theo đơn giá (mọi phòng, cho ngày).
export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (!canUser(session.user as any, "m10.nhaan.dangky:delete")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");
  const price = searchParams.get("price");
  if (!date || !price) return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Thiếu date / price" } }, { status: 400 });
  const op = Math.round(Number(price));

  const regs = await prisma.mealRegistration.findMany({ where: { date: dayRange(date) }, select: { id: true, guestByPrice: true, guestCount: true, guestUnitPrice: true } });
  for (const r of regs) {
    const tiers = readTiers(r as Reg);
    if ((tiers[String(op)] ?? 0) > 0) {
      delete tiers[String(op)];
      const totalGuest = Object.values(tiers).reduce((s, c) => s + Number(c), 0);
      await prisma.mealRegistration.update({ where: { id: r.id }, data: { guestByPrice: tiers, guestCount: totalGuest } });
    }
  }
  return NextResponse.json({ data: { ok: true } });
}
