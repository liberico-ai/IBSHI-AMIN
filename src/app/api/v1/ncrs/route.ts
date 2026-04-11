import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canDo } from "@/lib/permissions";
import { z } from "zod";

const CreateSchema = z.object({
  description: z.string().min(5),
  responsibleDept: z.string().min(1),
  assignedToId: z.string().uuid().optional().nullable(),
  dueDate: z.string(),
  sourceEventId: z.string().uuid().optional().nullable(),
});

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") ?? undefined;

  const where: any = {};
  if (status) where.status = status;

  const data = await prisma.nCR.findMany({
    where,
    include: {
      assignedTo: { select: { id: true, fullName: true, code: true } },
    },
    orderBy: [{ status: "asc" }, { dueDate: "asc" }],
    take: 100,
  });

  return NextResponse.json({ data });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const userRole = (session.user as any).role;
  if (!canDo(userRole, "events", "create")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const body = await request.json();
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", issues: parsed.error.issues } }, { status: 422 });
  }

  // Generate sequential NCR number
  const count = await prisma.nCR.count();
  const year = new Date().getFullYear();
  const ncrNumber = `NCR-${year}-${String(count + 1).padStart(3, "0")}`;

  const ncr = await prisma.nCR.create({
    data: {
      ncrNumber,
      description: parsed.data.description,
      responsibleDept: parsed.data.responsibleDept,
      assignedToId: parsed.data.assignedToId ?? null,
      dueDate: new Date(parsed.data.dueDate),
      sourceEventId: parsed.data.sourceEventId ?? null,
      status: "OPEN",
    },
    include: {
      assignedTo: { select: { id: true, fullName: true } },
    },
  });

  return NextResponse.json({ data: ncr }, { status: 201 });
}
