// Danh sách NV được phép truy cập M7 - Lương & Phúc lợi và tab Hợp đồng (M1).
// Phân quyền theo TỪNG NGƯỜI (không theo role). Khóa theo employeeCode (định danh đăng nhập).
// Cập nhật danh sách này khi cần thêm/bớt người.
export const PAYROLL_CONTRACT_VIEWERS = new Set<string>([
  "190021", // Nguyễn Thị Hương Thúy
  "190393", // Phạm Thị Xuân
  "190327", // Phạm Thị Mai Liên
  "190867", // Phạm Thảo Nguyên
  "toannd", // Nguyễn Đức Toàn (IBS-1137)
  "nv190906", // Lê Thị Hải Yến (P. HCNS)
]);

/** Có được xem M7 - Lương + tab Hợp đồng không? */
export function canViewPayroll(employeeCode?: string | null): boolean {
  return !!employeeCode && PAYROLL_CONTRACT_VIEWERS.has(employeeCode);
}

// Danh sách NV được phép DUYỆT phiếu đặt phòng họp + đặt xe.
// KHÔNG phân quyền theo role — chỉ định đích danh 3 NV.
export const ROOM_VEHICLE_APPROVERS = new Set<string>([
  "190021", // Nguyễn Thị Hương Thúy
  "190067", // Nguyễn Thanh Tùng
  "190865", // Hoàng Văn Toại
]);

/** Có được duyệt phiếu đặt phòng họp + đặt xe không? */
export function canApproveRoomVehicle(employeeCode?: string | null): boolean {
  return !!employeeCode && ROOM_VEHICLE_APPROVERS.has(employeeCode);
}

// Danh sách NV được TOÀN QUYỀN tab "Chi phí mua thực phẩm" (Nhà ăn) dù không phải HCNS.
export const FOOD_PURCHASE_MANAGERS = new Set<string>([
  "190089", // Nguyễn Thị Thu Nguyệt (P. Thương mại)
]);

/** Có được toàn quyền tab "Chi phí mua thực phẩm" không? */
export function canManageFoodPurchase(employeeCode?: string | null): boolean {
  return !!employeeCode && FOOD_PURCHASE_MANAGERS.has(employeeCode);
}

// Danh sách NV được xem + cấp phát tab "Danh sách yêu cầu VPP" (Văn phòng phẩm).
export const VPP_REQUEST_MANAGERS = new Set<string>([
  "190021", // Nguyễn Thị Hương Thúy
  "190865", // Hoàng Văn Toại
  "190067", // Nguyễn Thanh Tùng
]);

/** Có được xem + cấp phát "Danh sách yêu cầu VPP" không? */
export function canManageVppRequests(employeeCode?: string | null): boolean {
  return !!employeeCode && VPP_REQUEST_MANAGERS.has(employeeCode);
}

/** Toàn quyền VPP (xem tất cả + duyệt + cấp phát): 3 người chỉ định HOẶC BGĐ (BOM). */
export function canManageVpp(role?: string | null, employeeCode?: string | null): boolean {
  return role === "BOM" || canManageVppRequests(employeeCode);
}
