import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canDo } from "@/lib/permissions";
import { z } from "zod";

const UpdateSchema = z.object({
  mainDish: z.string().min(1).optional(),
  sideDish: z.string().min(1).optional(),
  soup: z.string().min(1).optional(),
  dessert: z.string().nullable().optional(),
});

// PUT /api/v1/meals/menu/:id — update a specific menu item
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const userRole = (session.user as any).role;
  if (!canDo(userRole, "meals", "readAll")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const { id } = await params;
  const item = await prisma.weeklyMenu.findUnique({ where: { id } });
  if (!item) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });

  const body = await request.json();
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", issues: parsed.error.issues } }, { status: 422 });
  }

  const updated = await prisma.weeklyMenu.update({ where: { id }, data: parsed.data });
  return NextResponse.json({ data: updated });
}

// DELETE /api/v1/meals/menu/:id — delete a specific menu item
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const userRole = (session.user as any).role;
  if (!canDo(userRole, "meals", "readAll")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const { id } = await params;
  const item = await prisma.weeklyMenu.findUnique({ where: { id } });
  if (!item) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });

  await prisma.weeklyMenu.delete({ where: { id } });
  return NextResponse.json({ data: { success: true } });
}
