"use client";

import { useEffect, useMemo, useState } from "react";
import { PageTitle } from "@/components/layout/page-title";
import { DateInput } from "@/components/shared/date-input";
import { formatDate, formatVND, apiError } from "@/lib/utils";
import { usePermission } from "@/hooks/use-permission";
import { confirmDialog, alertDialog } from "@/lib/confirm-dialog";
import {
  Plus, RefreshCw, X, Check, Clock, ClipboardCheck, Send, FileText,
  ChevronRight, ThumbsUp, ThumbsDown, AlertCircle, Mail, Award,
} from "lucide-react";

// ============== TYPES ==============
type Candidate = {
  id: string; fullName: string; phone: string; email?: string | null; status: string;
  recruitment: { positionName: string; department: { id: string; name: string } };
};
type OfferLetter = {
  id: string;
  candidateId: string;
  letterNumber: string;
  position: string;
  departmentName: string | null;
  workLocation: string;
  officialSalary: number | string;
  probationarySalary: number | string;
  probationDays: number;
  startDate: string;
  probationEndDate: string;
  benefits: string | null;
  body: string | null;
  status: "DRAFT" | "PENDING_HR_MGR" | "APPROVED" | "REJECTED" | "SENT" | "ACCEPTED" | "DECLINED" | "EXPIRED";
  submittedAt?: string | null;
  approvedAt?: string | null;
  rejectComments?: string | null;
  sentAt?: string | null;
  sentToEmail?: string | null;
  pdfUrl?: string | null;
  expiresAt?: string | null;
  acceptedAt?: string | null;
  declinedAt?: string | null;
  candidateNote?: string | null;
  createdAt: string;
  candidate: Candidate;
};

const STATUS_INFO: Record<OfferLetter["status"], { label: string; color: string; bg: string }> = {
  DRAFT:           { label: "Nháp",                color: "var(--ibs-text-dim)", bg: "rgba(100,116,139,0.15)" },
  PENDING_HR_MGR:  { label: "Chờ TP HCNS duyệt",   color: "var(--ibs-accent)",   bg: "rgba(0,180,216,0.12)" },
  APPROVED:        { label: "Đã duyệt (chưa gửi)", color: "#f59e0b",             bg: "rgba(245,158,11,0.12)" },
  REJECTED:        { label: "TP trả lại",          color: "var(--ibs-danger)",   bg: "rgba(239,68,68,0.12)" },
  SENT:            { label: "Đã gửi UV",           color: "#3b82f6",             bg: "rgba(59,130,246,0.12)" },
  ACCEPTED:        { label: "UV chấp nhận",        color: "var(--ibs-success)",  bg: "rgba(34,197,94,0.18)" },
  DECLINED:        { label: "UV từ chối",          color: "#dc2626",             bg: "rgba(220,38,38,0.18)" },
  EXPIRED:         { label: "Quá hạn 7 ngày",      color: "#6b7280",             bg: "rgba(107,114,128,0.18)" },
};

