"use client";

import { useState, useEffect, useMemo } from "react";
import { PageTitle } from "@/components/layout/page-title";
import { DataTable, Column } from "@/components/shared/data-table";
import { formatDate } from "@/lib/utils";
import { Plus, RefreshCw, X, Check, ChevronRight, Users, ClipboardList, Calendar, UserCheck } from "lucide-react";
import { usePermission } from "@/hooks/use-permission";
import { DateInput } from "@/components/shared/date-input";

type Department = { id: string; code: string; name: string };

type RecruitmentRequest = {
  id: string;
  positionName: string;
  quantity: number;
  reason: string;
  requirements: string;
  status: string;
  createdAt: string;
  approvedAt?: string;
  rejectedReason?: string;
  department: { name: string };
  candidates: { id: string; status: string }[];
};

type Candidate = {
  id: string;
  fullName: string;
  phone: string;
  email?: string;
  referredBy?: string;
  resumeUrl?: string;
  status: string;
  interviewDate?: string;
  interviewNote?: string;
  interviewScore?: number;
  createdAt: string;
  recruitment: {
    positionName: string;
    department: { name: string };
  };
};

const REQUEST_STATUS_LABELS: Record<string, string> = {
  PENDING: "Chờ duyệt", APPROVED: "Đã duyệt", REJECTED: "Từ chối",
  COMPLETED: "Hoàn thành", DRAFT: "Nháp", CANCELLED: "Hủy",
};

const CANDIDATE_STATUS_LABELS: Record<string, string> = {
  NEW: "Mới", SCREENING: "Sàng lọc", INTERVIEW: "Hẹn PV",
  INTERVIEWED: "Đã PV", OFFERED: "Offer", ACCEPTED: "Nhận việc",
  REJECTED: "Loại", WITHDRAWN: "Rút lui",
};

const CANDIDATE_STATUS_COLORS: Record<string, string> = {
  NEW: "#00B4D8", SCREENING: "#f59e0b", INTERVIEW: "#8b5cf6",
  INTERVIEWED: "#3b82f6", OFFERED: "#10b981", ACCEPTED: "#22c55e",
  REJECTED: "#ef4444", WITHDRAWN: "#6b7280",
};

type Tab = "requests" | "pipeline" | "interview" | "onboarding";

