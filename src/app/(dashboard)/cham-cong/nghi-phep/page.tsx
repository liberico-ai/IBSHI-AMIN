"use client";

import { useState, useEffect } from "react";
import { PageTitle } from "@/components/layout/page-title";
import { StatusBadge } from "@/components/shared/status-badge";
import { ApprovalWorkflow } from "@/components/shared/approval-workflow";
import { formatDate, apiError } from "@/lib/utils";
import { Plus, X, Calendar, Clock, Download, FileText, AlertTriangle } from "lucide-react";
import { DateInput } from "@/components/shared/date-input";
import { FileUpload } from "@/components/shared/file-upload";
import { BUCKETS } from "@/lib/minio-constants";
import { viewUrl } from "@/lib/use-presigned-url";
import { leaveRequiresProof, leaveProofState } from "@/lib/leave-proof";

type LeaveRequest = {
  id: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  reason: string;
  status: string;
  rejectedReason?: string;
  proofUrls?: string[];
  proofDeadline?: string | null;
  proofSubmittedAt?: string | null;
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
  WEDDING: "Cưới hỏi",
  SICK: "Ốm",
  MATERNITY: "Thai sản",
  FUNERAL: "Ma chay",
  WORK_ACCIDENT: "Tai nạn lao động",
  STUDY: "Học tập",
  UNPAID: "Không lương",
  // Loại cũ (giữ để hiển thị đơn cũ, không còn trong danh sách tạo mới)
  PERSONAL: "Việc cá nhân",
  PATERNITY: "Nghỉ vợ sinh",
};

// Danh sách loại nghỉ cho NV chọn khi tạo đơn (theo bộ mã chuẩn IBSHI).
const LEAVE_TYPE_OPTIONS = ["ANNUAL", "WEDDING", "SICK", "MATERNITY", "FUNERAL", "WORK_ACCIDENT", "STUDY", "UNPAID"]
  .map((value) => ({ value, label: LEAVE_TYPE_LABELS[value] }));

// Loại nghỉ → ký hiệu chấm công (căn cứ Bảng công). Bộ mã chuẩn IBSHI:
//   AL Phép năm · ML Cưới hỏi · SL Ốm · MT Thai sản · CL Ma chay · WL Tai nạn LĐ · UL Không lương · L Lễ · HT Học tập
const LEAVE_CODE_MAP: Record<string, string> = {
  ANNUAL: "AL",
  WEDDING: "ML",
  SICK: "SL",
  MATERNITY: "MT",
  FUNERAL: "CL",
  WORK_ACCIDENT: "WL",
  STUDY: "HT",
  UNPAID: "UL",
  PERSONAL: "UL",
  PATERNITY: "UL",
};
function leaveCodeOf(t: string): string { return LEAVE_CODE_MAP[t] || "UL"; }

const STATUS_OPTIONS = [
  { value: "", label: "Tất cả trạng thái" },
  { value: "PENDING", label: "Chờ duyệt" },
  { value: "APPROVED", label: "Đã duyệt" },
  { value: "REJECTED", label: "Từ chối" },
];

