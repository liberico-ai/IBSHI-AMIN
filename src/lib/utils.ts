import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, formatDistanceToNow } from "date-fns";
import { vi } from "date-fns/locale";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Trả về thông báo lỗi tiếng Việt rõ ràng từ response API.
 * Ưu tiên message do API trả; nếu không có thì map theo mã lỗi / HTTP status.
 * Dùng: setError(apiError(res.status, data.error))
 */
export function apiError(status: number, error?: any): string {
  const fromApi =
    error?.message ||
    error?.issues?.[0]?.message ||
    error?.details?.[0]?.message;
  if (fromApi) return fromApi;

  switch (error?.code) {
    case "FORBIDDEN": return "Bạn không có quyền thực hiện thao tác này";
    case "UNAUTHORIZED": return "Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại";
    case "VALIDATION_ERROR": return "Dữ liệu nhập chưa hợp lệ";
    case "NOT_FOUND": return "Không tìm thấy dữ liệu";
    case "CONFLICT": return "Dữ liệu bị trùng hoặc xung đột";
    case "FILE_TOO_LARGE": return "File vượt quá dung lượng cho phép";
    case "UPLOAD_FAILED": return "Lỗi upload file";
    case "MINIO_UNAVAILABLE": return "Máy chủ lưu trữ file chưa sẵn sàng";
    case "UPDATE_FAILED": return "Cập nhật thất bại, vui lòng thử lại";
  }

  switch (status) {
    case 400: return "Yêu cầu không hợp lệ";
    case 401: return "Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại";
    case 403: return "Bạn không có quyền thực hiện thao tác này";
    case 404: return "Không tìm thấy dữ liệu";
    case 409: return "Dữ liệu bị trùng hoặc xung đột";
    case 413: return "File vượt quá dung lượng cho phép";
    case 422: return "Dữ liệu nhập chưa hợp lệ";
    case 500: return "Lỗi máy chủ, vui lòng thử lại sau";
    case 503: return "Máy chủ tạm thời không khả dụng";
    default: return "Có lỗi xảy ra, vui lòng thử lại";
  }
}

/** Format VND: 24910600 → "24,910,600" */
export function formatVND(amount: number): string {
  return new Intl.NumberFormat("vi-VN").format(amount);
}

/** Format date: dd/MM/yyyy — theo GIỜ VN (Asia/Ho_Chi_Minh), KHÔNG phụ thuộc múi giờ máy xem. */
export function formatDate(date: Date | string, fmt?: string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (fmt === "relative") {
    return formatDistanceToNow(d, { addSuffix: true, locale: vi });
  }
  if (fmt) return format(d, fmt); // format tuỳ chỉnh (hiếm, thường date-only) → giữ date-fns
  return d.toLocaleDateString("en-GB", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", year: "numeric" });
}

/** Format datetime: dd/MM/yyyy HH:mm — cố định theo GIỜ VN (không lệch giữa các máy). */
export function formatDateTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleString("en-GB", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).replace(", ", " ");
}

/** Get initials: "Le Duy Huyen" → "LH" */
export function getInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

/** Map status to badge color variant */
export function getStatusColor(
  status: string
): "green" | "yellow" | "red" | "blue" | "gray" {
  const greenStatuses = ["ACTIVE", "COMPLETED", "PRESENT", "VALID", "APPROVED", "RESOLVED", "CLOSED"];
  const yellowStatuses = ["PENDING", "EXPIRING_SOON", "IN_PROGRESS", "INVESTIGATING", "PROBATION", "LATE"];
  const redStatuses = ["REJECTED", "EXPIRED", "ABSENT_UNAPPROVED", "OVERDUE", "TERMINATED", "CRITICAL", "REVOKED"];
  const blueStatuses = ["DRAFT", "NEW", "REPORTED", "INDEFINITE"];

  const upper = status.toUpperCase();
  if (greenStatuses.includes(upper)) return "green";
  if (yellowStatuses.includes(upper)) return "yellow";
  if (redStatuses.includes(upper)) return "red";
  if (blueStatuses.includes(upper)) return "blue";
  return "gray";
}

/** Calculate work days between two dates (exclude Saturday & Sunday) */
export function calculateWorkDays(startDate: Date, endDate: Date): number {
  let count = 0;
  const current = new Date(startDate);
  while (current <= endDate) {
    const day = current.getDay();
    if (day !== 0 && day !== 6) count++;
    current.setDate(current.getDate() + 1);
  }
  return count;
}

/** Generate next employee code: "IBS-089" → "IBS-090" */
export function generateEmployeeCode(lastCode: string): string {
  const num = parseInt(lastCode.replace("IBS-", ""), 10);
  return `IBS-${String(num + 1).padStart(3, "0")}`;
}
