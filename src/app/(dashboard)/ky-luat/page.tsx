"use client";

import { useState, useEffect } from "react";
import { PageTitle } from "@/components/layout/page-title";
import { DataTable, Column } from "@/components/shared/data-table";
import { formatDate } from "@/lib/utils";
import { Plus, RefreshCw, X, FileText, AlertTriangle, Search } from "lucide-react";

type Regulation = {
  id: string;
  code: string;
  title: string;
  category: string;
  content: string;
  effectiveDate: string;
  fileUrl?: string;
  isActive: boolean;
};

type Employee = { id: string; code: string; fullName: string; department: { name: string } };

type DisciplinaryAction = {
  id: string;
  violationType: string;
  description: string;
  penalty: string;
  decisionNumber?: string;
  effectiveDate: string;
  status: string;
  employee: { id: string; code: string; fullName: string; department: { name: string } };
  regulation?: { id: string; code: string; title: string };
};

const CATEGORY_LABELS: Record<string, string> = {
  GATE_SECURITY: "An ninh cổng", DISCIPLINE: "Kỷ luật lao động",
  EQUIPMENT: "Thiết bị máy móc", SEAL: "Niêm phong", UNIFORM: "Đồng phục", GENERAL: "Chung",
};

const CATEGORY_COLORS: Record<string, string> = {
  GATE_SECURITY: "#ef4444", DISCIPLINE: "#f59e0b", EQUIPMENT: "#3b82f6",
  SEAL: "#8b5cf6", UNIFORM: "#10b981", GENERAL: "#6b7280",
};

const DISCIPLINARY_STATUS_LABELS: Record<string, string> = {
  PENDING: "Đang xử lý", ISSUED: "Đã ban hành", APPEALED: "Đang khiếu nại", CLOSED: "Đã đóng",
};

const DISCIPLINARY_STATUS_COLORS: Record<string, string> = {
  PENDING: "#f59e0b", ISSUED: "#3b82f6", APPEALED: "#8b5cf6", CLOSED: "#22c55e",
};

type Tab = "regulations" | "disciplinary";

