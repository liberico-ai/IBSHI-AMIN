import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { buildContractHtml, renderContractDocxFromHtml, safeFileName } from "@/lib/contract-doc";

// GET — tải Word (.docx) hợp đồng đã soạn.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; contractId: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const { contractId } = await params;

  const c = await prisma.contract.findUnique({
    where: { id: contractId },
    include: {
      employee: {
        select: {
          fullName: true, gender: true, dateOfBirth: true,
          idNumber: true, idIssuedDate: true, idIssuedPlace: true,
          address: true, department: { select: { name: true } },
        },
      },
    },
  });
  if (!c) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });

  const html = c.documentHtml || buildContractHtml({
    contractNumber: c.contractNumber, contractType: c.contractType, startDate: c.startDate, endDate: c.endDate,
    baseSalary: c.insuranceSalary ?? c.baseSalary, allowance: c.allowance ?? 0, jobTitle: c.position, issuedDate: c.createdAt,
    employee: {
      fullName: c.employee.fullName,
      gender: c.employee.gender,
      dateOfBirth: c.employee.dateOfBirth,
      idNumber: c.employee.idNumber,
      idIssueDate: c.employee.idIssuedDate,
      idIssuePlace: c.employee.idIssuedPlace,
      address: c.employee.address,
      departmentName: c.employee.department?.name,
    },
  } as any);
  const docx = await renderContractDocxFromHtml(html);
  const safe = safeFileName(c.contractNumber);
  return new NextResponse(new Uint8Array(docx), {
    status: 200,
    headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "Content-Disposition": `attachment; filename="HDLD-${safe}.docx"` },
  });
}
