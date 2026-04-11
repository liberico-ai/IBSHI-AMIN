import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canDo } from "@/lib/permissions";
import { z } from "zod";

const UpdateContractSchema = z.object({
  contractNumber: z.string().min(1).optional(),
  contractType: z.enum(["PROBATION", "DEFINITE_12M", "DEFINITE_24M", "DEFINITE_36M", "INDEFINITE"]).optional(),
  startDate: z.string().optional(),
  endDate: z.string().nullable().optional(),
  baseSalary: z.number().int().positive().optional(),
  status: z.enum(["ACTIVE", "EXPIRING_SOON", "EXPIRED", "TERMINATED", "RENEWED"]).optional(),
  fileUrl: z.string().nullable().optional(),
});

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }

  const userRole = (session.user as any).role;
  if (!canDo(userRole, "contracts", "update")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const { id } = await params;
  const contract = await prisma.contract.findUnique({ where: { id } });
  if (!contract) {
    return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  }

  const body = await req.json();
  const parsed = UpdateContractSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", issues: parsed.error.issues } },
      { status: 422 }
    );
  }

  const data = parsed.data;
  const updateData: any = { ...data };
  if (data.startDate) updateData.startDate = new Date(data.startDate);
  if (data.endDate) updateData.endDate = new Date(data.endDate);
  if (data.endDate === null) updateData.endDate = null;

  const updated = await prisma.contract.update({ where: { id }, data: updateData });

  await prisma.auditLog.create({
    data: {
      userId: (session.user as any).id,
      action: "UPDATE",
      entityType: "Contract",
      entityId: id,
      oldValue: JSON.stringify(contract),
      newValue: JSON.stringify(updateData),
    },
  });

  return NextResponse.json({ data: updated });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }

  const userRole = (session.user as any).role;
  if (!canDo(userRole, "contracts", "delete")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const { id } = await params;
  const contract = await prisma.contract.findUnique({ where: { id } });
  if (!contract) {
    return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  }

  await prisma.contract.update({ where: { id }, data: { status: "TERMINATED" } });

  return NextResponse.json({ data: { success: true } });
}