export default function TuyenDungPage() {
  const [activeTab, setActiveTab] = useState<Tab>("requests");
  const [requests, setRequests] = useState<RecruitmentRequest[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loadingReqs, setLoadingReqs] = useState(true);
  const [loadingCands, setLoadingCands] = useState(true);
  const { canDo, hasRole } = usePermission();

  // Modals
  const [showNewRequest, setShowNewRequest] = useState(false);
  const [showNewCandidate, setShowNewCandidate] = useState(false);
  const [showCandidateDetail, setShowCandidateDetail] = useState<{ candidate: Candidate; withEval: boolean } | null>(null);
  const [rejectingReq, setRejectingReq] = useState<RecruitmentRequest | null>(null);
  const [createdEmployee, setCreatedEmployee] = useState<{ code: string; email: string; tempPassword: string } | null>(null);

  function fetchRequests() {
    setLoadingReqs(true);
    fetch("/api/v1/recruitment/requests")
      .then((r) => r.json()).then((res) => setRequests(res.data || []))
      .finally(() => setLoadingReqs(false));
  }
  function fetchCandidates() {
    setLoadingCands(true);
    fetch("/api/v1/recruitment/candidates")
      .then((r) => r.json()).then((res) => setCandidates(res.data || []))
      .finally(() => setLoadingCands(false));
  }

  useEffect(() => {
    fetch("/api/v1/departments").then((r) => r.json()).then((res) => setDepartments(res.data || []));
    fetchRequests();
    fetchCandidates();
  }, []);

  const interviewCandidates = useMemo(
    () => candidates.filter((c) => c.status === "INTERVIEW" || c.status === "INTERVIEWED"),
    [candidates]
  );
  const acceptedCandidates = useMemo(
    () => candidates.filter((c) => c.status === "ACCEPTED"),
    [candidates]
  );

  async function handleApproveRequest(req: RecruitmentRequest) {
    await fetch(`/api/v1/recruitment/requests/${req.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "APPROVE" }),
    });
    fetchRequests();
  }

  async function handleRejectRequest(req: RecruitmentRequest, reason: string) {
    await fetch(`/api/v1/recruitment/requests/${req.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "REJECT", rejectedReason: reason }),
    });
    setRejectingReq(null);
    fetchRequests();
  }

  async function handleUpdateCandidateStatus(id: string, status: string) {
    const res = await fetch(`/api/v1/recruitment/candidates/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const data = await res.json();
    fetchCandidates();
    setShowCandidateDetail(null);
    if (status === "ACCEPTED" && data.createdEmployee) {
      setCreatedEmployee(data.createdEmployee);
    }
  }

  const tabs: { key: Tab; label: string; icon: React.ReactNode; count?: number }[] = [
    { key: "requests", label: "Đề xuất tuyển", icon: <ClipboardList size={15} />, count: requests.filter(r => r.status === "PENDING").length },
    { key: "pipeline", label: "Pipeline ứng viên", icon: <Users size={15} />, count: candidates.filter(c => !["ACCEPTED","REJECTED","WITHDRAWN"].includes(c.status)).length },
    { key: "interview", label: "Lịch phỏng vấn", icon: <Calendar size={15} />, count: interviewCandidates.length },
    { key: "onboarding", label: "Onboarding", icon: <UserCheck size={15} />, count: acceptedCandidates.length },
  ];

  const requestColumns: Column<RecruitmentRequest>[] = [
    { key: "positionName", header: "Vị trí tuyển", render: (r) => <span className="font-semibold">{r.positionName}</span> },
    { key: "department", header: "Phòng ban", render: (r) => r.department.name },
    { key: "quantity", header: "SL", render: (r) => r.quantity },
    { key: "status", header: "Trạng thái", render: (r) => (
      <span className="text-[11px] font-semibold px-2 py-1 rounded-lg" style={{
        background: r.status === "APPROVED" ? "rgba(34,197,94,0.12)" : r.status === "REJECTED" ? "rgba(239,68,68,0.12)" : "rgba(0,180,216,0.12)",
        color: r.status === "APPROVED" ? "var(--ibs-success)" : r.status === "REJECTED" ? "var(--ibs-danger)" : "var(--ibs-accent)",
      }}>
        {REQUEST_STATUS_LABELS[r.status] || r.status}
      </span>
    )},
    { key: "candidates", header: "Ứng viên", render: (r) => (
      <span className="text-[12px]">{r.candidates.length} UV</span>
    )},
    { key: "createdAt", header: "Ngày tạo", render: (r) => formatDate(r.createdAt) },
    { key: "actions", header: "", render: (r) => (
      <div className="flex gap-2">
        {r.status === "PENDING" && hasRole("BOM") && (
          <>
            <button onClick={() => handleApproveRequest(r)} className="text-[11px] px-2 py-1 rounded-lg font-semibold" style={{ background: "rgba(34,197,94,0.15)", color: "var(--ibs-success)" }}>
              Duyệt
            </button>
            <button onClick={() => setRejectingReq(r)} className="text-[11px] px-2 py-1 rounded-lg font-semibold" style={{ background: "rgba(239,68,68,0.15)", color: "var(--ibs-danger)" }}>
              Từ chối
            </button>
          </>
        )}
        {r.status === "APPROVED" && canDo("recruitment", "create") && (
          <button onClick={() => { setShowNewCandidate(true); }} className="text-[11px] px-2 py-1 rounded-lg" style={{ background: "rgba(0,180,216,0.1)", color: "var(--ibs-accent)" }}>
            + Ứng viên
          </button>
        )}
      </div>
    )},
  ];

  const candidateColumns: Column<Candidate>[] = [
    { key: "fullName", header: "Họ tên", render: (c) => <span className="font-semibold">{c.fullName}</span> },
    { key: "phone", header: "Điện thoại", render: (c) => c.phone },
    { key: "position", header: "Vị trí", render: (c) => c.recruitment.positionName },
    { key: "dept", header: "Phòng ban", render: (c) => c.recruitment.department.name },
    { key: "status", header: "Trạng thái", render: (c) => (
      <span className="text-[11px] font-semibold px-2 py-1 rounded-lg" style={{
        background: `${CANDIDATE_STATUS_COLORS[c.status]}20`,
        color: CANDIDATE_STATUS_COLORS[c.status],
      }}>
        {CANDIDATE_STATUS_LABELS[c.status] || c.status}
      </span>
    )},
    { key: "referredBy", header: "Người giới thiệu", render: (c) => c.referredBy || "—" },
    { key: "createdAt", header: "Ngày nộp", render: (c) => formatDate(c.createdAt) },
    { key: "actions", header: "", render: (c) => (
      <button onClick={() => setShowCandidateDetail({ candidate: c, withEval: false })} className="text-[11px] px-2 py-1 rounded-lg" style={{ color: "var(--ibs-accent)" }}>
        Chi tiết <ChevronRight size={12} className="inline" />
      </button>
    )},
  ];

  return (
    <div>
      <PageTitle
        title="M4 — Tuyển dụng"
        description="Quản lý đề xuất tuyển dụng, pipeline ứng viên và onboarding"
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
            {t.count !== undefined && t.count > 0 && (
              <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-full" style={{
                background: activeTab === t.key ? "rgba(255,255,255,0.25)" : "rgba(0,180,216,0.15)",
                color: activeTab === t.key ? "#fff" : "var(--ibs-accent)",
              }}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab: Đề xuất tuyển dụng */}
      {activeTab === "requests" && (
        <div className="rounded-xl border" style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
          <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "var(--ibs-border)" }}>
            <div className="text-[14px] font-semibold">Danh sách đề xuất tuyển dụng</div>
            <div className="flex gap-2">
              <button onClick={fetchRequests} className="p-2 rounded-lg hover:opacity-70" style={{ color: "var(--ibs-text-dim)" }}>
                <RefreshCw size={15} />
              </button>
              {canDo("recruitment", "read") && (
                <button onClick={() => setShowNewRequest(true)} className="flex items-center gap-1.5 text-[13px] px-3 py-2 rounded-lg font-semibold" style={{ background: "var(--ibs-accent)", color: "#fff" }}>
                  <Plus size={14} /> Đề xuất mới
                </button>
              )}
            </div>
          </div>
          <DataTable columns={requestColumns} data={requests} loading={loadingReqs} emptyText="Chưa có đề xuất tuyển dụng" />
        </div>
      )}

      {/* Tab: Pipeline ứng viên */}
      {activeTab === "pipeline" && (
        <div className="rounded-xl border" style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
          <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "var(--ibs-border)" }}>
            <div className="text-[14px] font-semibold">Pipeline ứng viên</div>
            <div className="flex gap-2">
              <button onClick={fetchCandidates} className="p-2 rounded-lg hover:opacity-70" style={{ color: "var(--ibs-text-dim)" }}>
                <RefreshCw size={15} />
              </button>
              {canDo("recruitment", "create") && (
                <button onClick={() => setShowNewCandidate(true)} className="flex items-center gap-1.5 text-[13px] px-3 py-2 rounded-lg font-semibold" style={{ background: "var(--ibs-accent)", color: "#fff" }}>
                  <Plus size={14} /> Thêm ứng viên
                </button>
              )}
            </div>
          </div>

          {/* Kanban status summary */}
          <div className="flex gap-3 px-5 py-4 overflow-x-auto">
            {Object.entries(CANDIDATE_STATUS_LABELS).map(([status, label]) => {
              const count = candidates.filter((c) => c.status === status).length;
              return (
                <div key={status} className="flex-shrink-0 flex flex-col items-center gap-1 px-4 py-3 rounded-xl border min-w-[90px]" style={{ borderColor: "var(--ibs-border)", background: `${CANDIDATE_STATUS_COLORS[status]}10` }}>
                  <div className="text-[22px] font-bold" style={{ color: CANDIDATE_STATUS_COLORS[status] }}>{count}</div>
                  <div className="text-[11px] font-medium text-center" style={{ color: "var(--ibs-text-dim)" }}>{label}</div>
                </div>
              );
            })}
          </div>

          <DataTable columns={candidateColumns} data={candidates.filter(c => !["ACCEPTED","REJECTED","WITHDRAWN"].includes(c.status))} loading={loadingCands} emptyText="Chưa có ứng viên" />
        </div>
      )}

      {/* Tab: Lịch phỏng vấn */}
      {activeTab === "interview" && (
        <div className="rounded-xl border" style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
          <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "var(--ibs-border)" }}>
            <div className="text-[14px] font-semibold">Lịch phỏng vấn</div>
            <button onClick={fetchCandidates} className="p-2 rounded-lg hover:opacity-70" style={{ color: "var(--ibs-text-dim)" }}><RefreshCw size={15} /></button>
          </div>
          <DataTable
            columns={[
              ...candidateColumns.slice(0, 4),
              { key: "interviewDate", header: "Ngày PV", render: (c) => c.interviewDate ? formatDate(c.interviewDate) : <span style={{ color: "var(--ibs-text-dim)" }}>Chưa hẹn</span> },
              { key: "interviewScore", header: "Điểm", render: (c) => c.interviewScore ? `${c.interviewScore}/10` : "—" },
              { key: "actions", header: "", render: (c) => (
                <button onClick={() => setShowCandidateDetail({ candidate: c, withEval: true })} className="text-[11px] px-2 py-1 rounded-lg" style={{ color: "var(--ibs-accent)" }}>
                  Chi tiết <ChevronRight size={12} className="inline" />
                </button>
              )},
            ]}
            data={interviewCandidates}
            loading={loadingCands}
            emptyText="Không có ứng viên đang trong vòng phỏng vấn"
          />
        </div>
      )}

      {/* Tab: Onboarding */}
      {activeTab === "onboarding" && (
        <div className="rounded-xl border" style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
          <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "var(--ibs-border)" }}>
            <div className="text-[14px] font-semibold">Onboarding — Ứng viên đã nhận việc</div>
            <button onClick={fetchCandidates} className="p-2 rounded-lg hover:opacity-70" style={{ color: "var(--ibs-text-dim)" }}><RefreshCw size={15} /></button>
          </div>
          {acceptedCandidates.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2" style={{ color: "var(--ibs-text-dim)" }}>
              <UserCheck size={40} className="opacity-30" />
              <div className="text-[13px]">Chưa có ứng viên nào được nhận việc</div>
            </div>
          ) : (
            <div className="p-5 grid gap-3">
              {acceptedCandidates.map((c) => (
                <div key={c.id} className="flex items-center justify-between p-4 rounded-xl border" style={{ borderColor: "var(--ibs-border)" }}>
                  <div>
                    <div className="text-[14px] font-semibold">{c.fullName}</div>
                    <div className="text-[12px] mt-0.5" style={{ color: "var(--ibs-text-dim)" }}>
                      {c.recruitment.positionName} · {c.recruitment.department.name} · {c.phone}
                    </div>
                  </div>
                  <div className="text-[11px] font-semibold px-3 py-1 rounded-lg" style={{ background: "rgba(34,197,94,0.12)", color: "var(--ibs-success)" }}>
                    Đã nhận việc
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modal: Tạo đề xuất tuyển dụng */}
      {showNewRequest && (
        <NewRequestModal
          departments={departments}
          onClose={() => setShowNewRequest(false)}
          onSuccess={() => { setShowNewRequest(false); fetchRequests(); }}
        />
      )}

      {/* Modal: Thêm ứng viên */}
      {showNewCandidate && (
        <NewCandidateModal
          requests={requests.filter((r) => r.status === "APPROVED")}
          onClose={() => setShowNewCandidate(false)}
          onSuccess={() => { setShowNewCandidate(false); fetchCandidates(); }}
        />
      )}

      {/* Modal: Chi tiết / cập nhật ứng viên */}
      {showCandidateDetail && (
        <CandidateDetailModal
          candidate={showCandidateDetail.candidate}
          showEvaluation={showCandidateDetail.withEval}
          canEdit={canDo("recruitment", "update")}
          onClose={() => setShowCandidateDetail(null)}
          onUpdateStatus={handleUpdateCandidateStatus}
          onSaveInterview={async (id, data) => {
            const payload = { ...data };
            if (data.interviewDate &&
                !["INTERVIEW","INTERVIEWED","OFFERED","ACCEPTED","REJECTED","WITHDRAWN"].includes(showCandidateDetail.candidate.status)) {
              payload.status = "INTERVIEW";
            }
            await fetch(`/api/v1/recruitment/candidates/${id}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });
            fetchCandidates();
            setShowCandidateDetail(null);
          }}
        />
      )}

      {/* Modal: Từ chối đề xuất */}
      {rejectingReq && (
        <RejectRequestModal
          request={rejectingReq}
          onClose={() => setRejectingReq(null)}
          onReject={(reason) => handleRejectRequest(rejectingReq, reason)}
        />
      )}

      {/* Modal: Nhân viên mới được tạo tự động */}
      {createdEmployee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="rounded-2xl w-full max-w-md mx-4 p-6" style={{ background: "var(--ibs-bg-card)", border: "1px solid var(--ibs-border)" }}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "rgba(34,197,94,0.15)" }}>
                <Check size={20} style={{ color: "var(--ibs-success)" }} />
              </div>
              <div>
                <div className="text-[16px] font-bold">Tạo tài khoản nhân viên thành công</div>
                <div className="text-[12px] mt-0.5" style={{ color: "var(--ibs-text-dim)" }}>Hồ sơ nhân viên đã được khởi tạo tự động</div>
              </div>
            </div>
            <div className="rounded-xl p-4 mb-4" style={{ background: "var(--ibs-bg)", border: "1px solid var(--ibs-border)" }}>
              {[
                ["Mã nhân viên", createdEmployee.code],
                ["Email đăng nhập", createdEmployee.email],
                ["Mật khẩu tạm", createdEmployee.tempPassword],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between py-2 border-b last:border-0" style={{ borderColor: "rgba(51,65,85,0.3)" }}>
                  <span className="text-[12px]" style={{ color: "var(--ibs-text-dim)" }}>{label}</span>
                  <span className="text-[13px] font-mono font-semibold" style={{ color: "var(--ibs-accent)" }}>{value}</span>
                </div>
              ))}
            </div>
            <p className="text-[12px] mb-4" style={{ color: "var(--ibs-text-dim)" }}>
              Vui lòng thông báo mật khẩu tạm cho nhân viên. Họ sẽ được yêu cầu đổi mật khẩu khi đăng nhập lần đầu.
            </p>
            <button
              onClick={() => setCreatedEmployee(null)}
              className="w-full py-2.5 rounded-xl text-[13px] font-semibold"
              style={{ background: "var(--ibs-accent)", color: "#fff" }}
            >
              Đã hiểu
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ===== Sub-components =====

