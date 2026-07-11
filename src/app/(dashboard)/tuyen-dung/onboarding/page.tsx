"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PageTitle } from "@/components/layout/page-title";
import { FileUpload } from "@/components/shared/file-upload";
import { DateInput } from "@/components/shared/date-input";
import { BUCKETS } from "@/lib/minio-constants";
import { viewUrl } from "@/lib/use-presigned-url";
import { formatDate, apiError } from "@/lib/utils";
import { useCan } from "@/hooks/use-permission";
import { confirmDialog, alertDialog } from "@/lib/confirm-dialog";
import {
  Plus, RefreshCw, X, Check, Settings, Trash2, Calendar,
  ClipboardCheck, Clock, AlertCircle, FileText, ChevronRight, Edit3,
} from "lucide-react";

// ============== TYPES ==============
type Position = { id: string; name: string; departmentId?: string | null };
type Department = { id: string; name: string };
type Employee = {
  id: string; code: string; fullName: string; photo?: string | null;
  status: string; startDate: string;
  department: { id: string; name: string };
  position: { id: string; name: string };
};
type ProbationRow = {
  id: string; code: string; fullName: string; jobRole?: string | null;
  departmentName: string; startDate: string;
  probation: { id: string; status: string; endDate: string | null; contractNumber: string; rejectedReason?: string | null } | null;
  hasOnboarding: boolean;
};
type ChecklistItem = {
  id: string;
  checklistId: string;
  itemKey: string;
  title: string;
  isCompleted: boolean;
  completedAt?: string | null;
  attachmentUrl?: string | null;
  note?: string | null;
  sortOrder: number;
};
type Onboarding = {
  id: string;
  employeeId: string;
  status: "IN_PROGRESS" | "COMPLETED" | "EXTENDED";
  startedAt: string;
  dueDate?: string | null;
  completedAt?: string | null;
  isExtended: boolean;
  extendedUntil?: string | null;
  extensionReason?: string | null;
  extensionDocUrl?: string | null;
  extensionGrantedAt?: string | null;
  items: ChecklistItem[];
  employee: Employee;
};
type PositionReq = {
  id: string;
  positionId: string;
  position: { id: string; name: string };
  name: string;
  description?: string | null;
  isRequired: boolean;
  sortOrder: number;
};

// ============== HELPERS ==============
function isFixedItem(key: string) {
  return ["RESUME", "CCCD", "FINGERPRINT"].includes(key);
}
function itemIcon(key: string) {
  if (key === "RESUME") return "📄";
  if (key === "CCCD") return "🪪";
  if (key === "FINGERPRINT") return "👆";
  return "🎓";
}
function progress(items: ChecklistItem[]) {
  if (items.length === 0) return 0;
  return Math.round((items.filter((i) => i.isCompleted).length / items.length) * 100);
}
function statusBadge(s: Onboarding["status"], isExtended: boolean) {
  if (s === "COMPLETED") return { label: "Hoàn thành", color: "var(--ibs-success)", bg: "rgba(34,197,94,0.12)" };
  if (s === "EXTENDED" || isExtended) return { label: "Đã gia hạn", color: "#f59e0b", bg: "rgba(245,158,11,0.12)" };
  return { label: "Đang làm", color: "var(--ibs-accent)", bg: "rgba(0,180,216,0.12)" };
}
function isOverdue(o: Onboarding) {
  const dueRaw = o.extendedUntil || o.dueDate;
  if (!dueRaw || o.status === "COMPLETED") return false;
  return new Date(dueRaw) < new Date();
}

