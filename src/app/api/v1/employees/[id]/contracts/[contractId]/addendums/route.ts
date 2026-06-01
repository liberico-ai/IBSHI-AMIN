import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canDo } from "@/lib/permissions";
import { z } from "zod";
import { buildAddendumHtml } from "@/lib/contract-doc";

// GET — list phụ lục của 1 HĐ + prefill (giá trị hiện tại của HĐ + thông tin NV).
// POST — Tạo phụ lục mới (status PENDING_APPROVAL, gửi TP HCNS duyệt).

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; contractId: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const { contractId } = await params;

  const c = await prisma.contract.findUnique({
    where: { id: contractId },
    include: {
      employee: { select: { fullName: true, idNumber: true, jobRole: true, jobPosition: true, department: { select: { name: true } } } },
      addendums: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!c) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });

  // Tách phụ cấp hiện tại theo 3 thành phần (cố gắng đọc từ allowances Json hoặc offer)
  const aJson: any = c.allowances || {};
  let curFar = Number(aJson.farAllowance ?? aJson.fuel ?? 0);
  let curKpi = Number(aJson.kpiAllowance ?? aJson.kpi ?? 0);
  let curPos = Number(aJson.positionAllowance ?? 0);
  // Nếu allowances Json không đầy đủ, thử lấy từ Thư mời khớp tên ứng viên (offer.salaryBreakdown)
  if (!curFar && !curKpi && !curPos) {
    const offer = await prisma.offerLetter.findFirst({
      where: { candidate: { fullName: c.employee.fullName } },
      orderBy: { createdAt: "desc" },
      select: { salaryBreakdown: true },
    });
    const bd: any = offer?.salaryBreakdown;
    if (bd) { curFar = Number(bd.farAllowance || 0); curKpi = Number(bd.kpiAllowance || 0); curPos = Number(bd.positionAllowance || 0); }
  }

  // Số phụ lục kế tiếp = PL<n>-<số HĐ>
  const next = (c.addendums.length + 1).toString().padStart(2, "0");
  const addendumNumber = `PL${next}-${c.contractNumber}`;

  return NextResponse.json({
    data: {
      contract: {
        id: c.id, contractNumber: c.contractNumber, startDate: c.startDate, endDate: c.endDate,
        position: c.position, insuranceSalary: c.insuranceSalary, baseSalary: c.baseSalary, allowance: c.allowance,
      },
      employee: c.employee,
      addendums: c.addendums,
      suggested: {
        addendumNumber,
        // giá trị hiện tại của HĐ + hồ sơ NV (để form làm "cũ" và pre-fill "mới")
        currentJobRole: c.employee.jobRole ?? c.position ?? "",
        currentJobPosition: c.employee.jobPosition ?? "",
        currentBaseSalary: c.insuranceSalary ?? c.baseSalary ?? 0,
        currentFarAllowance: curFar,
        currentKpiAllowance: curKpi,
        currentPositionAllowance: curPos,
      },
    },
  });
}

