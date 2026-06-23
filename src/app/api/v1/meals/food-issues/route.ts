import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { computeFifo, availableQty } from "@/lib/food-inventory";
import { canManageFoodPurchase } from "@/lib/access";

// Thực XUẤT thực phẩm — bếp nhập lượng thực nấu; trừ tồn kho FIFO; chặn xuất vượt tồn.
function canManage(role: string, employeeCode?: string | null): boolean {
  return role === "HR_ADMIN" || role === "BOM" || role === "ADMIN" || canManageFoodPurchase(employeeCode);
}

const CreateSchema = z.object({
  date: z.string(),
  items: z.array(z.object({
    name: z.string().min(1),
    unit: z.string().default("Kg"),
    quantity: z.number().positive(),
  })).min(1),
});

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const now = new Date();
  const month = parseInt(searchParams.get("month") || String(now.getMonth() + 1));
  const year = parseInt(searchParams.get("year") || String(now.getFullYear()));
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0, 23, 59, 59);

  // FIFO cần toàn bộ lịch sử nhập + xuất để tính giá vốn đúng (tồn mang sang từ trước).
  const [allPurchases, allIssues] = await Promise.all([
    prisma.foodPurchase.findMany({ orderBy: [{ date: "asc" }, { createdAt: "asc" }] }),
    prisma.foodIssue.findMany({ orderBy: [{ date: "asc" }, { createdAt: "asc" }] }),
  ]);
  const { issueCost } = computeFifo(allPurchases, allIssues);

  const monthIssues = allIssues.filter((i) => i.date >= start && i.date <= end);
  const data = monthIssues
    .map((i) => ({ id: i.id, date: i.date, name: i.name, unit: i.unit, quantity: i.quantity, cost: issueCost.get(i.id) ?? 0 }))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const total = data.reduce((s, r) => s + r.cost, 0);

  return NextResponse.json({ data, meta: { month, year, total, canManage: canManage((session.user as any).role, (session.user as any).employeeCode) } });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const role = (session.user as any).role;
  const userId = (session.user as any).id;
  if (!canManage(role, (session.user as any).employeeCode)) return NextResponse.json({ error: { code: "FORBIDDEN", message: "Chỉ HCNS được thực xuất thực phẩm" } }, { status: 403 });

  const parsed = CreateSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: { code: "VALIDATION_ERROR", issues: parsed.error.issues } }, { status: 422 });
  const { date, items } = parsed.data;

  const [allPurchases, allIssues] = await Promise.all([
    prisma.foodPurchase.findMany(),
    prisma.foodIssue.findMany(),
  ]);

  // Chặn xuất vượt tồn. Gộp số lượng trùng món trong cùng phiếu để kiểm tra đúng tổng.
  const needByKey = new Map<string, { name: string; unit: string; qty: number }>();
  for (const it of items) {
    const k = `${it.name.trim().toLowerCase()}__${(it.unit || "Kg").trim().toLowerCase()}`;
    const cur = needByKey.get(k) || { name: it.name, unit: it.unit || "Kg", qty: 0 };
    cur.qty += it.quantity;
    needByKey.set(k, cur);
  }
  for (const n of Array.from(needByKey.values())) {
    const avail = availableQty(allPurchases as any, allIssues as any, n.name, n.unit);
    if (n.qty > avail + 1e-6) {
      return NextResponse.json({ error: { code: "OVER_STOCK", message: `"${n.name}" chỉ còn tồn ${avail} ${n.unit}, không thể xuất ${n.qty} ${n.unit}.` } }, { status: 409 });
    }
  }

  await prisma.foodIssue.createMany({
    data: items.map((it) => ({ date: new Date(date), name: it.name.trim(), unit: it.unit || "Kg", quantity: it.quantity, createdBy: userId })),
  });
  return NextResponse.json({ data: { ok: true, count: items.length } }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const role = (session.user as any).role;
  if (!canManage(role, (session.user as any).employeeCode)) return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const date = searchParams.get("date");
  if (id) {
    await prisma.foodIssue.delete({ where: { id } });
  } else if (date) {
    const d = new Date(date);
    await prisma.foodIssue.deleteMany({ where: { date: { gte: new Date(new Date(d).setHours(0, 0, 0, 0)), lte: new Date(new Date(d).setHours(23, 59, 59, 999)) } } });
  } else {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Cần id hoặc date" } }, { status: 400 });
  }
  return NextResponse.json({ data: { ok: true } });
}
