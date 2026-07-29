import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canUser } from "@/lib/permission-catalog";
import { canActOnEmployeeScope } from "@/lib/data-scope.server";
import { canDo } from "@/lib/permissions";
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
  if (!canUser(session.user as any, "m8.kyluat:edit")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const { id } = await params;
  const action = await prisma.disciplinaryAction.findUnique({ where: { id } });
  if (!action) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  if (!(await canActOnEmployeeScope((session.user as any).id, (session.user as any).role, "m8.kyluat", action.employeeId))) {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Nhân viên này ngoài phạm vi được cấp" } }, { status: 403 });
  }

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