// ============== MAIN ==============
export default function OfferLettersPage() {
  const { canDo, hasRole } = usePermission();
  const [list, setList] = useState<OfferLetter[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<"" | OfferLetter["status"]>("");
  const [showCreate, setShowCreate] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  function fetchList() {
    setLoading(true);
    fetch("/api/v1/recruitment/offer-letters")
      .then((r) => r.json())
      .then((res) => setList(res.data || []))
      .finally(() => setLoading(false));
  }

  useEffect(() => { fetchList(); }, []);

  const filtered = useMemo(() => {
    if (!filterStatus) return list;
    return list.filter((o) => o.status === filterStatus);
  }, [list, filterStatus]);

  const stats = useMemo(() => ({
    pending: list.filter((o) => o.status === "PENDING_HR_MGR").length,
    sent:    list.filter((o) => o.status === "SENT").length,
    accepted:list.filter((o) => o.status === "ACCEPTED").length,
    declined:list.filter((o) => ["DECLINED", "EXPIRED"].includes(o.status)).length,
  }), [list]);

  const detail = detailId ? list.find((o) => o.id === detailId) || null : null;

  return (
    <div>
      <PageTitle
        title="Thư mời nhận việc (Offer Letter)"
        description="HR soạn → TP HCNS duyệt → Hệ thống tự gửi email kèm PDF cho UV (SLA 7 ngày)"
      />

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <StatCard label="Chờ TP duyệt" value={stats.pending}  icon={<Clock size={18} />}        color="var(--ibs-accent)" />
        <StatCard label="Đã gửi UV"    value={stats.sent}     icon={<Send size={18} />}         color="#3b82f6" />
        <StatCard label="UV chấp nhận" value={stats.accepted} icon={<Award size={18} />}        color="var(--ibs-success)" />
        <StatCard label="Từ chối/Hết hạn" value={stats.declined} icon={<AlertCircle size={18} />} color="var(--ibs-danger)" />
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
        <div className="flex gap-1 p-1 rounded-xl flex-wrap" style={{ background: "var(--ibs-bg-card)", border: "1px solid var(--ibs-border)" }}>
          {([
            ["", "Tất cả"],
            ["DRAFT", "Nháp"],
            ["PENDING_HR_MGR", "Chờ duyệt"],
            ["SENT", "Đã gửi"],
            ["ACCEPTED", "Chấp nhận"],
            ["DECLINED", "Từ chối"],
            ["EXPIRED", "Hết hạn"],
          ] as const).map(([k, label]) => (
            <button key={k} type="button" onClick={() => setFilterStatus(k as any)}
              className="px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all"
              style={{
                background: filterStatus === k ? "var(--ibs-accent)" : "transparent",
                color: filterStatus === k ? "#fff" : "var(--ibs-text-dim)",
              }}
            >{label}</button>
          ))}
        </div>
        <div className="flex gap-2">
          <button onClick={fetchList} className="p-2 rounded-lg hover:opacity-70" style={{ color: "var(--ibs-text-dim)" }}><RefreshCw size={15} /></button>
          {canDo("recruitment", "create") && (
            <button onClick={() => setShowCreate(true)} className="flex items-center gap-1.5 text-[13px] px-3 py-2 rounded-lg font-semibold" style={{ background: "var(--ibs-accent)", color: "#fff" }}>
              <Plus size={14} /> Soạn thư mời
            </button>
          )}
        </div>
      </div>

      {/* List */}
      <div className="rounded-xl border" style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
        {loading ? (
          <div className="p-12 text-center text-[13px]" style={{ color: "var(--ibs-text-dim)" }}>Đang tải...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center" style={{ color: "var(--ibs-text-dim)" }}>
            <Mail size={40} className="mx-auto mb-2 opacity-30" />
            <div className="text-[13px]">Chưa có thư mời nào</div>
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: "var(--ibs-border)" }}>
            {filtered.map((o) => <OfferRow key={o.id} item={o} onClick={() => setDetailId(o.id)} />)}
          </div>
        )}
      </div>

      {showCreate && (
        <CreateOfferModal onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); fetchList(); }} />
      )}
      {detail && (
        <OfferDetailModal data={detail} canEdit={canDo("recruitment", "update")} canApprove={hasRole("MANAGER", "HR_ADMIN", "BOM")}
          onClose={() => setDetailId(null)} onChanged={() => fetchList()} />
      )}
    </div>
  );
}

