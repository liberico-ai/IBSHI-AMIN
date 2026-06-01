import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { buildContractHtml, COMPANY_INFO } from "@/lib/contract-doc";

// Bậc thời hạn HĐ tăng dần (bỏ 36M): Thử việc → 12 → 24 → Không XĐ.
const TIER_ORDER = ["PROBATION", "DEFINITE_12M", "DEFINITE_24M", "INDEFINITE"];
const TERM_MONTHS: Record<string, number | null> = { DEFINITE_12M: 12, DEFINITE_24M: 24, INDEFINITE: null, PROBATION: 2 };
function nextType(t: string): string {
  const i = TIER_ORDER.indexOf(t);
  if (i < 0 || i >= TIER_ORDER.length - 1) return "INDEFINITE";
  return TIER_ORDER[i + 1];
}

// GET — nội dung HĐ pre-fill cho việc KÝ HĐ MỚI (gia hạn) của 1 nhân viên.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const { id: employeeId } = await params;

  const emp = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: {
      code: true, fullName: true, dateOfBirth: true, idNumber: true, address: true,
      jobRole: true, jobPosition: true, skillLevel: true,
      department: { select: { name: true } },
      contracts: { orderBy: { startDate: "desc" } },
    },
  });
  if (!emp) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });

  // HĐ hiện tại (đang hiệu lực) làm gốc; nếu không có thì lấy HĐ mới nhất.
  const current = emp.contracts.find((c) => c.status === "ACTIVE") || emp.contracts[0] || null;
  const contractType = current ? nextType(current.contractType) : "DEFINITE_12M";

  // Ngày bắt đầu HĐ mới = ngay sau khi HĐ cũ hết hạn (nếu có), hoặc hôm nay.
  let startDate = new Date();
  if (current?.endDate) { startDate = new Date(current.endDate); startDate.setDate(startDate.getDate() + 1); }
  const months = TERM_MONTHS[contractType];
  let endDate: Date | null = null;
  if (months != null) { endDate = new Date(startDate); endDate.setMonth(endDate.getMonth() + months); endDate.setDate(endDate.getDate() - 1); }

  const baseSalary = current?.insuranceSalary ?? current?.baseSalary ?? 0;
  const allowance = current?.allowance ?? 0;
  const jobTitle = emp.jobRole ?? current?.position ?? "";

  // Số HĐLĐ cố định: <mã NV>/<năm ký>/HĐLĐ/IBS HI
  const contractNumber = `${emp.code}/${startDate.getFullYear()}/HĐLĐ/IBS HI`;

  const docData = {
    contractNumber,
    contractType,
    startDate, endDate, baseSalary, allowance, kpi: 0,
    jobTitle,
    workLocation: COMPANY_INFO.address,
    terms: "",
    issuedDate: new Date(),
    employee: {
      fullName: emp.fullName,
      dateOfBirth: emp.dateOfBirth,
      idNumber: emp.idNumber,
      address: emp.address,
      departmentName: emp.department?.name,
    },
  };

  return NextResponse.json({
    data: {
      html: buildContractHtml(docData as any),
      suggested: {
        contractNumber,
        employeeCode: emp.code,
        contractType,
        startDate: startDate.toISOString().slice(0, 10),
        endDate: endDate ? endDate.toISOString().slice(0, 10) : "",
        baseSalary, allowance,
        jobTitle,
        skillLevel: emp.skillLevel ?? "",
        jobRole: emp.jobRole ?? "",
        currentType: current?.contractType ?? null,
      },
    },
  });
}
