import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canDo } from "@/lib/permissions";
import { canUser } from "@/lib/permission-catalog";
import { z } from "zod";

const CreateSchema = z.object({
  itemKey: z.string().min(1),
  title: z.string().min(1),
  sortOrder: z.number().int().default(999),
  note: z.string().optional().nullable(),
});

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const userRole = (session.user as any).role;
  if (!canUser(session.user as any, "m4.tuyendung:edit")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const body = await request.json();
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", issues: parsed.error.issues } }, { status: 422 });
  }

  const created = await prisma.checklistItem.create({
    data: {
      checklistId: params.id,
      itemKey: parsed.data.itemKey,
      title: parsed.data.title,
      sortOrder: parsed.data.sortOrder,
      note: parsed.data.note ?? null,
    },
  });

  return NextResponse.json({ data: created }, { status: 201 });
}