function OfferRow({ item, onClick }: { item: OfferLetter; onClick: () => void }) {
  const info = STATUS_INFO[item.status];
  return (
    <button onClick={onClick} className="w-full flex items-center gap-4 px-5 py-4 hover:bg-white/[0.02] text-left transition-colors">
      <div className="w-11 h-11 rounded-full flex items-center justify-center text-[14px] font-bold flex-shrink-0" style={{ background: "rgba(0,180,216,0.15)", color: "var(--ibs-accent)" }}>
        {item.candidate.fullName.split(" ").pop()?.charAt(0) || "?"}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[14px] font-semibold">{item.candidate.fullName}</span>
          <span className="text-[11px] px-1.5 py-0.5 rounded font-mono" style={{ background: "rgba(51,65,85,0.4)", color: "var(--ibs-text-dim)" }}>{item.letterNumber}</span>
          <span className="text-[11px] px-2 py-0.5 rounded-lg font-semibold" style={{ background: info.bg, color: info.color }}>{info.label}</span>
        </div>
        <div className="text-[12px] mt-0.5" style={{ color: "var(--ibs-text-dim)" }}>
          {item.position} · {item.departmentName || "—"} · Bắt đầu: {formatDate(item.startDate)}
        </div>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        <div className="text-right">
          <div className="text-[13px] font-bold" style={{ color: "var(--ibs-accent)" }}>{formatVND(Number(item.officialSalary))}đ</div>
          <div className="text-[10px] mt-0.5" style={{ color: "var(--ibs-text-dim)" }}>Chính thức / tháng</div>
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
function CreateOfferModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [candidates, setCandidates] = useState<(Candidate & { hasOffer?: boolean })[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Candidate | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/v1/recruitment/candidates").then((r) => r.json()),
      fetch("/api/v1/recruitment/offer-letters").then((r) => r.json()),
    ])
      .then(([candRes, offRes]) => {
        const hasOffer = new Set(
          (offRes.data || [])
            .filter((o: OfferLetter) => ["DRAFT", "PENDING_HR_MGR", "APPROVED", "SENT", "ACCEPTED"].includes(o.status))
            .map((o: OfferLetter) => o.candidateId)
        );
        const list: (Candidate & { hasOffer?: boolean })[] = (candRes.data || []).map((c: any) => ({
          ...c,
          hasOffer: hasOffer.has(c.id),
        }));
        setCandidates(list);
      })
      .finally(() => setLoading(false));
  }, []);

  const filtered = candidates.filter((c) => {
    if (c.hasOffer) return false;
    // Chỉ show ứng viên đã qua phỏng vấn (INTERVIEWED) hoặc đang offer
    if (!["INTERVIEWED", "OFFERED"].includes(c.status)) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return c.fullName.toLowerCase().includes(q) || c.phone.toLowerCase().includes(q);
  });

  if (selected) {
    return <OfferFormSheet candidate={selected} onBack={() => setSelected(null)} onCreated={onCreated} onClose={onClose} />;
  }

  return (
    <ModalShell title="Chọn ứng viên để soạn thư mời" onClose={onClose} size="md">
      <div className="text-[12px] mb-3 p-3 rounded-lg" style={{ background: "rgba(0,180,216,0.06)", color: "var(--ibs-text-dim)" }}>
        ⓘ Chỉ hiển thị UV đã <strong>phỏng vấn xong</strong> (status INTERVIEWED) hoặc <strong>đang offer</strong> (OFFERED), chưa có thư mời đang xử lý.
      </div>
      <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Gõ tên hoặc SĐT..."
        className="w-full rounded-lg px-3 py-2 text-[13px] border mb-3"
        style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }}
      />
      <div className="rounded-lg border max-h-72 overflow-y-auto" style={{ borderColor: "var(--ibs-border)" }}>
        {loading ? (
          <div className="p-4 text-center text-[12px]" style={{ color: "var(--ibs-text-dim)" }}>Đang tải...</div>
        ) : filtered.length === 0 ? (
          <div className="p-4 text-center text-[12px]" style={{ color: "var(--ibs-text-dim)" }}>Không có UV phù hợp</div>
        ) : (
          filtered.map((c) => (
            <button key={c.id} onClick={() => setSelected(c)}
              className="w-full flex items-center gap-3 p-3 hover:bg-white/[0.03] transition-colors text-left border-b last:border-0"
              style={{ borderColor: "rgba(51,65,85,0.3)" }}
            >
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-bold flex-shrink-0" style={{ background: "rgba(0,180,216,0.15)", color: "var(--ibs-accent)" }}>
                {c.fullName.split(" ").pop()?.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium">{c.fullName}</div>
                <div className="text-[11px]" style={{ color: "var(--ibs-text-dim)" }}>
                  {c.phone}{c.email ? ` · ${c.email}` : " · ⚠ chưa có email"} · {c.recruitment.positionName} · {c.recruitment.department.name}
                </div>
              </div>
              <ChevronRight size={14} style={{ color: "var(--ibs-text-dim)" }} />
            </button>
          ))
        )}
      </div>
      <div className="flex justify-end mt-3">
        <button onClick={onClose} className="px-4 py-2 rounded-lg text-[13px] border" style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-dim)" }}>Đóng</button>
      </div>
    </ModalShell>
  );
}

