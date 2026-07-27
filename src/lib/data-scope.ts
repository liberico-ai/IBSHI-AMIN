// Phần THUẦN (không import prisma) — an toàn dùng cả client (ma trận) lẫn server.
// Phần cần DB (resolveScope) nằm ở data-scope.server.ts.

export type ResolvedScope = { all: true } | { deptIds: string[]; selfEmpId: string | null };

// Danh sách feature ĐÃ áp phạm vi (đã wire ở backend). UI chỉ hiện nút "Phạm vi" cho các mục này.
// Nhà ăn (m10.nhaan.dangky) chưa wire (GET là báo cáo tổng hợp — xử lý riêng sau).
export const SCOPED_FEATURES = new Set<string>([
  "m1.hoso",          // Hồ sơ nhân sự
  "m3.bangcong",      // Chấm công
  "m3.nghiphep",      // Nghỉ phép
  "m3.tangca",        // Tăng ca
  "m10.xe.datxe",     // Đặt xe
  "m10.phonghop.dat", // Phòng họp
  "m10.vpp.denghi",   // VPP đề nghị
]);

// Dựng mảnh Prisma `where` cho danh sách (records thuộc phòng trong scope HOẶC của chính mình).
//  Trả null nếu = tất cả (không lọc). Trả điều kiện chặn sạch nếu không có quyền nào.
export function scopeWhere(scope: ResolvedScope, opts: {
  deptPath: (deptIds: string[]) => any;   // vd (ids) => ({ requester: { departmentId: { in: ids } } })
  selfPath?: (empId: string) => any;      // vd (id) => ({ requestedBy: id })
}): any | null {
  if ("all" in scope) return null;
  const or: any[] = [];
  if (scope.deptIds.length) or.push(opts.deptPath(scope.deptIds));
  if (scope.selfEmpId && opts.selfPath) or.push(opts.selfPath(scope.selfEmpId));
  if (or.length === 0) return { id: "__none__" }; // không có phạm vi → không thấy gì
  return or.length === 1 ? or[0] : { OR: or };
}

// Ghép mảnh scope vào where hiện có bằng AND (không phá các filter khác như status/date).
export function applyScope(where: any, fragment: any | null) {
  if (!fragment) return;
  where.AND = [...(where.AND ?? []), fragment];
}

// Kiểm tra 1 record (theo phòng) có nằm trong phạm vi không — dùng cho action Duyệt/Sửa/Xóa.
export function scopeAllowsDept(scope: ResolvedScope, deptId: string | null | undefined): boolean {
  if ("all" in scope) return true;
  return !!deptId && scope.deptIds.includes(deptId);
}
