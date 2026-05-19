import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { normalizeItemName } from "../items/route";

const ItemSchema = z.object({
  // Có thể là item đã có (itemId) HOẶC item mới (name + unit)
  itemId: z.string().uuid().optional(),
  name: z.string().optional(),
  unit: z.string().optional(),
  quantity: z.number().positive(),
});

const CreateSchema = z.object({
  supplierId: z.string().uuid(),
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
  if (!["HR_ADMIN", "BOM"].includes((session.user as any).role))
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });

  const body = CreateSchema.parse(await request.json());
  const userId = (session.user as any).id;

  const result = await prisma.$transaction(async (tx) => {
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
        supplierId: body.supplierId,
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
