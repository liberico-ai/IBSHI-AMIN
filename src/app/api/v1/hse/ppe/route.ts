import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { checkPermission } from "@/lib/permissions";
import { z } from "zod";

const CreateSchema = z.object({
  name: z.string().min(2),
  code: z.string().min(2),
  unit: z.string().min(1),
  stockQuantity: z.number().int().min(0).default(0),
  minimumStock: z.number().int().min(0).default(10),
  notes: z.string().optional().nullable(),
});

const IssueSchema = z.object({
  itemId: z.string().uuid(),
  employeeId: z.string().uuid(),
  quantity: z.number().int().min(1).default(1),
  notes: z.string().optional().nullable(),
});

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const lowStock = searchParams.get("lowStock") === "true";

  const where: any = { isActive: true };
  if (lowStock) {
    // Will filter in JS since Prisma can't compare two fields in where
  }

  const data = await prisma.pPEItem.findMany({
    where,
    include: {
      issuances: {
        where: { returnDate: null },
        select: { id: true, employeeId: true, quantity: true },
      },
    },
    orderBy: { name: "asc" },
  });

  const result = lowStock ? data.filter((item) => item.stockQuantity <= item.minimumStock) : data;
  return NextResponse.json({ data: result });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const userRole = (session.user as any).role;
  if (!checkPermission(userRole, "HR_ADMIN")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const body = await request.json();

  // If issuing PPE to employee
  if (body.action === "issue") {
    const parsed = IssueSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: { code: "VALIDATION_ERROR", issues: parsed.error.issues } }, { status: 422 });
    }
    const item = await prisma.pPEItem.findUnique({ where: { id: parsed.data.itemId } });
    if (!item) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
    if (item.stockQuantity < parsed.data.quantity) {
      return NextResponse.json({ error: { code: "INSUFFICIENT_STOCK", message: "Không đủ tồn kho" } }, { status: 409 });
    }

    const [issuance] = await prisma.$transaction([
      prisma.pPEIssuance.create({ data: { itemId: parsed.data.itemId, employeeId: parsed.data.employeeId, quantity: parsed.data.quantity, notes: parsed.data.notes } }),
      prisma.pPEItem.update({ where: { id: parsed.data.itemId }, data: { stockQuantity: { decrement: parsed.data.quantity } } }),
    ]);
    return NextResponse.json({ data: issuance }, { status: 201 });
  }

  // Create new PPE item
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", issues: parsed.error.issues } }, { status: 422 });
  }

  const existing = await prisma.pPEItem.findUnique({ where: { code: parsed.data.code } });
  if (existing) return NextResponse.json({ error: { code: "DUPLICATE_CODE" } }, { status: 409 });

  const item = await prisma.pPEItem.create({ data: parsed.data });
  return NextResponse.json({ data: item }, { status: 201 });
}
