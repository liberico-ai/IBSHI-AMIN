import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { checkPermission } from "@/lib/permissions";
import { z } from "zod";

const UpdateSchema = z.object({
  status: z.enum(["PENDING", "ISSUED", "APPEALED", "CLOSED"]).optional(),
  penalty: z.string().min(2).optional(),
  description: z.string().optional(),
  decisionNumber: z.string().optional().nullable(),
  effectiveDate: z.string().optional(),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const userRole = (session.user as any).role;
  if (!checkPermission(userRole, "HR_ADMIN")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const { id } = await params;
  const action = await prisma.disciplinaryAction.findUnique({ where: { id } });
  if (!action) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });

  const body = await request.json();
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", issues: parsed.error.issues } }, { status: 422 });
  }

  const updateData: any = { ...parsed.data };
  if (parsed.data.effectiveDate) updateData.effectiveDate = new Date(parsed.data.effectiveDate);

  const updated = await prisma.disciplinaryAction.update({
    where: { id },
    data: updateData,
    include: {
      employee: { select: { id: true, code: true, fullName: true } },
      regulation: { select: { id: true, code: true, title: true } },
    },
  });

  return NextResponse.json({ data: updated });
}
