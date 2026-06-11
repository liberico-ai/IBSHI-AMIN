// Các loại nghỉ BẮT BUỘC bổ sung giấy tờ chứng minh (trong 7 ngày kể từ ngày nghỉ cuối).
export const PROOF_REQUIRED_LEAVE_TYPES = ["SICK", "MATERNITY", "FUNERAL", "WEDDING"] as const;
export const PROOF_DEADLINE_DAYS = 7;

export function leaveRequiresProof(leaveType: string): boolean {
  return (PROOF_REQUIRED_LEAVE_TYPES as readonly string[]).includes(leaveType);
}

// Hạn bổ sung giấy tờ = ngày nghỉ cuối + 7 ngày (hết ngày).
export function proofDeadlineFrom(endDate: Date): Date {
  const d = new Date(endDate);
  d.setDate(d.getDate() + PROOF_DEADLINE_DAYS);
  d.setHours(23, 59, 59, 999);
  return d;
}

export type LeaveProofState = "NOT_REQUIRED" | "SUBMITTED" | "PENDING" | "OVERDUE";

export function leaveProofState(args: {
  leaveType: string;
  proofSubmittedAt?: Date | string | null;
  proofUrls?: string[] | null;
  proofDeadline?: Date | string | null;
}): LeaveProofState {
  if (!leaveRequiresProof(args.leaveType)) return "NOT_REQUIRED";
  const hasProof = !!args.proofSubmittedAt || (args.proofUrls?.length ?? 0) > 0;
  if (hasProof) return "SUBMITTED";
  if (args.proofDeadline && new Date(args.proofDeadline).getTime() < Date.now()) return "OVERDUE";
  return "PENDING";
}
