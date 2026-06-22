import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { computeFifo } from "@/lib/food-inventory";
import { canManageFoodPurchase } from "@/lib/access";

// Sổ chi phí mua thực phẩm theo ngày. HCNS (HR_ADMIN/BOM) quản lý.
const CreateSchema = z.object({
  date: z.string(),
  items: z.array(z.object({
    name: z.string().min(1),
    unit: z.string().default("Kg"),
    quantity: z.number().positive(),
    unitPrice: z.number().int().min(0),
  })).min(1),
});

function canManage(role: string, employeeCode?: string | null): boolean {
  return role === "HR_ADMIN" || role === "BOM" || role === "ADMIN" || canManageFoodPurchase(employeeCode);
}

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const now = new Date();
  const month = parseInt(searchParams.get("month") || String(now.getMonth() + 1));
  const year = parseInt(searchParams.get("year") || String(now.getFullYear()));
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0, 23, 59, 59);

  const data = await prisma.foodPurchase.findMany({
    where: { date: { gte: start, lte: end } },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
  });
  const total = data.reduce((s, r) => s + Math.round(r.quantity * r.unitPrice), 0);

  // Tồn kho hiện tại (FIFO, toàn bộ lịch sử) + giá vốn THỰC XUẤT trong tháng.
  const [allPurchases, allIssues] = await Promise.all([
    prisma.foodPurchase.findMany(),
    prisma.foodIssue.findMany(),
  ]);
  const { issueCost, inventory } = computeFifo(allPurchases as any, allIssues as any);
  const issueCostTotal = allIssues
    .filter((i) => i.date >= start && i.date <= end)
    .reduce((s, i) => s + (issueCost.get(i.id) ?? 0), 0);
  const inventoryValue = inventory.reduce((s, r) => s + r.value, 0);

  return NextResponse.json({
    data,
    meta: { month, year, total, issueCostTotal, inventory, inventoryValue, canManage: canManage((session.user as any).role, (session.user as any).employeeCode) },
  });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const role = (session.user as any).role;
  const userId = (session.user as any).id;
  if (!canManage(role, (session.user as any).employeeCode)) return NextResponse.json({ error: { code: "FORBIDDEN", message: "Chỉ HCNS được nhập chi phí thực phẩm" } }, { status: 403 });

  const parsed = CreateSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: { code: "VALIDATION_ERROR", issues: parsed.error.issues } }, { status: 422 });
  const { date, items } = parsed.data;

  await prisma.foodPurchase.createMany({
    data: items.map((it) => ({ date: new Date(date), name: it.name, unit: it.unit || "Kg", quantity: it.quantity, unitPrice: it.unitPrice, createdBy: userId })),
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
    await prisma.foodPurchase.delete({ where: { id } });
  } else if (date) {
    const d = new Date(date);
    await prisma.foodPurchase.deleteMany({ where: { date: { gte: new Date(new Date(d).setHours(0, 0, 0, 0)), lte: new Date(new Date(d).setHours(23, 59, 59, 999)) } } });
  } else {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Cần id hoặc date" } }, { status: 400 });
  }
  return NextResponse.json({ data: { ok: true } });
}
