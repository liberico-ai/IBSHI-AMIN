import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";

// POST — Xác nhận đã ký phụ lục (upload bản scan) → áp giá trị mới vào HĐ gốc + hồ sơ NV.
const Schema = z.object({ fileUrl: z.string().min(1) });

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string; contractId: string; aid: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const role = (session.user as any).role;
  if (!["HR_ADMIN", "BOM", "ADMIN"].includes(role))
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });

  const { contractId, aid } = await params;
  const parsed = Schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: { code: "VALIDATION_ERROR" } }, { status: 422 });

  const a = await prisma.contractAddendum.findUnique({ where: { id: aid }, include: { contract: { select: { employeeId: true, insuranceSalary: true, baseSalary: true, allowance: true, position: true } } } });
  if (!a) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  if (a.status !== "APPROVED")
    return NextResponse.json({ error: { code: "INVALID_STATE", message: `Phụ lục đang ở trạng thái ${a.status} — cần đã duyệt mới xác nhận ký được` } }, { status: 400 });

  const result = await prisma.$transaction(async (tx) => {
    // 1) Đánh dấu phụ lục SIGNED + lưu file scan
    const updated = await tx.contractAddendum.update({
      where: { id: aid },
      data: { status: "SIGNED", signedAt: new Date(), fileUrl: parsed.data.fileUrl },
    });

    // 2) Áp giá trị MỚI vào HĐ gốc — bao gồm breakdown phụ cấp
    const contractPatch: any = {};
    if (a.newBaseSalary != null) { contractPatch.baseSalary = a.newBaseSalary; contractPatch.insuranceSalary = a.newBaseSalary; }
    // Tổng phụ cấp = nhà xa + KPI + chức vụ; chỉ cập nhật khi có ít nhất 1 thành phần mới
    const hasNewBreakdown = a.newFarAllowance != null || a.newKpi != null || a.newPositionAllowance != null;
    if (hasNewBreakdown) {
      const newFar = a.newFarAllowance ?? a.oldFarAllowance ?? 0;
      const newKpi = a.newKpi ?? a.oldKpi ?? 0;
      const newPos = a.newPositionAllowance ?? a.oldPositionAllowance ?? 0;
      contractPatch.allowance = newFar + newKpi + newPos;
      contractPatch.allowances = { farAllowance: newFar, kpiAllowance: newKpi, positionAllowance: newPos };
    } else if (a.newAllowance != null) {
      contractPatch.allowance = a.newAllowance;
    }
    if (a.newJobRole) contractPatch.position = a.newJobRole; // snapshot chức vụ trên HĐ
    if (Object.keys(contractPatch).length > 0) {
      await tx.contract.update({ where: { id: contractId }, data: contractPatch });
    }

    // 3) Áp lên hồ sơ NV (chức vụ + vị trí công việc)
    const empPatch: any = {};
    if (a.newJobRole) empPatch.jobRole = a.newJobRole;
    if (a.newJobPosition) empPatch.jobPosition = a.newJobPosition;
    if (Object.keys(empPatch).length > 0) {
      await tx.employee.update({ where: { id: a.contract.employeeId }, data: empPatch });
    }

    return updated;
  });

  return NextResponse.json({ data: result });
}