// ============== MAIN PAGE ==============
export default function OnboardingPage() {
  const can = useCan();
  const [list, setList] = useState<Onboarding[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<"" | "IN_PROGRESS" | "COMPLETED" | "EXTENDED">("");
  const [showCreate, setShowCreate] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  // HĐ thử việc
  const [prob, setProb] = useState<ProbationRow[]>([]);
  const [probCanApprove, setProbCanApprove] = useState(false);
  const [showProbCreate, setShowProbCreate] = useState(false);

  function fetchList() {
    setLoading(true);
    fetch("/api/v1/recruitment/onboarding")
      .then((r) => r.json())
      .then((res) => setList(res.data || []))
      .finally(() => setLoading(false));
  }

  function fetchProb() {
    fetch("/api/v1/recruitment/probation")
      .then((r) => r.json())
      .then((res) => { setProb(res.data || []); setProbCanApprove(!!res.canApprove); });
  }

  async function approveProb(empId: string, contractId: string, action: "APPROVE" | "REJECT") {
    let reason: string | undefined;
    if (action === "REJECT") {
      if (!(await confirmDialog({ message: "Từ chối HĐ thử việc này?", tone: "danger", confirmText: "Từ chối" }))) return;
    }
    const res = await fetch(`/api/v1/employees/${empId}/contracts/${contractId}/approve`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, reason }),
    });
    if (!res.ok) { const d = await res.json(); await alertDialog("Lỗi: " + apiError(res.status, d.error)); return; }
    fetchProb();
  }

  useEffect(() => { fetchList(); fetchProb(); }, []);

  const filtered = useMemo(() => {
    if (!filterStatus) return list;
    return list.filter((o) => o.status === filterStatus);
  }, [list, filterStatus]);

  const stats = useMemo(() => ({
    inProgress: list.filter((o) => o.status === "IN_PROGRESS").length,
    completed: list.filter((o) => o.status === "COMPLETED").length,
    extended: list.filter((o) => o.status === "EXTENDED" || o.isExtended).length,
    overdue: list.filter(isOverdue).length,
  }), [list]);

  const detail = detailId ? list.find((o) => o.id === detailId) || null : null;

  return (
    <div>
      <PageTitle
        title="Onboarding NV thử việc"
        description="Quản lý checklist hoàn thiện hồ sơ cho NV mới (do HCNS thao tác)"
      />

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <StatCard label="Đang onboarding" value={stats.inProgress} icon={<Clock size={18} />} color="var(--ibs-accent)" />
        <StatCard label="Hoàn thành" value={stats.completed} icon={<ClipboardCheck size={18} />} color="var(--ibs-success)" />
        <StatCard label="Đã gia hạn" value={stats.extended} icon={<Calendar size={18} />} color="#f59e0b" />
        <StatCard label="Quá hạn" value={stats.overdue} icon={<AlertCircle size={18} />} color="var(--ibs-danger)" />
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
        <div className="flex gap-1 p-1 rounded-xl" style={{ background: "var(--ibs-bg-card)", border: "1px solid var(--ibs-border)" }}>
          {([
            ["", "Tất cả"],
            ["IN_PROGRESS", "Đang làm"],
            ["EXTENDED", "Gia hạn"],
            ["COMPLETED", "Hoàn thành"],
          ] as const).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setFilterStatus(k as any)}
              className="px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all"
              style={{
                background: filterStatus === k ? "var(--ibs-accent)" : "transparent",
                color: filterStatus === k ? "#fff" : "var(--ibs-text-dim)",
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button onClick={fetchList} className="p-2 rounded-lg hover:opacity-70" style={{ color: "var(--ibs-text-dim)" }}>
            <RefreshCw size={15} />
          </button>
          {can("m4.onboarding:edit") && (
            <button onClick={() => setShowConfig(true)} className="flex items-center gap-1.5 text-[13px] px-3 py-2 rounded-lg border font-medium" style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-dim)" }}>
              <Settings size={14} /> Cấu hình bằng cấp theo vị trí
            </button>
          )}
          {can("m4.onboarding:create") && (
            <button onClick={() => setShowProbCreate(true)} className="flex items-center gap-1.5 text-[13px] px-3 py-2 rounded-lg font-semibold border" style={{ borderColor: "var(--ibs-accent)", color: "var(--ibs-accent)", background: "transparent" }}>
              <FileText size={14} /> Tạo HĐ thử việc
            </button>
          )}
          {can("m4.onboarding:create") && (
            <button onClick={() => setShowCreate(true)} className="flex items-center gap-1.5 text-[13px] px-3 py-2 rounded-lg font-semibold" style={{ background: "var(--ibs-accent)", color: "#fff" }}>
              <Plus size={14} /> Tạo onboarding
            </button>
          )}
        </div>
      </div>

      {/* HĐ thử việc chờ TP HCNS duyệt */}
      {(() => {
        const pending = prob.filter((p) => p.probation?.status === "PENDING_APPROVAL");
        if (pending.length === 0) return null;
        return (
          <div className="rounded-xl border mb-4" style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
            <div className="px-5 py-3 border-b text-[13px] font-semibold flex items-center gap-2" style={{ borderColor: "var(--ibs-border)" }}>
              <FileText size={14} style={{ color: "var(--ibs-warning)" }} /> HĐ thử việc chờ duyệt ({pending.length})
            </div>
            <div className="divide-y" style={{ borderColor: "var(--ibs-border)" }}>
              {pending.map((p) => (
                <div key={p.id} className="px-5 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium">{p.fullName} <span className="font-normal text-[12px]" style={{ color: "var(--ibs-text-dim)" }}>· {p.code} · {p.departmentName}</span></div>
                    <div className="text-[11px]" style={{ color: "var(--ibs-text-dim)" }}>
                      {p.probation!.contractNumber} · Hết thử việc: {p.probation!.endDate ? formatDate(new Date(p.probation!.endDate)) : "—"}
                    </div>
                  </div>
                  {probCanApprove ? (
                    <div className="flex gap-2 shrink-0">
                      <button onClick={() => approveProb(p.id, p.probation!.id, "APPROVE")} className="text-[12px] px-2.5 py-1 rounded-md font-semibold text-white" style={{ background: "#10b981" }}>Duyệt</button>
                      <button onClick={() => approveProb(p.id, p.probation!.id, "REJECT")} className="text-[12px] px-2.5 py-1 rounded-md font-semibold" style={{ background: "rgba(220,38,38,0.1)", color: "var(--ibs-danger)" }}>Từ chối</button>
                    </div>
                  ) : (
                    <span className="text-[11px] font-semibold px-2 py-1 rounded-md shrink-0" style={{ background: "rgba(234,179,8,0.1)", color: "var(--ibs-warning)" }}>Chờ TP HCNS duyệt</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* List */}
      <div className="rounded-xl border" style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
        {loading ? (
          <div className="p-12 text-center text-[13px]" style={{ color: "var(--ibs-text-dim)" }}>Đang tải...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center" style={{ color: "var(--ibs-text-dim)" }}>
            <ClipboardCheck size={40} className="mx-auto mb-2 opacity-30" />
            <div className="text-[13px]">Chưa có onboarding nào</div>
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: "var(--ibs-border)" }}>
            {filtered.map((o) => (
              <OnboardingRow key={o.id} item={o} onClick={() => setDetailId(o.id)} />
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      {showProbCreate && (
        <ProbationContractModal
          rows={prob.filter((p) => !p.probation || p.probation.status === "REJECTED")}
          onClose={() => setShowProbCreate(false)}
          onCreated={() => { setShowProbCreate(false); fetchProb(); }}
        />
      )}
      {showCreate && (
        <CreateOnboardingModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); fetchList(); fetchProb(); }}
        />
      )}
      {showConfig && (
        <ConfigPositionRequirementsModal onClose={() => setShowConfig(false)} />
      )}
      {detail && (
        <OnboardingDetailModal
          data={detail}
          canEdit={can("m4.onboarding:edit")}
          onClose={() => setDetailId(null)}
          onChanged={() => { fetchList(); }}
        />
      )}
    </div>
  );
}

// ============== ROW ==============
function OnboardingRow({ item, onClick }: { item: Onboarding; onClick: () => void }) {
  const pct = progress(item.items);
  const overdue = isOverdue(item);
  const badge = statusBadge(item.status, item.isExtended);
  const due = item.extendedUntil || item.dueDate;

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-4 px-5 py-4 hover:bg-white/[0.02] text-left transition-colors"
    >
      <div className="w-11 h-11 rounded-full flex items-center justify-center text-[14px] font-bold flex-shrink-0" style={{ background: "rgba(0,180,216,0.15)", color: "var(--ibs-accent)" }}>
        {item.employee.fullName.split(" ").pop()?.charAt(0) || "?"}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[14px] font-semibold">{item.employee.fullName}</span>
          <span className="text-[11px] px-1.5 py-0.5 rounded font-mono" style={{ background: "rgba(51,65,85,0.4)", color: "var(--ibs-text-dim)" }}>{item.employee.code}</span>
          <span className="text-[11px] px-2 py-0.5 rounded-lg font-semibold" style={{ background: badge.bg, color: badge.color }}>{badge.label}</span>
          {overdue && <span className="text-[11px] px-2 py-0.5 rounded-lg font-semibold" style={{ background: "rgba(239,68,68,0.12)", color: "var(--ibs-danger)" }}>Quá hạn</span>}
        </div>
        <div className="text-[12px] mt-0.5" style={{ color: "var(--ibs-text-dim)" }}>
          {((item.employee as any).jobRole || item.employee.position.name)} · {item.employee.department.name}
          {due && <> · Hạn: <span style={{ color: overdue ? "var(--ibs-danger)" : "var(--ibs-text)" }}>{formatDate(due)}</span></>}
        </div>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        <div className="text-right">
          <div className="text-[13px] font-bold" style={{ color: pct === 100 ? "var(--ibs-success)" : "var(--ibs-accent)" }}>
            {item.items.filter((i) => i.isCompleted).length}/{item.items.length}
          </div>
          <div className="w-24 h-1.5 mt-1 rounded-full overflow-hidden" style={{ background: "rgba(51,65,85,0.4)" }}>
            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: pct === 100 ? "var(--ibs-success)" : "var(--ibs-accent)" }} />
          </div>
        </div>
        <ChevronRight size={16} style={{ color: "var(--ibs-text-dim)" }} />
      </div>
    </button>
  );
}

function StatCard({ label, value, icon, color }: { label: string; value: number; icon: React.ReactNode; color: string }) {
  return (
    <div className="rounded-xl border p-4" style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
      <div className="flex items-center justify-between">
        <div style={{ color: "var(--ibs-text-dim)" }}>{icon}</div>
        <div className="text-[20px] font-bold" style={{ color }}>{value}</div>
      </div>
      <div className="text-[11px] mt-1" style={{ color: "var(--ibs-text-dim)" }}>{label}</div>
    </div>
  );
}

// ============== CREATE MODAL ==============
function CreateOnboardingModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [rows, setRows] = useState<ProbationRow[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string>("");
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Chỉ NV đã được TP HCNS DUYỆT HĐ thử việc (probation.status = ACTIVE) và chưa có onboarding.
    fetch("/api/v1/recruitment/probation")
      .then((r) => r.json())
      .then((res) => setRows((res.data || []).filter((p: ProbationRow) => p.probation?.status === "ACTIVE" && !p.hasOnboarding)))
      .finally(() => setLoading(false));
  }, []);

  const filtered = rows.filter((e) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return e.fullName.toLowerCase().includes(q) || e.code.toLowerCase().includes(q);
  });

  async function handleSubmit() {
    if (!selected) { setError("Hãy chọn 1 nhân viên"); return; }
    setSaving(true);
    setError("");
    const res = await fetch("/api/v1/recruitment/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employeeId: selected,
        dueDate: dueDate ? new Date(dueDate).toISOString() : null,
      }),
    });
    setSaving(false);
    if (res.ok) onCreated();
    else {
      const data = await res.json();
      setError(apiError(res.status, data.error));
    }
  }

  return (
    <ModalShell title="Tạo Onboarding cho NV thử việc" onClose={onClose} size="md">
      <div className="flex flex-col gap-3">
        <div>
          <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>
            Tìm nhân viên (đã duyệt HĐ thử việc, chưa có onboarding)
          </label>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Gõ tên hoặc mã NV…"
            className="w-full rounded-lg px-3 py-2 text-[13px] border"
            style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }}
          />
        </div>
        <div className="rounded-lg border max-h-60 overflow-y-auto" style={{ borderColor: "var(--ibs-border)" }}>
          {loading ? (
            <div className="p-4 text-center text-[12px]" style={{ color: "var(--ibs-text-dim)" }}>Đang tải...</div>
          ) : filtered.length === 0 ? (
            <div className="p-4 text-center text-[12px]" style={{ color: "var(--ibs-text-dim)" }}>Không có NV phù hợp</div>
          ) : (
            filtered.map((e) => (
              <button
                key={e.id}
                onClick={() => setSelected(e.id)}
                className="w-full flex items-center gap-3 p-3 hover:bg-white/[0.03] transition-colors text-left border-b last:border-0"
                style={{ borderColor: "rgba(51,65,85,0.3)", background: selected === e.id ? "rgba(0,180,216,0.08)" : "transparent" }}
              >
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-bold flex-shrink-0" style={{ background: "rgba(0,180,216,0.15)", color: "var(--ibs-accent)" }}>
                  {e.fullName.split(" ").pop()?.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium">{e.fullName}</div>
                  <div className="text-[11px]" style={{ color: "var(--ibs-text-dim)" }}>
                    {e.code} · {e.jobRole || "—"} · {e.departmentName}
                  </div>
                </div>
                {selected === e.id && <Check size={16} style={{ color: "var(--ibs-accent)" }} />}
              </button>
            ))
          )}
        </div>
        <div>
          <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>
            Hạn hoàn thành (tuỳ chọn — bỏ trống nếu chưa cần đặt hạn)
          </label>
          <DateInput
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-full rounded-lg px-3 py-2 text-[13px] border"
            style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }}
          />
        </div>
        {error && <div className="text-[12px] text-red-500">{error}</div>}
        <div className="flex gap-2 justify-end mt-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-[13px] border" style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-dim)" }}>Hủy</button>
          <button onClick={handleSubmit} disabled={!selected || saving} className="px-4 py-2 rounded-lg text-[13px] font-semibold" style={{ background: "var(--ibs-accent)", color: "#fff", opacity: !selected || saving ? 0.5 : 1 }}>
            {saving ? "Đang tạo..." : "Tạo onboarding"}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

