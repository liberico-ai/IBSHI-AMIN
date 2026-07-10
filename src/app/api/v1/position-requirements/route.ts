import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canUser } from "@/lib/permission-catalog";
import { canDo } from "@/lib/permissions";
import { z } from "zod";

const CreateSchema = z.object({
  positionId: z.string().uuid(),
  name: z.string().min(2),
  description: z.string().optional().nullable(),
  isRequired: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const userRole = (session.user as { role: string }).role;
  if (!canUser(session.user as any, "m4.vitri:view")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const positionId = searchParams.get("positionId") || undefined;

  const data = await prisma.positionRequirement.findMany({
    where: positionId ? { positionId } : {},
    include: { position: { select: { id: true, name: true, departmentId: true } } },
    orderBy: [{ positionId: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
  });

  return NextResponse.json({ data });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const userRole = (session.user as any).role;
  if (!canUser(session.user as any, "m4.vitri:create")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const body = await request.json();
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", issues: parsed.error.issues } }, { status: 422 });
  }

  const created = await prisma.positionRequirement.create({
    data: parsed.data,
    include: { position: { select: { id: true, name: true } } },
  });

  return NextResponse.json({ data: created }, { status: 201 });
}
