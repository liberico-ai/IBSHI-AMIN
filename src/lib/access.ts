// Danh sách NV được phép truy cập M7 - Lương & Phúc lợi và tab Hợp đồng (M1).
// Phân quyền theo TỪNG NGƯỜI (không theo role). Khóa theo employeeCode (định danh đăng nhập).
// Cập nhật danh sách này khi cần thêm/bớt người.
export const PAYROLL_CONTRACT_VIEWERS = new Set<string>([
  "190021", // Nguyễn Thị Hương Thúy
  "190393", // Phạm Thị Xuân
  "190327", // Phạm Thị Mai Liên
  "190867", // Phạm Thảo Nguyên
  "toannd", // Nguyễn Đức Toàn (IBS-1137)
]);

/** Có được xem M7 - Lương + tab Hợp đồng không? */
export function canViewPayroll(employeeCode?: string | null): boolean {
  return !!employeeCode && PAYROLL_CONTRACT_VIEWERS.has(employeeCode);
}
