import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canDo } from "@/lib/permissions";
import { calculatePayrollForPeriod } from "@/services/salary.service";
import { logAudit } from "@/lib/audit";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const userRole = (session.user as any).role;
  if (!canDo(userRole, "payroll", "readAll")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const { id } = await params;
  const period = await prisma.payrollPeriod.findUnique({
    where: { id },
    include: {
      records: {
        include: {
          employee: {
            select: {
              id: true, code: true, fullName: true,
              department: { select: { name: true } },
              position: { select: { name: true } },
            },
          },
        },
        orderBy: { employee: { fullName: "asc" } },
      },
    },
  });
  if (!period) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  return NextResponse.json({ data: period });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const userRole = (session.user as any).role;
  if (!canDo(userRole, "payroll", "calculate")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const { id } = await params;
  const period = await prisma.payrollPeriod.findUnique({ where: { id } });
  if (!period) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });

  const body = await request.json();
  const { action } = body;

  // APPROVE action
  if (action === "APPROVE") {
    if (!canDo(userRole, "payroll", "approve")) {
      return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
    }
    const updated = await prisma.payrollPeriod.update({
      where: { id },
      data: { status: "APPROVED", approvedBy: (session.user as any).id, approvedAt: new Date() },
    });
    logAudit({ userId: (session.user as any).id, action: "APPROVE", entityType: "PayrollPeriod", entityId: id, newValue: { status: "APPROVED" } });
    return NextResponse.json({ data: updated });
  }

  // CALCULATE action — delegates to salary.service
  if (action === "CALCULATE") {
    try {
      const result = await calculatePayrollForPeriod(id);
      logAudit({ userId: (session.user as any).id, action: "UPDATE", entityType: "PayrollPeriod", entityId: id, newValue: { action: "CALCULATE" } });
      return NextResponse.json({ data: result });
    } catch (err: any) {
      const code = err?.code;
      if (code === "PERIOD_NOT_FOUND") return NextResponse.json({ error: { code } }, { status: 404 });
      if (code === "PERIOD_ALREADY_APPROVED") return NextResponse.json({ error: { code } }, { status: 409 });
      throw err;
    }
  }

  // Generic status update
  const updated = await prisma.payrollPeriod.update({ where: { id }, data: { status: body.status } });
  return NextResponse.json({ data: updated });
}
