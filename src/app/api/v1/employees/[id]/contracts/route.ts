import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canDo } from "@/lib/permissions";
import { z } from "zod";

const createContractSchema = z.object({
  contractNumber: z.string().min(1, "Số hợp đồng không được để trống"),
  contractType: z.enum(["PROBATION", "DEFINITE_12M", "DEFINITE_24M", "DEFINITE_36M", "INDEFINITE"]),
  startDate: z.string().min(1, "Ngày bắt đầu không được để trống"),
  endDate: z.string().optional().nullable(),
  baseSalary: z.number().int().positive("Lương cơ bản phải > 0"),
  fileUrl: z.string().optional().nullable(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }

  const userRole = (session.user as any).role;
  if (!canDo(userRole, "employees", "readAll")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const { id: employeeId } = await params;

  const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!employee) {
    return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  }

  const body = await req.json();
  const parsed = createContractSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", issues: parsed.error.issues } },
      { status: 422 }
    );
  }

  const { contractNumber, contractType, startDate, endDate, baseSalary, fileUrl } = parsed.data;

  // Check duplicate contract number
  const existing = await prisma.contract.findFirst({ where: { contractNumber } });
  if (existing) {
    return NextResponse.json(
      { error: { code: "DUPLICATE", message: "Số hợp đồng đã tồn tại" } },
      { status: 409 }
    );
  }

  const contract = await prisma.contract.create({
    data: {
      employeeId,
      contractNumber,
      contractType: contractType as any,
      startDate: new Date(startDate),
      endDate: endDate ? new Date(endDate) : null,
      baseSalary,
      fileUrl: fileUrl || null,
      status: "ACTIVE",
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: (session.user as any).id,
      action: "CREATE",
      entityType: "Contract",
      entityId: contract.id,
      newValue: JSON.stringify({ contractNumber, contractType, baseSalary }),
    },
  });

  return NextResponse.json({ data: contract }, { status: 201 });
}
