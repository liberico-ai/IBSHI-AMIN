import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canDo } from "@/lib/permissions";
import { z } from "zod";

const ItemSchema = z.object({
  item: z.string().min(1),
  assignedTo: z.string().uuid().optional().nullable(),
  sortOrder: z.number().int().optional(),
});

// GET /api/v1/events/:id/checklist
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const { id: eventId } = await params;
  const items = await prisma.auditChecklist.findMany({
    where: { eventId },
    orderBy: { sortOrder: "asc" },
  });
  return NextResponse.json({ data: items });
}

// POST /api/v1/events/:id/checklist — add checklist item
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const userRole = (session.user as any).role;
  if (!canDo(userRole, "events", "create")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const { id: eventId } = await params;
  const event = await prisma.companyEvent.findUnique({ where: { id: eventId } });
  if (!event) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });

  const body = await request.json();

  // Accept single item or array
  const items = Array.isArray(body) ? body : [body];
  const results = [];
  for (const raw of items) {
    const parsed = ItemSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: { code: "VALIDATION_ERROR", issues: parsed.error.issues } }, { status: 422 });
    }
    const created = await prisma.auditChecklist.create({
      data: {
        eventId,
        item: parsed.data.item,
        assignedTo: parsed.data.assignedTo ?? null,
        sortOrder: parsed.data.sortOrder ?? 0,
      },
    });
    results.push(created);
  }

  return NextResponse.json({ data: results }, { status: 201 });
}
