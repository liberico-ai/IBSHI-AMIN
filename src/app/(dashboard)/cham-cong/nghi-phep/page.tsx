"use client";

import { useState, useEffect } from "react";
import { PageTitle } from "@/components/layout/page-title";
import { StatusBadge } from "@/components/shared/status-badge";
import { ApprovalWorkflow } from "@/components/shared/approval-workflow";
import { formatDate } from "@/lib/utils";
import { Plus, X, Calendar, Clock, Download } from "lucide-react";

type LeaveRequest = {
  id: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  reason: string;
  status: string;
  rejectedReason?: string;
  createdAt: string;
  employee: {
    id: string;
    code: string;
    fullName: string;
    department: { name: string };
  };
};

const LEAVE_TYPE_LABELS: Record<string, string> = {
  ANNUAL: "Phép năm",
  SICK: "Nghỉ ốm",
  PERSONAL: "Việc cá nhân",
  WEDDING: "Cưới hỏi",
  FUNERAL: "Tang lễ",
  MATERNITY: "Thai sản",
  PATERNITY: "Nghỉ vợ sinh",
  UNPAID: "Không lương",
};

const LEAVE_TYPE_OPTIONS = Object.entries(LEAVE_TYPE_LABELS).map(([value, label]) => ({ value, label }));

const STATUS_OPTIONS = [
  { value: "", label: "Tất cả trạng thái" },
  { value: "PENDING", label: "Chờ duyệt" },
  { value: "APPROVED", label: "Đã duyệt" },
  { value: "REJECTED", label: "Từ chối" },
];

