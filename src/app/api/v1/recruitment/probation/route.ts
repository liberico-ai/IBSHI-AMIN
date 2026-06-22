import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

// GET — danh sách NV đang THỬ VIỆC kèm HĐ thử việc (nếu có) + đã có onboarding chưa.
// Dùng cho tab Onboard: Tạo HĐ thử việc · Chờ duyệt · Tạo onboarding; và tab Đánh giá.
export async function GET(_req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const canApprove = ["HR_ADMIN", "BOM", "ADMIN"].includes((session.user as any).role);

  const emps = await prisma.employee.findMany({
    where: { status: "PROBATION" },
    select: {
      id: true, code: true, fullName: true, jobRole: true,
      department: { select: { name: true } },
      startDate: true,
      contracts: {
        where: { contractType: "PROBATION" },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { id: true, status: true, endDate: true, contractNumber: true, rejectedReason: true },
      },
      onboardingChecklist: { select: { id: true } },
    },
    orderBy: { code: "asc" },
  });

  const data = emps.map((e) => {
    const pc = e.contracts[0] || null;
    return {
      id: e.id, code: e.code, fullName: e.fullName, jobRole: e.jobRole,
      departmentName: e.department?.name || "",
      startDate: e.startDate,
      probation: pc ? { id: pc.id, status: pc.status, endDate: pc.endDate, contractNumber: pc.contractNumber, rejectedReason: pc.rejectedReason } : null,
      hasOnboarding: !!e.onboardingChecklist,
    };
  });

  return NextResponse.json({ data, canApprove });
}