export default function KyLuatPage() {
  const [activeTab, setActiveTab] = useState<Tab>("regulations");
  const [regulations, setRegulations] = useState<Regulation[]>([]);
  const [actions, setActions] = useState<DisciplinaryAction[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loadingRegs, setLoadingRegs] = useState(true);
  const [loadingActions, setLoadingActions] = useState(true);
  const [userRole, setUserRole] = useState("");

  const [showNewRegulation, setShowNewRegulation] = useState(false);
  const [showNewAction, setShowNewAction] = useState(false);
  const [selectedAction, setSelectedAction] = useState<DisciplinaryAction | null>(null);
  const [searchReg, setSearchReg] = useState("");

  function fetchRegulations() {
    setLoadingRegs(true);
    fetch("/api/v1/regulations?active=true")
      .then((r) => r.json()).then((res) => setRegulations(res.data || []))
      .finally(() => setLoadingRegs(false));
  }

  function fetchActions() {
    setLoadingActions(true);
    fetch("/api/v1/disciplinary-actions")
      .then((r) => r.json()).then((res) => setActions(res.data || []))
      .finally(() => setLoadingActions(false));
  }

  useEffect(() => {
    fetch("/api/v1/me").then((r) => r.json()).then((res) => setUserRole(res.data?.role || ""));
    fetch("/api/v1/employees?limit=300").then((r) => r.json()).then((res) => setEmployees(res.data || []));
    fetchRegulations();
    fetchActions();
  }, []);

  const canManage = userRole === "HR_ADMIN" || userRole === "BOM";

  const filteredRegs = regulations.filter((r) =>
    !searchReg ||
    r.code.toLowerCase().includes(searchReg.toLowerCase()) ||
    r.title.toLowerCase().includes(searchReg.toLowerCase())
  );

  const regulationColumns: Column<Regulation>[] = [
    { key: "code", header: "Mã QĐ", render: (r) => <span className="font-mono font-semibold text-[12px]">{r.code}</span> },
    { key: "title", header: "Tên quy định", render: (r) => <span className="font-medium">{r.title}</span> },
    { key: "category", header: "Phân loại", render: (r) => (
      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-lg" style={{ background: `${CATEGORY_COLORS[r.category]}20`, color: CATEGORY_COLORS[r.category] }}>
        {CATEGORY_LABELS[r.category] || r.category}
      </span>
    )},
    { key: "effectiveDate", header: "Ngày hiệu lực", render: (r) => formatDate(r.effectiveDate) },
    { key: "fileUrl", header: "File", render: (r) => r.fileUrl ? (
      <a href={r.fileUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] px-2 py-0.5 rounded" style={{ color: "var(--ibs-accent)" }}>Xem file</a>
    ) : <span style={{ color: "var(--ibs-text-dim)" }}>—</span> },
    { key: "actions", header: "", render: (r) => canManage ? (
      <button onClick={() => handleDeactivate(r.id)} className="text-[11px] px-2 py-0.5 rounded" style={{ color: "var(--ibs-danger)" }}>Hủy</button>
    ) : null },
  ];

  const actionColumns: Column<DisciplinaryAction>[] = [
    { key: "employee", header: "Nhân viên", render: (a) => (
      <div>
        <div className="font-semibold text-[13px]">{a.employee.fullName}</div>
        <div className="text-[11px]" style={{ color: "var(--ibs-text-dim)" }}>{a.employee.code} · {a.employee.department.name}</div>
      </div>
    )},
    { key: "violationType", header: "Loại vi phạm", render: (a) => a.violationType },
    { key: "penalty", header: "Hình thức xử lý", render: (a) => <span className="font-medium">{a.penalty}</span> },
    { key: "regulation", header: "Quy định vi phạm", render: (a) => a.regulation ? (
      <span className="text-[11px] font-mono">{a.regulation.code}</span>
    ) : <span style={{ color: "var(--ibs-text-dim)" }}>—</span> },
    { key: "effectiveDate", header: "Ngày hiệu lực", render: (a) => formatDate(a.effectiveDate) },
    { key: "status", header: "Trạng thái", render: (a) => (
      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-lg" style={{ background: `${DISCIPLINARY_STATUS_COLORS[a.status]}20`, color: DISCIPLINARY_STATUS_COLORS[a.status] }}>
        {DISCIPLINARY_STATUS_LABELS[a.status] || a.status}
      </span>
    )},
    { key: "actions", header: "", render: (a) => (
      <button onClick={() => setSelectedAction(a)} className="text-[11px] px-2 py-0.5 rounded" style={{ color: "var(--ibs-accent)" }}>
        Chi tiết
      </button>
    )},
  ];

  async function handleDeactivate(id: string) {
    if (!confirm("Hủy kích hoạt quy định này?")) return;
    await fetch(`/api/v1/regulations/${id}`, { method: "DELETE" });
    fetchRegulations();
  }

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: "regulations", label: "Văn bản quy định", icon: <FileText size={15} /> },
    { key: "disciplinary", label: "Biên bản kỷ luật", icon: <AlertTriangle size={15} /> },
  ];

  return (
    <div>
      <PageTitle
        title="M8 — Kỷ luật & Quy định"
        description="Quản lý nội quy công ty và biên bản xử lý kỷ luật"
      />

      {/* Tabs */}
      <div className="flex gap-1 mb-6 p-1 rounded-xl w-fit" style={{ background: "var(--ibs-bg-card)", border: "1px solid var(--ibs-border)" }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-medium transition-all"
            style={{
              background: activeTab === t.key ? "var(--ibs-accent)" : "transparent",
              color: activeTab === t.key ? "#fff" : "var(--ibs-text-dim)",
            }}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab: Văn bản quy định */}
      {activeTab === "regulations" && (
        <div className="rounded-xl border" style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
          <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "var(--ibs-border)" }}>
            <div className="flex items-center gap-3">
              <div className="text-[14px] font-semibold">Danh sách văn bản quy định</div>
              <div className="flex items-center gap-2 rounded-lg border px-3 py-1.5" style={{ borderColor: "var(--ibs-border)", background: "var(--ibs-bg)" }}>
                <Search size={13} style={{ color: "var(--ibs-text-dim)" }} />
                <input value={searchReg} onChange={(e) => setSearchReg(e.target.value)}
                  placeholder="Tìm mã hoặc tên..." className="bg-transparent text-[12px] outline-none w-40"
                  style={{ color: "var(--ibs-text)" }} />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={fetchRegulations} className="p-2 rounded-lg hover:opacity-70" style={{ color: "var(--ibs-text-dim)" }}>
                <RefreshCw size={15} />
              </button>
              {canManage && (
                <button onClick={() => setShowNewRegulation(true)} className="flex items-center gap-1.5 text-[13px] px-3 py-2 rounded-lg font-semibold" style={{ background: "var(--ibs-accent)", color: "#fff" }}>
                  <Plus size={14} /> Thêm QĐ
                </button>
              )}
            </div>
          </div>
          <DataTable columns={regulationColumns} data={filteredRegs} loading={loadingRegs} emptyText="Chưa có văn bản quy định nào" />
        </div>
      )}

      {/* Tab: Biên bản kỷ luật */}
      {activeTab === "disciplinary" && (
        <div className="rounded-xl border" style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
          <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "var(--ibs-border)" }}>
            <div className="text-[14px] font-semibold">Biên bản xử lý kỷ luật</div>
            <div className="flex gap-2">
              <button onClick={fetchActions} className="p-2 rounded-lg hover:opacity-70" style={{ color: "var(--ibs-text-dim)" }}>
                <RefreshCw size={15} />
              </button>
              {canManage && (
                <button onClick={() => setShowNewAction(true)} className="flex items-center gap-1.5 text-[13px] px-3 py-2 rounded-lg font-semibold" style={{ background: "var(--ibs-warning)", color: "#fff" }}>
                  <Plus size={14} /> Tạo biên bản
                </button>
              )}
            </div>
          </div>
          <DataTable columns={actionColumns} data={actions} loading={loadingActions} emptyText="Chưa có biên bản kỷ luật nào" />
        </div>
      )}

      {/* Modal: Thêm quy định */}
      {showNewRegulation && (
        <NewRegulationModal
          onClose={() => setShowNewRegulation(false)}
          onSuccess={() => { setShowNewRegulation(false); fetchRegulations(); }}
        />
      )}

      {/* Modal: Tạo biên bản kỷ luật */}
      {showNewAction && (
        <NewActionModal
          employees={employees}
          regulations={regulations}
          onClose={() => setShowNewAction(false)}
          onSuccess={() => { setShowNewAction(false); fetchActions(); }}
        />
      )}

      {/* Modal: Chi tiết biên bản */}
      {selectedAction && (
        <ActionDetailModal
          action={selectedAction}
          canManage={canManage}
          onClose={() => setSelectedAction(null)}
          onUpdate={async (id, data) => {
            await fetch(`/api/v1/disciplinary-actions/${id}`, {
              method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
            });
            fetchActions();
            setSelectedAction(null);
          }}
        />
      )}
    </div>
  );
}

