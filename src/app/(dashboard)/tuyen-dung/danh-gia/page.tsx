"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PageTitle } from "@/components/layout/page-title";
import { FileUpload } from "@/components/shared/file-upload";
import { DateInput } from "@/components/shared/date-input";
import { BUCKETS } from "@/lib/minio-constants";
import { viewUrl } from "@/lib/use-presigned-url";
import { formatDate, formatVND, apiError } from "@/lib/utils";
import { usePermission } from "@/hooks/use-permission";
import { confirmDialog, alertDialog } from "@/lib/confirm-dialog";
import { PROBATION_CRITERIA, PROBATION_RATINGS, TIER_LABELS, type RatingKey } from "@/lib/probation-eval";
import {
  Plus, RefreshCw, X, Check, ClipboardCheck, Clock, AlertCircle,
  FileText, ChevronRight, ThumbsUp, ThumbsDown, Award,
} from "lucide-react";

// ============== TYPES ==============
type Employee = {
  id: string; code: string; fullName: string; photo?: string | null;
  status: string; startDate: string;
  department: { id: string; name: string };
  position: { id: string; name: string };
};
type Scores = {
  ratings: Record<string, RatingKey>;
  q9PerformsWell: boolean;
  q10SignContract: boolean;
};
type ContractDraft = {
  contractNumber: string; contractType: string; startDate: string; endDate: string | null;
  baseSalary: number; allowance: number; kpi: number;
  jobTitle: string | null; workLocation: string | null; terms: string | null;
};
type Evaluation = {
  id: string;
  employeeId: string;
  evaluatedBy: string;
  evaluationDate: string;
  scores: Scores;
  totalScore: number;
  recommendedTier: string;
  selectedTier: string | null;
  comments: string | null;
  status: "DRAFT" | "PENDING_DIRECTOR" | "APPROVED" | "CONTRACT_ISSUED" | "REJECTED" | "SIGNED" | "FAILED";
  contractDraft?: ContractDraft | null;
  directorApprovedAt?: string | null;
  directorRejectedAt?: string | null;
  directorComments?: string | null;
  hrSignedAt?: string | null;
  signedContractUrl?: string | null;
  signedContractId?: string | null;
  contractStartDate?: string | null;
  contractEndDate?: string | null;
  createdAt: string;
  employee: Employee;
};

const STATUS_INFO: Record<Evaluation["status"], { label: string; color: string; bg: string }> = {
  DRAFT:             { label: "Nháp",                color: "var(--ibs-text-dim)", bg: "rgba(100,116,139,0.15)" },
  PENDING_DIRECTOR:  { label: "Chờ BGĐ duyệt",       color: "var(--ibs-accent)",   bg: "rgba(0,180,216,0.12)" },
  APPROVED:          { label: "BGĐ đã duyệt",         color: "var(--ibs-success)",  bg: "rgba(34,197,94,0.12)" },
  CONTRACT_ISSUED:   { label: "Đợi ký hợp đồng",       color: "#f59e0b",             bg: "rgba(245,158,11,0.14)" },
  REJECTED:          { label: "Trả lại (đánh giá lại)", color: "var(--ibs-danger)", bg: "rgba(239,68,68,0.12)" },
  SIGNED:            { label: "Đã ký HĐ chính thức",  color: "#22c55e",             bg: "rgba(34,197,94,0.18)" },
  FAILED:            { label: "Chấm dứt thử việc",    color: "#dc2626",             bg: "rgba(220,38,38,0.18)" },
};