// ============== TẠO HĐ THỬ VIỆC (soạn + phát hành chờ TP HCNS duyệt) ==============
function ProbationContractModal({ rows, onClose, onCreated }: { rows: ProbationRow[]; onClose: () => void; onCreated: () => void }) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [empId, setEmpId] = useState("");
  const [search, setSearch] = useState("");
  const [loadingDoc, setLoadingDoc] = useState(false);
  const [contractNumber, setContractNumber] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [baseSalary, setBaseSalary] = useState("");
  const [position, setPosition] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const filtered = rows.filter((r) => !search || r.fullName.toLowerCase().includes(search.toLowerCase()) || r.code.toLowerCase().includes(search.toLowerCase()));

  function pick(id: string) {
    setEmpId(id); setError(""); setLoadingDoc(true);
    fetch(`/api/v1/employees/${id}/contracts/probation-prefill`)
      .then((r) => r.json())
      .then((res) => {
        const s = res.data?.suggested || {};
        setContractNumber(s.contractNumber || "");
        setStartDate(s.startDate || "");
        setEndDate(s.endDate || "");
        setBaseSalary(s.baseSalary ? Number(s.baseSalary).toLocaleString("vi-VN") : "");
        setPosition(s.jobTitle || "");
        if (editorRef.current && res.data?.html) editorRef.current.innerHTML = res.data.html;
      })
      .catch(() => setError("Không tải được nội dung HĐ"))
      .finally(() => setLoadingDoc(false));
  }

  const exec = (cmd: string) => { document.execCommand(cmd, false); editorRef.current?.focus(); };

  async function publish() {
    setError("");
    if (!empId) { setError("Hãy chọn 1 nhân viên thử việc"); return; }
    if (!startDate || !endDate) { setError("Thiếu ngày bắt đầu / kết thúc"); return; }
    setSaving(true);
    const res = await fetch(`/api/v1/employees/${empId}/contracts/probation`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contractNumber, startDate, endDate,
        baseSalary: parseInt(baseSalary.replace(/\D/g, ""), 10) || 0,
        position: position.trim() || null,
        documentHtml: editorRef.current?.innerHTML || null,
      }),
    });
    setSaving(false);
    if (res.ok) onCreated();
    else { const d = await res.json(); setError(apiError(res.status, d.error)); }
  }

  const fcls = "w-full rounded-lg px-2.5 py-1.5 text-[12px] border outline-none";
  const fst = { background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" } as React.CSSProperties;
  const L = ({ children }: { children: React.ReactNode }) => <label className="text-[11px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>{children}</label>;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4">
      <div className="rounded-2xl w-full max-w-3xl p-6 max-h-[92vh] overflow-y-auto" style={{ background: "var(--ibs-bg-card)", border: "1px solid var(--ibs-border)" }}>
        <div className="flex items-center justify-between mb-3">
          <div className="text-[16px] font-bold">Tạo HĐ thử việc</div>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <div className="text-[12px] mb-3 p-2.5 rounded-lg" style={{ background: "rgba(0,180,216,0.06)", color: "var(--ibs-text-dim)" }}>
          ⓘ Chọn NV thử việc → kiểm tra thông tin (lương thử việc lấy từ thư mời, có thể sửa) → <strong>Phát hành</strong>. HĐ sẽ chờ <strong>TP HCNS duyệt</strong> trước khi onboard.
        </div>

        {!empId ? (
          <>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm tên / mã NV thử việc…" className={`${fcls} mb-2`} style={fst} />
            <div className="rounded-lg border max-h-72 overflow-y-auto" style={{ borderColor: "var(--ibs-border)" }}>
              {filtered.length === 0 ? (
                <div className="p-4 text-center text-[12px]" style={{ color: "var(--ibs-text-dim)" }}>Không có NV thử việc cần tạo HĐ</div>
              ) : filtered.map((e) => (
                <button key={e.id} onClick={() => pick(e.id)} className="w-full flex items-center justify-between gap-3 p-3 hover:bg-white/[0.03] text-left border-b last:border-0" style={{ borderColor: "rgba(51,65,85,0.3)" }}>
                  <div>
                    <div className="text-[13px] font-medium">{e.fullName}</div>
                    <div className="text-[11px]" style={{ color: "var(--ibs-text-dim)" }}>{e.code} · {e.jobRole || "—"} · {e.departmentName}</div>
                  </div>
                  {e.probation?.status === "REJECTED" && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ background: "rgba(220,38,38,0.1)", color: "var(--ibs-danger)" }}>Bị từ chối — soạn lại</span>}
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-3 p-3 rounded-lg" style={{ background: "var(--ibs-bg)" }}>
              <div className="col-span-2 md:col-span-1"><L>Số HĐLĐ (tự sinh)</L><input value={contractNumber} readOnly className={fcls} style={{ ...fst, opacity: 0.75 }} /></div>
              <div><L>Loại HĐ</L><input value="Thử việc" readOnly className={fcls} style={{ ...fst, opacity: 0.75 }} /></div>
              <div><L>Ngày bắt đầu *</L><DateInput value={startDate} onChange={(e) => setStartDate(e.target.value)} className={fcls} style={fst} /></div>
              <div><L>Ngày kết thúc (2 tháng) *</L><DateInput value={endDate} onChange={(e) => setEndDate(e.target.value)} className={fcls} style={fst} /></div>
              <div><L>Lương thử việc</L><input type="text" inputMode="numeric" value={baseSalary} onChange={(e) => { const d = e.target.value.replace(/\D/g, ""); setBaseSalary(d ? Number(d).toLocaleString("vi-VN") : ""); }} className={fcls} style={fst} /></div>
              <div><L>Chức danh</L><input value={position} onChange={(e) => setPosition(e.target.value)} className={fcls} style={fst} /></div>
            </div>
            <div className="text-[11px] font-semibold mb-1" style={{ color: "var(--ibs-text-dim)" }}>NỘI DUNG HĐ THỬ VIỆC (sửa trực tiếp như Word)</div>
            <div className="flex gap-1 mb-1">
              <button type="button" onMouseDown={(e) => { e.preventDefault(); exec("bold"); }} className="px-2 py-1 rounded text-[12px] font-bold border" style={{ borderColor: "var(--ibs-border)" }}>B</button>
              <button type="button" onMouseDown={(e) => { e.preventDefault(); exec("italic"); }} className="px-2 py-1 rounded text-[12px] italic border" style={{ borderColor: "var(--ibs-border)" }}>I</button>
            </div>
            {loadingDoc && <div className="text-[12px] py-4 text-center" style={{ color: "var(--ibs-text-dim)" }}>Đang tải nội dung…</div>}
            <div ref={editorRef} contentEditable suppressContentEditableWarning className="rounded-lg border p-4 text-[12.5px] overflow-y-auto leading-relaxed" style={{ background: "#fff", color: "#111", borderColor: "var(--ibs-border)", minHeight: 260, maxHeight: 340, display: loadingDoc ? "none" : "block" }} />
          </>
        )}

        {error && <div className="text-[12px] text-red-500 mt-2">{error}</div>}
        <div className="flex gap-2 justify-end mt-4">
          {empId && <button onClick={() => setEmpId("")} className="px-4 py-2 rounded-lg text-[13px] border mr-auto" style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-dim)" }}>← Chọn NV khác</button>}
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-[13px] border" style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-dim)" }}>Hủy</button>
          {empId && (
            <button onClick={publish} disabled={saving || loadingDoc} className="px-4 py-2 rounded-lg text-[13px] font-semibold text-white" style={{ background: "var(--ibs-accent)", opacity: saving || loadingDoc ? 0.6 : 1 }}>
              {saving ? "Đang phát hành..." : "Phát hành HĐ thử việc"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ============== DETAIL MODAL ==============
function OnboardingDetailModal({ data, canEdit, onClose, onChanged }: {
  data: Onboarding;
  canEdit: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [items, setItems] = useState(data.items);
  const [showExtend, setShowExtend] = useState(false);
  const [showAddCustom, setShowAddCustom] = useState(false);
  const pct = progress(items);
  const due = data.extendedUntil || data.dueDate;
  const overdue = isOverdue({ ...data, items });

  async function updateItem(itemId: string, patch: Partial<{ attachmentUrl: string | null; isCompleted: boolean; note: string | null; title: string }>) {
    const res = await fetch(`/api/v1/recruitment/onboarding/${data.id}/items/${itemId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (res.ok) {
      const json = await res.json();
      setItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, ...json.data } : i)));
      onChanged();
    }
  }

  async function deleteItem(itemId: string) {
    if (!(await confirmDialog({ message: "Xóa mục này?", tone: "danger", confirmText: "Xóa" }))) return;
    const res = await fetch(`/api/v1/recruitment/onboarding/${data.id}/items/${itemId}`, {
      method: "DELETE",
    });
    if (res.ok) {
      setItems((prev) => prev.filter((i) => i.id !== itemId));
      onChanged();
    }
  }

  async function addCustomItem(name: string) {
    const res = await fetch(`/api/v1/recruitment/onboarding/${data.id}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        itemKey: `CUSTOM_${Date.now()}`,
        title: name,
        sortOrder: 999,
      }),
    });
    if (res.ok) {
      const json = await res.json();
      setItems((prev) => [...prev, json.data]);
      onChanged();
    }
  }

  return (
    <ModalShell title={`Onboarding — ${data.employee.fullName}`} onClose={onClose} size="lg">
      {/* Header info */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4 p-3 rounded-lg" style={{ background: "var(--ibs-bg)" }}>
        <Info label="Mã NV" value={data.employee.code} />
        <Info label="Vị trí" value={((data.employee as any).jobRole || data.employee.position.name)} />
        <Info label="Phòng ban" value={data.employee.department.name} />
        <Info label="Bắt đầu" value={formatDate(data.startedAt)} />
      </div>

      {/* Progress + extend info */}
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[12px] font-semibold">Tiến độ checklist</span>
            <span className="text-[12px] font-bold" style={{ color: pct === 100 ? "var(--ibs-success)" : "var(--ibs-accent)" }}>
              {items.filter((i) => i.isCompleted).length}/{items.length} mục ({pct}%)
            </span>
          </div>
          <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: "rgba(51,65,85,0.4)" }}>
            <div className="h-full transition-all" style={{ width: `${pct}%`, background: pct === 100 ? "var(--ibs-success)" : "var(--ibs-accent)" }} />
          </div>
        </div>
        <div className="text-right">
          <div className="text-[11px]" style={{ color: "var(--ibs-text-dim)" }}>Hạn hoàn thành</div>
          <div className="text-[13px] font-semibold" style={{ color: overdue ? "var(--ibs-danger)" : "var(--ibs-text)" }}>
            {due ? formatDate(due) : "—"}
            {data.isExtended && <span className="ml-1.5 text-[10px] font-normal" style={{ color: "#f59e0b" }}>(đã gia hạn)</span>}
          </div>
        </div>
      </div>

      {/* Extension banner if extended */}
      {data.isExtended && data.extensionReason && (
        <div className="mb-4 p-3 rounded-lg border" style={{ background: "rgba(245,158,11,0.06)", borderColor: "rgba(245,158,11,0.3)" }}>
          <div className="flex items-start gap-2">
            <Calendar size={14} style={{ color: "#f59e0b", marginTop: 2 }} />
            <div className="flex-1 text-[12px]">
              <div className="font-semibold mb-1" style={{ color: "#f59e0b" }}>Đã gia hạn — đến {data.extendedUntil && formatDate(data.extendedUntil)}</div>
              <div style={{ color: "var(--ibs-text-dim)" }}>Lý do: {data.extensionReason}</div>
              {data.extensionDocUrl && (
                <a href={viewUrl(data.extensionDocUrl)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 mt-1 text-[11px] hover:underline" style={{ color: "#f59e0b" }}>
                  <FileText size={11} /> Xem file đã ký
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Items */}
      <div className="space-y-2 mb-4">
        {items.map((it) => (
          <ChecklistItemRow
            key={it.id}
            item={it}
            canEdit={canEdit}
            onUpdate={(patch) => updateItem(it.id, patch)}
            onDelete={() => deleteItem(it.id)}
          />
        ))}
        {canEdit && !showAddCustom && (
          <button
            onClick={() => setShowAddCustom(true)}
            className="w-full p-3 rounded-lg border-2 border-dashed text-[12px] font-medium hover:bg-white/[0.02] transition-colors"
            style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-dim)" }}
          >
            + Thêm mục bổ sung (tuỳ NV này)
          </button>
        )}
        {showAddCustom && (
          <AddCustomItemForm
            onCancel={() => setShowAddCustom(false)}
            onAdd={async (name) => { await addCustomItem(name); setShowAddCustom(false); }}
          />
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between gap-2 pt-3 border-t" style={{ borderColor: "var(--ibs-border)" }}>
        <div>
          {canEdit && data.status !== "COMPLETED" && (
            <button
              onClick={() => setShowExtend(true)}
              className="text-[12px] px-3 py-1.5 rounded-lg font-medium border"
              style={{ borderColor: "rgba(245,158,11,0.4)", color: "#f59e0b" }}
            >
              <Calendar size={12} className="inline mr-1" /> Gia hạn (cần file scan + lý do)
            </button>
          )}
        </div>
        <button onClick={onClose} className="px-4 py-2 rounded-lg text-[13px] font-semibold" style={{ background: "var(--ibs-accent)", color: "#fff" }}>
          Đóng
        </button>
      </div>

      {showExtend && (
        <ExtendModal
          checklistId={data.id}
          currentDue={due || null}
          onClose={() => setShowExtend(false)}
          onExtended={() => { setShowExtend(false); onChanged(); onClose(); }}
        />
      )}
    </ModalShell>
  );
}

function ChecklistItemRow({ item, canEdit, onUpdate, onDelete }: {
  item: ChecklistItem;
  canEdit: boolean;
  onUpdate: (patch: Partial<{ attachmentUrl: string | null; isCompleted: boolean; note: string | null; title: string }>) => Promise<void> | void;
  onDelete: () => void;
}) {
  const [showUpload, setShowUpload] = useState(false);
  const [editingNote, setEditingNote] = useState(false);
  const [noteVal, setNoteVal] = useState(item.note || "");
  const fixed = isFixedItem(item.itemKey);

  return (
    <div className="rounded-lg border p-3" style={{ background: "var(--ibs-bg)", borderColor: item.isCompleted ? "rgba(34,197,94,0.3)" : "var(--ibs-border)" }}>
      <div className="flex items-center gap-3">
        <button
          onClick={() => canEdit && onUpdate({ isCompleted: !item.isCompleted })}
          disabled={!canEdit}
          className="w-6 h-6 rounded flex items-center justify-center flex-shrink-0 transition-colors"
          style={{
            background: item.isCompleted ? "var(--ibs-success)" : "transparent",
            border: `1.5px solid ${item.isCompleted ? "var(--ibs-success)" : "var(--ibs-border)"}`,
            cursor: canEdit ? "pointer" : "not-allowed",
          }}
        >
          {item.isCompleted && <Check size={14} color="#fff" strokeWidth={3} />}
        </button>
        <div className="text-[18px]">{itemIcon(item.itemKey)}</div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-medium">
            {item.title}
            {!fixed && (
              <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded font-normal" style={{ background: "rgba(0,180,216,0.12)", color: "var(--ibs-accent)" }}>
                {item.itemKey.startsWith("CERT_") ? "Bằng cấp theo vị trí" : "Tuỳ chỉnh"}
              </span>
            )}
          </div>
          {item.itemKey === "FINGERPRINT" && (
            <div className="text-[11px] mt-0.5" style={{ color: "var(--ibs-text-dim)" }}>
              ⓘ Hiện tại tick thủ công sau khi đăng ký trên máy chấm. Khi cắm API máy chấm → sẽ tự động.
            </div>
          )}
          {item.completedAt && (
            <div className="text-[11px] mt-0.5" style={{ color: "var(--ibs-text-dim)" }}>
              Hoàn thành: {formatDate(item.completedAt)}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {item.attachmentUrl ? (
            <a href={viewUrl(item.attachmentUrl)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[11px] px-2 py-1 rounded" style={{ background: "rgba(0,180,216,0.12)", color: "var(--ibs-accent)" }}>
              <FileText size={11} /> Xem file
            </a>
          ) : null}
          {canEdit && (
            <>
              <button onClick={() => setShowUpload((v) => !v)} className="text-[11px] px-2 py-1 rounded hover:bg-white/[0.05]" style={{ color: "var(--ibs-text-dim)" }} title={item.attachmentUrl ? "Thay file" : "Upload file"}>
                {item.attachmentUrl ? "Thay file" : "+ File"}
              </button>
              <button onClick={() => setEditingNote((v) => !v)} className="p-1 rounded hover:bg-white/[0.05]" style={{ color: "var(--ibs-text-dim)" }} title="Ghi chú">
                <Edit3 size={12} />
              </button>
              {!fixed && (
                <button onClick={onDelete} className="p-1 rounded hover:bg-white/[0.05]" style={{ color: "var(--ibs-danger)" }} title="Xóa mục">
                  <Trash2 size={12} />
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {showUpload && canEdit && (
        <div className="mt-3 pt-3 border-t" style={{ borderColor: "rgba(51,65,85,0.3)" }}>
          <FileUpload
            bucket={BUCKETS.HR_DOCUMENTS}
            folder={`onboarding/${item.checklistId}`}
            label={`Upload tài liệu cho "${item.title}"`}
            currentUrl={item.attachmentUrl || undefined}
            onUploaded={async (res) => {
              await onUpdate({ attachmentUrl: res.url, isCompleted: true });
              setShowUpload(false);
            }}
            onError={(msg) => void alertDialog(msg)}
          />
        </div>
      )}

      {editingNote && canEdit && (
        <div className="mt-3 pt-3 border-t flex gap-2" style={{ borderColor: "rgba(51,65,85,0.3)" }}>
          <input
            value={noteVal}
            onChange={(e) => setNoteVal(e.target.value)}
            placeholder="Ghi chú thêm cho mục này…"
            className="flex-1 rounded-lg px-3 py-1.5 text-[12px] border"
            style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }}
          />
          <button
            onClick={async () => { await onUpdate({ note: noteVal || null }); setEditingNote(false); }}
            className="text-[12px] px-3 py-1.5 rounded-lg font-semibold"
            style={{ background: "var(--ibs-accent)", color: "#fff" }}
          >
            Lưu
          </button>
        </div>
      )}

      {item.note && !editingNote && (
        <div className="mt-2 text-[11px] pl-9" style={{ color: "var(--ibs-text-dim)" }}>
          📝 {item.note}
        </div>
      )}
    </div>
  );
}

function AddCustomItemForm({ onCancel, onAdd }: { onCancel: () => void; onAdd: (name: string) => Promise<void> }) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  return (
    <div className="rounded-lg border-2 border-dashed p-3 flex gap-2" style={{ borderColor: "var(--ibs-accent)" }}>
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Tên mục bổ sung (vd: Khám sức khoẻ)…"
        className="flex-1 rounded-lg px-3 py-1.5 text-[12px] border"
        style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }}
        onKeyDown={async (e) => { if (e.key === "Enter" && name.trim()) { setSaving(true); await onAdd(name.trim()); setSaving(false); } }}
      />
      <button
        onClick={async () => { if (!name.trim()) return; setSaving(true); await onAdd(name.trim()); setSaving(false); }}
        disabled={!name.trim() || saving}
        className="text-[12px] px-3 py-1.5 rounded-lg font-semibold"
        style={{ background: "var(--ibs-accent)", color: "#fff", opacity: !name.trim() || saving ? 0.5 : 1 }}
      >
        Thêm
      </button>
      <button onClick={onCancel} className="text-[12px] px-3 py-1.5 rounded-lg border" style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-dim)" }}>
        Huỷ
      </button>
    </div>
  );
}

// ============== EXTEND MODAL ==============
function ExtendModal({ checklistId, currentDue, onClose, onExtended }: {
  checklistId: string;
  currentDue: string | null;
  onClose: () => void;
  onExtended: () => void;
}) {
  const [extendedUntil, setExtendedUntil] = useState("");
  const [reason, setReason] = useState("");
  const [docUrl, setDocUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit() {
    if (!extendedUntil || !reason.trim() || !docUrl) {
      setError("Cần điền đủ ngày gia hạn, lý do và file scan");
      return;
    }
    setSaving(true);
    const res = await fetch(`/api/v1/recruitment/onboarding/${checklistId}/extend`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        extendedUntil: new Date(extendedUntil).toISOString(),
        extensionReason: reason,
        extensionDocUrl: docUrl,
      }),
    });
    setSaving(false);
    if (res.ok) onExtended();
    else {
      const data = await res.json();
      setError(apiError(res.status, data.error));
    }
  }

  return (
    <ModalShell title="Gia hạn Onboarding" onClose={onClose} size="md">
      <div className="text-[12px] mb-3 p-3 rounded-lg" style={{ background: "rgba(245,158,11,0.06)", color: "var(--ibs-text-dim)" }}>
        ⓘ Gia hạn chỉ thực hiện sau khi BLĐ đã duyệt văn bản. HR upload file scan đã ký + ghi rõ lý do.
        {currentDue && <> Hạn hiện tại: <strong>{formatDate(currentDue)}</strong>.</>}
      </div>
      <div className="flex flex-col gap-3">
        <div>
          <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Hạn mới *</label>
          <DateInput
            value={extendedUntil}
            onChange={(e) => setExtendedUntil(e.target.value)}
            className="w-full rounded-lg px-3 py-2 text-[13px] border"
            style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }}
          />
        </div>
        <div>
          <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Lý do gia hạn (BLĐ phê duyệt) *</label>
          <textarea
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="VD: Theo công văn số 123/CV-BGĐ ngày dd/mm/yyyy: NV cần thêm 2 tuần để hoàn thiện chứng chỉ AWS…"
            className="w-full rounded-lg px-3 py-2 text-[13px] border resize-none"
            style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }}
          />
        </div>
        <div>
          <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>File scan đã ký *</label>
          <FileUpload
            bucket={BUCKETS.HR_DOCUMENTS}
            folder={`onboarding/${checklistId}/extension`}
            label="Upload file scan (PDF/ảnh)"
            onUploaded={(res) => setDocUrl(res.url)}
            onError={(msg) => void alertDialog(msg)}
            currentUrl={docUrl || undefined}
          />
        </div>
        {error && <div className="text-[12px] text-red-500">{error}</div>}
        <div className="flex gap-2 justify-end mt-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-[13px] border" style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-dim)" }}>Huỷ</button>
          <button onClick={handleSubmit} disabled={saving} className="px-4 py-2 rounded-lg text-[13px] font-semibold" style={{ background: "#f59e0b", color: "#fff" }}>
            {saving ? "Đang lưu..." : "Xác nhận gia hạn"}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

// ============== POSITION REQUIREMENTS MODAL ==============
function ConfigPositionRequirementsModal({ onClose }: { onClose: () => void }) {
  const [positions, setPositions] = useState<Position[]>([]);
  const [reqs, setReqs] = useState<PositionReq[]>([]);
  const [selectedPos, setSelectedPos] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");

  function fetchAll() {
    setLoading(true);
    Promise.all([
      fetch("/api/v1/positions").then((r) => r.json()),
      fetch("/api/v1/position-requirements").then((r) => r.json()),
    ])
      .then(([posRes, reqRes]) => {
        setPositions(posRes.data || []);
        setReqs(reqRes.data || []);
        if (!selectedPos && posRes.data?.length) setSelectedPos(posRes.data[0].id);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => { fetchAll(); }, []);

  const filtered = reqs.filter((r) => r.positionId === selectedPos);

  async function handleAdd() {
    if (!newName.trim() || !selectedPos) return;
    const res = await fetch("/api/v1/position-requirements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        positionId: selectedPos,
        name: newName.trim(),
        description: newDesc.trim() || null,
      }),
    });
    if (res.ok) {
      const json = await res.json();
      setReqs((prev) => [...prev, json.data]);
      setNewName("");
      setNewDesc("");
      setAdding(false);
    }
  }

  async function handleDelete(id: string) {
    if (!(await confirmDialog({ message: "Xoá yêu cầu này khỏi vị trí?", tone: "danger", confirmText: "Xoá" }))) return;
    const res = await fetch(`/api/v1/position-requirements/${id}`, { method: "DELETE" });
    if (res.ok) setReqs((prev) => prev.filter((r) => r.id !== id));
  }

  return (
    <ModalShell title="Cấu hình bằng cấp / chứng chỉ theo vị trí" onClose={onClose} size="lg">
      <div className="text-[12px] mb-3 p-3 rounded-lg" style={{ background: "rgba(0,180,216,0.06)", color: "var(--ibs-text-dim)" }}>
        ⓘ Khi tạo onboarding mới cho NV ở vị trí X, hệ thống sẽ tự sinh sẵn các mục bằng cấp / chứng chỉ tương ứng — HR chỉ cần upload tài liệu cho từng mục.
      </div>

      <div className="grid grid-cols-12 gap-3" style={{ minHeight: 360 }}>
        {/* Position list */}
        <div className="col-span-4 rounded-lg border overflow-y-auto" style={{ borderColor: "var(--ibs-border)", maxHeight: 400 }}>
          <div className="px-3 py-2 text-[11px] font-semibold uppercase border-b" style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-dim)" }}>
            Vị trí ({positions.length})
          </div>
          {loading ? (
            <div className="p-3 text-[12px]" style={{ color: "var(--ibs-text-dim)" }}>Đang tải...</div>
          ) : (
            positions.map((p) => {
              const count = reqs.filter((r) => r.positionId === p.id).length;
              return (
                <button
                  key={p.id}
                  onClick={() => { setSelectedPos(p.id); setAdding(false); }}
                  className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-white/[0.03] transition-colors border-b last:border-0 text-[13px]"
                  style={{ borderColor: "rgba(51,65,85,0.3)", background: selectedPos === p.id ? "rgba(0,180,216,0.08)" : "transparent" }}
                >
                  <span>{p.name}</span>
                  {count > 0 && <span className="text-[11px] px-1.5 py-0.5 rounded font-bold" style={{ background: "rgba(0,180,216,0.15)", color: "var(--ibs-accent)" }}>{count}</span>}
                </button>
              );
            })
          )}
        </div>

        {/* Requirements list */}
        <div className="col-span-8 rounded-lg border" style={{ borderColor: "var(--ibs-border)", maxHeight: 400, overflowY: "auto" }}>
          <div className="flex items-center justify-between px-3 py-2 border-b" style={{ borderColor: "var(--ibs-border)" }}>
            <span className="text-[12px] font-semibold" style={{ color: "var(--ibs-text-dim)" }}>
              Yêu cầu cho: {positions.find((p) => p.id === selectedPos)?.name || "—"}
            </span>
            {!adding && selectedPos && (
              <button onClick={() => setAdding(true)} className="text-[12px] px-2 py-1 rounded font-semibold" style={{ background: "var(--ibs-accent)", color: "#fff" }}>
                <Plus size={11} className="inline" /> Thêm
              </button>
            )}
          </div>
          {adding && (
            <div className="p-3 border-b" style={{ borderColor: "var(--ibs-border)", background: "rgba(0,180,216,0.04)" }}>
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Tên bằng cấp / chứng chỉ (vd: Chứng chỉ hàn AWS)"
                className="w-full rounded-lg px-3 py-1.5 text-[13px] border mb-2"
                style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }}
              />
              <textarea
                rows={2}
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="Mô tả thêm (tuỳ chọn)"
                className="w-full rounded-lg px-3 py-1.5 text-[12px] border resize-none mb-2"
                style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }}
              />
              <div className="flex gap-2 justify-end">
                <button onClick={() => { setAdding(false); setNewName(""); setNewDesc(""); }} className="text-[12px] px-3 py-1 rounded border" style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-dim)" }}>Huỷ</button>
                <button onClick={handleAdd} disabled={!newName.trim()} className="text-[12px] px-3 py-1 rounded font-semibold" style={{ background: "var(--ibs-accent)", color: "#fff", opacity: newName.trim() ? 1 : 0.5 }}>Lưu</button>
              </div>
            </div>
          )}
          {filtered.length === 0 && !adding ? (
            <div className="p-6 text-center text-[12px]" style={{ color: "var(--ibs-text-dim)" }}>
              Vị trí này chưa có yêu cầu bằng cấp nào. Nhấn "+ Thêm" để cấu hình.
            </div>
          ) : (
            filtered.map((r) => (
              <div key={r.id} className="flex items-start gap-2 px-3 py-2 border-b last:border-0" style={{ borderColor: "rgba(51,65,85,0.3)" }}>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium">🎓 {r.name}</div>
                  {r.description && <div className="text-[11px] mt-0.5" style={{ color: "var(--ibs-text-dim)" }}>{r.description}</div>}
                </div>
                <button onClick={() => handleDelete(r.id)} className="p-1 rounded hover:bg-white/[0.05]" style={{ color: "var(--ibs-danger)" }}>
                  <Trash2 size={12} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="flex justify-end mt-4">
        <button onClick={onClose} className="px-4 py-2 rounded-lg text-[13px] font-semibold" style={{ background: "var(--ibs-accent)", color: "#fff" }}>
          Đóng
        </button>
      </div>
    </ModalShell>
  );
}

// ============== SHARED MODAL SHELL ==============
function ModalShell({ title, onClose, children, size = "md" }: {
  title: string; onClose: () => void; children: React.ReactNode; size?: "sm" | "md" | "lg";
}) {
  const sizeClass = size === "lg" ? "max-w-4xl" : size === "sm" ? "max-w-sm" : "max-w-2xl";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className={`rounded-2xl w-full ${sizeClass} mx-4 p-6 max-h-[90vh] overflow-y-auto`} style={{ background: "var(--ibs-bg-card)", border: "1px solid var(--ibs-border)" }}>
        <div className="flex items-center justify-between mb-4">
          <div className="text-[16px] font-bold">{title}</div>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/[0.05]"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase font-semibold" style={{ color: "var(--ibs-text-dim)" }}>{label}</div>
      <div className="text-[13px] font-medium mt-0.5">{value}</div>
    </div>
  );
}
