"use client";

import { useState, useEffect, useMemo } from "react";
import { PageTitle } from "@/components/layout/page-title";
import { DataTable, Column } from "@/components/shared/data-table";
import { formatDate, apiError } from "@/lib/utils";
import { Plus, RefreshCw, X, Check, ChevronRight, Users, ClipboardList, FileText, Download } from "lucide-react";
import { useCan } from "@/hooks/use-permission";
import { DateInput } from "@/components/shared/date-input";
import { FileUpload } from "@/components/shared/file-upload";
import { BUCKETS } from "@/lib/minio-constants";
import { viewUrl } from "@/lib/use-presigned-url";

type Department = { id: string; code: string; name: string };

type RecruitmentRequest = {
  id: string;
  positionName: string;
  jobDescription?: string;
  quantity: number;
  reason: string;
  requirements: string;
  degreeRequirement?: string;
  salaryMin?: number | null;
  salaryMax?: number | null;
  recruitFrom?: string | null;
  recruitTo?: string | null;
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
  interviewTime?: string;
  interviewLocation?: string;
  interviewContact?: string;
  interviewInviteSentAt?: string;
  interviewNote?: string;
  interviewScore?: number;
  createdAt: string;
  recruitment: {
    positionName: string;
    department: { id: string; name: string };
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

// Các mốc giờ phỏng vấn (07:00–18:00, mỗi 30 phút).
const INTERVIEW_TIME_OPTIONS: string[] = (() => {
  const arr: string[] = [];
  for (let h = 7; h <= 18; h++) {
    for (const m of [0, 30]) arr.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
  }
  return arr;
})();

// Đề xuất hết hạn tuyển: quá ngày "tuyển đến" (và không phải đã từ chối).
function isReqExpired(r: { recruitTo?: string | null; status: string }): boolean {
  if (!r.recruitTo || r.status === "REJECTED") return false;
  const end = new Date(r.recruitTo);
  end.setHours(23, 59, 59, 999);
  return end.getTime() < Date.now();
}
const fmtSalary = (n?: number | null) => (n ? n.toLocaleString("vi-VN") : "");
function salaryRange(min?: number | null, max?: number | null): string {
  if (!min && !max) return "—";
  if (min && max) return `${fmtSalary(min)} – ${fmtSalary(max)}`;
  return min ? `Từ ${fmtSalary(min)}` : `Đến ${fmtSalary(max)}`;
}

type Tab = "requests" | "pipeline";

export default function TuyenDungPage() {
  const [activeTab, setActiveTab] = useState<Tab>("requests");
  const [requests, setRequests] = useState<RecruitmentRequest[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loadingReqs, setLoadingReqs] = useState(true);
  const [loadingCands, setLoadingCands] = useState(true);
  const [candStatusFilter, setCandStatusFilter] = useState("");
  const [candFrom, setCandFrom] = useState("");
  const [candTo, setCandTo] = useState("");
  const can = useCan();

  // Modals
  const [showNewRequest, setShowNewRequest] = useState(false);
  const [showNewCandidate, setShowNewCandidate] = useState(false);
  const [showCandidateDetail, setShowCandidateDetail] = useState<{ candidate: Candidate } | null>(null);
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
    // Cập nhật modal in-place (không đóng) để user thấy stage mới + làm tiếp
    setShowCandidateDetail((prev) =>
      prev && prev.candidate.id === id
        ? { ...prev, candidate: { ...prev.candidate, status } }
        : prev
    );
    // Trường hợp ACCEPTED (chỉ còn từ đường candidates PUT cũ — UI mới đã bỏ): hiện popup credentials + đóng modal
    if (status === "ACCEPTED" && data.data?.createdEmployee) {
      setCreatedEmployee(data.data.createdEmployee);
      setShowCandidateDetail(null);
    }
  }

  const tabs: { key: Tab; label: string; icon: React.ReactNode; count?: number }[] = [
    { key: "requests", label: "Đề xuất tuyển", icon: <ClipboardList size={15} />, count: requests.filter(r => r.status === "PENDING").length },
    { key: "pipeline", label: "Pipeline ứng viên", icon: <Users size={15} />, count: candidates.filter(c => !["ACCEPTED","REJECTED","WITHDRAWN"].includes(c.status)).length },
  ];

  // Lọc ứng viên theo trạng thái + ngày nộp.
  const filteredCandidates = useMemo(() => candidates.filter((c) => {
    if (candStatusFilter && c.status !== candStatusFilter) return false;
    if (candFrom && new Date(c.createdAt) < new Date(candFrom)) return false;
    if (candTo) { const end = new Date(candTo); end.setHours(23, 59, 59, 999); if (new Date(c.createdAt) > end) return false; }
    return true;
  }), [candidates, candStatusFilter, candFrom, candTo]);

  async function handleExportCandidates() {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Ứng viên");
    ws.columns = [
      { header: "Họ tên", key: "fullName", width: 24 },
      { header: "SĐT", key: "phone", width: 14 },
      { header: "Email", key: "email", width: 26 },
      { header: "Vị trí ứng tuyển", key: "position", width: 22 },
      { header: "Phòng ban", key: "dept", width: 18 },
      { header: "Trạng thái", key: "status", width: 14 },
      { header: "Ngày nộp", key: "createdAt", width: 14 },
      { header: "Ngày PV", key: "interviewDate", width: 14 },
      { header: "Điểm PV", key: "score", width: 10 },
      { header: "Người giới thiệu", key: "referredBy", width: 18 },
    ];
    ws.getRow(1).font = { bold: true };
    filteredCandidates.forEach((c) => ws.addRow({
      fullName: c.fullName, phone: c.phone, email: c.email || "",
      position: c.recruitment?.positionName || "", dept: c.recruitment?.department?.name || "",
      status: CANDIDATE_STATUS_LABELS[c.status] || c.status,
      createdAt: c.createdAt ? formatDate(c.createdAt) : "",
      interviewDate: c.interviewDate ? formatDate(c.interviewDate) : "",
      score: c.interviewScore ?? "", referredBy: c.referredBy || "",
    }));
    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ung-vien_${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const requestColumns: Column<RecruitmentRequest>[] = [
    { key: "positionName", header: "Vị trí tuyển", render: (r) => (
      <div className="min-w-0">
        <div className="font-semibold">{r.positionName}</div>
        {r.jobDescription && <div className="text-[11px] truncate max-w-[240px]" title={r.jobDescription} style={{ color: "var(--ibs-text-dim)" }}>{r.jobDescription}</div>}
        {r.degreeRequirement && <div className="text-[11px] truncate max-w-[240px]" title={r.degreeRequirement} style={{ color: "var(--ibs-text-dim)" }}>🎓 {r.degreeRequirement}</div>}
      </div>
    )},
    { key: "department", header: "Phòng ban", render: (r) => r.department.name },
    { key: "quantity", header: "SL", render: (r) => r.quantity },
    { key: "salary", header: "Mức lương", render: (r) => <span className="text-[12px]">{salaryRange(r.salaryMin, r.salaryMax)}</span> },
    { key: "period", header: "Thời gian tuyển", render: (r) => (
      (r.recruitFrom || r.recruitTo)
        ? <span className="text-[12px]">{r.recruitFrom ? formatDate(r.recruitFrom) : "…"} – {r.recruitTo ? formatDate(r.recruitTo) : "…"}</span>
        : <span style={{ color: "var(--ibs-text-dim)" }}>—</span>
    )},
    { key: "status", header: "Trạng thái", render: (r) => {
      if (isReqExpired(r)) return (
        <span className="text-[11px] font-semibold px-2 py-1 rounded-lg" style={{ background: "rgba(148,163,184,0.18)", color: "var(--ibs-text-muted)" }}>Hết hạn</span>
      );
      return (
        <span className="text-[11px] font-semibold px-2 py-1 rounded-lg" style={{
          background: r.status === "APPROVED" ? "rgba(34,197,94,0.12)" : r.status === "REJECTED" ? "rgba(239,68,68,0.12)" : "rgba(0,180,216,0.12)",
          color: r.status === "APPROVED" ? "var(--ibs-success)" : r.status === "REJECTED" ? "var(--ibs-danger)" : "var(--ibs-accent)",
        }}>
          {REQUEST_STATUS_LABELS[r.status] || r.status}
        </span>
      );
    }},
    { key: "candidates", header: "Ứng viên", render: (r) => (
      <span className="text-[12px]">{r.candidates.length} UV</span>
    )},
    { key: "createdAt", header: "Ngày tạo", render: (r) => formatDate(r.createdAt) },
    { key: "actions", header: "", render: (r) => (
      <div className="flex gap-2">
        {r.status === "PENDING" && can("m4.yeucau:create") && (
          <>
            <button onClick={() => handleApproveRequest(r)} className="text-[11px] px-2 py-1 rounded-lg font-semibold" style={{ background: "rgba(34,197,94,0.15)", color: "var(--ibs-success)" }}>
              Duyệt
            </button>
            <button onClick={() => setRejectingReq(r)} className="text-[11px] px-2 py-1 rounded-lg font-semibold" style={{ background: "rgba(239,68,68,0.15)", color: "var(--ibs-danger)" }}>
              Từ chối
            </button>
          </>
        )}
        {r.status === "APPROVED" && !isReqExpired(r) && can("m4.ungvien:create") && (
          <button onClick={() => { setShowNewCandidate(true); }} className="text-[11px] px-2 py-1 rounded-lg" style={{ background: "rgba(0,180,216,0.1)", color: "var(--ibs-accent)" }}>
            + Ứng viên
          </button>
        )}
        {r.status === "APPROVED" && isReqExpired(r) && (
          <span className="text-[11px] px-2 py-1 rounded-lg" style={{ background: "rgba(148,163,184,0.15)", color: "var(--ibs-text-muted)" }} title="Đã hết thời gian tuyển dụng">Hết hạn tuyển</span>
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
    { key: "cv", header: "CV", render: (c) => c.resumeUrl
      ? <a href={viewUrl(c.resumeUrl)} target="_blank" rel="noreferrer" download onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-md font-semibold" style={{ background: "rgba(0,180,216,0.12)", color: "var(--ibs-accent)" }}><FileText size={11} /> Tải</a>
      : <span style={{ color: "var(--ibs-text-dim)" }}>—</span> },
    { key: "interviewDate", header: "Ngày PV", render: (c) => c.interviewDate ? formatDate(c.interviewDate) : <span style={{ color: "var(--ibs-text-dim)" }}>—</span> },
    { key: "interviewScore", header: "Điểm PV", render: (c) => c.interviewScore ? <span style={{ color: "var(--ibs-accent)", fontWeight: 600 }}>{c.interviewScore}/10</span> : <span style={{ color: "var(--ibs-text-dim)" }}>—</span> },
    { key: "createdAt", header: "Ngày nộp", render: (c) => formatDate(c.createdAt) },
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
              {can("m4.yeucau:create") && (
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
              {can("m4.ungvien:create") && (
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

          {/* Filter ứng viên: trạng thái + ngày nộp + export */}
          <div className="flex flex-wrap items-center gap-3 px-5 pb-3">
            <select value={candStatusFilter} onChange={(e) => setCandStatusFilter(e.target.value)} className="px-3 py-2 rounded-lg text-[13px] outline-none" style={{ background: "var(--ibs-bg)", border: "1px solid var(--ibs-border)", color: "var(--ibs-text)" }}>
              <option value="">Tất cả trạng thái</option>
              {Object.entries(CANDIDATE_STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <div className="flex items-center gap-2">
              <span className="text-[12px]" style={{ color: "var(--ibs-text-dim)" }}>Ngày nộp:</span>
              <DateInput value={candFrom} onChange={(e) => setCandFrom(e.target.value)} className="px-3 py-2 rounded-lg text-[13px] outline-none" style={{ background: "var(--ibs-bg)", border: "1px solid var(--ibs-border)", color: "var(--ibs-text)" }} />
              <span style={{ color: "var(--ibs-text-dim)" }}>–</span>
              <DateInput value={candTo} min={candFrom} onChange={(e) => setCandTo(e.target.value)} className="px-3 py-2 rounded-lg text-[13px] outline-none" style={{ background: "var(--ibs-bg)", border: "1px solid var(--ibs-border)", color: "var(--ibs-text)" }} />
            </div>
            {(candStatusFilter || candFrom || candTo) && (
              <button onClick={() => { setCandStatusFilter(""); setCandFrom(""); setCandTo(""); }} className="text-[12px] underline" style={{ color: "var(--ibs-text-muted)" }}>Xóa lọc</button>
            )}
            <span className="text-[12px]" style={{ color: "var(--ibs-text-dim)" }}>{filteredCandidates.length} ứng viên</span>
            <button onClick={handleExportCandidates} className="ml-auto flex items-center gap-1.5 text-[13px] px-3 py-2 rounded-lg font-medium border" style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-muted)" }}>
              <Download size={14} /> Export Excel
            </button>
          </div>

          <DataTable columns={candidateColumns} data={filteredCandidates} loading={loadingCands} emptyText="Không có ứng viên khớp bộ lọc" onRowClick={(c) => setShowCandidateDetail({ candidate: c })} />
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
          showEvaluation={true}
          canEdit={can("m4.ungvien:edit")}
          onClose={() => setShowCandidateDetail(null)}
          onUpdateStatus={handleUpdateCandidateStatus}
          onSaveInterview={async (id, data) => {
            const cs = showCandidateDetail.candidate.status;
            // SCREENING + có ngày PV → soạn & GỬI THƯ MỜI PHỎNG VẤN (email) + chuyển sang Hẹn PV.
            if (data.interviewDate && cs === "SCREENING") {
              const res = await fetch(`/api/v1/recruitment/candidates/${id}/send-interview-invite`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  interviewDate: data.interviewDate,
                  interviewTime: data.interviewTime,
                  interviewLocation: data.interviewLocation,
                  interviewContact: data.interviewContact,
                  interviewNote: data.interviewNote,
                }),
              });
              if (!res.ok) {
                const j = await res.json().catch(() => null);
                alert(apiError(res.status, j?.error) || "Gửi thư mời phỏng vấn thất bại");
                return;
              }
              fetchCandidates();
              setShowCandidateDetail(null);
              return;
            }
            // Các trường hợp khác (vd INTERVIEW → INTERVIEWED): cập nhật thường.
            const payload: Record<string, unknown> = { ...data };
            if (cs === "INTERVIEW") payload.status = "INTERVIEWED";
            await fetch(`/api/v1/recruitment/candidates/${id}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });
            fetchCandidates();
            setShowCandidateDetail((prev) =>
              prev && prev.candidate.id === id
                ? { ...prev, candidate: { ...prev.candidate, ...payload } as Candidate }
                : prev
            );
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
  const [form, setForm] = useState({ departmentId: "", positionName: "", jobDescription: "", quantity: 1, reason: "", requirements: "", degreeRequirement: "", salaryMin: "", salaryMax: "", recruitFrom: "", recruitTo: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch("/api/v1/recruitment/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        quantity: Number(form.quantity),
        salaryMin: form.salaryMin ? Number(form.salaryMin) : null,
        salaryMax: form.salaryMax ? Number(form.salaryMax) : null,
        recruitFrom: form.recruitFrom || null,
        recruitTo: form.recruitTo || null,
      }),
    });
    setSaving(false);
    if (res.ok) { onSuccess(); } else {
      const data = await res.json();
      setError(apiError(res.status, data.error));
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="rounded-2xl w-full max-w-lg mx-4 p-6 max-h-[90vh] overflow-y-auto" style={{ background: "var(--ibs-bg-card)", border: "1px solid var(--ibs-border)" }}>
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
            <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Mô tả vị trí công việc</label>
            <textarea rows={2} value={form.jobDescription} onChange={(e) => setForm({ ...form, jobDescription: e.target.value })}
              className="w-full rounded-lg px-3 py-2 text-[13px] border resize-none" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }}
              placeholder="Mô tả công việc, nhiệm vụ chính của vị trí..." />
          </div>
          <div>
            <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Số lượng *</label>
            <input type="number" required min={1} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })}
              className="w-full rounded-lg px-3 py-2 text-[13px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }} />
          </div>
          <div>
            <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Mức lương (VNĐ/tháng)</label>
            <div className="flex items-center gap-2">
              <input type="text" inputMode="numeric" value={form.salaryMin ? Number(form.salaryMin).toLocaleString("vi-VN") : ""}
                onChange={(e) => setForm({ ...form, salaryMin: e.target.value.replace(/\D/g, "") })} placeholder="Từ"
                className="w-full rounded-lg px-3 py-2 text-[13px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }} />
              <span style={{ color: "var(--ibs-text-dim)" }}>–</span>
              <input type="text" inputMode="numeric" value={form.salaryMax ? Number(form.salaryMax).toLocaleString("vi-VN") : ""}
                onChange={(e) => setForm({ ...form, salaryMax: e.target.value.replace(/\D/g, "") })} placeholder="Đến"
                className="w-full rounded-lg px-3 py-2 text-[13px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }} />
            </div>
          </div>
          <div>
            <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Thời gian tuyển</label>
            <div className="flex items-center gap-2">
              <DateInput value={form.recruitFrom} onChange={(e) => setForm({ ...form, recruitFrom: e.target.value })}
                className="w-full rounded-lg px-3 py-2 text-[13px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }} />
              <span style={{ color: "var(--ibs-text-dim)" }}>–</span>
              <DateInput value={form.recruitTo} onChange={(e) => setForm({ ...form, recruitTo: e.target.value })}
                className="w-full rounded-lg px-3 py-2 text-[13px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }} />
            </div>
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
              placeholder="Kinh nghiệm, kỹ năng..." />
          </div>
          <div>
            <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Yêu cầu về bằng cấp</label>
            <textarea rows={2} value={form.degreeRequirement} onChange={(e) => setForm({ ...form, degreeRequirement: e.target.value })}
              className="w-full rounded-lg px-3 py-2 text-[13px] border resize-none" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }}
              placeholder="VD: Tốt nghiệp CĐ/ĐH chuyên ngành cơ khí; chứng chỉ hàn..." />
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
    setError("");
    const email = form.email.trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Vui lòng nhập email hợp lệ (bắt buộc — dùng để gửi thư mời nhận việc).");
      return;
    }
    setSaving(true);
    const body: any = { recruitmentId: form.recruitmentId, fullName: form.fullName, phone: form.phone, email };
    if (form.referredBy) body.referredBy = form.referredBy;
    if (form.resumeUrl) body.resumeUrl = form.resumeUrl;
    const res = await fetch("/api/v1/recruitment/candidates", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    setSaving(false);
    if (res.ok) { onSuccess(); } else {
      const data = await res.json();
      setError(apiError(res.status, data.error));
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
            <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Email *</label>
            <input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="ungvien@email.com"
              className="w-full rounded-lg px-3 py-2 text-[13px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }} />
          </div>
          <div>
            <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Người giới thiệu</label>
            <input value={form.referredBy} onChange={(e) => setForm({ ...form, referredBy: e.target.value })}
              className="w-full rounded-lg px-3 py-2 text-[13px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }} />
          </div>
          <div>
            <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>File CV ứng viên</label>
            {form.resumeUrl ? (
              <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-[12px]" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)" }}>
                <a href={viewUrl(form.resumeUrl)} target="_blank" rel="noreferrer" className="flex items-center gap-1 truncate" style={{ color: "var(--ibs-accent)" }}><FileText size={12} /> Đã tải CV — bấm để xem</a>
                <button type="button" onClick={() => setForm((f) => ({ ...f, resumeUrl: "" }))} style={{ color: "var(--ibs-danger)" }}><X size={13} /></button>
              </div>
            ) : (
              <FileUpload bucket={BUCKETS.HR_DOCUMENTS} folder="cv" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" label="Tải CV lên (PDF / DOC / ảnh)" onUploaded={(r) => setForm((f) => ({ ...f, resumeUrl: r.url }))} onError={(msg) => setError(msg)} />
            )}
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
  const [interviewTime, setInterviewTime] = useState(candidate.interviewTime || "");
  const [interviewLocation, setInterviewLocation] = useState(candidate.interviewLocation || "");
  const [interviewContact, setInterviewContact] = useState(candidate.interviewContact || "");
  const [interviewers, setInterviewers] = useState<{ id: string; fullName: string; code?: string; jobRole?: string | null }[]>([]);
  const [interviewScore, setInterviewScore] = useState(candidate.interviewScore?.toString() || "");

  // Người phỏng vấn: chỉ NV (đang làm) thuộc phòng ban của đề xuất tuyển dụng.
  useEffect(() => {
    if (candidate.status !== "SCREENING") return;
    const deptId = candidate.recruitment.department?.id;
    if (!deptId) return;
    fetch(`/api/v1/employees?departmentId=${deptId}&limit=500`)
      .then((r) => r.json())
      .then((res) => setInterviewers((res.data || []).filter((e: any) => ["ACTIVE", "PROBATION"].includes(e.status))))
      .catch(() => {});
  }, [candidate.status, candidate.recruitment.department?.id]);
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

  // Workflow chuẩn (stage-aware):
  //  - NEW → SCREENING: nút "→ Sàng lọc UV này" (không cần form)
  //  - SCREENING → INTERVIEW: form Ngày PV bắt buộc + nút "Lưu & Hẹn phỏng vấn"
  //  - INTERVIEW → INTERVIEWED: form Bộ tiêu chí + nút "Lưu & Đánh dấu Đã PV"
  //  - INTERVIEWED+: chỉ banner CTA "→ Sang tab Thư mời"
  //  - OFFERED → ACCEPTED/DECLINED: tự động ở Tab 2 mark-result
  // Negative actions (Loại / Rút lui): hiện theo stage ở action bar dưới cùng.

  async function handleSave() {
    setSaving(true);
    await onSaveInterview(candidate.id, {
      interviewDate: interviewDate || null,
      interviewTime: interviewTime || null,
      interviewLocation: interviewLocation || null,
      interviewContact: interviewContact || null,
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

        {candidate.resumeUrl ? (
          <a href={viewUrl(candidate.resumeUrl)} target="_blank" rel="noreferrer" download
            className="flex items-center justify-center gap-2 mb-4 px-3 py-2.5 rounded-lg text-[13px] font-semibold border"
            style={{ background: "rgba(0,180,216,0.1)", borderColor: "var(--ibs-accent)", color: "var(--ibs-accent)" }}>
            <FileText size={15} /> Xem / Tải CV ứng viên
          </a>
        ) : (
          <div className="mb-4 px-3 py-2 rounded-lg text-[12px]" style={{ background: "var(--ibs-bg)", color: "var(--ibs-text-dim)" }}>
            Ứng viên này chưa có file CV.
          </div>
        )}

        {candidate.interviewDate && ["INTERVIEW", "INTERVIEWED", "OFFERED"].includes(candidate.status) && (
          <div className="mb-4 px-3 py-2.5 rounded-lg text-[12px]" style={{ background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.25)" }}>
            <div className="font-semibold mb-0.5" style={{ color: "var(--ibs-success)" }}>📅 Lịch phỏng vấn{candidate.interviewInviteSentAt ? " · ✓ đã gửi thư mời" : ""}</div>
            <div style={{ color: "var(--ibs-text-dim)" }}>
              {candidate.interviewTime ? `${candidate.interviewTime} · ` : ""}{formatDate(candidate.interviewDate)}
              {candidate.interviewLocation ? ` · ${candidate.interviewLocation}` : ""}
              {candidate.interviewContact ? ` · LH: ${candidate.interviewContact}` : ""}
            </div>
          </div>
        )}

        {canEdit && (
          <>
            {/* Form chỉ hiện khi cần — SCREENING (hẹn PV) hoặc INTERVIEW (đánh giá) */}
            {(candidate.status === "SCREENING" || candidate.status === "INTERVIEW") && (
            <div className="border-t pt-4 mb-4" style={{ borderColor: "var(--ibs-border)" }}>
              <div className="text-[12px] font-semibold mb-3" style={{ color: "var(--ibs-text-dim)" }}>
                {candidate.status === "SCREENING" ? "Hẹn lịch phỏng vấn" : "Thông tin phỏng vấn"}
              </div>
              <div className="flex flex-col gap-3">
                <div>
                  <label className="text-[11px] mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>
                    Ngày phỏng vấn {candidate.status === "SCREENING" && <span style={{ color: "var(--ibs-danger)" }}>*</span>}
                  </label>
                  <DateInput value={interviewDate} onChange={(e) => setInterviewDate(e.target.value)}
                    className="w-full rounded-lg px-3 py-2 text-[13px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }} />
                </div>
                {candidate.status === "SCREENING" && (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Giờ phỏng vấn <span style={{ color: "var(--ibs-danger)" }}>*</span></label>
                        <select value={interviewTime} onChange={(e) => setInterviewTime(e.target.value)}
                          className="w-full rounded-lg px-3 py-2 text-[13px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }}>
                          <option value="">-- Chọn giờ --</option>
                          {INTERVIEW_TIME_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                          {interviewTime && !INTERVIEW_TIME_OPTIONS.includes(interviewTime) && <option value={interviewTime}>{interviewTime}</option>}
                        </select>
                      </div>
                      <div>
                        <label className="text-[11px] mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Người phỏng vấn <span style={{ color: "var(--ibs-text-dim)" }}>({candidate.recruitment.department.name})</span></label>
                        <select value={interviewContact} onChange={(e) => setInterviewContact(e.target.value)}
                          className="w-full rounded-lg px-3 py-2 text-[13px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }}>
                          <option value="">-- Chọn người phỏng vấn --</option>
                          {interviewers.map((e) => {
                            const label = `${e.fullName}${e.jobRole ? ` — ${e.jobRole}` : ""}`;
                            return <option key={e.id} value={label}>{label}</option>;
                          })}
                          {/* Giữ giá trị cũ nếu không nằm trong danh sách (vd đã chọn trước đó) */}
                          {interviewContact && !interviewers.some((e) => `${e.fullName}${e.jobRole ? ` — ${e.jobRole}` : ""}` === interviewContact) && (
                            <option value={interviewContact}>{interviewContact}</option>
                          )}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="text-[11px] mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Địa điểm phỏng vấn</label>
                      <input value={interviewLocation} onChange={(e) => setInterviewLocation(e.target.value)} placeholder="Để trống = VP Công ty (Km6 QL5, Hồng Bàng, Hải Phòng)"
                        className="w-full rounded-lg px-3 py-2 text-[13px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }} />
                    </div>
                  </>
                )}
                {candidate.status === "INTERVIEW" && (
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
                  <label className="text-[11px] mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Ghi chú</label>
                  <textarea rows={2} value={interviewNote} onChange={(e) => setInterviewNote(e.target.value)}
                    className="w-full rounded-lg px-3 py-2 text-[13px] border resize-none" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }} />
                </div>
              </div>
            </div>
            )}

            {/* Banner cho stage hậu PV — INTERVIEWED / OFFERED */}
            {["INTERVIEWED", "OFFERED"].includes(candidate.status) && (
              <div className="border-t pt-4 mb-4" style={{ borderColor: "var(--ibs-border)" }}>
                <div className="p-3 rounded-lg text-[12px]" style={{ background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.3)", color: "var(--ibs-text)" }}>
                  <div className="font-semibold mb-1" style={{ color: "var(--ibs-success)" }}>
                    {candidate.status === "INTERVIEWED" ? "✓ Đã phỏng vấn xong" : "✓ Đã gửi thư mời (OFFERED)"}
                  </div>
                  <div style={{ color: "var(--ibs-text-dim)" }}>
                    Sang tab <strong style={{ color: "var(--ibs-accent)" }}>Thư mời (Offer)</strong> để {candidate.status === "INTERVIEWED" ? "soạn thư mời nhận việc cho UV này" : "theo dõi/đánh dấu phản hồi UV"}.
                  </div>
                </div>
              </div>
            )}

            {/* Evaluation table — chỉ hiện khi ứng viên đang phỏng vấn (INTERVIEW) */}
            {(candidate.status === "INTERVIEW") && (
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

            {/* Stage-aware action bar: nút phụ (đỏ) bên trái, primary (chính) bên phải */}
            <div className="flex items-center justify-between gap-2 pt-3 border-t flex-wrap" style={{ borderColor: "var(--ibs-border)" }}>
              {/* Nút phụ — Loại / Rút lui (theo stage) */}
              <div className="flex gap-2 flex-wrap">
                {["NEW", "SCREENING"].includes(candidate.status) && (
                  <button type="button" onClick={() => onUpdateStatus(candidate.id, "REJECTED")}
                    className="text-[12px] px-3 py-1.5 rounded-lg font-semibold"
                    style={{ background: "rgba(239,68,68,0.15)", color: "var(--ibs-danger)" }}>
                    → Loại UV
                  </button>
                )}
                {candidate.status === "INTERVIEW" && (
                  <>
                    <button type="button" onClick={() => onUpdateStatus(candidate.id, "REJECTED")}
                      className="text-[12px] px-3 py-1.5 rounded-lg font-semibold"
                      style={{ background: "rgba(239,68,68,0.15)", color: "var(--ibs-danger)" }}>
                      → Loại
                    </button>
                    <button type="button" onClick={() => onUpdateStatus(candidate.id, "WITHDRAWN")}
                      className="text-[12px] px-3 py-1.5 rounded-lg font-semibold"
                      style={{ background: "rgba(107,114,128,0.18)", color: "var(--ibs-text-dim)" }}>
                      → UV rút lui
                    </button>
                  </>
                )}
              </div>

              {/* Nút chính — Đóng + 1 nút action duy nhất theo stage */}
              <div className="flex gap-2">
                <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-[13px] border" style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-dim)" }}>Đóng</button>

                {candidate.status === "NEW" && (
                  <button type="button" onClick={() => onUpdateStatus(candidate.id, "SCREENING")}
                    className="px-4 py-2 rounded-lg text-[13px] font-semibold"
                    style={{ background: "var(--ibs-accent)", color: "#fff" }}>
                    → Sàng lọc UV này
                  </button>
                )}

                {candidate.status === "SCREENING" && (
                  <button type="button" onClick={handleSave} disabled={saving || !interviewDate || !interviewTime}
                    title={!interviewDate ? "Vui lòng chọn Ngày phỏng vấn" : !interviewTime ? "Vui lòng chọn Giờ phỏng vấn" : ""}
                    className="px-4 py-2 rounded-lg text-[13px] font-semibold"
                    style={{ background: "var(--ibs-accent)", color: "#fff", opacity: saving || !interviewDate || !interviewTime ? 0.5 : 1 }}>
                    {saving ? "Đang gửi..." : "Lưu & Gửi thư mời PV"}
                  </button>
                )}

                {candidate.status === "INTERVIEW" && (
                  <button type="button" onClick={handleSave} disabled={saving}
                    className="px-4 py-2 rounded-lg text-[13px] font-semibold"
                    style={{ background: "var(--ibs-accent)", color: "#fff" }}>
                    {saving ? "Đang lưu..." : "Lưu & Đánh dấu Đã PV"}
                  </button>
                )}

                {/* INTERVIEWED/OFFERED: không có primary action — user phải sang tab Thư mời */}
              </div>
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