const CreateSchema = z.object({
  addendumNumber: z.string().min(1),
  effectiveDate: z.string(), // ISO date string
  newJobRole: z.string().optional().nullable(),
  newJobPosition: z.string().optional().nullable(),
  newBaseSalary: z.number().int().min(0).max(2_000_000_000).optional().nullable(),
  newFarAllowance: z.number().int().min(0).max(2_000_000_000).optional().nullable(),
  newKpi: z.number().int().min(0).max(2_000_000_000).optional().nullable(),         // PC KPI
  newPositionAllowance: z.number().int().min(0).max(2_000_000_000).optional().nullable(),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string; contractId: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const role = (session.user as any).role;
  const userId = (session.user as any).id;
  if (!canDo(role, "employees", "readAll")) return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });

  const { contractId } = await params;
  const c = await prisma.contract.findUnique({
    where: { id: contractId },
    include: { employee: { select: { fullName: true, idNumber: true, jobRole: true, jobPosition: true, department: { select: { name: true } } } } },
  });
  if (!c) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  if (c.status !== "ACTIVE")
    return NextResponse.json({ error: { code: "INVALID_STATE", message: "Chỉ ký phụ lục cho HĐ đang hiệu lực" } }, { status: 400 });

  // Tính phụ cấp hiện tại (cũ) theo 3 thành phần
  const aJson: any = c.allowances || {};
  let curFar = Number(aJson.farAllowance ?? aJson.fuel ?? 0);
  let curKpi = Number(aJson.kpiAllowance ?? aJson.kpi ?? 0);
  let curPos = Number(aJson.positionAllowance ?? 0);
  if (!curFar && !curKpi && !curPos) {
    const offer = await prisma.offerLetter.findFirst({
      where: { candidate: { fullName: c.employee.fullName } },
      orderBy: { createdAt: "desc" },
      select: { salaryBreakdown: true },
    });
    const bd: any = offer?.salaryBreakdown;
    if (bd) { curFar = Number(bd.farAllowance || 0); curKpi = Number(bd.kpiAllowance || 0); curPos = Number(bd.positionAllowance || 0); }
  }

  const parsed = CreateSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: { code: "VALIDATION_ERROR", issues: parsed.error.issues } }, { status: 422 });
  const b = parsed.data;

  const effDate = new Date(b.effectiveDate);
  if (effDate < new Date(c.startDate)) return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Ngày hiệu lực phải sau ngày bắt đầu HĐ" } }, { status: 422 });
  if (c.endDate && effDate > new Date(c.endDate)) return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Ngày hiệu lực phải trước ngày kết thúc HĐ" } }, { status: 422 });

  try {
    // Tổng phụ cấp mới = nhà xa + KPI + chức vụ
    const totalNewAllowance = (b.newFarAllowance ?? 0) + (b.newKpi ?? 0) + (b.newPositionAllowance ?? 0);
    const curBase = c.insuranceSalary ?? c.baseSalary ?? 0;
    const curRole = c.employee.jobRole;
    const curJobPos = c.employee.jobPosition;

    // Dựng nội dung phụ lục từ dữ liệu — chỉ liệt kê các trường có THAY ĐỔI
    const changes: { label: string; oldValue?: any; newValue?: any; isMoney?: boolean }[] = [];
    if (b.newJobRole && b.newJobRole !== curRole) changes.push({ label: "Chức vụ", oldValue: curRole || "—", newValue: b.newJobRole });
    if (b.newJobPosition && b.newJobPosition !== curJobPos) changes.push({ label: "Vị trí công việc", oldValue: curJobPos || "—", newValue: b.newJobPosition });
    if (b.newBaseSalary != null && b.newBaseSalary !== curBase) changes.push({ label: "Lương cơ bản (đóng BHXH)", oldValue: curBase, newValue: b.newBaseSalary, isMoney: true });
    if (b.newFarAllowance != null && b.newFarAllowance !== curFar) changes.push({ label: "Phụ cấp nhà xa", oldValue: curFar, newValue: b.newFarAllowance, isMoney: true });
    if (b.newKpi != null && b.newKpi !== curKpi) changes.push({ label: "Phụ cấp KPI", oldValue: curKpi, newValue: b.newKpi, isMoney: true });
    if (b.newPositionAllowance != null && b.newPositionAllowance !== curPos) changes.push({ label: "Phụ cấp chức vụ", oldValue: curPos, newValue: b.newPositionAllowance, isMoney: true });
    const curTotalAllow = curFar + curKpi + curPos;
    if (totalNewAllowance !== curTotalAllow) changes.push({ label: "Tổng phụ cấp", oldValue: curTotalAllow, newValue: totalNewAllowance, isMoney: true });

    const documentHtml = buildAddendumHtml({
      addendumNumber: b.addendumNumber.trim(),
      parentContractNumber: c.contractNumber,
      effectiveDate: effDate,
      issuedDate: new Date(),
      changes,
      employee: { fullName: c.employee.fullName, idNumber: c.employee.idNumber, departmentName: c.employee.department?.name },
    });

    const created = await prisma.contractAddendum.create({
      data: {
        contractId,
        addendumNumber: b.addendumNumber.trim(),
        effectiveDate: effDate,
        oldJobRole: curRole, newJobRole: b.newJobRole || null,
        oldJobPosition: curJobPos, newJobPosition: b.newJobPosition || null,
        oldBaseSalary: curBase, newBaseSalary: b.newBaseSalary ?? null,
        oldAllowance: c.allowance, newAllowance: totalNewAllowance > 0 ? totalNewAllowance : null,
        oldFarAllowance: curFar, newFarAllowance: b.newFarAllowance ?? null,
        oldKpi: curKpi, newKpi: b.newKpi ?? null,
        oldPositionAllowance: curPos, newPositionAllowance: b.newPositionAllowance ?? null,
        documentHtml,
        status: "PENDING_APPROVAL",
        createdBy: userId,
      },
    });

    // Notify TP HCNS / BOM
    const approvers = await prisma.user.findMany({ where: { role: { in: ["HR_ADMIN", "BOM"] }, isActive: true }, select: { id: true } });
    await prisma.notification.createMany({
      data: approvers.map((u) => ({
        userId: u.id,
        title: "Phụ lục HĐ chờ duyệt",
        message: `Phụ lục ${created.addendumNumber} cần duyệt.`,
        type: "APPROVAL_REQUIRED",
        referenceType: "contract_addendum",
        referenceId: created.id,
      })),
    });

    return NextResponse.json({ data: created }, { status: 201 });
  } catch (err: any) {
    console.error("[addendums.POST]", err?.message || err);
    return NextResponse.json({ error: { code: "CREATE_FAILED", message: "Không tạo được phụ lục." } }, { status: 400 });
  }
}
