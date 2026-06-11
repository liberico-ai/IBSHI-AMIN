import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { buildContractHtml, COMPANY_INFO } from "@/lib/contract-doc";

// GET — nội dung HĐ THỬ VIỆC pre-fill cho 1 nhân viên (thời hạn 2 tháng, lương thử việc lấy từ thư mời).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const { id: employeeId } = await params;

  const emp = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: {
      code: true, fullName: true, gender: true, dateOfBirth: true,
      idNumber: true, idIssuedDate: true, idIssuedPlace: true, address: true,
      jobRole: true, startDate: true, department: { select: { name: true } },
    },
  });
  if (!emp) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });

  // Lấy lương thử việc (HCNS đã nhập) từ Thư mời khớp tên ứng viên
  const offer = await prisma.offerLetter.findFirst({
    where: { candidate: { fullName: emp.fullName } },
    orderBy: { createdAt: "desc" },
    select: { probationarySalary: true, probationEndDate: true, startDate: true, position: true },
  });

  const startDate = emp.startDate ?? new Date();
  // Thời hạn thử việc mặc định 2 tháng
  const endDate = offer?.probationEndDate ?? (() => { const d = new Date(startDate); d.setMonth(d.getMonth() + 2); return d; })();
  const probSalary = offer?.probationarySalary ? Math.round(Number(offer.probationarySalary)) : 0;
  const contractNumber = `${emp.code}/${startDate.getFullYear()}/HĐLĐ/IBS HI`;

  const docData = {
    contractNumber,
    contractType: "PROBATION",
    startDate, endDate, baseSalary: probSalary, allowance: 0, kpi: 0,
    jobTitle: emp.jobRole ?? offer?.position ?? "",
    workLocation: COMPANY_INFO.address,
    terms: "",
    issuedDate: new Date(),
    employee: {
      fullName: emp.fullName,
      gender: emp.gender,
      dateOfBirth: emp.dateOfBirth,
      idNumber: emp.idNumber,
      idIssueDate: emp.idIssuedDate,
      idIssuePlace: emp.idIssuedPlace,
      address: emp.address,
      departmentName: emp.department?.name,
    },
  };

  return NextResponse.json({
    data: {
      html: buildContractHtml(docData as any),
      suggested: {
        contractNumber,
        startDate: startDate.toISOString().slice(0, 10),
        endDate: endDate.toISOString().slice(0, 10),
        baseSalary: probSalary,
        jobTitle: emp.jobRole ?? "",
      },
    },
  });
}
