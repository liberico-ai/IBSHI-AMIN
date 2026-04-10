"use client";

import { useState, useEffect } from "react";
import { PageTitle } from "@/components/layout/page-title";
import { DataTable, Column } from "@/components/shared/data-table";
import { formatDate } from "@/lib/utils";
import { Plus, RefreshCw, X, BookOpen, Users, CheckSquare, AlertTriangle } from "lucide-react";

type Department = { id: string; name: string };

type TrainingPlan = {
  id: string;
  title: string;
  type: string;
  trainer: string;
  scheduledDate: string;
  maxParticipants: number;
  status: string;
  description?: string;
  department?: { name: string };
  records: { id: string; attended: boolean; employeeId: string }[];
};

type TrainingRecord = {
  id: string;
  attended: boolean;
  score?: number;
  note?: string;
  employee: { id: string; code: string; fullName: string; department: { name: string } };
};

const TRAINING_TYPE_LABELS: Record<string, string> = {
  SAFETY: "An toàn lao động", TECHNICAL: "Kỹ thuật", QUALITY: "Chất lượng",
  MANAGEMENT: "Quản lý", ONBOARDING: "Onboarding",
};

const TRAINING_TYPE_COLORS: Record<string, string> = {
  SAFETY: "#ef4444", TECHNICAL: "#3b82f6", QUALITY: "#10b981",
  MANAGEMENT: "#8b5cf6", ONBOARDING: "#f59e0b",
};

const EVENT_STATUS_LABELS: Record<string, string> = {
  PLANNING: "Lên kế hoạch", PREPARING: "Chuẩn bị", READY: "Sẵn sàng",
  IN_PROGRESS: "Đang diễn ra", COMPLETED: "Hoàn thành", CANCELLED: "Hủy",
};

const EVENT_STATUS_COLORS: Record<string, string> = {
  PLANNING: "#6b7280", PREPARING: "#f59e0b", READY: "#00B4D8",
  IN_PROGRESS: "#3b82f6", COMPLETED: "#22c55e", CANCELLED: "#ef4444",
};

type Tab = "plans" | "attendance" | "certificates";

