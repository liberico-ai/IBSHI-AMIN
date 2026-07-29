import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canSeeOTTab } from "@/lib/ot-access";
import { canUser } from "@/lib/permission-catalog";
import { resolveScope, applyScope } from "@/lib/data-scope.server";

// GET — danh sách NV (đang làm) để chọn khi đề xuất OT.
//   ĐỌC MA TRẬN + PHẠM VI DỮ LIỆU giống Nhà ăn (chốt 2026-07-29 — trước đây gate cứng theo role/jobRole
//   nên người được cấp quyền qua ma trận + phạm vi 5 phòng KHÔNG dùng được).
//   - Vào được nếu: role/jobRole cũ (canSeeOTTab) HOẶC có ô tick ma trận m3.tangca (Xem/Thêm).
//   - Lọc NV theo PHẠM VI m3.tangca: "all"=tất cả; đầu mối = đúng các phòng được cấp (vd 5 Xưởng);
//     Trưởng phòng (mặc định) = phòng mình; Tổ trưởng = tổ mình.
export async function GET(_req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const userId = (session.user as any).id;
  const role = (session.user as any).role;

  const emp = await prisma.employee.findFirst({ where: { userId }, select: { departmentId: true, jobRole: true, teamId: true } });
  // Gate ADDITIVE: role/jobRole cũ HOẶC ô tick ma trận Tăng ca.
  const allowed = canSeeOTTab({ jobRole: emp?.jobRole, role })
    || canUser(session.user as any, "m3.tangca:create")
    || canUser(session.user as any, "m3.tangca:view");
  if (!allowed) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const where: any = { status: { in: ["ACTIVE", "PROBATION"] } };
  if (emp?.jobRole === "Tổ trưởng" && emp?.teamId) {
    where.teamId = emp.teamId; // Tổ trưởng → CHỈ tổ mình phụ trách.
  } else {
    // PHẠM VI dữ liệu (m3.tangca) — giống Nhà ăn: "all"=tất cả; ngược lại = các phòng được cấp
    //   (mặc định theo vai trò nếu chưa cấu hình; đầu mối = đúng phạm vi đã cấp, vd 5 Xưởng).
    const scope = await resolveScope(userId, role, "m3.tangca");
    if (!("all" in scope)) {
      let deptIds = (scope as any).deptIds as string[];
      if (deptIds.length === 0 && emp?.departmentId) deptIds = [emp.departmentId]; // fallback: phòng của chính mình
      applyScope(where, deptIds.length ? { departmentId: { in: deptIds } } : { id: "__none__" });
    }
  }

  const data = await prisma.employee.findMany({
    where,
    select: {
      id: true, fullName: true,
      team: { select: { id: true, name: true } },
      department: { select: { id: true, name: true } },
    },
    orderBy: { fullName: "asc" },
  });
  return NextResponse.json({ data });
}
