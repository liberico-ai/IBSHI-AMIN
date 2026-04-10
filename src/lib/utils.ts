import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, formatDistanceToNow } from "date-fns";
import { vi } from "date-fns/locale";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format VND: 24910600 → "24,910,600" */
export function formatVND(amount: number): string {
  return new Intl.NumberFormat("vi-VN").format(amount);
}

/** Format date: dd/MM/yyyy */
export function formatDate(date: Date | string, fmt?: string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (fmt === "relative") {
    return formatDistanceToNow(d, { addSuffix: true, locale: vi });
  }
  return format(d, fmt || "dd/MM/yyyy");
}

/** Format datetime: dd/MM/yyyy HH:mm */
export function formatDateTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return format(d, "dd/MM/yyyy HH:mm");
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
