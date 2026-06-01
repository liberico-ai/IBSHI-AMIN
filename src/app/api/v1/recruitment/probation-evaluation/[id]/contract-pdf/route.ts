import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { buildContractHtml, renderContractPdfFromHtml } from "@/lib/contract-doc";

// GET — sinh & tải PDF Hợp đồng từ nội dung đã soạn (contractDraft.contractHtml).
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const evalRec = await prisma.probationEvaluation.findUnique({
    where: { id: params.id },
    include: { employee: { select: { fullName: true, dateOfBirth: true, idNumber: true, address: true, department: { select: { name: true } } } } },
  });
  if (!evalRec) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  const d: any = evalRec.contractDraft;
  if (!d) return NextResponse.json({ error: { code: "NO_DRAFT", message: "Chưa soạn thảo hợp đồng" } }, { status: 409 });

  const html = d.contractHtml || buildContractHtml({ ...d, issuedDate: evalRec.contractIssuedAt, employee: { fullName: evalRec.employee.fullName, dateOfBirth: evalRec.employee.dateOfBirth, idNumber: evalRec.employee.idNumber, address: evalRec.employee.address, departmentName: evalRec.employee.department?.name } });
  const pdf = await renderContractPdfFromHtml(html);
  const safe = String(d.contractNumber).replace(/[\\/]/g, "_");
  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="HDLD-${safe}.pdf"` },
  });
}
