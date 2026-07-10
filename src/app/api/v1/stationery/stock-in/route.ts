import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { normalizeItemName } from "@/lib/stationery";
import { canUser } from "@/lib/permission-catalog";

const ItemSchema = z.object({
  // Có thể là item đã có (itemId) HOẶC item mới (name + unit)
  itemId: z.string().uuid().optional(),
  name: z.string().optional(),
  unit: z.string().optional(),
  quantity: z.number().positive(),
});

const CreateSchema = z.object({
  supplierName: z.string().min(1),  // tên NCC nhập tay — auto find-or-create
  importDate: z.string(),
  notes: z.string().optional().nullable(),
  items: z.array(ItemSchema).min(1),
});

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 200);
  const data = await prisma.stationeryStockIn.findMany({
    take: limit,
    orderBy: { importDate: "desc" },
    include: {
      supplier: { select: { id: true, name: true } },
      items: { include: { item: { select: { id: true, name: true, unit: true } } } },
    },
  });
  return NextResponse.json({ data });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  // Nhập kho VPP = quản lý kho (m10.vpp.nhapkho:create), không phải "đề nghị VPP".
  if (!canUser(session.user as any, "m10.vpp.nhapkho:create"))
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });

  const body = CreateSchema.parse(await request.json());
  const userId = (session.user as any).id;

  const result = await prisma.$transaction(async (tx) => {
    // Find-or-create NCC theo tên (case-insensitive, trim)
    const supplierName = body.supplierName.trim();
    let supplier = await tx.stationerySupplier.findFirst({
      where: { name: { equals: supplierName, mode: "insensitive" } },
    });
    if (!supplier) {
      supplier = await tx.stationerySupplier.create({ data: { name: supplierName } });
    }
    // Resolve/create từng item, dedupe theo normalizedName
    const resolved: { itemId: string; quantity: number }[] = [];
    for (const it of body.items) {
      let itemId = it.itemId;
      if (!itemId) {
        if (!it.name || !it.unit) throw new Error("Item thiếu name/unit");
        const normalized = normalizeItemName(it.name);
        const existing = await tx.stationeryItem.findUnique({ where: { normalizedName: normalized } });
        if (existing) itemId = existing.id;
        else {
          const created = await tx.stationeryItem.create({
            data: { name: it.name.trim(), normalizedName: normalized, unit: it.unit, currentStock: 0 },
          });
          itemId = created.id;
        }
      }
      resolved.push({ itemId: itemId!, quantity: it.quantity });
    }
    // Tạo StockIn
    const stockIn = await tx.stationeryStockIn.create({
      data: {
        supplierId: supplier.id,
        importDate: new Date(body.importDate),
        notes: body.notes ?? null,
        createdById: userId,
        items: { create: resolved },
      },
    });
    // Cập nhật tồn kho — cộng dồn
    for (const r of resolved) {
      await tx.stationeryItem.update({
        where: { id: r.itemId },
        data: { currentStock: { increment: r.quantity } },
      });
    }
    return stockIn;
  });

  return NextResponse.json({ data: result }, { status: 201 });
}