function NewRequestModal({ departments, onClose, onSuccess }: {
  departments: Department[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [form, setForm] = useState({ departmentId: "", positionName: "", quantity: 1, reason: "", requirements: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch("/api/v1/recruitment/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, quantity: Number(form.quantity) }),
    });
    setSaving(false);
    if (res.ok) { onSuccess(); } else {
      const data = await res.json();
      setError(data.error?.message || "Có lỗi xảy ra");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="rounded-2xl w-full max-w-lg mx-4 p-6" style={{ background: "var(--ibs-bg-card)", border: "1px solid var(--ibs-border)" }}>
        <div className="flex items-center justify-between mb-5">
          <div className="text-[16px] font-bold">Tạo đề xuất tuyển dụng</div>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div>
            <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Phòng ban *</label>
            <select required value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value })}
              className="w-full rounded-lg px-3 py-2 text-[13px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }}>
              <option value="">Chọn phòng ban...</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Vị trí tuyển *</label>
            <input required value={form.positionName} onChange={(e) => setForm({ ...form, positionName: e.target.value })}
              className="w-full rounded-lg px-3 py-2 text-[13px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }}
              placeholder="VD: Công nhân hàn MIG" />
          </div>
          <div>
            <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Số lượng *</label>
            <input type="number" required min={1} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })}
              className="w-full rounded-lg px-3 py-2 text-[13px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }} />
          </div>
          <div>
            <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Lý do tuyển *</label>
            <textarea required rows={2} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })}
              className="w-full rounded-lg px-3 py-2 text-[13px] border resize-none" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }}
              placeholder="Mô tả lý do cần tuyển dụng..." />
          </div>
          <div>
            <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Yêu cầu ứng viên</label>
            <textarea rows={2} value={form.requirements} onChange={(e) => setForm({ ...form, requirements: e.target.value })}
              className="w-full rounded-lg px-3 py-2 text-[13px] border resize-none" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }}
              placeholder="Kinh nghiệm, kỹ năng, bằng cấp..." />
          </div>
          {error && <div className="text-[12px] text-red-500">{error}</div>}
          <div className="flex gap-2 justify-end mt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-[13px] border" style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-dim)" }}>Hủy</button>
            <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg text-[13px] font-semibold" style={{ background: "var(--ibs-accent)", color: "#fff" }}>
              {saving ? "Đang gửi..." : "Gửi đề xuất"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function NewCandidateModal({ requests, onClose, onSuccess }: {
  requests: RecruitmentRequest[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [form, setForm] = useState({ recruitmentId: "", fullName: "", phone: "", email: "", referredBy: "", resumeUrl: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const body: any = { recruitmentId: form.recruitmentId, fullName: form.fullName, phone: form.phone };
    if (form.email) body.email = form.email;
    if (form.referredBy) body.referredBy = form.referredBy;
    if (form.resumeUrl) body.resumeUrl = form.resumeUrl;
    const res = await fetch("/api/v1/recruitment/candidates", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    setSaving(false);
    if (res.ok) { onSuccess(); } else {
      const data = await res.json();
      setError(data.error?.issues?.[0]?.message || "Có lỗi xảy ra");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="rounded-2xl w-full max-w-lg mx-4 p-6" style={{ background: "var(--ibs-bg-card)", border: "1px solid var(--ibs-border)" }}>
        <div className="flex items-center justify-between mb-5">
          <div className="text-[16px] font-bold">Thêm ứng viên mới</div>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div>
            <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Đề xuất tuyển dụng *</label>
            <select required value={form.recruitmentId} onChange={(e) => setForm({ ...form, recruitmentId: e.target.value })}
              className="w-full rounded-lg px-3 py-2 text-[13px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }}>
              <option value="">Chọn đề xuất...</option>
              {requests.map((r) => <option key={r.id} value={r.id}>{r.positionName} — {r.department.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Họ và tên *</label>
            <input required value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              className="w-full rounded-lg px-3 py-2 text-[13px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }} />
          </div>
          <div>
            <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Số điện thoại * (0xxxxxxxxx)</label>
            <input required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="w-full rounded-lg px-3 py-2 text-[13px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }}
              placeholder="0901234567" />
          </div>
          <div>
            <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Email</label>
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full rounded-lg px-3 py-2 text-[13px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }} />
          </div>
          <div>
            <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Người giới thiệu</label>
            <input value={form.referredBy} onChange={(e) => setForm({ ...form, referredBy: e.target.value })}
              className="w-full rounded-lg px-3 py-2 text-[13px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }} />
          </div>
          {error && <div className="text-[12px] text-red-500">{error}</div>}
          <div className="flex gap-2 justify-end mt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-[13px] border" style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-dim)" }}>Hủy</button>
            <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg text-[13px] font-semibold" style={{ background: "var(--ibs-accent)", color: "#fff" }}>
              {saving ? "Đang lưu..." : "Thêm ứng viên"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const EVAL_CRITERIA_I = [
  { key: "c1", label: "Chuyên môn, hiểu biết về công việc ứng tuyển", coeff: 1.5 },
  { key: "c2", label: "Quá trình kinh nghiệm phù hợp với công việc sắp tới (hỏi kỹ về kinh nghiệm, các tình huống)", coeff: 1.5 },
  { key: "c3", label: "Kỹ năng trong công việc (kỹ năng cơ bản, kỹ năng chuyên môn)", coeff: 1.0 },
  { key: "c4", label: "Hiểu biết về công ty và nhiệm vụ sắp tới, mức độ quan tâm tới vị trí ứng tuyển", coeff: 1.0 },
  { key: "c5", label: "Khả năng nắm bắt, nhìn nhận vấn đề", coeff: 1.0 },
  { key: "c6", label: "Khả năng ngoại ngữ", coeff: 1.0 },
  { key: "c7", label: "Khả năng giao tiếp, truyền đạt thông tin", coeff: 1.0 },
  { key: "c8", label: "Ngoại hình, tính cách, tinh thần cầu tiến", coeff: 1.0 },
  { key: "c9", label: "Lợi thế đặc biệt khác", coeff: 1.0 },
];
const EVAL_CRITERIA_II = [
  { key: "m1", label: "Kỹ năng quản lý thời gian, quản lý con người, làm việc nhóm và xử lý tình huống", coeff: 1.5 },
  { key: "m2", label: "Khả năng điều hành, lập kế hoạch, tổ chức công việc và kiểm tra giám sát", coeff: 1.5 },
  { key: "m3", label: "Kinh nghiệm quản lý trước đây (Quy mô QL, phạm vi QL…)", coeff: 1.5 },
  { key: "m4", label: "Tinh thần chính trực, trách nhiệm, tác phong lãnh đạo hòa đồng – thu hút – đáng tôn trọng", coeff: 1.0 },
];
const EVAL_MAX_I = EVAL_CRITERIA_I.reduce((s, c) => s + c.coeff * 5, 0);
const EVAL_MAX_TOTAL = EVAL_MAX_I + EVAL_CRITERIA_II.reduce((s, c) => s + c.coeff * 5, 0);
const SCORE_COLS = [{ v: 1, label: "Yếu" }, { v: 2, label: "TB" }, { v: 3, label: "Khá" }, { v: 4, label: "Tốt" }, { v: 5, label: "XS" }];

function CandidateDetailModal({ candidate, showEvaluation = false, canEdit, onClose, onUpdateStatus, onSaveInterview }: {
  candidate: Candidate;
  showEvaluation?: boolean;
  canEdit: boolean;
  onClose: () => void;
  onUpdateStatus: (id: string, status: string) => void;
  onSaveInterview: (id: string, data: any) => void;
}) {
  const [interviewDate, setInterviewDate] = useState(candidate.interviewDate ? candidate.interviewDate.slice(0, 10) : "");
  const [interviewNote, setInterviewNote] = useState(candidate.interviewNote || "");
  const [interviewScore, setInterviewScore] = useState(candidate.interviewScore?.toString() || "");
  const [saving, setSaving] = useState(false);
  const [showEvalTable, setShowEvalTable] = useState(false);
  const [evalScores, setEvalScores] = useState<Record<string, number>>({});

  const totalI = EVAL_CRITERIA_I.reduce((s, c) => s + (evalScores[c.key] || 0) * c.coeff, 0);
  const totalII = EVAL_CRITERIA_II.reduce((s, c) => s + (evalScores[c.key] || 0) * c.coeff, 0);
  const totalAll = totalI + totalII;

  useEffect(() => {
    if (totalAll > 0) {
      setInterviewScore(((totalAll / EVAL_MAX_TOTAL) * 10).toFixed(1));
    }
  }, [totalAll]);

  const nextStatuses: Record<string, string[]> = {
    NEW: ["SCREENING", "REJECTED"],
    SCREENING: ["INTERVIEW", "REJECTED"],
    INTERVIEW: ["INTERVIEWED", "REJECTED", "WITHDRAWN"],
    INTERVIEWED: ["OFFERED", "REJECTED"],
    OFFERED: ["ACCEPTED", "REJECTED", "WITHDRAWN"],
  };

  async function handleSave() {
    setSaving(true);
    await onSaveInterview(candidate.id, {
      interviewDate: interviewDate || null,
      interviewNote: interviewNote || null,
      interviewScore: interviewScore ? Number(interviewScore) : null,
    });
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className={`rounded-2xl w-full mx-4 p-6 flex flex-col max-h-[90vh] overflow-y-auto transition-all duration-200 ${showEvalTable ? "max-w-5xl" : "max-w-lg"}`} style={{ background: "var(--ibs-bg-card)", border: "1px solid var(--ibs-border)" }}>
        <div className="flex items-center justify-between mb-5">
          <div>
            <div className="text-[16px] font-bold">{candidate.fullName}</div>
            <div className="text-[12px] mt-0.5" style={{ color: "var(--ibs-text-dim)" }}>
              {candidate.recruitment.positionName} · {candidate.recruitment.department.name}
            </div>
          </div>
          <button onClick={onClose}><X size={18} /></button>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <InfoRow label="SĐT" value={candidate.phone} />
          <InfoRow label="Email" value={candidate.email || "—"} />
          <InfoRow label="Người giới thiệu" value={candidate.referredBy || "—"} />
          <InfoRow label="Trạng thái" value={
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-lg" style={{ background: `${CANDIDATE_STATUS_COLORS[candidate.status]}20`, color: CANDIDATE_STATUS_COLORS[candidate.status] }}>
              {CANDIDATE_STATUS_LABELS[candidate.status]}
            </span>
          } />
        </div>

        {canEdit && (
          <>
            <div className="border-t pt-4 mb-4" style={{ borderColor: "var(--ibs-border)" }}>
              <div className="text-[12px] font-semibold mb-3" style={{ color: "var(--ibs-text-dim)" }}>Thông tin phỏng vấn</div>
              <div className="flex flex-col gap-3">
                <div>
                  <label className="text-[11px] mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Ngày phỏng vấn</label>
                  <DateInput value={interviewDate} onChange={(e) => setInterviewDate(e.target.value)}
                    className="w-full rounded-lg px-3 py-2 text-[13px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }} />
                </div>
                {(showEvaluation) && (
                <div>
                  <label className="text-[11px] mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>
                    Điểm đánh giá (1–10)
                    <span className="ml-1.5 text-[10px]" style={{ color: "var(--ibs-text-dim)" }}>— tự tính từ bảng tiêu chí bên dưới</span>
                  </label>
                  <input type="number" readOnly value={interviewScore}
                    className="w-full rounded-lg px-3 py-2 text-[13px] border"
                    style={{ background: "rgba(51,65,85,0.3)", borderColor: "var(--ibs-border)", color: interviewScore ? "var(--ibs-accent)" : "var(--ibs-text-dim)", cursor: "default", fontWeight: interviewScore ? 600 : 400 }} />
                </div>
                )}
                <div>
                  <label className="text-[11px] mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Ghi chú phỏng vấn</label>
                  <textarea rows={2} value={interviewNote} onChange={(e) => setInterviewNote(e.target.value)}
                    className="w-full rounded-lg px-3 py-2 text-[13px] border resize-none" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }} />
                </div>
              </div>
            </div>

            {/* Evaluation table — chỉ hiện khi ứng viên đang/đã phỏng vấn */}
            {(showEvaluation) && (
            <div className="border-t pt-4 mb-4" style={{ borderColor: "var(--ibs-border)" }}>
              <button onClick={() => setShowEvalTable(v => !v)}
                className="flex items-center gap-2 text-[12px] font-semibold mb-3"
                style={{ color: "var(--ibs-accent)" }}>
                <ChevronRight size={14} style={{ transform: showEvalTable ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.2s" }} />
                {showEvalTable ? "Ẩn bảng đánh giá" : "Mở bảng đánh giá tiêu chí phỏng vấn"}
                {totalAll > 0 && <span className="ml-2 px-2 py-0.5 rounded-full text-[10px]" style={{ background: "rgba(0,180,216,0.15)", color: "var(--ibs-accent)" }}>
                  {totalAll.toLocaleString("vi-VN", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} / {EVAL_MAX_TOTAL} điểm
                </span>}
              </button>

              {showEvalTable && (
                <div className="overflow-x-auto rounded-lg border" style={{ borderColor: "var(--ibs-border)" }}>
                  <table className="w-full border-collapse text-[11px]">
                    <thead>
                      <tr style={{ background: "rgba(0,180,216,0.08)" }}>
                        <th className="px-3 py-2 text-left font-semibold border-b border-r" style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-dim)", minWidth: "280px" }}>Tiêu chí</th>
                        <th className="px-2 py-2 text-center font-semibold border-b border-r" style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-dim)", whiteSpace: "nowrap" }}>Hệ số</th>
                        {SCORE_COLS.map(s => (
                          <th key={s.v} className="px-2 py-2 text-center font-semibold border-b border-r" style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-dim)", minWidth: "52px" }}>
                            {s.label}<br /><span style={{ color: "var(--ibs-accent)" }}>({s.v}đ)</span>
                          </th>
                        ))}
                        <th className="px-2 py-2 text-center font-semibold border-b" style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-dim)", whiteSpace: "nowrap" }}>Tổng</th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* Part I header */}
                      <tr style={{ background: "rgba(51,65,85,0.3)" }}>
                        <td colSpan={7} className="px-3 py-1.5 font-semibold border-b" style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-muted)", fontSize: "10px", letterSpacing: "0.05em" }}>
                          I. CÁC TIÊU CHÍ CHÍNH
                        </td>
                      </tr>
                      {EVAL_CRITERIA_I.map((cr, idx) => {
                        const s = evalScores[cr.key] || 0;
                        const pts = +(s * cr.coeff).toFixed(2);
                        return (
                          <tr key={cr.key} style={{ borderBottom: "1px solid rgba(51,65,85,0.4)" }}>
                            <td className="px-3 py-2 border-r" style={{ borderColor: "rgba(51,65,85,0.4)" }}>
                              <span style={{ color: "var(--ibs-text-dim)", marginRight: 4 }}>{idx + 1}.</span>
                              {cr.label}
                            </td>
                            <td className="px-2 py-2 text-center border-r font-semibold" style={{ borderColor: "rgba(51,65,85,0.4)", color: "var(--ibs-accent)" }}>{cr.coeff}</td>
                            {SCORE_COLS.map(sc => (
                              <td key={sc.v} className="px-2 py-2 text-center border-r" style={{ borderColor: "rgba(51,65,85,0.4)" }}>
                                <input type="radio" name={cr.key} value={sc.v}
                                  checked={evalScores[cr.key] === sc.v}
                                  onChange={() => setEvalScores(prev => ({ ...prev, [cr.key]: sc.v }))}
                                  style={{ accentColor: "var(--ibs-accent)", cursor: "pointer", width: 14, height: 14 }} />
                              </td>
                            ))}
                            <td className="px-2 py-2 text-center font-semibold" style={{ color: pts > 0 ? "var(--ibs-success)" : "var(--ibs-text-dim)" }}>
                              {pts > 0 ? pts : "—"}
                            </td>
                          </tr>
                        );
                      })}
                      {/* Part I total */}
                      <tr style={{ background: "rgba(16,185,129,0.06)", borderBottom: "1px solid rgba(51,65,85,0.4)" }}>
                        <td colSpan={2} className="px-3 py-2 font-bold border-r" style={{ borderColor: "rgba(51,65,85,0.4)", color: "var(--ibs-success)" }}>TỔNG (I)</td>
                        {SCORE_COLS.map(sc => <td key={sc.v} className="border-r" style={{ borderColor: "rgba(51,65,85,0.4)" }} />)}
                        <td className="px-2 py-2 text-center font-bold" style={{ color: "var(--ibs-success)" }}>{totalI.toLocaleString("vi-VN", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</td>
                      </tr>

                      {/* Part II header */}
                      <tr style={{ background: "rgba(51,65,85,0.3)" }}>
                        <td colSpan={7} className="px-3 py-1.5 font-semibold border-b" style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-muted)", fontSize: "10px", letterSpacing: "0.05em" }}>
                          II. CÁC TIÊU CHÍ CHO VỊ TRÍ QUẢN LÝ
                        </td>
                      </tr>
                      {EVAL_CRITERIA_II.map((cr, idx) => {
                        const s = evalScores[cr.key] || 0;
                        const pts = +(s * cr.coeff).toFixed(2);
                        return (
                          <tr key={cr.key} style={{ borderBottom: "1px solid rgba(51,65,85,0.4)" }}>
                            <td className="px-3 py-2 border-r" style={{ borderColor: "rgba(51,65,85,0.4)" }}>
                              <span style={{ color: "var(--ibs-text-dim)", marginRight: 4 }}>{idx + 1}.</span>
                              {cr.label}
                            </td>
                            <td className="px-2 py-2 text-center border-r font-semibold" style={{ borderColor: "rgba(51,65,85,0.4)", color: "var(--ibs-accent)" }}>{cr.coeff}</td>
                            {SCORE_COLS.map(sc => (
                              <td key={sc.v} className="px-2 py-2 text-center border-r" style={{ borderColor: "rgba(51,65,85,0.4)" }}>
                                <input type="radio" name={cr.key} value={sc.v}
                                  checked={evalScores[cr.key] === sc.v}
                                  onChange={() => setEvalScores(prev => ({ ...prev, [cr.key]: sc.v }))}
                                  style={{ accentColor: "var(--ibs-accent)", cursor: "pointer", width: 14, height: 14 }} />
                              </td>
                            ))}
                            <td className="px-2 py-2 text-center font-semibold" style={{ color: pts > 0 ? "var(--ibs-success)" : "var(--ibs-text-dim)" }}>
                              {pts > 0 ? pts : "—"}
                            </td>
                          </tr>
                        );
                      })}
                      {/* Part II total */}
                      <tr style={{ background: "rgba(16,185,129,0.06)", borderBottom: "1px solid rgba(51,65,85,0.4)" }}>
                        <td colSpan={2} className="px-3 py-2 font-bold border-r" style={{ borderColor: "rgba(51,65,85,0.4)", color: "var(--ibs-success)" }}>TỔNG (II)</td>
                        {SCORE_COLS.map(sc => <td key={sc.v} className="border-r" style={{ borderColor: "rgba(51,65,85,0.4)" }} />)}
                        <td className="px-2 py-2 text-center font-bold" style={{ color: "var(--ibs-success)" }}>{totalII.toLocaleString("vi-VN", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</td>
                      </tr>
                      {/* Grand total */}
                      <tr style={{ background: "rgba(0,180,216,0.08)" }}>
                        <td colSpan={2} className="px-3 py-2.5 font-bold border-r" style={{ borderColor: "rgba(51,65,85,0.4)", color: "var(--ibs-accent)" }}>TỔNG (I + II)</td>
                        {SCORE_COLS.map(sc => <td key={sc.v} className="border-r" style={{ borderColor: "rgba(51,65,85,0.4)" }} />)}
                        <td className="px-2 py-2.5 text-center font-bold text-[13px]" style={{ color: "var(--ibs-accent)" }}>
                          {totalAll.toLocaleString("vi-VN", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                          <span className="text-[10px] ml-1" style={{ color: "var(--ibs-text-dim)" }}>/{EVAL_MAX_TOTAL}</span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            )}

            {nextStatuses[candidate.status] && (
              <div className="border-t pt-4 mb-4" style={{ borderColor: "var(--ibs-border)" }}>
                <div className="text-[12px] font-semibold mb-3" style={{ color: "var(--ibs-text-dim)" }}>Chuyển trạng thái</div>
                <div className="flex flex-wrap gap-2">
                  {nextStatuses[candidate.status].map((s) => (
                    <button key={s} onClick={() => onUpdateStatus(candidate.id, s)}
                      className="text-[12px] px-3 py-1.5 rounded-lg font-semibold"
                      style={{ background: `${CANDIDATE_STATUS_COLORS[s]}20`, color: CANDIDATE_STATUS_COLORS[s] }}>
                      → {CANDIDATE_STATUS_LABELS[s]}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2 justify-end">
              <button onClick={onClose} className="px-4 py-2 rounded-lg text-[13px] border" style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-dim)" }}>Đóng</button>
              <button onClick={handleSave} disabled={saving} className="px-4 py-2 rounded-lg text-[13px] font-semibold" style={{ background: "var(--ibs-accent)", color: "#fff" }}>
                {saving ? "Đang lưu..." : "Lưu"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function RejectRequestModal({ request, onClose, onReject }: {
  request: RecruitmentRequest;
  onClose: () => void;
  onReject: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="rounded-2xl w-full max-w-md mx-4 p-6" style={{ background: "var(--ibs-bg-card)", border: "1px solid var(--ibs-border)" }}>
        <div className="text-[16px] font-bold mb-4">Từ chối đề xuất tuyển dụng</div>
        <div className="text-[13px] mb-3" style={{ color: "var(--ibs-text-dim)" }}>
          Đề xuất: <strong style={{ color: "var(--ibs-text)" }}>{request.positionName}</strong> — {request.department.name}
        </div>
        <div>
          <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Lý do từ chối *</label>
          <textarea required rows={3} value={reason} onChange={(e) => setReason(e.target.value)}
            className="w-full rounded-lg px-3 py-2 text-[13px] border resize-none" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }} />
        </div>
        <div className="flex gap-2 justify-end mt-4">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-[13px] border" style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-dim)" }}>Hủy</button>
          <button onClick={() => reason && onReject(reason)} disabled={!reason} className="px-4 py-2 rounded-lg text-[13px] font-semibold" style={{ background: "var(--ibs-danger)", color: "#fff", opacity: reason ? 1 : 0.5 }}>
            Xác nhận từ chối
          </button>
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
