"use client";

type BadgeVariant = "green" | "yellow" | "red" | "blue" | "gray";

const VARIANT_STYLES: Record<BadgeVariant, { bg: string; color: string }> = {
  green:  { bg: "rgba(16,185,129,0.15)",  color: "var(--ibs-success)" },
  yellow: { bg: "rgba(245,158,11,0.15)",  color: "var(--ibs-warning)" },
  red:    { bg: "rgba(239,68,68,0.15)",   color: "var(--ibs-danger)" },
  blue:   { bg: "rgba(0,180,216,0.15)",   color: "var(--ibs-accent)" },
  gray:   { bg: "rgba(100,116,139,0.15)", color: "var(--ibs-text-dim)" },
};

const STATUS_LABEL_MAP: Record<string, string> = {
  // Employee
  ACTIVE: "Đang làm", PROBATION: "Thử việc", ON_LEAVE: "Tạm nghỉ",
  RESIGNED: "Đã nghỉ", TERMINATED: "Sa thải",
  // Contract
  EXPIRING_SOON: "Sắp hết hạn", EXPIRED: "Hết hạn", RENEWED: "Đã gia hạn",
  INDEFINITE: "Không thời hạn", DEFINITE_12M: "12 tháng",
  DEFINITE_24M: "24 tháng", DEFINITE_36M: "36 tháng", PROBATION_CONTRACT: "Thử việc",
  // Certificate
  VALID: "Còn hiệu lực", REVOKED: "Thu hồi",
  // Approval
  DRAFT: "Nháp", PENDING: "Chờ duyệt", APPROVED: "Đã duyệt",
  REJECTED: "Từ chối", COMPLETED: "Hoàn thành", CANCELLED: "Đã hủy",
  // Attendance
  PRESENT: "Có mặt", ABSENT_APPROVED: "Nghỉ phép", ABSENT_UNAPPROVED: "Nghỉ KP",
  LATE: "Đi muộn", BUSINESS_TRIP: "Công tác", HALF_DAY: "Nửa ngày",
};

const STATUS_VARIANT_MAP: Record<string, BadgeVariant> = {
  ACTIVE: "green", VALID: "green", PRESENT: "green", APPROVED: "green",
  COMPLETED: "green", RESOLVED: "green", CLOSED: "green",
  PROBATION: "yellow", EXPIRING_SOON: "yellow", PENDING: "yellow",
  IN_PROGRESS: "yellow", LATE: "yellow", HALF_DAY: "yellow",
  RESIGNED: "red", TERMINATED: "red", EXPIRED: "red", REJECTED: "red",
  ABSENT_UNAPPROVED: "red", OVERDUE: "red", REVOKED: "red",
  DRAFT: "blue", ON_LEAVE: "blue", BUSINESS_TRIP: "blue", NEW: "blue",
};

interface StatusBadgeProps {
  status: string;
  variant?: BadgeVariant;
  label?: string;
}

export function StatusBadge({ status, variant, label }: StatusBadgeProps) {
  const resolvedVariant = variant || STATUS_VARIANT_MAP[status] || "gray";
  const resolvedLabel = label || STATUS_LABEL_MAP[status] || status;
  const style = VARIANT_STYLES[resolvedVariant];

  return (
    <span
      className="inline-block text-[11px] font-semibold px-2.5 py-[3px] rounded-xl whitespace-nowrap"
      style={{ background: style.bg, color: style.color }}
    >
      {resolvedLabel}
    </span>
  );
}