// ============== MAIN ==============
export default function ProbationEvaluationPage() {
  const { canDo, hasRole } = usePermission();
  const [list, setList] = useState<Evaluation[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<"" | Evaluation["status"]>("");
  const [showCreate, setShowCreate] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  function fetchList() {
    setLoading(true);
    fetch("/api/v1/recruitment/probation-evaluation")
      .then((r) => r.json())
      .then((res) => setList(res.data || []))
      .finally(() => setLoading(false));
  }

  useEffect(() => { fetchList(); }, []);

  const filtered = useMemo(() => {
    if (!filterStatus) return list;
    return list.filter((e) => e.status === filterStatus);
  }, [list, filterStatus]);

  const stats = useMemo(() => ({
    pending: list.filter((e) => e.status === "PENDING_DIRECTOR").length,
    approved: list.filter((e) => e.status === "APPROVED").length,
    signed: list.filter((e) => e.status === "SIGNED").length,
    rejected: list.filter((e) => e.status === "REJECTED").length,
    failed: list.filter((e) => e.status === "FAILED").length,
  }), [list]);

  const detail = detailId ? list.find((e) => e.id === detailId) || null : null;

  return (
    <div>
      <PageTitle
        title="Đánh giá thử việc → Ký HĐ chính thức"
        description="TP đánh giá theo 8 tiêu chí + 2 câu Yes/No → BGĐ duyệt → HCNS ký HĐ"
      />

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
        <StatCard label="Chờ BGĐ duyệt"   value={stats.pending}  icon={<Clock size={18} />}         color="var(--ibs-accent)" />
        <StatCard label="BGĐ đã duyệt"    value={stats.approved} icon={<ThumbsUp size={18} />}      color="var(--ibs-success)" />
        <StatCard label="Đã ký HĐ"        value={stats.signed}   icon={<Award size={18} />}         color="#22c55e" />
        <StatCard label="Trả lại"         value={stats.rejected} icon={<AlertCircle size={18} />}   color="var(--ibs-danger)" />
        <StatCard label="Không qua TV"    value={stats.failed}   icon={<ThumbsDown size={18} />}    color="#dc2626" />
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
        <div className="flex gap-1 p-1 rounded-xl flex-wrap" style={{ background: "var(--ibs-bg-card)", border: "1px solid var(--ibs-border)" }}>
          {([
            ["", "Tất cả"],
            ["PENDING_DIRECTOR", "Chờ duyệt"],
            ["APPROVED", "Đã duyệt"],
            ["SIGNED", "Đã ký HĐ"],
            ["REJECTED", "Trả lại"],
            ["FAILED", "Chấm dứt"],
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
          {canDo("recruitment", "create") && (
            <button onClick={() => setShowCreate(true)} className="flex items-center gap-1.5 text-[13px] px-3 py-2 rounded-lg font-semibold" style={{ background: "var(--ibs-accent)", color: "#fff" }}>
              <Plus size={14} /> Tạo đánh giá
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
            <ClipboardCheck size={40} className="mx-auto mb-2 opacity-30" />
            <div className="text-[13px]">Chưa có đánh giá nào</div>
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: "var(--ibs-border)" }}>
            {filtered.map((e) => (
              <EvalRow key={e.id} item={e} onClick={() => setDetailId(e.id)} />
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      {showCreate && (
        <CreateEvalModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); fetchList(); }}
        />
      )}
      {detail && (
        <EvalDetailModal
          data={detail}
          isBOM={hasRole("BOM")}
          canEdit={canDo("recruitment", "update")}
          onClose={() => setDetailId(null)}
          onChanged={() => { fetchList(); }}
        />
      )}
    </div>
  );
}

// ============== ROW ==============
function EvalRow({ item, onClick }: { item: Evaluation; onClick: () => void }) {
  const info = STATUS_INFO[item.status];
  const tier = item.selectedTier || item.recommendedTier;
  return (
    <button onClick={onClick} className="w-full flex items-center gap-4 px-5 py-4 hover:bg-white/[0.02] text-left transition-colors">
      <div className="w-11 h-11 rounded-full flex items-center justify-center text-[14px] font-bold flex-shrink-0" style={{ background: "rgba(0,180,216,0.15)", color: "var(--ibs-accent)" }}>
        {item.employee.fullName.split(" ").pop()?.charAt(0) || "?"}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[14px] font-semibold">{item.employee.fullName}</span>
          <span className="text-[11px] px-1.5 py-0.5 rounded font-mono" style={{ background: "rgba(51,65,85,0.4)", color: "var(--ibs-text-dim)" }}>{item.employee.code}</span>
          <span className="text-[11px] px-2 py-0.5 rounded-lg font-semibold" style={{ background: info.bg, color: info.color }}>{info.label}</span>
        </div>
        <div className="text-[12px] mt-0.5" style={{ color: "var(--ibs-text-dim)" }}>
          {((item.employee as any).jobRole || item.employee.position.name)} · {item.employee.department.name} · Ngày đánh giá: {formatDate(item.evaluationDate)}
        </div>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        <div className="text-right">
          <div className="text-[13px] font-bold" style={{ color: item.totalScore >= 9 ? "var(--ibs-success)" : item.totalScore >= 7.5 ? "#22c55e" : item.totalScore >= 6 ? "#f59e0b" : "var(--ibs-danger)" }}>
            {item.totalScore.toFixed(1)} <span className="text-[10px]" style={{ color: "var(--ibs-text-dim)" }}>/10</span>
          </div>
          <div className="text-[10px] mt-0.5 font-semibold" style={{ color: "var(--ibs-text-dim)" }}>
            {TIER_LABELS[tier] || tier}
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
function CreateEvalModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [employees, setEmployees] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Chỉ NV đã được TP DUYỆT HĐ thử việc (probation.status = ACTIVE) VÀ còn ≤ 7 ngày là hết hạn thử việc.
    Promise.all([
      fetch("/api/v1/recruitment/probation").then((r) => r.json()),
      fetch("/api/v1/recruitment/probation-evaluation").then((r) => r.json()),
    ])
      .then(([probRes, evalRes]) => {
        const hasEval = new Set(
          (evalRes.data || [])
            .filter((e: Evaluation) => ["DRAFT", "PENDING_DIRECTOR", "APPROVED", "REJECTED"].includes(e.status))
            .map((e: Evaluation) => e.employeeId)
        );
        const list = (probRes.data || [])
          .filter((p: any) => {
            if (p.probation?.status !== "ACTIVE" || hasEval.has(p.id)) return false;
            if (!p.probation.endDate) return false;
            const daysLeft = Math.ceil((new Date(p.probation.endDate).getTime() - Date.now()) / 864e5);
            return daysLeft <= 7; // còn ≤ 1 tuần là hết hạn thử việc
          })
          .map((p: any) => ({ id: p.id, code: p.code, fullName: p.fullName, jobRole: p.jobRole, department: { name: p.departmentName } }));
        setEmployees(list);
      })
      .finally(() => setLoading(false));
  }, []);

  const filtered = employees.filter((e) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return e.fullName.toLowerCase().includes(q) || e.code.toLowerCase().includes(q);
  });

  return (
    <ModalShell title="Chọn nhân viên để đánh giá" onClose={onClose} size="md">
      <div className="flex flex-col gap-3">
        <div>
          <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>
            NV đã duyệt HĐ thử việc & còn ≤ 1 tuần hết hạn thử việc
          </label>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Gõ tên hoặc mã NV…"
            className="w-full rounded-lg px-3 py-2 text-[13px] border"
            style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }}
          />
        </div>
        <div className="rounded-lg border max-h-72 overflow-y-auto" style={{ borderColor: "var(--ibs-border)" }}>
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
                    {e.code} · {(e as any).jobRole || "Nhân viên"}{(e as any).jobPosition ? ` · ${(e as any).jobPosition}` : ""} · {e.department.name}
                  </div>
                </div>
                {selected === e.id && <Check size={16} style={{ color: "var(--ibs-accent)" }} />}
              </button>
            ))
          )}
        </div>
        <div className="text-[11px] text-center" style={{ color: "var(--ibs-text-dim)" }}>
          Bấm chọn 1 NV ở danh sách phía trên để mở form đánh giá
        </div>
        <div className="flex gap-2 justify-end mt-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-[13px] border" style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-dim)" }}>Đóng</button>
        </div>
      </div>
      {selected && <NewEvalFormSheet employeeId={selected} onClose={onClose} onCreated={onCreated} />}
    </ModalShell>
  );
}