export default function DaoTaoPage() {
  const [activeTab, setActiveTab] = useState<Tab>("plans");
  const [plans, setPlans] = useState<TrainingPlan[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState("");

  const [showNewPlan, setShowNewPlan] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<TrainingPlan | null>(null);
  const [planRecords, setPlanRecords] = useState<TrainingRecord[]>([]);
  const [loadingRecords, setLoadingRecords] = useState(false);

  function fetchPlans() {
    setLoading(true);
    fetch("/api/v1/training/plans")
      .then((r) => r.json()).then((res) => setPlans(res.data || []))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    fetch("/api/v1/me").then((r) => r.json()).then((res) => setUserRole(res.data?.role || ""));
    fetch("/api/v1/departments").then((r) => r.json()).then((res) => setDepartments(res.data || []));
    fetchPlans();
  }, []);

  async function fetchRecords(planId: string) {
    setLoadingRecords(true);
    const res = await fetch(`/api/v1/training/plans/${planId}/records`);
    const data = await res.json();
    setPlanRecords(data.data || []);
    setLoadingRecords(false);
  }

  async function handleUpdateStatus(planId: string, status: string) {
    await fetch(`/api/v1/training/plans/${planId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    fetchPlans();
  }

  const canManage = userRole === "HR_ADMIN" || userRole === "BOM";

  const planColumns: Column<TrainingPlan>[] = [
    { key: "title", header: "Tên khóa đào tạo", render: (p) => <span className="font-semibold">{p.title}</span> },
    { key: "type", header: "Loại", render: (p) => (
      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-lg" style={{ background: `${TRAINING_TYPE_COLORS[p.type]}20`, color: TRAINING_TYPE_COLORS[p.type] }}>
        {TRAINING_TYPE_LABELS[p.type] || p.type}
      </span>
    )},
    { key: "department", header: "Phòng ban", render: (p) => p.department?.name || "Tất cả" },
    { key: "trainer", header: "Giảng viên", render: (p) => p.trainer },
    { key: "scheduledDate", header: "Ngày đào tạo", render: (p) => formatDate(p.scheduledDate) },
    { key: "participants", header: "Tham gia", render: (p) => `${p.records.length}/${p.maxParticipants}` },
    { key: "status", header: "Trạng thái", render: (p) => (
      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-lg" style={{ background: `${EVENT_STATUS_COLORS[p.status]}20`, color: EVENT_STATUS_COLORS[p.status] }}>
        {EVENT_STATUS_LABELS[p.status] || p.status}
      </span>
    )},
    { key: "actions", header: "", render: (p) => (
      <button onClick={() => { setSelectedPlan(p); fetchRecords(p.id); }} className="text-[11px] px-2 py-1 rounded-lg" style={{ color: "var(--ibs-accent)" }}>
        Chi tiết
      </button>
    )},
  ];

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: "plans", label: "Kế hoạch đào tạo", icon: <BookOpen size={15} /> },
    { key: "attendance", label: "Điểm danh", icon: <CheckSquare size={15} /> },
    { key: "certificates", label: "Cảnh báo chứng chỉ", icon: <AlertTriangle size={15} /> },
  ];

  return (
    <div>
      <PageTitle
        title="M5 — Đào tạo & Phát triển"
        description="Kế hoạch đào tạo, điểm danh và theo dõi chứng chỉ"
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

      {/* Tab: Kế hoạch đào tạo */}
      {activeTab === "plans" && (
        <div className="rounded-xl border" style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
          <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "var(--ibs-border)" }}>
            <div className="text-[14px] font-semibold">Danh sách kế hoạch đào tạo</div>
            <div className="flex gap-2">
              <button onClick={fetchPlans} className="p-2 rounded-lg hover:opacity-70" style={{ color: "var(--ibs-text-dim)" }}>
                <RefreshCw size={15} />
              </button>
              {canManage && (
                <button onClick={() => setShowNewPlan(true)} className="flex items-center gap-1.5 text-[13px] px-3 py-2 rounded-lg font-semibold" style={{ background: "var(--ibs-accent)", color: "#fff" }}>
                  <Plus size={14} /> Tạo kế hoạch
                </button>
              )}
            </div>
          </div>
          <DataTable columns={planColumns} data={plans} loading={loading} emptyText="Chưa có kế hoạch đào tạo nào" />
        </div>
      )}

      {/* Tab: Điểm danh */}
      {activeTab === "attendance" && (
        <div className="rounded-xl border" style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
          <div className="px-5 py-4 border-b" style={{ borderColor: "var(--ibs-border)" }}>
            <div className="text-[14px] font-semibold mb-1">Điểm danh theo khóa đào tạo</div>
            <div className="text-[12px]" style={{ color: "var(--ibs-text-dim)" }}>Chọn khóa đào tạo để xem và cập nhật điểm danh</div>
          </div>
          <div className="p-5">
            <div className="grid gap-3">
              {plans.filter((p) => ["PREPARING", "READY", "IN_PROGRESS", "COMPLETED"].includes(p.status)).map((p) => (
                <button key={p.id} onClick={() => { setSelectedPlan(p); fetchRecords(p.id); setActiveTab("plans"); }}
                  className="flex items-center justify-between p-4 rounded-xl border text-left hover:opacity-80 transition-opacity"
                  style={{ borderColor: "var(--ibs-border)" }}>
                  <div>
                    <div className="text-[14px] font-semibold">{p.title}</div>
                    <div className="text-[12px] mt-0.5" style={{ color: "var(--ibs-text-dim)" }}>
                      {formatDate(p.scheduledDate)} · {p.trainer} · {p.records.length}/{p.maxParticipants} người
                    </div>
                  </div>
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-lg" style={{ background: `${EVENT_STATUS_COLORS[p.status]}20`, color: EVENT_STATUS_COLORS[p.status] }}>
                    {EVENT_STATUS_LABELS[p.status]}
                  </span>
                </button>
              ))}
              {plans.filter((p) => ["PREPARING", "READY", "IN_PROGRESS", "COMPLETED"].includes(p.status)).length === 0 && (
                <div className="text-center py-12 text-[13px]" style={{ color: "var(--ibs-text-dim)" }}>
                  Không có khóa đào tạo nào đang hoạt động
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tab: Cảnh báo chứng chỉ hết hạn */}
      {activeTab === "certificates" && (
        <CertificateAlerts />
      )}

      {/* Modal: Tạo kế hoạch đào tạo */}
      {showNewPlan && (
        <NewPlanModal
          departments={departments}
          onClose={() => setShowNewPlan(false)}
          onSuccess={() => { setShowNewPlan(false); fetchPlans(); }}
        />
      )}

      {/* Modal: Chi tiết kế hoạch + điểm danh */}
      {selectedPlan && (
        <PlanDetailModal
          plan={selectedPlan}
          records={planRecords}
          loading={loadingRecords}
          canManage={canManage}
          onClose={() => { setSelectedPlan(null); setPlanRecords([]); }}
          onUpdateStatus={handleUpdateStatus}
          onRefreshRecords={() => fetchRecords(selectedPlan.id)}
          onRefreshPlans={fetchPlans}
        />
      )}
    </div>
  );
}

// Certificate expiry alerts
function CertificateAlerts() {
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch("/api/v1/alerts?type=certificate")
      .then((r) => r.json()).then((res) => setAlerts(res.data || []))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="rounded-xl border p-8 text-center text-[13px]" style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)", color: "var(--ibs-text-dim)" }}>
      Đang tải...
    </div>
  );

  return (
    <div className="rounded-xl border" style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
      <div className="px-5 py-4 border-b" style={{ borderColor: "var(--ibs-border)" }}>
        <div className="text-[14px] font-semibold">Cảnh báo chứng chỉ hết hạn</div>
      </div>
      {alerts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-2" style={{ color: "var(--ibs-text-dim)" }}>
          <AlertTriangle size={36} className="opacity-30" />
          <div className="text-[13px]">Không có chứng chỉ nào sắp hết hạn</div>
        </div>
      ) : (
        <div className="divide-y" style={{ borderColor: "var(--ibs-border)" }}>
          {alerts.map((a: any) => (
            <div key={a.id} className="flex items-center justify-between px-5 py-3">
              <div>
                <div className="text-[13px] font-semibold">{a.name}</div>
                <div className="text-[12px] mt-0.5" style={{ color: "var(--ibs-text-dim)" }}>
                  {a.employee?.fullName} · {a.employee?.department?.name}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[12px] font-semibold" style={{ color: a.status === "EXPIRED" ? "var(--ibs-danger)" : "var(--ibs-warning)" }}>
                  {a.status === "EXPIRED" ? "Đã hết hạn" : "Sắp hết hạn"}
                </div>
                <div className="text-[11px]" style={{ color: "var(--ibs-text-dim)" }}>
                  {a.expiryDate ? formatDate(a.expiryDate) : "—"}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// New Plan Modal
function NewPlanModal({ departments, onClose, onSuccess }: {
  departments: Department[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [form, setForm] = useState({
    title: "", type: "SAFETY", departmentId: "", scheduledDate: "",
    trainer: "", maxParticipants: 30, description: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const body: any = { ...form, maxParticipants: Number(form.maxParticipants) };
    if (!body.departmentId) delete body.departmentId;
    const res = await fetch("/api/v1/training/plans", {
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
          <div className="text-[16px] font-bold">Tạo kế hoạch đào tạo</div>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div>
            <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Tên khóa đào tạo *</label>
            <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full rounded-lg px-3 py-2 text-[13px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }}
              placeholder="VD: Đào tạo ATVSLĐ Q1/2026" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Loại đào tạo *</label>
              <select required value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}
                className="w-full rounded-lg px-3 py-2 text-[13px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }}>
                {Object.entries(TRAINING_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Phòng ban (để trống = tất cả)</label>
              <select value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value })}
                className="w-full rounded-lg px-3 py-2 text-[13px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }}>
                <option value="">Tất cả phòng ban</option>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Ngày đào tạo *</label>
              <input required type="date" value={form.scheduledDate} onChange={(e) => setForm({ ...form, scheduledDate: e.target.value })}
                className="w-full rounded-lg px-3 py-2 text-[13px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }} />
            </div>
            <div>
              <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Số người tối đa</label>
              <input type="number" min={1} value={form.maxParticipants} onChange={(e) => setForm({ ...form, maxParticipants: Number(e.target.value) })}
                className="w-full rounded-lg px-3 py-2 text-[13px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }} />
            </div>
          </div>
          <div>
            <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Giảng viên / Người phụ trách *</label>
            <input required value={form.trainer} onChange={(e) => setForm({ ...form, trainer: e.target.value })}
              className="w-full rounded-lg px-3 py-2 text-[13px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }} />
          </div>
          <div>
            <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Mô tả</label>
            <textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full rounded-lg px-3 py-2 text-[13px] border resize-none" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }} />
          </div>
          {error && <div className="text-[12px] text-red-500">{error}</div>}
          <div className="flex gap-2 justify-end mt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-[13px] border" style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-dim)" }}>Hủy</button>
            <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg text-[13px] font-semibold" style={{ background: "var(--ibs-accent)", color: "#fff" }}>
              {saving ? "Đang tạo..." : "Tạo kế hoạch"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Plan Detail Modal with attendance
function PlanDetailModal({ plan, records, loading, canManage, onClose, onUpdateStatus, onRefreshRecords, onRefreshPlans }: {
  plan: TrainingPlan;
  records: TrainingRecord[];
  loading: boolean;
  canManage: boolean;
  onClose: () => void;
  onUpdateStatus: (id: string, status: string) => void;
  onRefreshRecords: () => void;
  onRefreshPlans: () => void;
}) {
  const [savingAttendance, setSavingAttendance] = useState(false);
  const [attendance, setAttendance] = useState<Record<string, { attended: boolean; score: string; note: string }>>({});

  useEffect(() => {
    const init: Record<string, { attended: boolean; score: string; note: string }> = {};
    records.forEach((r) => {
      init[r.employee.id] = { attended: r.attended, score: r.score?.toString() || "", note: r.note || "" };
    });
    setAttendance(init);
  }, [records]);

  const statusFlow: Record<string, string> = {
    PLANNING: "PREPARING", PREPARING: "READY", READY: "IN_PROGRESS", IN_PROGRESS: "COMPLETED",
  };

  async function handleSaveAttendance() {
    setSavingAttendance(true);
    const recs = Object.entries(attendance).map(([empId, val]) => ({
      employeeId: empId,
      attended: val.attended,
      score: val.score ? Number(val.score) : null,
      note: val.note || null,
    }));
    await fetch(`/api/v1/training/plans/${plan.id}/records`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ records: recs }),
    });
    setSavingAttendance(false);
    onRefreshRecords();
    onRefreshPlans();
  }

  const attendedCount = Object.values(attendance).filter((a) => a.attended).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="rounded-2xl w-full max-w-2xl mx-4 flex flex-col max-h-[90vh]" style={{ background: "var(--ibs-bg-card)", border: "1px solid var(--ibs-border)" }}>
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-5 border-b flex-shrink-0" style={{ borderColor: "var(--ibs-border)" }}>
          <div>
            <div className="text-[16px] font-bold">{plan.title}</div>
            <div className="text-[12px] mt-1 flex gap-3" style={{ color: "var(--ibs-text-dim)" }}>
              <span>{TRAINING_TYPE_LABELS[plan.type]}</span>
              <span>·</span>
              <span>{formatDate(plan.scheduledDate)}</span>
              <span>·</span>
              <span>{plan.trainer}</span>
            </div>
          </div>
          <button onClick={onClose}><X size={18} /></button>
        </div>

        {/* Status + progress */}
        <div className="px-6 py-4 border-b flex items-center justify-between flex-shrink-0" style={{ borderColor: "var(--ibs-border)" }}>
          <div className="flex items-center gap-3">
            <span className="text-[12px] font-semibold px-2 py-1 rounded-lg" style={{ background: `${EVENT_STATUS_COLORS[plan.status]}20`, color: EVENT_STATUS_COLORS[plan.status] }}>
              {EVENT_STATUS_LABELS[plan.status]}
            </span>
            <span className="text-[12px]" style={{ color: "var(--ibs-text-dim)" }}>
              {attendedCount}/{records.length} tham dự
            </span>
          </div>
          {canManage && statusFlow[plan.status] && (
            <button onClick={() => { onUpdateStatus(plan.id, statusFlow[plan.status]); onRefreshPlans(); }}
              className="text-[12px] px-3 py-1.5 rounded-lg font-semibold"
              style={{ background: "rgba(0,180,216,0.12)", color: "var(--ibs-accent)" }}>
              → {EVENT_STATUS_LABELS[statusFlow[plan.status]]}
            </button>
          )}
        </div>

        {/* Records list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-[13px]" style={{ color: "var(--ibs-text-dim)" }}>Đang tải...</div>
          ) : records.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2" style={{ color: "var(--ibs-text-dim)" }}>
              <Users size={36} className="opacity-30" />
              <div className="text-[13px]">Chưa có người tham gia nào được ghi nhận</div>
            </div>
          ) : (
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b" style={{ borderColor: "var(--ibs-border)" }}>
                  <th className="text-left px-5 py-3 text-[11px] font-semibold" style={{ color: "var(--ibs-text-dim)" }}>Nhân viên</th>
                  <th className="px-3 py-3 text-[11px] font-semibold text-center" style={{ color: "var(--ibs-text-dim)" }}>Có mặt</th>
                  <th className="px-3 py-3 text-[11px] font-semibold text-center" style={{ color: "var(--ibs-text-dim)" }}>Điểm</th>
                  <th className="px-5 py-3 text-[11px] font-semibold" style={{ color: "var(--ibs-text-dim)" }}>Ghi chú</th>
                </tr>
              </thead>
              <tbody>
                {records.map((rec) => {
                  const val = attendance[rec.employee.id] || { attended: false, score: "", note: "" };
                  return (
                    <tr key={rec.id} className="border-b" style={{ borderColor: "var(--ibs-border)" }}>
                      <td className="px-5 py-3">
                        <div className="font-medium">{rec.employee.fullName}</div>
                        <div className="text-[11px]" style={{ color: "var(--ibs-text-dim)" }}>{rec.employee.code} · {rec.employee.department.name}</div>
                      </td>
                      <td className="px-3 py-3 text-center">
                        {canManage ? (
                          <input type="checkbox" checked={val.attended}
                            onChange={(e) => setAttendance((prev) => ({ ...prev, [rec.employee.id]: { ...val, attended: e.target.checked } }))}
                            className="w-4 h-4 rounded" />
                        ) : (
                          <span style={{ color: val.attended ? "var(--ibs-success)" : "var(--ibs-danger)" }}>
                            {val.attended ? "✓" : "✗"}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-center">
                        {canManage ? (
                          <input type="number" min={0} max={100} value={val.score}
                            onChange={(e) => setAttendance((prev) => ({ ...prev, [rec.employee.id]: { ...val, score: e.target.value } }))}
                            className="w-16 rounded px-2 py-1 text-[12px] border text-center" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }} />
                        ) : val.score || "—"}
                      </td>
                      <td className="px-5 py-3">
                        {canManage ? (
                          <input value={val.note}
                            onChange={(e) => setAttendance((prev) => ({ ...prev, [rec.employee.id]: { ...val, note: e.target.value } }))}
                            className="w-full rounded px-2 py-1 text-[12px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }} />
                        ) : val.note || "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        {canManage && records.length > 0 && (
          <div className="flex justify-end px-6 py-4 border-t flex-shrink-0" style={{ borderColor: "var(--ibs-border)" }}>
            <button onClick={handleSaveAttendance} disabled={savingAttendance}
              className="flex items-center gap-2 text-[13px] px-4 py-2 rounded-lg font-semibold"
              style={{ background: "var(--ibs-accent)", color: "#fff" }}>
              {savingAttendance ? "Đang lưu..." : "Lưu điểm danh"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
