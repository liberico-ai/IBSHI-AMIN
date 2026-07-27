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

// Kiểm tra user có được THAO TÁC (thêm/sửa/xóa/duyệt) trên 1 phòng ban theo Phạm vi của feature.
//  scope=all (HR/BGĐ/ADMIN hoặc được cấp "Tất cả") → mọi phòng.
//  có danh sách phòng → phải nằm trong đó. Rỗng (NV thường) → fallback về phòng của chính mình.
// Dùng cho các luồng "đăng ký/duyệt HỘ cả phòng" như Nhà ăn — Phạm vi bọc MỌI quyền, không có bypass.
export async function canActOnDeptScope(userId: string, role: string, feature: string, departmentId: string): Promise<boolean> {
  const scope = await resolveScope(userId, role, feature);
  if ("all" in scope) return true;
  let deptIds = scope.deptIds;
  if (deptIds.length === 0) {
    const emp = await prisma.employee.findFirst({ where: { userId }, select: { departmentId: true } });
    if (emp?.departmentId) deptIds = [emp.departmentId];
  }
  return !!departmentId && deptIds.includes(departmentId);
}

// Như canActOnDeptScope nhưng cho record gắn theo NHÂN VIÊN (vd đăng ký nghỉ HỘ cho employeeId).
// Tra phòng ban của nhân viên đích rồi kiểm theo phạm vi.
export async function canActOnEmployeeScope(userId: string, role: string, feature: string, employeeId: string): Promise<boolean> {
  const scope = await resolveScope(userId, role, feature);
  if ("all" in scope) return true;
  const target = await prisma.employee.findUnique({ where: { id: employeeId }, select: { departmentId: true } });
  if (!target?.departmentId) return false;
  let deptIds = scope.deptIds;
  if (deptIds.length === 0) {
    const emp = await prisma.employee.findFirst({ where: { userId }, select: { departmentId: true } });
    if (emp?.departmentId) deptIds = [emp.departmentId];
  }
  return deptIds.includes(target.departmentId);
}

// Trả danh sách deptId thuộc phạm vi (đã fallback phòng mình). null = tất cả.
export async function scopeDeptIds(userId: string, role: string, feature: string): Promise<string[] | null> {
  const scope = await resolveScope(userId, role, feature);
  if ("all" in scope) return null;
  let deptIds = scope.deptIds;
  if (deptIds.length === 0) {
    const emp = await prisma.employee.findFirst({ where: { userId }, select: { departmentId: true } });
    if (emp?.departmentId) deptIds = [emp.departmentId];
  }
  return deptIds;
}
