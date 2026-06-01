import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { buildContractHtml } from "@/lib/contract-doc";

// GET — trả nội dung HĐ (HTML) để xem trên modal.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; contractId: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const { contractId } = await params;

  const c = await prisma.contract.findUnique({
    where: { id: contractId },
    include: { employee: { select: { fullName: true, dateOfBirth: true, idNumber: true, address: true, department: { select: { name: true } } } } },
  });
  if (!c) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });

  const html = c.documentHtml || buildContractHtml({
    contractNumber: c.contractNumber, contractType: c.contractType, startDate: c.startDate, endDate: c.endDate,
    baseSalary: c.insuranceSalary ?? c.baseSalary, allowance: c.allowance ?? 0, jobTitle: c.position, issuedDate: c.createdAt,
    employee: { fullName: c.employee.fullName, dateOfBirth: c.employee.dateOfBirth, idNumber: c.employee.idNumber, address: c.employee.address, departmentName: c.employee.department?.name },
  } as any);

  return NextResponse.json({ data: { html, contractNumber: c.contractNumber } });
}
