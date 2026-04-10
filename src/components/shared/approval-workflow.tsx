"use client";

import { Check, X, Clock, CheckCircle2, XCircle } from "lucide-react";

type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED" | string;

interface ApprovalWorkflowProps {
  status: ApprovalStatus;
  onApprove?: () => void;
  onReject?: () => void;
  loading?: boolean;
  /** Show only the status badge without action buttons */
  readOnly?: boolean;
  approvedLabel?: string;
  rejectedLabel?: string;
}

const STATUS_CONFIG: Record<string, { icon: React.ElementType; label: string; color: string; bg: string }> = {
  PENDING: { icon: Clock, label: "Chờ duyệt", color: "#f59e0b", bg: "rgba(245,158,11,0.12)" },
  APPROVED: { icon: CheckCircle2, label: "Đã duyệt", color: "#10b981", bg: "rgba(16,185,129,0.12)" },
  REJECTED: { icon: XCircle, label: "Từ chối", color: "#ef4444", bg: "rgba(239,68,68,0.12)" },
};

export function ApprovalWorkflow({
  status,
  onApprove,
  onReject,
  loading = false,
  readOnly = false,
  approvedLabel = "Duyệt",
  rejectedLabel = "Từ chối",
}: ApprovalWorkflowProps) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.PENDING;
  const Icon = cfg.icon;
  const isPending = status === "PENDING";

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Status badge */}
      <span
        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold"
        style={{ background: cfg.bg, color: cfg.color }}
      >
        <Icon size={11} />
        {cfg.label}
      </span>

      {/* Action buttons — only for PENDING and non-readOnly */}
      {isPending && !readOnly && (
        <>
          <button
            type="button"
            onClick={onApprove}
            disabled={loading}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-semibold transition-colors disabled:opacity-50"
            style={{ background: "rgba(16,185,129,0.15)", color: "#10b981" }}
          >
            <Check size={11} /> {approvedLabel}
          </button>
          <button
            type="button"
            onClick={onReject}
            disabled={loading}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-semibold transition-colors disabled:opacity-50"
            style={{ background: "rgba(239,68,68,0.15)", color: "#ef4444" }}
          >
            <X size={11} /> {rejectedLabel}
          </button>
        </>
      )}
    </div>
  );
}
