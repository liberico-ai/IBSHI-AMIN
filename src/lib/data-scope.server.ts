import prisma from "./prisma";
import type { ResolvedScope } from "./data-scope";

export type { ResolvedScope } from "./data-scope";
export { scopeWhere, applyScope, scopeAllowsDept, SCOPED_FEATURES } from "./data-scope";

// Đọc AccessGrant.dataScopes + role → phạm vi phòng cho 1 feature.
//  - HR_ADMIN/BOM/ADMIN: tất cả.
//  - dataScopes[feature] = "all" | [deptId,...]: theo cấu hình.
//  - Không cấu hình → mặc định theo role (MANAGER = phòng mình; còn lại = chỉ mình).
export async function resolveScope(userId: string, role: string, feature: string): Promise<ResolvedScope> {
  if (role === "HR_ADMIN" || role === "BOM" || role === "ADMIN") return { all: true };
  const [grant, emp] = await Promise.all([
    prisma.accessGrant.findUnique({ where: { userId }, select: { dataScopes: true } }),
    prisma.employee.findFirst({ where: { userId }, select: { id: true, departmentId: true } }),
  ]);
  const scopes = (grant?.dataScopes ?? null) as Record<string, "all" | string[]> | null;
  const explicit = scopes?.[feature];
  if (explicit === "all") return { all: true };
  if (Array.isArray(explicit)) return { deptIds: explicit, selfEmpId: emp?.id ?? null };
  if (role === "MANAGER" && emp?.departmentId) return { deptIds: [emp.departmentId], selfEmpId: emp?.id ?? null };
  return { deptIds: [], selfEmpId: emp?.id ?? null }; // TEAM_LEAD / EMPLOYEE → chỉ mình
}
