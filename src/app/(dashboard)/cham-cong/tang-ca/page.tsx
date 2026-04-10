"use client";

import { useState, useEffect } from "react";
import { PageTitle } from "@/components/layout/page-title";
import { StatusBadge } from "@/components/shared/status-badge";
import { ApprovalWorkflow } from "@/components/shared/approval-workflow";
import { formatDate } from "@/lib/utils";
import { Plus, X, Clock, Calendar } from "lucide-react";

type OTRequest = {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  hours: number;
  otRate: number;
  reason: string;
  status: string;
  createdAt: string;
  employee: {
    id: string;
    code: string;
    fullName: string;
    department: { name: string };
  };
};

const STATUS_OPTIONS = [
  { value: "", label: "Tất cả trạng thái" },
  { value: "PENDING", label: "Chờ duyệt" },
  { value: "APPROVED", label: "Đã duyệt" },
  { value: "REJECTED", label: "Từ chối" },
];

const OT_RATE_LABELS: Record<string, string> = {
  "1.5": "×1.5 (ngày thường)",
  "2":   "×2.0 (cuối tuần)",
  "3":   "×3.0 (ngày lễ)",
};

// ── New OT Dialog ──────────────────────────────────────────────────────────────
function NewOTDialog({ onClose, onSuccess }: { onClose: () => void; onSuccess: (item: OTRequest) => void }) {
  const [form, setForm] = useState({ date: "", startTime: "17:30", endTime: "20:00", reason: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleChange(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
    setError(null);
  }

  // Auto-detect OT rate from date
  function getOTRate(dateStr: string): number {
    if (!dateStr) return 1.5;
    const d = new Date(dateStr).getDay();
    return d === 0 || d === 6 ? 2.0 : 1.5;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/v1/ot-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error?.message || json?.error?.details?.[0]?.message || "Có lỗi xảy ra");
        return;
      }
      onSuccess(json.data);
    } catch {
      setError("Lỗi kết nối");
    } finally {
      setSaving(false);
    }
  }

  const otRate = getOTRate(form.date);
  const durationH = form.startTime && form.endTime
    ? Math.max(0, (parseInt(form.endTime.split(":")[0]) * 60 + parseInt(form.endTime.split(":")[1]) - parseInt(form.startTime.split(":")[0]) * 60 - parseInt(form.startTime.split(":")[1])) / 60)
    : 0;

  const inputCls = "w-full px-3 py-2 rounded-lg text-[13px] outline-none";
  const inputStyle = { background: "var(--ibs-bg)", border: "1px solid var(--ibs-border)", color: "var(--ibs-text)" };
  const labelCls = "block text-[12px] font-medium mb-1.5";
  const labelStyle = { color: "var(--ibs-text-muted)" };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.7)" }}>
      <div className="w-full max-w-[460px] rounded-xl border shadow-2xl" style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "var(--ibs-border)" }}>
          <h3 className="text-[15px] font-semibold">Đề xuất tăng ca</h3>
          <button onClick={onClose} style={{ color: "var(--ibs-text-dim)" }}><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="text-[13px] px-3 py-2 rounded-lg" style={{ background: "rgba(239,68,68,0.1)", color: "var(--ibs-danger)" }}>
              {error}
            </div>
          )}

          <div>
            <label className={labelCls} style={labelStyle}>Ngày tăng ca *</label>
            <input required type="date" value={form.date} onChange={(e) => handleChange("date", e.target.value)}
              className={inputCls} style={inputStyle} />
            {form.date && (
              <p className="text-[11px] mt-1" style={{ color: "var(--ibs-text-dim)" }}>
                Hệ số lương: <strong style={{ color: "var(--ibs-accent)" }}>×{otRate}</strong> {otRate === 2 ? "(Cuối tuần)" : "(Ngày thường)"}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls} style={labelStyle}>Giờ bắt đầu *</label>
              <input required type="time" value={form.startTime} onChange={(e) => handleChange("startTime", e.target.value)}
                className={inputCls} style={inputStyle} />
            </div>
            <div>
              <label className={labelCls} style={labelStyle}>Giờ kết thúc *</label>
              <input required type="time" value={form.endTime} onChange={(e) => handleChange("endTime", e.target.value)}
                className={inputCls} style={inputStyle} />
            </div>
          </div>

          {durationH > 0 && (
            <div className="px-3 py-2 rounded-lg flex items-center gap-2" style={{ background: "rgba(0,180,216,0.08)", border: "1px solid rgba(0,180,216,0.2)" }}>
              <Clock size={13} style={{ color: "var(--ibs-accent)" }} />
              <span className="text-[12px]">
                Thời gian OT: <strong style={{ color: "var(--ibs-accent)" }}>{durationH.toFixed(1)} giờ</strong>
              </span>
            </div>
          )}

          <div>
            <label className={labelCls} style={labelStyle}>Lý do *</label>
            <textarea required rows={3} minLength={5}
              value={form.reason} onChange={(e) => handleChange("reason", e.target.value)}
              placeholder="Mô tả công việc cần tăng ca..."
              className={`${inputCls} resize-none`} style={inputStyle} />
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
              {saving ? "Đang gửi..." : "Gửi đề xuất"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function TangCaPage() {
  const [requests, setRequests] = useState<OTRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string>("EMPLOYEE");

  useEffect(() => {
    fetch("/api/v1/me").then((r) => r.json()).then((res) => { if (res.role) setUserRole(res.role); }).catch(() => {});
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    setLoading(true);
    fetch(`/api/v1/ot-requests?${params}`)
      .then((r) => r.json())
      .then((res) => setRequests(res.data || []))
      .finally(() => setLoading(false));
  }, [statusFilter]);

  const canApprove = userRole === "MANAGER" || userRole === "HR_ADMIN" || userRole === "BOM";

  async function handleAction(id: string, action: "APPROVE" | "REJECT") {
    setActionLoading(id + action);
    try {
      const res = await fetch(`/api/v1/ot-requests/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        const json = await res.json();
        setRequests((prev) => prev.map((r) => (r.id === id ? { ...r, status: json.data.status } : r)));
      }
    } finally {
      setActionLoading(null);
    }
  }

  const pendingCount  = requests.filter((r) => r.status === "PENDING").length;
  const approvedCount = requests.filter((r) => r.status === "APPROVED").length;
  const totalHours    = requests.filter((r) => r.status === "APPROVED").reduce((s, r) => s + r.hours, 0);

  return (
    <div>
      <PageTitle title="Tăng ca (OT)" description="Quản lý đề xuất làm ngoài giờ" />

      {/* Summary */}
      <div className="grid grid-cols-4 gap-4 mb-5">
        {[
          { label: "Chờ duyệt",   value: pendingCount,           color: "#f59e0b" },
          { label: "Đã duyệt",    value: approvedCount,          color: "#10b981" },
          { label: "Tổng giờ OT", value: `${totalHours.toFixed(1)}h`, color: "var(--ibs-accent)" },
          { label: "Tổng đề xuất",value: requests.length,        color: "var(--ibs-text)" },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border p-4" style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
            <div className="text-[26px] font-extrabold" style={{ color: s.color }}>{s.value}</div>
            <div className="text-[12px] mt-0.5" style={{ color: "var(--ibs-text-dim)" }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 rounded-lg text-[13px] outline-none"
          style={{ background: "var(--ibs-bg-card)", border: "1px solid var(--ibs-border)", color: "var(--ibs-text)" }}>
          {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <div className="ml-auto">
          <button onClick={() => setShowNew(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-medium text-white"
            style={{ background: "var(--ibs-accent)" }}>
            <Plus size={14} /> Đề xuất tăng ca
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border overflow-hidden" style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
        {loading ? (
          <div className="py-16 text-center text-[13px]" style={{ color: "var(--ibs-text-dim)" }}>Đang tải...</div>
        ) : requests.length === 0 ? (
          <div className="py-16 text-center text-[13px]" style={{ color: "var(--ibs-text-dim)" }}>Chưa có đề xuất tăng ca nào</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  {["Nhân viên", "Ngày", "Giờ làm", "Thời lượng", "Hệ số", "Lý do", "Trạng thái", ""].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-[11px] uppercase tracking-wider font-semibold border-b"
                      style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-dim)" }}>{h}</th>
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
                      <span className="flex items-center gap-1" style={{ color: "var(--ibs-text-muted)" }}>
                        <Calendar size={12} />
                        {formatDate(new Date(r.date))}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[13px]" style={{ color: "var(--ibs-text-muted)" }}>
                      {r.startTime} – {r.endTime}
                    </td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-1 text-[13px] font-semibold"
                        style={{ color: "var(--ibs-accent)" }}>
                        <Clock size={12} />
                        {r.hours.toFixed(1)}h
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[12px]" style={{ color: "var(--ibs-text-muted)" }}>
                      {OT_RATE_LABELS[String(r.otRate)] || `×${r.otRate}`}
                    </td>
                    <td className="px-4 py-3 text-[12px] max-w-[160px]" style={{ color: "var(--ibs-text-muted)" }}>
                      <span className="line-clamp-2">{r.reason}</span>
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

      <div className="mt-3 flex items-center gap-1.5 text-[11px]" style={{ color: "var(--ibs-text-dim)" }}>
        <Clock size={11} />
        Hiển thị 50 đề xuất gần nhất. Hệ số OT: ×1.5 ngày thường, ×2.0 cuối tuần, ×3.0 ngày lễ.
      </div>

      {showNew && (
        <NewOTDialog
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
