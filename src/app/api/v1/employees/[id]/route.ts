import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canDo } from "@/lib/permissions";
import { z } from "zod";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }

  const { id } = await params;
  const userRole = (session.user as any).role;
  const userId = (session.user as any).id;

  const employee = await prisma.employee.findUnique({
    where: { id },
    include: {
      department: true,
      position: true,
      team: true,
      user: { select: { email: true, isActive: true } },
      contracts: { orderBy: { createdAt: "desc" } },
      certificates: { orderBy: { expiryDate: "asc" } },
      workHistory: { orderBy: { effectiveDate: "desc" } },
      leaveBalances: { where: { year: new Date().getFullYear() } },
    },
  });

  if (!employee) {
    return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  }

  // RBAC check
  if (userRole === "EMPLOYEE" || userRole === "TEAM_LEAD") {
    if (employee.userId !== userId) {
      return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
    }
  } else if (userRole === "MANAGER") {
    const manager = await prisma.employee.findFirst({ where: { userId } });
    if (manager && employee.departmentId !== manager.departmentId) {
      return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
    }
  }

  return NextResponse.json({ data: employee });
}

const UpdateEmployeeSchema = z.object({
  phone: z.string().regex(/^0\d{9}$/).optional(),
  currentAddress: z.string().optional(),
  bankAccount: z.string().optional(),
  bankName: z.string().optional(),
  emergencyContact: z.string().optional(),
  emergencyPhone: z.string().optional(),
  status: z.enum(["ACTIVE", "PROBATION", "ON_LEAVE", "RESIGNED", "TERMINATED"]).optional(),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }

  const userRole = (session.user as any).role;
  const userId = (session.user as any).id;
  const { id } = await params;

  const employee = await prisma.employee.findUnique({ where: { id } });
  if (!employee) {
    return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  }

  // Employees can only update their own contact info
  if (userRole === "EMPLOYEE" || userRole === "TEAM_LEAD") {
    if (employee.userId !== userId) {
      return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
    }
  }

  const body = await request.json();
  const parsed = UpdateEmployeeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", details: parsed.error.issues } },
      { status: 400 }
    );
  }

  // Non-HR_ADMIN cannot change status
  const updateData = { ...parsed.data };
  if (!canDo(userRole, "employees", "readAll") && updateData.status) {
    delete updateData.status;
  }

  const updated = await prisma.employee.update({
    where: { id },
    data: { ...updateData, updatedAt: new Date() },
    include: { department: true, position: true },
  });

  await prisma.auditLog.create({
    data: {
      userId: (session.user as any).id,
      action: "UPDATE",
      entityType: "Employee",
      entityId: id,
      newValue: JSON.stringify(updateData),
    },
  });

  return NextResponse.json({ data: updated });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }

  const userRole = (session.user as any).role;
  if (!canDo(userRole, "employees", "delete")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const { id } = await params;
  const employee = await prisma.employee.findUnique({
    where: { id },
    include: { user: true },
  });
  if (!employee) {
    return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  }

  // Soft delete
  await prisma.$transaction([
    prisma.employee.update({
      where: { id },
      data: { status: "RESIGNED" },
    }),
    prisma.user.update({
      where: { id: employee.userId },
      data: { isActive: false },
    }),
  ]);

  await prisma.auditLog.create({
    data: {
      userId: (session.user as any).id,
      action: "DELETE",
      entityType: "Employee",
      entityId: id,
      newValue: JSON.stringify({ status: "RESIGNED", isActive: false }),
    },
  });

  return NextResponse.json({ data: { success: true } });
}