// ============== OFFER FORM ==============
function OfferFormSheet({ candidate, onBack, onCreated, onClose }: {
  candidate: Candidate; onBack: () => void; onCreated: () => void; onClose: () => void;
}) {
  const [position, setPosition] = useState(candidate.recruitment.positionName);
  const [jobRole, setJobRole] = useState("Nhân viên");
  const [department, setDepartment] = useState(candidate.recruitment.department.name);
  // Các thành phần lương — bỏ trống = 0
  const [baseSalary, setBaseSalary] = useState("");
  const [farAllowance, setFarAllowance] = useState("");
  const [kpiAllowance, setKpiAllowance] = useState("");
  const [positionAllowance, setPositionAllowance] = useState("");
  const [probDays, setProbDays] = useState("60");
  const [probSalary, setProbSalary] = useState(""); // lương thử việc — HCNS tự nhập
  const [startDate, setStartDate] = useState("");
  const [benefits, setBenefits] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Lương chính thức = tổng các thành phần. Lương thử việc do HCNS tự nhập (không tự tính 85%).
  const officialSalary = (Number(baseSalary) || 0) + (Number(farAllowance) || 0) + (Number(kpiAllowance) || 0) + (Number(positionAllowance) || 0);

  const probationEnd = useMemo(() => {
    if (!startDate || !probDays) return null;
    const d = new Date(startDate);
    d.setDate(d.getDate() + Number(probDays));
    return d;
  }, [startDate, probDays]);

  async function handleSubmit(submit: boolean) {
    if (officialSalary <= 0 || !startDate || !position) {
      setError("Cần điền vị trí, ít nhất 1 khoản lương, và ngày bắt đầu");
      return;
    }
    if (!(Number(probSalary) > 0)) {
      setError("Vui lòng nhập lương thử việc");
      return;
    }
    if (!candidate.email) {
      setError("Ứng viên không có email — không gửi được sau khi duyệt. Vui lòng cập nhật email UV trong Pipeline trước.");
      return;
    }
    setSaving(true);
    setError("");
    const res = await fetch("/api/v1/recruitment/offer-letters", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        candidateId: candidate.id,
        position,
        jobRole,
        departmentName: department,
        officialSalary: officialSalary,
        probationarySalary: Number(probSalary) || 0,
        salaryBreakdown: {
          baseSalary: Number(baseSalary) || 0,
          farAllowance: Number(farAllowance) || 0,
          kpiAllowance: Number(kpiAllowance) || 0,
          positionAllowance: Number(positionAllowance) || 0,
        },
        probationDays: Number(probDays),
        startDate: new Date(startDate).toISOString(),
        benefits: benefits || null,
        saveAsDraft: !submit,
      }),
    });
    setSaving(false);
    if (res.ok) { onCreated(); onClose(); }
    else {
      const d = await res.json();
      setError(apiError(res.status, d.error));
    }
  }

  return (
    <ModalShell title={`Soạn thư mời nhận việc — ${candidate.fullName}`} onClose={onClose} size="lg">
      <div className="text-[12px] mb-3 p-3 rounded-lg" style={{ background: "rgba(0,180,216,0.06)", color: "var(--ibs-text-dim)" }}>
        ⓘ UV: <strong>{candidate.fullName}</strong> · {candidate.phone}{candidate.email ? ` · ${candidate.email}` : " · ⚠ chưa có email"}<br/>
        Số thư mời sẽ được tự động sinh khi lưu (vd: 703/2026/TM-IBSHI). <strong>Lương thử việc do HCNS tự nhập</strong> (có nút ≈85% điền nhanh nếu cần).
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
        <div>
          <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Vị trí làm việc *</label>
          <input value={position} onChange={(e) => setPosition(e.target.value)} placeholder="Kỹ sư kỹ thuật"
            className="w-full rounded-lg px-3 py-2 text-[13px] border"
            style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }}
          />
        </div>
        <div>
          <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Chức vụ *</label>
          <select value={jobRole} onChange={(e) => setJobRole(e.target.value)}
            className="w-full rounded-lg px-3 py-2 text-[13px] border"
            style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }}>
            {["Nhân viên", "Tổ trưởng", "Phó phòng", "Trưởng phòng", "Công nhân", "Giám đốc"].map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Bộ phận / Phòng ban</label>
          <input value={department} onChange={(e) => setDepartment(e.target.value)}
            className="w-full rounded-lg px-3 py-2 text-[13px] border"
            style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }}
          />
        </div>
      </div>

      {/* Các thành phần lương — bỏ trống = không có khoản đó */}
      <div className="text-[12px] font-semibold mb-2" style={{ color: "var(--ibs-text-dim)" }}>Cơ cấu lương chính thức (bỏ trống = 0)</div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
        {([
          ["Lương cơ bản", baseSalary, setBaseSalary, "8.000.000"],
          ["Phụ cấp nhà xa", farAllowance, setFarAllowance, "200.000"],
          ["Phụ cấp KPI", kpiAllowance, setKpiAllowance, "0"],
          ["Phụ cấp chức vụ", positionAllowance, setPositionAllowance, "0"],
        ] as [string, string, (s: string) => void, string][]).map(([lbl, val, set, ph]) => (
          <div key={lbl}>
            <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>{lbl}</label>
            <div className="relative">
              <input type="text" inputMode="numeric" value={val ? formatVND(Number(val)) : ""}
                onChange={(e) => set(e.target.value.replace(/[^\d]/g, ""))} placeholder={ph}
                className="w-full rounded-lg px-2 py-2 pr-6 text-[13px] border"
                style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }} />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-semibold pointer-events-none" style={{ color: "var(--ibs-text-dim)" }}>đ</span>
            </div>
          </div>
        ))}
      </div>

      {/* Tổng tự tính */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="p-3 rounded-lg border" style={{ background: "rgba(0,180,216,0.06)", borderColor: "rgba(0,180,216,0.3)" }}>
          <div className="text-[11px] uppercase font-semibold" style={{ color: "var(--ibs-text-dim)" }}>Tổng thu nhập</div>
          <div className="text-[18px] font-bold mt-0.5" style={{ color: "var(--ibs-accent)" }}>{formatVND(officialSalary)} đ</div>
        </div>
        <div className="p-3 rounded-lg border" style={{ background: "rgba(245,158,11,0.06)", borderColor: "rgba(245,158,11,0.3)" }}>
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-[11px] uppercase font-semibold" style={{ color: "var(--ibs-text-dim)" }}>Lương thử việc *</span>
            {officialSalary > 0 && (
              <button type="button" onClick={() => setProbSalary(String(Math.round((officialSalary * 0.85) / 1000) * 1000))}
                className="text-[10px] px-1.5 py-0.5 rounded font-semibold" style={{ color: "#f59e0b", background: "rgba(245,158,11,0.18)" }}
                title="Điền nhanh 85% lương chính thức">
                ≈85%
              </button>
            )}
          </div>
          <div className="relative">
            <input type="text" inputMode="numeric" value={probSalary ? formatVND(Number(probSalary)) : ""}
              onChange={(e) => setProbSalary(e.target.value.replace(/[^\d]/g, ""))} placeholder="Nhập lương thử việc"
              className="w-full rounded-lg px-2 py-1.5 pr-6 text-[16px] font-bold border"
              style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "#f59e0b" }} />
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-semibold pointer-events-none" style={{ color: "var(--ibs-text-dim)" }}>đ</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
        <div>
          <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Số ngày thử việc *</label>
          <input type="number" value={probDays} onChange={(e) => setProbDays(e.target.value)}
            className="w-full rounded-lg px-3 py-2 text-[13px] border"
            style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }}
          />
        </div>
        <div>
          <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Ngày bắt đầu *</label>
          <DateInput value={startDate} onChange={(e) => setStartDate(e.target.value)}
            className="w-full rounded-lg px-3 py-2 text-[13px] border"
            style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }}
          />
        </div>
        <div>
          <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Ngày kết thúc thử việc</label>
          <input value={probationEnd ? formatDate(probationEnd) : "—"} disabled
            className="w-full rounded-lg px-3 py-2 text-[13px] border"
            style={{ background: "rgba(51,65,85,0.3)", borderColor: "var(--ibs-border)", color: "var(--ibs-text-dim)" }}
          />
        </div>
      </div>

      <div className="mb-3">
        <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Các chế độ liên quan (tuỳ chọn — bỏ trống dùng nội dung mặc định)</label>
        <textarea rows={3} value={benefits} onChange={(e) => setBenefits(e.target.value)}
          placeholder="Mặc định: 'Được đóng BHXH khi lao động được tiếp nhận chính thức, được hưởng các quyền lợi của lao động chính thức theo quy định công ty...'"
          className="w-full rounded-lg px-3 py-2 text-[13px] border resize-none"
          style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }}
        />
      </div>

      {error && <div className="text-[12px] text-red-500 mb-3">{error}</div>}

      <div className="flex gap-2 justify-end pt-3 border-t" style={{ borderColor: "var(--ibs-border)" }}>
        <button onClick={onBack} className="px-4 py-2 rounded-lg text-[13px] border" style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-dim)" }}>← Chọn UV khác</button>
        <button onClick={() => handleSubmit(false)} disabled={saving} className="px-4 py-2 rounded-lg text-[13px] border" style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }}>Lưu nháp</button>
        <button onClick={() => handleSubmit(true)} disabled={saving} className="px-4 py-2 rounded-lg text-[13px] font-semibold" style={{ background: "var(--ibs-accent)", color: "#fff" }}>
          {saving ? "Đang gửi..." : "Gửi TP HCNS duyệt"}
        </button>
      </div>
    </ModalShell>
  );
}