// ── New Leave Request Dialog ──────────────────────────────────────────────────
function NewLeaveDialog({ onClose, onSuccess }: { onClose: () => void; onSuccess: (item: LeaveRequest) => void }) {
  const [form, setForm] = useState({ leaveType: "ANNUAL", startDate: "", endDate: "", reason: "", proofUrls: [] as string[] });
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
        setError(apiError(res.status, json?.error));
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
          <h3 className="text-[15px] font-semibold">Tạo đơn xin nghỉ</h3>
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
              <DateInput required value={form.startDate}
                onChange={(e) => handleChange("startDate", e.target.value)}
                className={inputCls} style={inputStyle} />
            </div>
            <div>
              <label className={labelCls} style={labelStyle}>Ngày kết thúc *</label>
              <DateInput required value={form.endDate} min={form.startDate}
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

          {leaveRequiresProof(form.leaveType) && (
            <div>
              <label className={labelCls} style={labelStyle}>
                Giấy tờ chứng minh
                <span className="font-normal" style={{ color: "var(--ibs-text-dim)" }}> (có thể bổ sung trong 7 ngày kể từ ngày nghỉ cuối)</span>
              </label>
              {form.proofUrls.length > 0 && (
                <div className="space-y-1 mb-2">
                  {form.proofUrls.map((u, i) => (
                    <div key={i} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded text-[12px]" style={{ background: "var(--ibs-bg)", border: "1px solid var(--ibs-border)" }}>
                      <a href={viewUrl(u)} target="_blank" rel="noreferrer" className="truncate flex items-center gap-1" style={{ color: "var(--ibs-accent)" }}><FileText size={12} /> Giấy tờ {i + 1}</a>
                      <button type="button" onClick={() => setForm((f) => ({ ...f, proofUrls: f.proofUrls.filter((_, idx) => idx !== i) }))} style={{ color: "var(--ibs-danger)" }}><X size={13} /></button>
                    </div>
                  ))}
                </div>
              )}
              <FileUpload bucket={BUCKETS.HR_DOCUMENTS} folder="leave-proof" accept=".pdf,.jpg,.jpeg,.png" label="Tải giấy tờ lên (có thể bỏ qua, bổ sung sau)" onUploaded={(r) => setForm((f) => ({ ...f, proofUrls: [...f.proofUrls, r.url] }))} onError={(msg) => setError(msg)} />
            </div>
          )}

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

// ── Reject Dialog (nhập lý do từ chối) ────────────────────────────────────────
function RejectDialog({ request, onClose, onConfirm }: { request: LeaveRequest; onClose: () => void; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const inputCls = "w-full px-3 py-2 rounded-lg text-[13px] outline-none";
  const inputStyle = { background: "var(--ibs-bg)", border: "1px solid var(--ibs-border)", color: "var(--ibs-text)" };
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.7)" }}>
      <div className="w-full max-w-[460px] rounded-xl border shadow-2xl" style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "var(--ibs-border)" }}>
          <h3 className="text-[15px] font-semibold">Từ chối đơn nghỉ phép</h3>
          <button onClick={onClose} style={{ color: "var(--ibs-text-dim)" }}><X size={18} /></button>
        </div>
        <div className="p-5 space-y-3">
          <div className="text-[13px] rounded-lg p-3" style={{ background: "var(--ibs-bg)", color: "var(--ibs-text-muted)" }}>
            <div><b>{request.employee.fullName}</b> · {LEAVE_TYPE_LABELS[request.leaveType] || request.leaveType}</div>
            <div className="text-[12px] mt-1">{formatDate(new Date(request.startDate))} → {formatDate(new Date(request.endDate))} · {request.totalDays} ngày</div>
            <div className="text-[12px] mt-1">Lý do xin nghỉ: {request.reason}</div>
          </div>
          <div>
            <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--ibs-text-muted)" }}>Lý do từ chối *</label>
            <textarea required rows={3} value={reason} onChange={(e) => setReason(e.target.value)}
              placeholder="Nhập lý do từ chối để nhân viên nắm được..." className={`${inputCls} resize-none`} style={inputStyle} />
          </div>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2 rounded-lg text-[13px] font-medium" style={{ border: "1px solid var(--ibs-border)", color: "var(--ibs-text-muted)" }}>Hủy</button>
            <button type="button" disabled={saving || !reason.trim()} onClick={() => { setSaving(true); onConfirm(reason.trim()); }}
              className="flex-1 py-2 rounded-lg text-[13px] font-medium text-white" style={{ background: (saving || !reason.trim()) ? "rgba(220,38,38,0.5)" : "var(--ibs-danger)" }}>
              {saving ? "Đang xử lý..." : "Xác nhận từ chối"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Dialog bổ sung giấy tờ chứng minh ─────────────────────────────────────────
function ProofUploadDialog({ request, onClose, onSaved }: { request: LeaveRequest; onClose: () => void; onSaved: (r: { id: string; proofUrls: string[]; proofSubmittedAt: string }) => void }) {
  const [urls, setUrls] = useState<string[]>(request.proofUrls || []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (urls.length === 0) { setError("Vui lòng đính kèm giấy tờ"); return; }
    setSaving(true);
    const res = await fetch(`/api/v1/leave-requests/${request.id}/submit-proof`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ proofUrls: urls }),
    });
    setSaving(false);
    if (!res.ok) { const j = await res.json().catch(() => null); setError(apiError(res.status, j?.error)); return; }
    const j = await res.json();
    onSaved({ id: request.id, proofUrls: j.data.proofUrls, proofSubmittedAt: j.data.proofSubmittedAt });
  }

  const han = request.proofDeadline ? formatDate(new Date(request.proofDeadline)) : "";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.7)" }}>
      <div className="w-full max-w-[440px] rounded-xl border shadow-2xl" style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "var(--ibs-border)" }}>
          <h3 className="text-[15px] font-semibold">Bổ sung giấy tờ chứng minh</h3>
          <button onClick={onClose} style={{ color: "var(--ibs-text-dim)" }}><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="text-[12px]" style={{ color: "var(--ibs-text-dim)" }}>
            Đơn nghỉ: {formatDate(new Date(request.startDate))} – {formatDate(new Date(request.endDate))}{han ? ` · Hạn bổ sung: ${han}` : ""}
          </div>
          {error && <div className="text-[13px] px-3 py-2 rounded-lg" style={{ background: "rgba(239,68,68,0.1)", color: "var(--ibs-danger)" }}>{error}</div>}
          {urls.length > 0 && (
            <div className="space-y-1">
              {urls.map((u, i) => (
                <div key={i} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded text-[12px]" style={{ background: "var(--ibs-bg)", border: "1px solid var(--ibs-border)" }}>
                  <a href={viewUrl(u)} target="_blank" rel="noreferrer" className="truncate flex items-center gap-1" style={{ color: "var(--ibs-accent)" }}><FileText size={12} /> Giấy tờ {i + 1}</a>
                  <button type="button" onClick={() => setUrls((p) => p.filter((_, idx) => idx !== i))} style={{ color: "var(--ibs-danger)" }}><X size={13} /></button>
                </div>
              ))}
            </div>
          )}
          <FileUpload bucket={BUCKETS.HR_DOCUMENTS} folder="leave-proof" accept=".pdf,.jpg,.jpeg,.png" label="Tải giấy tờ lên" onUploaded={(r) => setUrls((p) => [...p, r.url])} onError={(msg) => setError(msg)} />
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2 rounded-lg text-[13px] font-medium border" style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-muted)" }}>Hủy</button>
            <button type="button" onClick={handleSave} disabled={saving} className="flex-1 py-2 rounded-lg text-[13px] font-medium text-white" style={{ background: "var(--ibs-accent)", opacity: saving ? 0.6 : 1 }}>{saving ? "Đang lưu..." : "Lưu giấy tờ"}</button>
          </div>
        </div>
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
  const [proofModalFor, setProofModalFor] = useState<LeaveRequest | null>(null);
  const [rejectTarget, setRejectTarget] = useState<LeaveRequest | null>(null);

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

  const canApprove = userRole === "MANAGER" || userRole === "HR_ADMIN" || userRole === "BOM" || userRole === "ADMIN";
  const isHR = userRole === "HR_ADMIN" || userRole === "BOM" || userRole === "ADMIN";

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

  async function handleAction(id: string, action: "APPROVE" | "REJECT", note?: string) {
    setActionLoading(id + action);
    try {
      const res = await fetch(`/api/v1/leave-requests/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, note }),
      });
      if (res.ok) {
        const json = await res.json();
        setRequests((prev) =>
          prev.map((r) => (r.id === id ? { ...r, status: json.data.status, rejectedReason: json.data.rejectedReason } : r))
        );
      }
    } finally {
      setActionLoading(null);
      setRejectTarget(null);
    }
  }

  // Summary counts
  const pendingCount = requests.filter((r) => r.status === "PENDING").length;
  const approvedCount = requests.filter((r) => r.status === "APPROVED").length;

  return (
    <div>
      <PageTitle title="Xin Nghỉ" description="Quản lý đơn xin nghỉ phép" />

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
            <Plus size={14} /> Tạo đơn xin nghỉ
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
                      <div>{LEAVE_TYPE_LABELS[r.leaveType] || r.leaveType}</div>
                      <span className="inline-block mt-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded" title="Ký hiệu chấm công" style={{ background: "rgba(0,180,216,0.12)", color: "var(--ibs-accent)" }}>
                        {leaveCodeOf(r.leaveType)}
                      </span>
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
                    <td className="px-4 py-3 text-[12px] max-w-[200px]" style={{ color: "var(--ibs-text-muted)" }}>
                      <span className="line-clamp-2">{r.reason}</span>
                      {r.status === "REJECTED" && r.rejectedReason && (
                        <span className="block text-[11px] mt-0.5" style={{ color: "var(--ibs-danger)" }}>
                          Lý do từ chối: {r.rejectedReason}
                        </span>
                      )}
                      {(() => {
                        const ps = leaveProofState({ leaveType: r.leaveType, proofSubmittedAt: r.proofSubmittedAt, proofUrls: r.proofUrls, proofDeadline: r.proofDeadline });
                        if (ps === "NOT_REQUIRED") return null;
                        if (ps === "SUBMITTED") return (
                          <span className="mt-1 flex items-center gap-1 text-[11px]" style={{ color: "var(--ibs-success)" }}>
                            <FileText size={11} /> Đã có giấy tờ
                            {r.proofUrls?.[0] && <a href={viewUrl(r.proofUrls[0])} target="_blank" rel="noreferrer" className="underline">xem</a>}
                          </span>
                        );
                        const hanStr = r.proofDeadline ? formatDate(new Date(r.proofDeadline)) : "";
                        return (
                          <span className="mt-1 flex items-center gap-1.5 flex-wrap text-[11px] font-medium" style={{ color: ps === "OVERDUE" ? "var(--ibs-danger)" : "var(--ibs-warning)" }}>
                            <AlertTriangle size={11} />
                            {ps === "OVERDUE" ? `Quá hạn bổ sung giấy tờ (${hanStr})` : `Cần bổ sung giấy tờ — hạn ${hanStr}`}
                            <button onClick={() => setProofModalFor(r)} className="underline font-semibold" style={{ color: "var(--ibs-accent)" }}>Bổ sung</button>
                          </span>
                        );
                      })()}
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
                          onReject={() => setRejectTarget(r)}
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

      {proofModalFor && (
        <ProofUploadDialog
          request={proofModalFor}
          onClose={() => setProofModalFor(null)}
          onSaved={(updated) => {
            setRequests((prev) => prev.map((r) => (r.id === updated.id ? { ...r, proofUrls: updated.proofUrls, proofSubmittedAt: updated.proofSubmittedAt } : r)));
            setProofModalFor(null);
          }}
        />
      )}

      {rejectTarget && (
        <RejectDialog
          request={rejectTarget}
          onClose={() => setRejectTarget(null)}
          onConfirm={(reason) => handleAction(rejectTarget.id, "REJECT", reason)}
        />
      )}
    </div>
  );
}