// ── New Leave Request Dialog ──────────────────────────────────────────────────
function NewLeaveDialog({ onClose, onSuccess }: { onClose: () => void; onSuccess: (item: LeaveRequest) => void }) {
  const [form, setForm] = useState({ leaveType: "ANNUAL", startDate: "", endDate: "", reason: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleChange(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/v1/leave-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error?.message || "Có lỗi xảy ra");
        return;
      }
      onSuccess(json.data);
    } catch {
      setError("Lỗi kết nối");
    } finally {
      setSaving(false);
    }
  }

  const inputCls = "w-full px-3 py-2 rounded-lg text-[13px] outline-none";
  const inputStyle = { background: "var(--ibs-bg)", border: "1px solid var(--ibs-border)", color: "var(--ibs-text)" };
  const labelCls = "block text-[12px] font-medium mb-1.5";
  const labelStyle = { color: "var(--ibs-text-muted)" };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.7)" }}>
      <div className="w-full max-w-[480px] rounded-xl border shadow-2xl" style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "var(--ibs-border)" }}>
          <h3 className="text-[15px] font-semibold">Tạo đơn nghỉ phép</h3>
          <button onClick={onClose} style={{ color: "var(--ibs-text-dim)" }}><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="text-[13px] px-3 py-2 rounded-lg" style={{ background: "rgba(239,68,68,0.1)", color: "var(--ibs-danger)" }}>
              {error}
            </div>
          )}

          <div>
            <label className={labelCls} style={labelStyle}>Loại nghỉ *</label>
            <select required value={form.leaveType} onChange={(e) => handleChange("leaveType", e.target.value)}
              className={inputCls} style={inputStyle}>
              {LEAVE_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls} style={labelStyle}>Ngày bắt đầu *</label>
              <input required type="date" value={form.startDate}
                onChange={(e) => handleChange("startDate", e.target.value)}
                className={inputCls} style={inputStyle} />
            </div>
            <div>
              <label className={labelCls} style={labelStyle}>Ngày kết thúc *</label>
              <input required type="date" value={form.endDate} min={form.startDate}
                onChange={(e) => handleChange("endDate", e.target.value)}
                className={inputCls} style={inputStyle} />
            </div>
          </div>

          <div>
            <label className={labelCls} style={labelStyle}>Lý do *</label>
            <textarea
              required
              rows={3}
              minLength={5}
              value={form.reason}
              onChange={(e) => handleChange("reason", e.target.value)}
              placeholder="Mô tả lý do nghỉ..."
              className={`${inputCls} resize-none`}
              style={inputStyle}
            />
          </div>

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2 rounded-lg text-[13px] font-medium"
              style={{ border: "1px solid var(--ibs-border)", color: "var(--ibs-text-muted)" }}>
              Hủy
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 py-2 rounded-lg text-[13px] font-medium text-white"
              style={{ background: saving ? "rgba(0,180,216,0.5)" : "var(--ibs-accent)" }}>
              {saving ? "Đang gửi..." : "Gửi đơn"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function NghiPhepPage() {
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string>("EMPLOYEE");

  useEffect(() => {
    fetch("/api/v1/me")
      .then((r) => r.json())
      .then((res) => { if (res.role) setUserRole(res.role); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    setLoading(true);
    fetch(`/api/v1/leave-requests?${params}`)
      .then((r) => r.json())
      .then((res) => setRequests(res.data || []))
      .finally(() => setLoading(false));
  }, [statusFilter]);

  const canApprove = userRole === "MANAGER" || userRole === "HR_ADMIN" || userRole === "BOM";
  const isHR = userRole === "HR_ADMIN" || userRole === "BOM";

  async function exportExcel() {
    const { default: ExcelJS } = await import("exceljs");
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Danh sách nghỉ phép");
    ws.columns = [
      { header: "STT", key: "stt", width: 6 },
      { header: "Mã NV", key: "code", width: 11 },
      { header: "Họ tên", key: "name", width: 26 },
      { header: "Phòng ban", key: "dept", width: 18 },
      { header: "Loại nghỉ", key: "leaveType", width: 16 },
      { header: "Từ ngày", key: "startDate", width: 13 },
      { header: "Đến ngày", key: "endDate", width: 13 },
      { header: "Số ngày", key: "totalDays", width: 10 },
      { header: "Lý do", key: "reason", width: 30 },
      { header: "Trạng thái", key: "status", width: 16 },
    ];
    ws.getRow(1).font = { bold: true };
    const STATUS_VN: Record<string, string> = {
      PENDING: "Chờ duyệt", PENDING_HR: "Chờ HR duyệt",
      APPROVED: "Đã duyệt", REJECTED: "Từ chối",
    };
    requests.forEach((r, idx) => {
      ws.addRow({
        stt: idx + 1,
        code: r.employee.code,
        name: r.employee.fullName,
        dept: r.employee.department?.name,
        leaveType: LEAVE_TYPE_LABELS[r.leaveType] ?? r.leaveType,
        startDate: r.startDate.slice(0, 10),
        endDate: r.endDate.slice(0, 10),
        totalDays: r.totalDays,
        reason: r.reason,
        status: STATUS_VN[r.status] ?? r.status,
      });
    });
    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "nghi-phep.xlsx";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleAction(id: string, action: "APPROVE" | "REJECT") {
    setActionLoading(id + action);
    try {
      const res = await fetch(`/api/v1/leave-requests/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        const json = await res.json();
        setRequests((prev) =>
          prev.map((r) => (r.id === id ? { ...r, status: json.data.status } : r))
        );
      }
    } finally {
      setActionLoading(null);
    }
  }

  // Summary counts
  const pendingCount = requests.filter((r) => r.status === "PENDING").length;
  const approvedCount = requests.filter((r) => r.status === "APPROVED").length;

  return (
    <div>
      <PageTitle title="Nghỉ phép" description="Quản lý đơn xin nghỉ phép" />

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4 mb-5">
        {[
          { label: "Chờ duyệt", value: pendingCount, color: "#f59e0b" },
          { label: "Đã duyệt", value: approvedCount, color: "#10b981" },
          { label: "Tổng đơn", value: requests.length, color: "var(--ibs-accent)" },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border p-4" style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
            <div className="text-[26px] font-extrabold" style={{ color: s.color }}>{s.value}</div>
            <div className="text-[12px] mt-0.5" style={{ color: "var(--ibs-text-dim)" }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 rounded-lg text-[13px] outline-none"
          style={{ background: "var(--ibs-bg-card)", border: "1px solid var(--ibs-border)", color: "var(--ibs-text)" }}
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <div className="ml-auto flex items-center gap-2">
          {isHR && (
            <button
              onClick={exportExcel}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[13px] font-medium border"
              style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-dim)" }}
            >
              <Download size={13} /> Export Excel
            </button>
          )}
          <button
            onClick={() => setShowNew(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-medium text-white"
            style={{ background: "var(--ibs-accent)" }}
          >
            <Plus size={14} /> Tạo đơn nghỉ phép
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border overflow-hidden" style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
        {loading ? (
          <div className="py-16 text-center text-[13px]" style={{ color: "var(--ibs-text-dim)" }}>Đang tải...</div>
        ) : requests.length === 0 ? (
          <div className="py-16 text-center text-[13px]" style={{ color: "var(--ibs-text-dim)" }}>Chưa có đơn nghỉ phép nào</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  {["Nhân viên", "Loại nghỉ", "Từ ngày", "Đến ngày", "Số ngày", "Lý do", "Trạng thái", ""].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-[11px] uppercase tracking-wider font-semibold border-b"
                      style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-dim)" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => (
                  <tr key={r.id} className="border-b transition-colors hover:bg-white/[0.02]"
                    style={{ borderColor: "rgba(51,65,85,0.4)" }}>
                    <td className="px-4 py-3">
                      <div className="text-[13px] font-medium">{r.employee.fullName}</div>
                      <div className="text-[11px]" style={{ color: "var(--ibs-text-dim)" }}>
                        {r.employee.code} · {r.employee.department.name}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[13px]">
                      {LEAVE_TYPE_LABELS[r.leaveType] || r.leaveType}
                    </td>
                    <td className="px-4 py-3 text-[13px]">
                      <span className="flex items-center gap-1" style={{ color: "var(--ibs-text-muted)" }}>
                        <Calendar size={12} />
                        {formatDate(new Date(r.startDate))}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[13px]">
                      <span className="flex items-center gap-1" style={{ color: "var(--ibs-text-muted)" }}>
                        <Calendar size={12} />
                        {formatDate(new Date(r.endDate))}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-[13px] font-semibold px-2 py-0.5 rounded"
                        style={{ background: "rgba(0,180,216,0.1)", color: "var(--ibs-accent)" }}>
                        {r.totalDays} ngày
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[12px] max-w-[180px]" style={{ color: "var(--ibs-text-muted)" }}>
                      <span className="line-clamp-2">{r.reason}</span>
                      {r.status === "REJECTED" && r.rejectedReason && (
                        <span className="block text-[11px] mt-0.5" style={{ color: "var(--ibs-danger)" }}>
                          Lý do từ chối: {r.rejectedReason}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="px-4 py-3">
                      {canApprove && (
                        <ApprovalWorkflow
                          status={r.status}
                          loading={actionLoading === r.id + "APPROVE" || actionLoading === r.id + "REJECT"}
                          onApprove={() => handleAction(r.id, "APPROVE")}
                          onReject={() => handleAction(r.id, "REJECT")}
                        />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Footer note */}
      <div className="mt-3 flex items-center gap-1.5 text-[11px]" style={{ color: "var(--ibs-text-dim)" }}>
        <Clock size={11} />
        Hiển thị 50 đơn gần nhất. Phép năm được trừ tự động khi duyệt.
      </div>

      {showNew && (
        <NewLeaveDialog
          onClose={() => setShowNew(false)}
          onSuccess={(item) => {
            setRequests((prev) => [item, ...prev]);
            setShowNew(false);
          }}
        />
      )}
    </div>
  );
}