// Inline form khi đã chọn NV
function NewEvalFormSheet({ employeeId, onClose, onCreated }: { employeeId: string; onClose: () => void; onCreated: () => void }) {
  const [ratings, setRatings] = useState<Record<string, RatingKey>>({});
  const [q9, setQ9] = useState(true);
  const [q10, setQ10] = useState(true);
  const [comments, setComments] = useState("");
  const [overrideTier, setOverrideTier] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const allRated = PROBATION_CRITERIA.every((c) => ratings[c.key]);

  const { score10, tier, unacc } = useMemo(() => {
    let total = 0, count = 0, unacc = 0;
    for (const cr of PROBATION_CRITERIA) {
      const r = ratings[cr.key];
      if (!r || r === "NA") continue;
      total += PROBATION_RATINGS[r].points;
      count++;
      if (r === "UNACCEPTABLE") unacc++;
    }
    const score = count > 0 ? +((total / (count * 3)) * 10).toFixed(1) : 0;
    let tier: string;
    if (!q10 || !q9 || score < 6 || unacc >= 2) tier = "FAIL";
    else if (score >= 9) tier = "INDEFINITE";
    else if (score >= 7.5) tier = "DEFINITE_24M";
    else tier = "DEFINITE_12M";
    return { score10: score, tier, unacc };
  }, [ratings, q9, q10]);

  async function handleSubmit(submit: boolean) {
    if (!allRated) { setError("Vui lòng đánh giá đủ 8 tiêu chí"); return; }
    setSaving(true);
    setError("");
    const res = await fetch("/api/v1/recruitment/probation-evaluation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employeeId,
        scores: { ratings, q9PerformsWell: q9, q10SignContract: q10 },
        selectedTier: overrideTier || tier,
        comments: comments || null,
        saveAsDraft: !submit,
      }),
    });
    setSaving(false);
    if (res.ok) { onCreated(); onClose(); }
    else {
      const data = await res.json();
      setError(apiError(res.status, data.error));
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4">
      <div className="rounded-2xl w-full max-w-3xl mx-4 p-6 max-h-[92vh] overflow-y-auto" style={{ background: "var(--ibs-bg-card)", border: "1px solid var(--ibs-border)" }}>
        <div className="flex items-center justify-between mb-4">
          <div className="text-[16px] font-bold">Đánh giá thử việc — 8 tiêu chí</div>
          <button onClick={onClose}><X size={18} /></button>
        </div>

        <CriteriaTable ratings={ratings} setRatings={setRatings} />

        {/* 2 câu Yes/No */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
          <YesNoCard
            label="Cho đến nay NV đã thực hiện tốt nhiệm vụ chưa?"
            value={q9}
            onChange={setQ9}
          />
          <YesNoCard
            label="Có đồng ý ký HĐ chính thức với NV không?"
            value={q10}
            onChange={setQ10}
          />
        </div>

        {/* Comments */}
        <div className="mb-4">
          <label className="text-[12px] font-semibold mb-1.5 block" style={{ color: "var(--ibs-text-dim)" }}>Nhận xét khác (tuỳ chọn)</label>
          <textarea
            rows={3}
            value={comments}
            onChange={(e) => setComments(e.target.value)}
            className="w-full rounded-lg px-3 py-2 text-[13px] border resize-none"
            style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }}
            placeholder="Đánh giá thêm về NV (điểm mạnh, điểm cần cải thiện…)"
          />
        </div>

        {/* Tự tính score + tier */}
        <div className="p-4 rounded-lg border mb-4" style={{ background: "rgba(0,180,216,0.04)", borderColor: "rgba(0,180,216,0.3)" }}>
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-[11px] uppercase font-semibold" style={{ color: "var(--ibs-text-dim)" }}>Điểm tự động</div>
              <div className="text-[28px] font-bold" style={{ color: score10 >= 9 ? "var(--ibs-success)" : score10 >= 7.5 ? "#22c55e" : score10 >= 6 ? "#f59e0b" : "var(--ibs-danger)" }}>
                {score10.toFixed(1)}<span className="text-[14px] font-normal" style={{ color: "var(--ibs-text-dim)" }}>/10</span>
              </div>
              {unacc > 0 && <div className="text-[11px] mt-1" style={{ color: "var(--ibs-danger)" }}>⚠ Có {unacc} tiêu chí "Kém"</div>}
            </div>
            <div className="text-right">
              <div className="text-[11px] uppercase font-semibold" style={{ color: "var(--ibs-text-dim)" }}>Gợi ý tier HĐ</div>
              <div className="text-[14px] font-bold mt-1" style={{ color: tier === "FAIL" ? "var(--ibs-danger)" : "var(--ibs-success)" }}>
                {TIER_LABELS[tier]}
              </div>
            </div>
          </div>
          <div className="border-t pt-3" style={{ borderColor: "rgba(51,65,85,0.4)" }}>
            <label className="text-[11px] font-semibold mb-1.5 block" style={{ color: "var(--ibs-text-dim)" }}>Chốt tier (TP có thể override gợi ý)</label>
            <div className="flex gap-2 flex-wrap">
              {["INDEFINITE", "DEFINITE_24M", "DEFINITE_12M", "FAIL"].map((t) => {
                const active = (overrideTier || tier) === t;
                return (
                  <button
                    key={t}
                    onClick={() => setOverrideTier(t)}
                    className="text-[12px] px-3 py-1.5 rounded-lg font-medium border transition-all"
                    style={{
                      background: active ? (t === "FAIL" ? "var(--ibs-danger)" : "var(--ibs-accent)") : "transparent",
                      color: active ? "#fff" : "var(--ibs-text)",
                      borderColor: active ? (t === "FAIL" ? "var(--ibs-danger)" : "var(--ibs-accent)") : "var(--ibs-border)",
                    }}
                  >
                    {TIER_LABELS[t]} {t === tier && <span className="text-[10px] ml-1 opacity-70">(gợi ý)</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {error && <div className="text-[12px] text-red-500 mb-2">{error}</div>}

        <div className="flex gap-2 justify-end pt-3 border-t" style={{ borderColor: "var(--ibs-border)" }}>
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-[13px] border" style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-dim)" }}>Hủy</button>
          <button onClick={() => handleSubmit(false)} disabled={saving} className="px-4 py-2 rounded-lg text-[13px] border" style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }}>
            Lưu nháp
          </button>
          <button onClick={() => handleSubmit(true)} disabled={saving || !allRated} className="px-4 py-2 rounded-lg text-[13px] font-semibold" style={{ background: "var(--ibs-accent)", color: "#fff", opacity: saving || !allRated ? 0.5 : 1 }}>
            {saving ? "Đang gửi..." : "Gửi BGĐ duyệt"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============== DETAIL MODAL ==============
function EvalDetailModal({ data, isBOM, canEdit, onClose, onChanged }: {
  data: Evaluation;
  isBOM: boolean;
  canEdit: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [tab, setTab] = useState<"view" | "approve" | "draft" | "sign">("view");

  return (
    <ModalShell title={`Đánh giá thử việc — ${data.employee.fullName}`} onClose={onClose} size="lg">
      {/* Header info */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4 p-3 rounded-lg" style={{ background: "var(--ibs-bg)" }}>
        <Info label="Mã NV" value={data.employee.code} />
        <Info label="Chức vụ" value={((data.employee as any).jobRole || "Nhân viên")} />
        <Info label="Vị trí / Phòng ban" value={`${(data.employee as any).jobPosition || data.employee.position.name} · ${data.employee.department.name}`} />
        <Info label="Trạng thái" value={
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-lg" style={{ background: STATUS_INFO[data.status].bg, color: STATUS_INFO[data.status].color }}>
            {STATUS_INFO[data.status].label}
          </span>
        } />
      </div>

      {/* Score summary */}
      <div className="flex items-center justify-between gap-3 mb-4 p-4 rounded-lg border" style={{ background: "rgba(0,180,216,0.04)", borderColor: "rgba(0,180,216,0.3)" }}>
        <div>
          <div className="text-[11px] uppercase font-semibold" style={{ color: "var(--ibs-text-dim)" }}>Điểm đánh giá</div>
          <div className="text-[24px] font-bold mt-1" style={{ color: data.totalScore >= 9 ? "var(--ibs-success)" : data.totalScore >= 7.5 ? "#22c55e" : data.totalScore >= 6 ? "#f59e0b" : "var(--ibs-danger)" }}>
            {data.totalScore.toFixed(1)}<span className="text-[12px]" style={{ color: "var(--ibs-text-dim)" }}>/10</span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[11px] uppercase font-semibold" style={{ color: "var(--ibs-text-dim)" }}>Tier HĐ đã chốt</div>
          <div className="text-[14px] font-bold mt-1" style={{ color: (data.selectedTier || data.recommendedTier) === "FAIL" ? "var(--ibs-danger)" : "var(--ibs-success)" }}>
            {TIER_LABELS[data.selectedTier || data.recommendedTier]}
          </div>
          {data.selectedTier && data.selectedTier !== data.recommendedTier && (
            <div className="text-[10px] mt-0.5" style={{ color: "var(--ibs-text-dim)" }}>(override gợi ý: {TIER_LABELS[data.recommendedTier]})</div>
          )}
        </div>
      </div>

      {/* Criteria readonly */}
      <div className="mb-4">
        <div className="text-[12px] font-semibold mb-2" style={{ color: "var(--ibs-text-dim)" }}>Chi tiết 8 tiêu chí</div>
        <div className="rounded-lg border overflow-hidden" style={{ borderColor: "var(--ibs-border)" }}>
          {PROBATION_CRITERIA.map((cr, idx) => {
            const r = data.scores.ratings[cr.key];
            const info = r ? PROBATION_RATINGS[r] : null;
            return (
              <div key={cr.key} className="flex items-center gap-3 px-3 py-2 border-b last:border-0 text-[12px]" style={{ borderColor: "rgba(51,65,85,0.3)" }}>
                <span style={{ color: "var(--ibs-text-dim)" }}>{idx + 1}.</span>
                <span className="flex-1">{cr.label}</span>
                {info && (
                  <span className="text-[11px] px-2 py-0.5 rounded font-semibold" style={{ background: `${info.color}20`, color: info.color }}>
                    {info.label}
                  </span>
                )}
              </div>
            );
          })}
        </div>
        <div className="grid grid-cols-2 gap-3 mt-3 text-[12px]">
          <div className="p-3 rounded-lg" style={{ background: "var(--ibs-bg)" }}>
            <span style={{ color: "var(--ibs-text-dim)" }}>Đã thực hiện tốt:</span>{" "}
            <strong style={{ color: data.scores.q9PerformsWell ? "var(--ibs-success)" : "var(--ibs-danger)" }}>
              {data.scores.q9PerformsWell ? "CÓ" : "KHÔNG"}
            </strong>
          </div>
          <div className="p-3 rounded-lg" style={{ background: "var(--ibs-bg)" }}>
            <span style={{ color: "var(--ibs-text-dim)" }}>Đồng ý ký HĐ:</span>{" "}
            <strong style={{ color: data.scores.q10SignContract ? "var(--ibs-success)" : "var(--ibs-danger)" }}>
              {data.scores.q10SignContract ? "CÓ" : "KHÔNG"}
            </strong>
          </div>
        </div>
      </div>

      {data.comments && (
        <div className="mb-4 p-3 rounded-lg text-[12px]" style={{ background: "var(--ibs-bg)" }}>
          <div className="font-semibold mb-1" style={{ color: "var(--ibs-text-dim)" }}>Nhận xét của TP:</div>
          <div>{data.comments}</div>
        </div>
      )}

      {data.directorComments && (
        <div className="mb-4 p-3 rounded-lg border text-[12px]" style={{ background: data.status === "REJECTED" ? "rgba(239,68,68,0.06)" : "rgba(34,197,94,0.06)", borderColor: data.status === "REJECTED" ? "rgba(239,68,68,0.3)" : "rgba(34,197,94,0.3)" }}>
          <div className="font-semibold mb-1" style={{ color: data.status === "REJECTED" ? "var(--ibs-danger)" : "var(--ibs-success)" }}>
            {data.status === "REJECTED" ? "Lý do BGĐ trả lại:" : "Ghi chú BGĐ:"}
          </div>
          <div>{data.directorComments}</div>
        </div>
      )}

      {data.status === "SIGNED" && (
        <div className="mb-4 p-3 rounded-lg border text-[12px]" style={{ background: "rgba(34,197,94,0.06)", borderColor: "rgba(34,197,94,0.3)" }}>
          <div className="flex items-center gap-2 font-semibold mb-1" style={{ color: "var(--ibs-success)" }}>
            <Award size={14} /> Đã ký HĐ chính thức
          </div>
          {data.contractStartDate && <div>Bắt đầu: {formatDate(data.contractStartDate)}</div>}
          {data.contractEndDate && <div>Hết hạn: {formatDate(data.contractEndDate)}</div>}
          {!data.contractEndDate && <div>HĐ không thời hạn</div>}
          {data.signedContractUrl && (
            <a href={viewUrl(data.signedContractUrl)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 mt-1 hover:underline" style={{ color: "var(--ibs-success)" }}>
              <FileText size={11} /> Xem HĐ đã ký
            </a>
          )}
        </div>
      )}

      {/* Nội dung HĐ đã soạn (Đợi ký hợp đồng) */}
      {data.status === "CONTRACT_ISSUED" && data.contractDraft && (
        <div className="mb-4 p-3 rounded-lg border text-[12px]" style={{ background: "rgba(245,158,11,0.06)", borderColor: "rgba(245,158,11,0.35)" }}>
          <div className="flex items-center gap-2 font-semibold mb-2" style={{ color: "#f59e0b" }}>
            <FileText size={14} /> Hợp đồng đã soạn — chờ ký
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            <div><span style={{ color: "var(--ibs-text-dim)" }}>Số HĐ:</span> <strong>{data.contractDraft.contractNumber}</strong></div>
            <div><span style={{ color: "var(--ibs-text-dim)" }}>Loại:</span> <strong>{TIER_LABELS[data.contractDraft.contractType] || data.contractDraft.contractType}</strong></div>
            <div><span style={{ color: "var(--ibs-text-dim)" }}>Từ ngày:</span> {formatDate(data.contractDraft.startDate)}</div>
            <div><span style={{ color: "var(--ibs-text-dim)" }}>Đến ngày:</span> {data.contractDraft.endDate ? formatDate(data.contractDraft.endDate) : "Không thời hạn"}</div>
            <div><span style={{ color: "var(--ibs-text-dim)" }}>Lương chính:</span> {data.contractDraft.baseSalary.toLocaleString("vi-VN")}đ</div>
            <div><span style={{ color: "var(--ibs-text-dim)" }}>Phụ cấp + KPI:</span> {((data.contractDraft.allowance||0)+(data.contractDraft.kpi||0)).toLocaleString("vi-VN")}đ</div>
            {data.contractDraft.jobTitle && <div><span style={{ color: "var(--ibs-text-dim)" }}>Chức danh:</span> {data.contractDraft.jobTitle}</div>}
            {data.contractDraft.workLocation && <div><span style={{ color: "var(--ibs-text-dim)" }}>Nơi làm việc:</span> {data.contractDraft.workLocation}</div>}
          </div>
          <div className="flex gap-2 mt-3">
            <a href={`/api/v1/recruitment/probation-evaluation/${data.id}/contract-pdf`} download
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold border"
              style={{ borderColor: "#f59e0b", color: "#f59e0b" }}>
              <FileText size={12} /> Tải PDF
            </a>
            <a href={`/api/v1/recruitment/probation-evaluation/${data.id}/contract-docx`} download
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold border"
              style={{ borderColor: "var(--ibs-accent)", color: "var(--ibs-accent)" }}>
              <FileText size={12} /> Tải Word
            </a>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap items-center justify-end gap-2 pt-3 border-t" style={{ borderColor: "var(--ibs-border)" }}>
        {/* BGĐ duyệt / từ chối */}
        {data.status === "PENDING_DIRECTOR" && isBOM && (
          <>
            <button onClick={() => setTab("approve")} className="px-3 py-2 rounded-lg text-[12px] font-semibold flex items-center gap-1.5" style={{ background: "rgba(34,197,94,0.15)", color: "var(--ibs-success)" }}>
              <ThumbsUp size={13} /> Duyệt
            </button>
            <button onClick={() => setTab("approve")} className="px-3 py-2 rounded-lg text-[12px] font-semibold flex items-center gap-1.5" style={{ background: "rgba(239,68,68,0.15)", color: "var(--ibs-danger)" }}>
              <ThumbsDown size={13} /> Trả lại
            </button>
          </>
        )}

        {/* HCNS soạn thảo HĐ (BGĐ đã duyệt) */}
        {data.status === "APPROVED" && canEdit && (data.selectedTier || data.recommendedTier) !== "FAIL" && (
          <button onClick={() => setTab("draft")} className="px-3 py-2 rounded-lg text-[12px] font-semibold flex items-center gap-1.5" style={{ background: "var(--ibs-accent)", color: "#fff" }}>
            <FileText size={13} /> Soạn thảo HĐ
          </button>
        )}

        {/* HCNS xác nhận đã ký (Đợi ký hợp đồng) */}
        {data.status === "CONTRACT_ISSUED" && canEdit && (
          <button onClick={() => setTab("sign")} className="px-3 py-2 rounded-lg text-[12px] font-semibold flex items-center gap-1.5" style={{ background: "var(--ibs-accent)", color: "#fff" }}>
            <Award size={13} /> Xác nhận đã ký HĐ
          </button>
        )}

        {/* HCNS chấm dứt thử việc */}
        {data.status === "APPROVED" && canEdit && (data.selectedTier || data.recommendedTier) === "FAIL" && (
          <button
            onClick={async () => {
              if (!(await confirmDialog({ message: "Xác nhận chấm dứt thử việc với nhân viên này?", tone: "danger", confirmText: "Chấm dứt" }))) return;
              const res = await fetch(`/api/v1/recruitment/probation-evaluation/${data.id}/mark-failed`, { method: "POST" });
              if (res.ok) { onChanged(); onClose(); }
            }}
            className="px-3 py-2 rounded-lg text-[12px] font-semibold flex items-center gap-1.5"
            style={{ background: "var(--ibs-danger)", color: "#fff" }}
          >
            <ThumbsDown size={13} /> Chấm dứt thử việc
          </button>
        )}

        <button onClick={onClose} className="px-4 py-2 rounded-lg text-[13px] font-semibold" style={{ background: "var(--ibs-bg)", color: "var(--ibs-text)" }}>
          Đóng
        </button>
      </div>

      {tab === "approve" && (
        <ApproveModal
          evaluationId={data.id}
          onClose={() => setTab("view")}
          onDone={() => { setTab("view"); onChanged(); onClose(); }}
        />
      )}
      {tab === "draft" && (
        <DraftContractModal
          evaluation={data}
          onClose={() => setTab("view")}
          onDone={() => { setTab("view"); onChanged(); onClose(); }}
        />
      )}
      {tab === "sign" && (
        <SignContractModal
          evaluation={data}
          onClose={() => setTab("view")}
          onDone={() => { setTab("view"); onChanged(); onClose(); }}
        />
      )}
    </ModalShell>
  );
}

// ============== APPROVE / REJECT MODAL ==============
function ApproveModal({ evaluationId, onClose, onDone }: { evaluationId: string; onClose: () => void; onDone: () => void }) {
  const [mode, setMode] = useState<"approve" | "reject">("approve");
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit() {
    if (mode === "reject" && comment.trim().length < 5) {
      setError("Cần ghi rõ lý do trả lại (≥5 ký tự)");
      return;
    }
    setSaving(true);
    setError("");
    const url = `/api/v1/recruitment/probation-evaluation/${evaluationId}/${mode}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ directorComments: comment || null }),
    });
    setSaving(false);
    if (res.ok) onDone();
    else {
      const data = await res.json();
      setError(apiError(res.status, data.error));
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4">
      <div className="rounded-2xl w-full max-w-md p-6" style={{ background: "var(--ibs-bg-card)", border: "1px solid var(--ibs-border)" }}>
        <div className="flex items-center justify-between mb-4">
          <div className="text-[16px] font-bold">BGĐ xét duyệt đánh giá</div>
          <button onClick={onClose}><X size={18} /></button>
        </div>

        <div className="flex gap-1 p-1 rounded-xl mb-4" style={{ background: "var(--ibs-bg)" }}>
          <button onClick={() => setMode("approve")} className="flex-1 py-2 rounded-lg text-[12px] font-semibold" style={{ background: mode === "approve" ? "var(--ibs-success)" : "transparent", color: mode === "approve" ? "#fff" : "var(--ibs-text-dim)" }}>
            Duyệt
          </button>
          <button onClick={() => setMode("reject")} className="flex-1 py-2 rounded-lg text-[12px] font-semibold" style={{ background: mode === "reject" ? "var(--ibs-danger)" : "transparent", color: mode === "reject" ? "#fff" : "var(--ibs-text-dim)" }}>
            Trả lại
          </button>
        </div>

        <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>
          {mode === "approve" ? "Ghi chú (tuỳ chọn)" : "Lý do trả lại *"}
        </label>
        <textarea
          rows={3}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder={mode === "approve" ? "Vd: Đồng ý ký HĐ theo tier TP đề xuất" : "Vd: Đánh giá điểm Sáng tạo chưa phù hợp, đề nghị TP đánh giá lại…"}
          className="w-full rounded-lg px-3 py-2 text-[13px] border resize-none mb-3"
          style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }}
        />

        {error && <div className="text-[12px] text-red-500 mb-2">{error}</div>}

        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-[13px] border" style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-dim)" }}>Hủy</button>
          <button onClick={handleSubmit} disabled={saving} className="px-4 py-2 rounded-lg text-[13px] font-semibold" style={{ background: mode === "approve" ? "var(--ibs-success)" : "var(--ibs-danger)", color: "#fff" }}>
            {saving ? "Đang xử lý..." : (mode === "approve" ? "Xác nhận duyệt" : "Xác nhận trả lại")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============== DRAFT CONTRACT MODAL (soạn thảo văn bản → phát hành) ==============
function DraftContractModal({ evaluation, onClose, onDone }: { evaluation: Evaluation; onClose: () => void; onDone: () => void }) {
  const tier = evaluation.selectedTier || evaluation.recommendedTier;
  const editorRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [employeeCode, setEmployeeCode] = useState("");
  const [startDate, setStartDate] = useState("");
  const [baseSalary, setBaseSalary] = useState<string>("");
  const [allowance, setAllowance] = useState<string>("");
  const [kpi, setKpi] = useState<string>("");
  const [jobTitle, setJobTitle] = useState("");
  const [workLocation, setWorkLocation] = useState("");
  const [terms, setTerms] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Tải nội dung HĐ pre-fill (HTML) + thông tin gợi ý
  useEffect(() => {
    fetch(`/api/v1/recruitment/probation-evaluation/${evaluation.id}/contract-prefill`)
      .then((r) => r.json())
      .then((res) => {
        const s = res.data?.suggested || {};
        setEmployeeCode(s.employeeCode || "");
        setStartDate(s.startDate || "");
        setBaseSalary(s.baseSalary ? String(s.baseSalary) : "");
        setAllowance(s.allowance ? String(s.allowance) : "");
        setKpi(s.kpi ? String(s.kpi) : "");
        setJobTitle(s.jobTitle || "");
        setWorkLocation(s.workLocation || "");
        setTerms(s.terms || "");
        if (editorRef.current && res.data?.html) editorRef.current.innerHTML = res.data.html;
      })
      .finally(() => setLoading(false));
  }, [evaluation.id]);

  const exec = (cmd: string) => { document.execCommand(cmd, false); editorRef.current?.focus(); };

  // Số HĐLĐ cố định: <mã NV>/<năm ký>/HĐLĐ/IBS HI — không cho sửa.
  const contractNumber = employeeCode && startDate ? `${employeeCode}/${new Date(startDate).getFullYear()}/HĐLĐ/IBS HI` : "";

  const Money = ({ v, set }: { v: string; set: (s: string) => void }) => (
    <div className="relative">
      <input type="text" inputMode="numeric" value={v ? formatVND(Number(v)) : ""} onChange={(e) => set(e.target.value.replace(/[^\d]/g, ""))} placeholder="0"
        className="w-full rounded-lg px-2 py-1.5 pr-6 text-[12px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }} />
      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] pointer-events-none" style={{ color: "var(--ibs-text-dim)" }}>đ</span>
    </div>
  );

  async function handleSubmit() {
    if (!contractNumber.trim() || !startDate || !baseSalary) { setError("Cần số HĐ, ngày bắt đầu và lương chính"); return; }
    setSaving(true); setError("");
    const res = await fetch(`/api/v1/recruitment/probation-evaluation/${evaluation.id}/issue-contract`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contractNumber: contractNumber.trim(),
        startDate: new Date(startDate).toISOString(),
        baseSalary: Number(baseSalary), allowance: Number(allowance) || 0, kpi: Number(kpi) || 0,
        jobTitle: jobTitle.trim() || null, workLocation: workLocation.trim() || null, terms: terms.trim() || null,
        contractHtml: editorRef.current?.innerHTML || null,
      }),
    });
    setSaving(false);
    if (res.ok) onDone();
    else { const d = await res.json(); setError(apiError(res.status, d.error)); }
  }

  const L = ({ children }: { children: React.ReactNode }) => <label className="text-[11px] font-medium block" style={{ color: "var(--ibs-text-dim)" }}>{children}</label>;
  const fcls = "w-full rounded-lg px-2 py-1.5 text-[12px] border";
  const fst = { background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" } as React.CSSProperties;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4">
      <div className="rounded-2xl w-full max-w-3xl p-6 max-h-[92vh] overflow-y-auto flex flex-col" style={{ background: "var(--ibs-bg-card)", border: "1px solid var(--ibs-border)" }}>
        <div className="flex items-center justify-between mb-3">
          <div className="text-[16px] font-bold">Soạn thảo hợp đồng lao động — {TIER_LABELS[tier]}</div>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <div className="text-[12px] mb-3 p-2.5 rounded-lg" style={{ background: "rgba(0,180,216,0.06)", color: "var(--ibs-text-dim)" }}>
          ⓘ Thông tin đã điền sẵn từ Thư mời + hồ sơ NV — anh chỉ cần <strong>chỉnh sửa &amp; xác nhận</strong> rồi <strong>Phát hành</strong> (sinh file Word/PDF để in, trạng thái → Đợi ký hợp đồng).
        </div>

        {/* Thông tin hệ thống (đã điền sẵn) */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-3 p-3 rounded-lg" style={{ background: "var(--ibs-bg)" }}>
          <div className="col-span-2 md:col-span-1"><L>Số HĐLĐ (tự sinh)</L><input value={contractNumber} readOnly title="Số HĐ tự sinh theo mã NV/năm ký — không sửa" className={fcls} style={{ ...fst, opacity: 0.75, cursor: "not-allowed" }} /></div>
          <div><L>Ngày bắt đầu *</L><DateInput value={startDate} onChange={(e) => setStartDate(e.target.value)} className={fcls} style={fst} /></div>
          <div><L>Lương chính (BHXH) *</L><Money v={baseSalary} set={setBaseSalary} /></div>
          <div><L>Phụ cấp</L><Money v={allowance} set={setAllowance} /></div>
          <div><L>KPI</L><Money v={kpi} set={setKpi} /></div>
          <div><L>Chức danh</L><input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} className={fcls} style={fst} /></div>
        </div>

        {/* Trình soạn thảo văn bản HĐ */}
        <div className="text-[11px] font-semibold mb-1" style={{ color: "var(--ibs-text-dim)" }}>NỘI DUNG HỢP ĐỒNG (sửa trực tiếp như Word)</div>
        <div className="flex gap-1 mb-1">
          <button type="button" onMouseDown={(e) => { e.preventDefault(); exec("bold"); }} className="px-2 py-1 rounded text-[12px] font-bold border" style={{ borderColor: "var(--ibs-border)" }}>B</button>
          <button type="button" onMouseDown={(e) => { e.preventDefault(); exec("italic"); }} className="px-2 py-1 rounded text-[12px] italic border" style={{ borderColor: "var(--ibs-border)" }}>I</button>
          <button type="button" onMouseDown={(e) => { e.preventDefault(); exec("insertUnorderedList"); }} className="px-2 py-1 rounded text-[12px] border" style={{ borderColor: "var(--ibs-border)" }}>• List</button>
        </div>
        {loading && <div className="text-[12px] py-4 text-center" style={{ color: "var(--ibs-text-dim)" }}>Đang tải nội dung hợp đồng…</div>}
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          className="rounded-lg border p-4 text-[12.5px] overflow-y-auto leading-relaxed"
          style={{ background: "#fff", color: "#111", borderColor: "var(--ibs-border)", minHeight: 300, maxHeight: 380, display: loading ? "none" : "block" }}
        />

        {error && <div className="text-[12px] text-red-500 mt-2">{error}</div>}
        <div className="flex gap-2 justify-end mt-4">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-[13px] border" style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-dim)" }}>Hủy</button>
          <button onClick={handleSubmit} disabled={saving || loading} className="px-4 py-2 rounded-lg text-[13px] font-semibold" style={{ background: "var(--ibs-accent)", color: "#fff", opacity: saving || loading ? 0.7 : 1 }}>
            {saving ? "Đang phát hành..." : "Phát hành hợp đồng"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============== SIGN CONTRACT MODAL (Đợi ký → xác nhận đã ký) ==============
function SignContractModal({ evaluation, onClose, onDone }: { evaluation: Evaluation; onClose: () => void; onDone: () => void }) {
  const [signedUrl, setSignedUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit() {
    if (!signedUrl) { setError("Cần upload file HĐ đã ký"); return; }
    setSaving(true);
    const res = await fetch(`/api/v1/recruitment/probation-evaluation/${evaluation.id}/sign-contract`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ signedContractUrl: signedUrl }),
    });
    setSaving(false);
    if (res.ok) onDone();
    else { const data = await res.json(); setError(apiError(res.status, data.error)); }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4">
      <div className="rounded-2xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto" style={{ background: "var(--ibs-bg-card)", border: "1px solid var(--ibs-border)" }}>
        <div className="flex items-center justify-between mb-4">
          <div className="text-[16px] font-bold">Xác nhận đã ký HĐ chính thức</div>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <div className="text-[12px] mb-3 p-3 rounded-lg" style={{ background: "rgba(0,180,216,0.06)", color: "var(--ibs-text-dim)" }}>
          ⓘ Upload bản scan HĐ đã ký → NV chuyển sang <strong>Đang làm việc</strong>, hệ thống tạo HĐLĐ chính thức (số {evaluation.contractDraft?.contractNumber || ""}) vào hồ sơ M1.
        </div>
        <div>
          <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>File scan HĐ đã ký *</label>
          <FileUpload
            bucket={BUCKETS.HR_DOCUMENTS}
            folder={`contracts/${evaluation.employee.code}`}
            label="Upload file scan HĐ (PDF/ảnh)"
            currentUrl={signedUrl || undefined}
            onUploaded={(res) => setSignedUrl(res.url)}
            onError={(msg) => void alertDialog(msg)}
          />
        </div>
        {error && <div className="text-[12px] text-red-500 mt-2">{error}</div>}
        <div className="flex gap-2 justify-end mt-4">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-[13px] border" style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-dim)" }}>Hủy</button>
          <button onClick={handleSubmit} disabled={saving} className="px-4 py-2 rounded-lg text-[13px] font-semibold" style={{ background: "var(--ibs-accent)", color: "#fff" }}>
            {saving ? "Đang lưu..." : "Xác nhận ký HĐ"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============== SHARED ==============
function CriteriaTable({ ratings, setRatings }: { ratings: Record<string, RatingKey>; setRatings: React.Dispatch<React.SetStateAction<Record<string, RatingKey>>> }) {
  return (
    <div className="rounded-lg border overflow-hidden mb-4" style={{ borderColor: "var(--ibs-border)" }}>
      <div className="grid text-[11px] uppercase font-semibold px-3 py-2 border-b" style={{ background: "rgba(0,180,216,0.06)", borderColor: "var(--ibs-border)", color: "var(--ibs-text-dim)", gridTemplateColumns: "1fr 80px 80px 80px 80px" }}>
        <div>Tiêu chí</div>
        <div className="text-center" style={{ color: PROBATION_RATINGS.SATISFACTORY.color }}>Tốt</div>
        <div className="text-center" style={{ color: PROBATION_RATINGS.NEEDS_IMPROVEMENT.color }}>Cải thiện</div>
        <div className="text-center" style={{ color: PROBATION_RATINGS.UNACCEPTABLE.color }}>Kém</div>
        <div className="text-center" style={{ color: PROBATION_RATINGS.NA.color }}>N/A</div>
      </div>
      {PROBATION_CRITERIA.map((cr, idx) => (
        <div key={cr.key} className="grid items-center px-3 py-2 border-b last:border-0 text-[12px]" style={{ borderColor: "rgba(51,65,85,0.3)", gridTemplateColumns: "1fr 80px 80px 80px 80px" }}>
          <div>
            <span style={{ color: "var(--ibs-text-dim)", marginRight: 6 }}>{idx + 1}.</span>
            {cr.label}
          </div>
          {(["SATISFACTORY", "NEEDS_IMPROVEMENT", "UNACCEPTABLE", "NA"] as RatingKey[]).map((r) => (
            <div key={r} className="flex justify-center">
              <input
                type="radio"
                name={cr.key}
                checked={ratings[cr.key] === r}
                onChange={() => setRatings((prev) => ({ ...prev, [cr.key]: r }))}
                style={{ accentColor: PROBATION_RATINGS[r].color, cursor: "pointer", width: 16, height: 16 }}
              />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function YesNoCard({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="p-3 rounded-lg border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)" }}>
      <div className="text-[12px] mb-2">{label}</div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onChange(true); }}
          className="flex-1 py-1.5 rounded-lg text-[12px] font-semibold border cursor-pointer"
          style={{ background: value ? "var(--ibs-success)" : "transparent", color: value ? "#fff" : "var(--ibs-text)", borderColor: value ? "var(--ibs-success)" : "var(--ibs-border)" }}
        >
          Có
        </button>
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onChange(false); }}
          className="flex-1 py-1.5 rounded-lg text-[12px] font-semibold border cursor-pointer"
          style={{ background: !value ? "var(--ibs-danger)" : "transparent", color: !value ? "#fff" : "var(--ibs-text)", borderColor: !value ? "var(--ibs-danger)" : "var(--ibs-border)" }}
        >
          Không
        </button>
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
