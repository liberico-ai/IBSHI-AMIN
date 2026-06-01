import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { tierToContractType, calcContractEndDate } from "@/lib/probation-eval";
import { buildContractHtml, COMPANY_INFO } from "@/lib/contract-doc";

// GET — trả nội dung HĐ pre-fill (HTML) + thông tin gợi ý để soạn thảo.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const evalRec = await prisma.probationEvaluation.findUnique({
    where: { id: params.id },
    include: {
      employee: { select: { code: true, fullName: true, dateOfBirth: true, idNumber: true, address: true, jobRole: true, jobPosition: true, department: { select: { name: true } } } },
    },
  });
  if (!evalRec) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });

  // Nếu đã soạn rồi → trả lại bản đã lưu để sửa tiếp
  const existing: any = evalRec.contractDraft;
  const tier = evalRec.selectedTier || evalRec.recommendedTier;
  const contractType = tierToContractType(tier) || "DEFINITE_12M";

  // Khớp Thư mời nhận việc theo tên ứng viên (chưa có FK NV↔offer) để lấy lương/vị trí/nơi làm việc/ngày
  const offer = await prisma.offerLetter.findFirst({
    where: { candidate: { fullName: evalRec.employee.fullName } },
    orderBy: { createdAt: "desc" },
    select: { officialSalary: true, salaryBreakdown: true, position: true, departmentName: true, workLocation: true, startDate: true, benefits: true },
  });

  // Cơ cấu lương từ Thư mời: Lương cơ bản → Lương đóng BHXH; TẤT CẢ phụ cấp (nhà xa + KPI + chức vụ) → cột Phụ cấp.
  const bd: any = offer?.salaryBreakdown;
  const offerBase = bd ? (bd.baseSalary || 0) : (offer ? Number(offer.officialSalary) : 0);
  const offerAllowance = bd ? ((bd.farAllowance || 0) + (bd.kpiAllowance || 0) + (bd.positionAllowance || 0)) : 0;
  const baseSalary = existing?.baseSalary ?? offerBase;
  const allowance = existing?.allowance ?? offerAllowance;
  const kpi = existing?.kpi ?? 0;
  const startDate = existing?.startDate ? new Date(existing.startDate) : (offer?.startDate ?? null);
  const endDate = existing?.endDate ? new Date(existing.endDate) : (startDate ? calcContractEndDate(tier, startDate) : null);
  const jobTitle = existing?.jobTitle ?? evalRec.employee.jobRole ?? offer?.position ?? "";
  const workLocation = existing?.workLocation ?? offer?.workLocation ?? COMPANY_INFO.address;
  const terms = existing?.terms ?? offer?.benefits ?? "";

  // Số HĐLĐ cố định: <mã NV>/<năm ký>/HĐLĐ/IBS HI
  const numYear = (startDate ?? new Date()).getFullYear();
  const contractNumber = `${evalRec.employee.code}/${numYear}/HĐLĐ/IBS HI`;

  const data = {
    contractNumber,
    contractType,
    startDate, endDate, baseSalary, allowance, kpi, jobTitle, workLocation, terms,
    issuedDate: new Date(),
    employee: {
      fullName: evalRec.employee.fullName,
      dateOfBirth: evalRec.employee.dateOfBirth,
      idNumber: evalRec.employee.idNumber,
      address: evalRec.employee.address,
      departmentName: evalRec.employee.department?.name,
    },
  };

  // Giữ bản nháp đã soạn (nếu có) để không mất chỉnh sửa tay; nếu chưa có → dựng mẫu (đã có số HĐ tự sinh)
  const html = existing?.contractHtml || buildContractHtml(data as any);

  return NextResponse.json({
    data: {
      html,
      suggested: {
        contractNumber,
        employeeCode: evalRec.employee.code,
        contractType,
        startDate: startDate ? startDate.toISOString().slice(0, 10) : "",
        baseSalary, allowance, kpi, jobTitle, workLocation, terms,
      },
    },
  });
}