// New Regulation Modal
function NewRegulationModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState({ code: "", title: "", category: "GENERAL", content: "", effectiveDate: "", fileUrl: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const body: any = { ...form };
    if (!body.fileUrl) delete body.fileUrl;
    const res = await fetch("/api/v1/regulations", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    setSaving(false);
    if (res.ok) { onSuccess(); } else {
      const data = await res.json();
      setError(data.error?.message || "Có lỗi xảy ra");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="rounded-2xl w-full max-w-lg mx-4 p-6 max-h-[90vh] overflow-y-auto" style={{ background: "var(--ibs-bg-card)", border: "1px solid var(--ibs-border)" }}>
        <div className="flex items-center justify-between mb-5">
          <div className="text-[16px] font-bold">Thêm văn bản quy định</div>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Mã quy định *</label>
              <input required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })}
                className="w-full rounded-lg px-3 py-2 text-[13px] border font-mono" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }}
                placeholder="QĐ-V01" />
            </div>
            <div>
              <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Phân loại *</label>
              <select required value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-full rounded-lg px-3 py-2 text-[13px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }}>
                {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Tên quy định *</label>
            <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full rounded-lg px-3 py-2 text-[13px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }}
              placeholder="VD: Quy định an toàn cổng vào nhà máy" />
          </div>
          <div>
            <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Ngày hiệu lực *</label>
            <input required type="date" value={form.effectiveDate} onChange={(e) => setForm({ ...form, effectiveDate: e.target.value })}
              className="w-full rounded-lg px-3 py-2 text-[13px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }} />
          </div>
          <div>
            <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Nội dung</label>
            <textarea rows={3} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })}
              className="w-full rounded-lg px-3 py-2 text-[13px] border resize-none" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }} />
          </div>
          <div>
            <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Link file đính kèm</label>
            <input value={form.fileUrl} onChange={(e) => setForm({ ...form, fileUrl: e.target.value })}
              className="w-full rounded-lg px-3 py-2 text-[13px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }}
              placeholder="https://..." />
          </div>
          {error && <div className="text-[12px] text-red-500">{error}</div>}
          <div className="flex gap-2 justify-end mt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-[13px] border" style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-dim)" }}>Hủy</button>
            <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg text-[13px] font-semibold" style={{ background: "var(--ibs-accent)", color: "#fff" }}>
              {saving ? "Đang lưu..." : "Thêm quy định"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// New Disciplinary Action Modal
function NewActionModal({ employees, regulations, onClose, onSuccess }: {
  employees: Employee[];
  regulations: Regulation[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [form, setForm] = useState({
    employeeId: "", violationType: "", regulationId: "",
    description: "", penalty: "", decisionNumber: "", effectiveDate: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const body: any = { ...form };
    if (!body.regulationId) delete body.regulationId;
    if (!body.decisionNumber) delete body.decisionNumber;
    const res = await fetch("/api/v1/disciplinary-actions", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    setSaving(false);
    if (res.ok) { onSuccess(); } else {
      const data = await res.json();
      setError(data.error?.message || "Có lỗi xảy ra");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="rounded-2xl w-full max-w-lg mx-4 p-6 max-h-[90vh] overflow-y-auto" style={{ background: "var(--ibs-bg-card)", border: "1px solid var(--ibs-border)" }}>
        <div className="flex items-center justify-between mb-5">
          <div className="text-[16px] font-bold">Tạo biên bản kỷ luật</div>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div>
            <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Nhân viên vi phạm *</label>
            <select required value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })}
              className="w-full rounded-lg px-3 py-2 text-[13px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }}>
              <option value="">Chọn nhân viên...</option>
              {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.fullName} ({emp.code}) — {emp.department.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Loại vi phạm *</label>
            <input required value={form.violationType} onChange={(e) => setForm({ ...form, violationType: e.target.value })}
              className="w-full rounded-lg px-3 py-2 text-[13px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }}
              placeholder="VD: Đi trễ, tự ý bỏ ca, vi phạm ATVSLĐ..." />
          </div>
          <div>
            <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Quy định vi phạm (nếu có)</label>
            <select value={form.regulationId} onChange={(e) => setForm({ ...form, regulationId: e.target.value })}
              className="w-full rounded-lg px-3 py-2 text-[13px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }}>
              <option value="">Không liên kết</option>
              {regulations.map((r) => <option key={r.id} value={r.id}>{r.code} — {r.title}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Mô tả hành vi vi phạm *</label>
            <textarea required rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full rounded-lg px-3 py-2 text-[13px] border resize-none" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }} />
          </div>
          <div>
            <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Hình thức xử lý *</label>
            <input required value={form.penalty} onChange={(e) => setForm({ ...form, penalty: e.target.value })}
              className="w-full rounded-lg px-3 py-2 text-[13px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }}
              placeholder="VD: Khiển trách bằng lời, Cảnh cáo, Hạ bậc lương..." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Số quyết định</label>
              <input value={form.decisionNumber} onChange={(e) => setForm({ ...form, decisionNumber: e.target.value })}
                className="w-full rounded-lg px-3 py-2 text-[13px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }}
                placeholder="QĐ-2026-001" />
            </div>
            <div>
              <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Ngày hiệu lực *</label>
              <input required type="date" value={form.effectiveDate} onChange={(e) => setForm({ ...form, effectiveDate: e.target.value })}
                className="w-full rounded-lg px-3 py-2 text-[13px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }} />
            </div>
          </div>
          {error && <div className="text-[12px] text-red-500">{error}</div>}
          <div className="flex gap-2 justify-end mt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-[13px] border" style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-dim)" }}>Hủy</button>
            <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg text-[13px] font-semibold" style={{ background: "var(--ibs-warning)", color: "#fff" }}>
              {saving ? "Đang lưu..." : "Tạo biên bản"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Action Detail Modal
function ActionDetailModal({ action, canManage, onClose, onUpdate }: {
  action: DisciplinaryAction;
  canManage: boolean;
  onClose: () => void;
  onUpdate: (id: string, data: any) => void;
}) {
  const nextStatuses: Record<string, string[]> = {
    PENDING: ["ISSUED", "CLOSED"],
    ISSUED: ["APPEALED", "CLOSED"],
    APPEALED: ["CLOSED"],
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="rounded-2xl w-full max-w-lg mx-4 p-6" style={{ background: "var(--ibs-bg-card)", border: "1px solid var(--ibs-border)" }}>
        <div className="flex items-center justify-between mb-5">
          <div>
            <div className="text-[16px] font-bold">{action.employee.fullName}</div>
            <div className="text-[12px] mt-0.5" style={{ color: "var(--ibs-text-dim)" }}>{action.employee.code} · {action.employee.department.name}</div>
          </div>
          <button onClick={onClose}><X size={18} /></button>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <InfoRow label="Loại vi phạm" value={action.violationType} />
          <InfoRow label="Hình thức xử lý" value={<span className="font-semibold">{action.penalty}</span>} />
          <InfoRow label="Ngày hiệu lực" value={formatDate(action.effectiveDate)} />
          <InfoRow label="Số quyết định" value={action.decisionNumber || "—"} />
          <InfoRow label="Quy định vi phạm" value={action.regulation ? `${action.regulation.code}` : "—"} />
          <InfoRow label="Trạng thái" value={
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-lg"
              style={{ background: `${DISCIPLINARY_STATUS_COLORS[action.status]}20`, color: DISCIPLINARY_STATUS_COLORS[action.status] }}>
              {DISCIPLINARY_STATUS_LABELS[action.status]}
            </span>
          } />
        </div>

        <div className="mb-4 p-3 rounded-lg" style={{ background: "var(--ibs-bg)", border: "1px solid var(--ibs-border)" }}>
          <div className="text-[11px] mb-1" style={{ color: "var(--ibs-text-dim)" }}>Mô tả hành vi vi phạm</div>
          <div className="text-[13px]">{action.description}</div>
        </div>

        {canManage && nextStatuses[action.status] && (
          <div className="border-t pt-4 mb-4" style={{ borderColor: "var(--ibs-border)" }}>
            <div className="text-[12px] font-semibold mb-3" style={{ color: "var(--ibs-text-dim)" }}>Cập nhật trạng thái</div>
            <div className="flex gap-2">
              {nextStatuses[action.status].map((s) => (
                <button key={s} onClick={() => onUpdate(action.id, { status: s })}
                  className="text-[12px] px-3 py-1.5 rounded-lg font-semibold"
                  style={{ background: `${DISCIPLINARY_STATUS_COLORS[s]}20`, color: DISCIPLINARY_STATUS_COLORS[s] }}>
                  → {DISCIPLINARY_STATUS_LABELS[s]}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-[13px] border" style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-dim)" }}>Đóng</button>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] mb-0.5" style={{ color: "var(--ibs-text-dim)" }}>{label}</div>
      <div className="text-[13px] font-medium">{value}</div>
    </div>
  );
}