// ============== DETAIL MODAL ==============
function OfferDetailModal({ data, canEdit, canApprove, onClose, onChanged }: {
  data: OfferLetter; canEdit: boolean; canApprove: boolean; onClose: () => void; onChanged: () => void;
}) {
  const [showApproveModal, setShowApproveModal] = useState<"approve" | "reject" | null>(null);
  const [showResultModal, setShowResultModal] = useState<"ACCEPTED" | "DECLINED" | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleResend() {
    if (!(await confirmDialog("Gửi lại email cho ứng viên?"))) return;
    setBusy(true);
    const res = await fetch(`/api/v1/recruitment/offer-letters/${data.id}/resend`, { method: "POST" });
    setBusy(false);
    if (res.ok) { onChanged(); onClose(); }
    else { const d = await res.json(); await alertDialog(apiError(res.status, d.error)); }
  }

  return (
    <ModalShell title={`Thư mời ${data.letterNumber} — ${data.candidate.fullName}`} onClose={onClose} size="lg">
      {/* Header info */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4 p-3 rounded-lg" style={{ background: "var(--ibs-bg)" }}>
        <Info label="Họ tên UV" value={data.candidate.fullName} />
        <Info label="Email UV" value={data.candidate.email || "—"} />
        <Info label="Vị trí" value={data.position} />
        <Info label="Bộ phận" value={data.departmentName || "—"} />
        <Info label="Số thư" value={data.letterNumber} />
        <Info label="Ngày bắt đầu" value={formatDate(data.startDate)} />
        <Info label="Hết thử việc" value={formatDate(data.probationEndDate)} />
        <Info label="Trạng thái" value={
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-lg" style={{ background: STATUS_INFO[data.status].bg, color: STATUS_INFO[data.status].color }}>
            {STATUS_INFO[data.status].label}
          </span>
        } />
      </div>

      {/* Salary */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="p-3 rounded-lg border" style={{ background: "rgba(0,180,216,0.04)", borderColor: "rgba(0,180,216,0.3)" }}>
          <div className="text-[11px] uppercase font-semibold" style={{ color: "var(--ibs-text-dim)" }}>Lương chính thức</div>
          <div className="text-[18px] font-bold mt-1" style={{ color: "var(--ibs-accent)" }}>{formatVND(Number(data.officialSalary))}đ <span className="text-[11px] font-normal" style={{ color: "var(--ibs-text-dim)" }}>/ tháng</span></div>
        </div>
        <div className="p-3 rounded-lg border" style={{ background: "rgba(245,158,11,0.04)", borderColor: "rgba(245,158,11,0.3)" }}>
          <div className="text-[11px] uppercase font-semibold" style={{ color: "var(--ibs-text-dim)" }}>Lương thử việc ({data.probationDays} ngày)</div>
          <div className="text-[18px] font-bold mt-1" style={{ color: "#f59e0b" }}>{formatVND(Number(data.probationarySalary))}đ <span className="text-[11px] font-normal" style={{ color: "var(--ibs-text-dim)" }}>/ tháng</span></div>
        </div>
      </div>

      {/* Banners */}
      {data.status === "REJECTED" && data.rejectComments && (
        <div className="mb-4 p-3 rounded-lg border text-[12px]" style={{ background: "rgba(239,68,68,0.06)", borderColor: "rgba(239,68,68,0.3)" }}>
          <div className="font-semibold mb-1" style={{ color: "var(--ibs-danger)" }}>TP HCNS trả lại — lý do:</div>
          <div>{data.rejectComments}</div>
        </div>
      )}
      {data.status === "SENT" && data.sentAt && (
        <div className="mb-4 p-3 rounded-lg border text-[12px]" style={{ background: "rgba(59,130,246,0.06)", borderColor: "rgba(59,130,246,0.3)" }}>
          <div className="flex items-center gap-1.5 font-semibold mb-1" style={{ color: "#3b82f6" }}><Mail size={13} /> Đã gửi email</div>
          <div>Gửi tới: <strong>{data.sentToEmail}</strong> lúc {formatDate(data.sentAt)}</div>
          {data.expiresAt && <div>SLA hết hạn: <strong>{formatDate(data.expiresAt)}</strong></div>}
        </div>
      )}
      {data.status === "ACCEPTED" && (
        <div className="mb-4 p-3 rounded-lg border text-[12px]" style={{ background: "rgba(34,197,94,0.06)", borderColor: "rgba(34,197,94,0.3)" }}>
          <div className="flex items-center gap-1.5 font-semibold mb-1" style={{ color: "var(--ibs-success)" }}><Check size={13} /> UV đã chấp nhận thư mời</div>
          {data.acceptedAt && <div>Lúc: {formatDate(data.acceptedAt)}</div>}
          {data.candidateNote && <div className="mt-1">Ghi chú UV: {data.candidateNote}</div>}
        </div>
      )}
      {data.status === "DECLINED" && (
        <div className="mb-4 p-3 rounded-lg border text-[12px]" style={{ background: "rgba(220,38,38,0.06)", borderColor: "rgba(220,38,38,0.3)" }}>
          <div className="flex items-center gap-1.5 font-semibold mb-1" style={{ color: "#dc2626" }}><X size={13} /> UV từ chối</div>
          {data.candidateNote && <div className="mt-1">Lý do: {data.candidateNote}</div>}
        </div>
      )}

      {data.pdfUrl && (
        <div className="mb-4 flex items-center gap-2 p-3 rounded-lg" style={{ background: "var(--ibs-bg)" }}>
          <FileText size={14} style={{ color: "var(--ibs-accent)" }} />
          <a href={data.pdfUrl} target="_blank" rel="noopener noreferrer" className="text-[12px] font-semibold hover:underline" style={{ color: "var(--ibs-accent)" }}>
            Xem PDF thư mời đã gửi
          </a>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap items-center justify-end gap-2 pt-3 border-t" style={{ borderColor: "var(--ibs-border)" }}>
        {/* TP HCNS / HR Mgr duyệt */}
        {data.status === "PENDING_HR_MGR" && canApprove && (
          <>
            <button type="button" onClick={() => setShowApproveModal("approve")} className="px-3 py-2 rounded-lg text-[12px] font-semibold flex items-center gap-1.5" style={{ background: "var(--ibs-success)", color: "#fff" }}>
              <ThumbsUp size={13} /> Duyệt + Gửi tự động
            </button>
            <button type="button" onClick={() => setShowApproveModal("reject")} className="px-3 py-2 rounded-lg text-[12px] font-semibold flex items-center gap-1.5" style={{ background: "var(--ibs-danger)", color: "#fff" }}>
              <ThumbsDown size={13} /> Trả lại
            </button>
          </>
        )}

        {/* Resend if APPROVED but not sent OR SENT */}
        {(data.status === "APPROVED" || data.status === "SENT") && canApprove && (
          <button type="button" onClick={handleResend} disabled={busy} className="px-3 py-2 rounded-lg text-[12px] font-semibold flex items-center gap-1.5 border" style={{ borderColor: "rgba(59,130,246,0.4)", color: "#3b82f6" }}>
            <Send size={13} /> {data.status === "APPROVED" ? "Gửi email lần đầu" : "Gửi lại email"}
          </button>
        )}

        {/* HCNS đánh dấu kết quả phản hồi từ UV */}
        {data.status === "SENT" && canEdit && (
          <>
            <button type="button" onClick={() => setShowResultModal("ACCEPTED")} className="px-3 py-2 rounded-lg text-[12px] font-semibold flex items-center gap-1.5" style={{ background: "rgba(34,197,94,0.15)", color: "var(--ibs-success)" }}>
              <Check size={13} /> UV đã chấp nhận
            </button>
            <button type="button" onClick={() => setShowResultModal("DECLINED")} className="px-3 py-2 rounded-lg text-[12px] font-semibold flex items-center gap-1.5" style={{ background: "rgba(220,38,38,0.15)", color: "#dc2626" }}>
              <X size={13} /> UV từ chối
            </button>
          </>
        )}

        <button onClick={onClose} className="px-4 py-2 rounded-lg text-[13px] font-semibold" style={{ background: "var(--ibs-bg)", color: "var(--ibs-text)" }}>
          Đóng
        </button>
      </div>

      {showApproveModal && (
        <ApproveRejectModal id={data.id} mode={showApproveModal} onClose={() => setShowApproveModal(null)} onDone={() => { setShowApproveModal(null); onChanged(); onClose(); }} />
      )}
      {showResultModal && (
        <MarkResultModal id={data.id} result={showResultModal} onClose={() => setShowResultModal(null)} onDone={() => { setShowResultModal(null); onChanged(); onClose(); }} />
      )}
    </ModalShell>
  );
}

function ApproveRejectModal({ id, mode, onClose, onDone }: { id: string; mode: "approve" | "reject"; onClose: () => void; onDone: () => void }) {
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");

  async function handle() {
    if (mode === "reject" && comment.trim().length < 5) {
      setError("Cần ghi rõ lý do (≥5 ký tự)");
      return;
    }
    setBusy(true);
    setError("");
    const url = `/api/v1/recruitment/offer-letters/${id}/${mode}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(mode === "reject" ? { rejectComments: comment } : {}),
    });
    setBusy(false);
    if (res.ok) {
      const data = await res.json();
      if (data.warning) {
        setWarning(data.warning);
        setTimeout(() => onDone(), 3000);
      } else onDone();
    }
    else { const d = await res.json(); setError(apiError(res.status, d.error)); }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4">
      <div className="rounded-2xl w-full max-w-md p-6" style={{ background: "var(--ibs-bg-card)", border: "1px solid var(--ibs-border)" }}>
        <div className="flex items-center justify-between mb-4">
          <div className="text-[16px] font-bold">{mode === "approve" ? "Duyệt + Gửi email cho UV" : "Trả lại HR soạn lại"}</div>
          <button type="button" onClick={onClose}><X size={18} /></button>
        </div>

        {mode === "approve" ? (
          <div className="text-[12px] mb-3 p-3 rounded-lg" style={{ background: "rgba(34,197,94,0.06)", color: "var(--ibs-text-dim)" }}>
            ⓘ Sau khi duyệt: hệ thống sẽ <strong>tự động render PDF</strong> + <strong>gửi email kèm PDF</strong> cho UV. SLA 7 ngày.
          </div>
        ) : (
          <div className="mb-3">
            <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Lý do trả lại *</label>
            <textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="vd: Mức lương đề xuất chưa hợp lý, đề nghị HR điều chỉnh lại..."
              className="w-full rounded-lg px-3 py-2 text-[13px] border resize-none"
              style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }}
            />
          </div>
        )}

        {warning && <div className="text-[12px] mb-3 p-2 rounded" style={{ background: "rgba(245,158,11,0.12)", color: "#f59e0b" }}>⚠ {warning}</div>}
        {error && <div className="text-[12px] text-red-500 mb-2">{error}</div>}

        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-[13px] border" style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-dim)" }}>Huỷ</button>
          <button type="button" onClick={handle} disabled={busy} className="px-4 py-2 rounded-lg text-[13px] font-semibold" style={{ background: mode === "approve" ? "var(--ibs-success)" : "var(--ibs-danger)", color: "#fff" }}>
            {busy ? "Đang xử lý..." : (mode === "approve" ? "Xác nhận duyệt + Gửi" : "Xác nhận trả lại")}
          </button>
        </div>
      </div>
    </div>
  );
}

function MarkResultModal({ id, result, onClose, onDone }: { id: string; result: "ACCEPTED" | "DECLINED"; onClose: () => void; onDone: () => void }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [createdEmp, setCreatedEmp] = useState<{ code: string; email: string; tempPassword: string } | null>(null);

  async function handle() {
    setBusy(true);
    const res = await fetch(`/api/v1/recruitment/offer-letters/${id}/mark-result`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ result, candidateNote: note || null }),
    });
    const data = await res.json();
    setBusy(false);
    if (res.ok) {
      // ACCEPTED → server trả về createdEmployee (mã NV + email + temp pass) → show popup
      if (result === "ACCEPTED" && data.data?.createdEmployee) {
        setCreatedEmp(data.data.createdEmployee);
      } else {
        onDone();
      }
    } else {
      setError(apiError(res.status, data.error));
    }
  }

  // Popup hiển thị credentials tạm cho NV mới
  if (createdEmp) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4">
        <div className="rounded-2xl w-full max-w-md p-6" style={{ background: "var(--ibs-bg-card)", border: "1px solid var(--ibs-border)" }}>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "rgba(34,197,94,0.15)" }}>
              <Check size={20} style={{ color: "var(--ibs-success)" }} />
            </div>
            <div>
              <div className="text-[16px] font-bold">Tạo tài khoản NV thành công</div>
              <div className="text-[12px] mt-0.5" style={{ color: "var(--ibs-text-dim)" }}>NV đã được khởi tạo với status PROBATION — sẵn sàng sang tab Onboard.</div>
            </div>
          </div>
          <div className="rounded-xl p-4 mb-4" style={{ background: "var(--ibs-bg)", border: "1px solid var(--ibs-border)" }}>
            {[
              ["Mã nhân viên", createdEmp.code],
              ["Email đăng nhập", createdEmp.email],
              ["Mật khẩu tạm", createdEmp.tempPassword],
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between py-2 border-b last:border-0" style={{ borderColor: "rgba(51,65,85,0.3)" }}>
                <span className="text-[12px]" style={{ color: "var(--ibs-text-dim)" }}>{label}</span>
                <span className="text-[13px] font-mono font-semibold" style={{ color: "var(--ibs-accent)" }}>{value}</span>
              </div>
            ))}
          </div>
          <p className="text-[12px] mb-4" style={{ color: "var(--ibs-text-dim)" }}>
            Vui lòng thông báo mật khẩu tạm cho NV. Họ sẽ được yêu cầu đổi mật khẩu khi đăng nhập lần đầu.
          </p>
          <button type="button" onClick={() => { setCreatedEmp(null); onDone(); }}
            className="w-full py-2.5 rounded-xl text-[13px] font-semibold"
            style={{ background: "var(--ibs-accent)", color: "#fff" }}
          >
            Đã hiểu — đi sang tab Onboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4">
      <div className="rounded-2xl w-full max-w-md p-6" style={{ background: "var(--ibs-bg-card)", border: "1px solid var(--ibs-border)" }}>
        <div className="flex items-center justify-between mb-4">
          <div className="text-[16px] font-bold">{result === "ACCEPTED" ? "✓ UV chấp nhận thư mời" : "✗ UV từ chối thư mời"}</div>
          <button type="button" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="text-[12px] mb-3 p-3 rounded-lg" style={{ background: result === "ACCEPTED" ? "rgba(34,197,94,0.06)" : "rgba(220,38,38,0.06)", color: "var(--ibs-text-dim)" }}>
          {result === "ACCEPTED" ? (
            <>ⓘ Sau khi xác nhận: candidate.status = <strong>ACCEPTED</strong> + hệ thống <strong>tự tạo tài khoản nhân viên</strong> (mã IBS-xxx, mật khẩu tạm, status PROBATION). Sau đó qua tab <strong>Onboard</strong> để tạo checklist 4 mục.</>
          ) : (
            <>ⓘ Sau khi xác nhận: candidate.status = <strong>REJECTED</strong>. Có thể tạo thư mời mới cho UV khác.</>
          )}
        </div>

        <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Ghi chú từ UV (tuỳ chọn)</label>
        <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder={result === "ACCEPTED" ? "VD: UV xác nhận sẽ đến nhận việc đúng ngày..." : "VD: UV nhận offer khác lương cao hơn..."}
          className="w-full rounded-lg px-3 py-2 text-[13px] border resize-none mb-3"
          style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }}
        />

        {error && <div className="text-[12px] text-red-500 mb-2">{error}</div>}

        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-[13px] border" style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-dim)" }}>Huỷ</button>
          <button type="button" onClick={handle} disabled={busy} className="px-4 py-2 rounded-lg text-[13px] font-semibold" style={{ background: result === "ACCEPTED" ? "var(--ibs-success)" : "var(--ibs-danger)", color: "#fff" }}>
            {busy ? "Đang xử lý..." : result === "ACCEPTED" ? "Xác nhận + Tạo NV" : "Xác nhận từ chối"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ModalShell({ title, onClose, children, size = "md" }: { title: string; onClose: () => void; children: React.ReactNode; size?: "sm" | "md" | "lg" }) {
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
