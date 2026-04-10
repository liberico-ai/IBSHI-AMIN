"use client";

import { useState, useEffect } from "react";
import { PageTitle } from "@/components/layout/page-title";
import { BarChart2, TrendingUp, TrendingDown, RefreshCw, Star, Users, Minus } from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────────

type KPIScore = {
  id: string;
  departmentId: string;
  quarter: number;
  year: number;
  attendanceRate: number;
  productivityRate: number;
  qualityRate: number;
  safetyRate: number;
  overallScore: number;
  trend: number;
  department: { id: string; code: string; name: string };
};

type Evaluation = {
  id: string;
  employeeId: string;
  evaluatorId: string;
  period: string;
  relationship: string;
  scores: Record<string, number>;
  comment?: string;
  evaluator: { fullName: string; position?: { name: string } };
};

type Employee = { id: string; code: string; fullName: string };

const EVAL_CRITERIA = [
  { key: "leadership", label: "Lãnh đạo / Chủ động" },
  { key: "teamwork", label: "Làm việc nhóm" },
  { key: "technical", label: "Kỹ năng chuyên môn" },
  { key: "communication", label: "Giao tiếp" },
  { key: "punctuality", label: "Đúng giờ / Kỷ luật" },
];

const RELATIONSHIP_LABELS: Record<string, string> = {
  SELF: "Tự đánh giá",
  MANAGER: "Cấp trên",
  PEER: "Đồng nghiệp",
  SUBORDINATE: "Cấp dưới",
};

// ─── Score cell with color ───────────────────────────────────────────────────────
function ScoreCell({ value }: { value: number }) {
  const color = value >= 90 ? "#10b981" : value >= 80 ? "#f59e0b" : "#ef4444";
  return <span style={{ color, fontWeight: 700 }}>{value.toFixed(1)}%</span>;
}

function TrendCell({ value }: { value: number }) {
  if (value === 0) return <span style={{ color: "var(--ibs-text-dim)" }}>—</span>;
  const color = value > 0 ? "#10b981" : "#ef4444";
  const Icon = value > 0 ? TrendingUp : TrendingDown;
  return (
    <span className="flex items-center gap-1" style={{ color }}>
      <Icon size={12} />
      {Math.abs(value).toFixed(1)}%
    </span>
  );
}

// ─── Eval Dialog ────────────────────────────────────────────────────────────────
function EvalDialog({
  employees,
  onClose,
  onSuccess,
}: {
  employees: Employee[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const currentQuarter = Math.ceil((new Date().getMonth() + 1) / 3);
  const currentYear = new Date().getFullYear();

  const [form, setForm] = useState({
    employeeId: "",
    period: `Q${currentQuarter}/${currentYear}`,
    relationship: "PEER",
    scores: Object.fromEntries(EVAL_CRITERIA.map((c) => [c.key, 3])),
    comment: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function setScore(key: string, val: number) {
    setForm((f) => ({ ...f, scores: { ...f.scores, [key]: val } }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.employeeId) { setError("Chọn nhân viên cần đánh giá"); return; }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/kpi/evaluations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error?.message || "Có lỗi xảy ra");
        return;
      }
      onSuccess();
    } catch {
      setError("Lỗi kết nối");
    } finally {
      setSaving(false);
    }
  }

  const inputCls = "w-full px-3 py-2 rounded-lg text-[13px] outline-none";
  const inputStyle = { background: "var(--ibs-bg)", border: "1px solid var(--ibs-border)", color: "var(--ibs-text)" };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.7)" }}>
      <div className="w-full max-w-[520px] rounded-xl border shadow-2xl overflow-auto max-h-[90vh]"
        style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "var(--ibs-border)" }}>
          <h3 className="text-[15px] font-semibold">Đánh giá 360°</h3>
          <button onClick={onClose} style={{ color: "var(--ibs-text-dim)" }}>✕</button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="px-3 py-2 rounded-lg text-[13px]" style={{ background: "rgba(239,68,68,0.1)", color: "var(--ibs-danger)" }}>
              {error}
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--ibs-text-muted)" }}>
                Nhân viên cần đánh giá *
              </label>
              <select value={form.employeeId} onChange={(e) => setForm((f) => ({ ...f, employeeId: e.target.value }))}
                className={inputCls} style={inputStyle}>
                <option value="">-- Chọn --</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>{emp.fullName} ({emp.code})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--ibs-text-muted)" }}>
                Mối quan hệ *
              </label>
              <select value={form.relationship} onChange={(e) => setForm((f) => ({ ...f, relationship: e.target.value }))}
                className={inputCls} style={inputStyle}>
                {Object.entries(RELATIONSHIP_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--ibs-text-muted)" }}>Kỳ đánh giá</label>
            <input value={form.period} onChange={(e) => setForm((f) => ({ ...f, period: e.target.value }))}
              placeholder="Q1/2026" className={inputCls} style={inputStyle} />
          </div>

          <div className="space-y-3">
            <p className="text-[12px] font-medium" style={{ color: "var(--ibs-text-muted)" }}>Điểm đánh giá (1–5 sao)</p>
            {EVAL_CRITERIA.map((c) => (
              <div key={c.key} className="flex items-center justify-between">
                <span className="text-[13px]">{c.label}</span>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button key={star} type="button" onClick={() => setScore(c.key, star)}>
                      <Star size={18} fill={form.scores[c.key] >= star ? "#f59e0b" : "none"}
                        style={{ color: form.scores[c.key] >= star ? "#f59e0b" : "var(--ibs-text-dim)" }} />
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div>
            <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--ibs-text-muted)" }}>Nhận xét</label>
            <textarea rows={3} value={form.comment}
              onChange={(e) => setForm((f) => ({ ...f, comment: e.target.value }))}
              placeholder="Điểm mạnh, điểm cần cải thiện..."
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
              {saving ? "Đang gửi..." : "Gửi đánh giá"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────────
export default function KPIPage() {
  const [tab, setTab] = useState<"scores" | "evaluations">("scores");
  const [scores, setScores] = useState<KPIScore[]>([]);
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [showEvalDialog, setShowEvalDialog] = useState(false);

  const currentQuarter = Math.ceil((new Date().getMonth() + 1) / 3);
  const currentYear = new Date().getFullYear();
  const [quarter, setQuarter] = useState(currentQuarter);
  const [year, setYear] = useState(currentYear);

  useEffect(() => {
    fetch(`/api/v1/employees?limit=200`).then((r) => r.json())
      .then((res) => setEmployees(res.data || []));
  }, []);

  useEffect(() => {
    setLoading(true);
    if (tab === "scores") {
      fetch(`/api/v1/kpi/scores?quarter=${quarter}&year=${year}`)
        .then((r) => r.json())
        .then((res) => setScores(res.data || []))
        .finally(() => setLoading(false));
    } else {
      fetch(`/api/v1/kpi/evaluations?period=Q${quarter}/${year}`)
        .then((r) => r.json())
        .then((res) => setEvaluations(res.data || []))
        .finally(() => setLoading(false));
    }
  }, [tab, quarter, year]);

  async function handleCalculate() {
    setCalculating(true);
    try {
      const res = await fetch("/api/v1/kpi/calculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quarter, year }),
      });
      const json = await res.json();
      if (res.ok) setScores(json.data || []);
    } finally {
      setCalculating(false);
    }
  }

  const avgOverall = scores.length
    ? scores.reduce((s, x) => s + x.overallScore, 0) / scores.length
    : 0;

  const cardStyle = { background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" };
  const thStyle = { borderColor: "var(--ibs-border)", color: "var(--ibs-text-dim)" };

  return (
    <div>
      <PageTitle title="M6 — KPI & Đánh giá" description="Điểm KPI theo phòng ban và đánh giá 360°" />

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4 mb-5">
        {[
          { label: "KPI tổng TB", value: `${avgOverall.toFixed(1)}%`, color: avgOverall >= 90 ? "#10b981" : avgOverall >= 80 ? "#f59e0b" : "#ef4444" },
          { label: "Phòng ban", value: scores.length, color: "var(--ibs-accent)" },
          { label: "≥90% (Tốt)", value: scores.filter((s) => s.overallScore >= 90).length, color: "#10b981" },
          { label: "<80% (Cần cải thiện)", value: scores.filter((s) => s.overallScore < 80).length, color: "#ef4444" },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border p-4" style={cardStyle}>
            <div className="text-[26px] font-extrabold" style={{ color: s.color }}>{s.value}</div>
            <div className="text-[12px] mt-0.5" style={{ color: "var(--ibs-text-dim)" }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        {/* Tabs */}
        <div className="flex rounded-lg p-0.5 gap-0.5" style={{ background: "var(--ibs-bg)" }}>
          {([["scores", "KPI Phòng ban"], ["evaluations", "Đánh giá 360°"]] as const).map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)}
              className="px-4 py-1.5 rounded-md text-[13px] font-medium transition-colors"
              style={tab === key
                ? { background: "var(--ibs-accent)", color: "#fff" }
                : { color: "var(--ibs-text-muted)" }}>
              {label}
            </button>
          ))}
        </div>

        {/* Period filter */}
        <select value={quarter} onChange={(e) => setQuarter(parseInt(e.target.value))}
          className="px-3 py-2 rounded-lg text-[13px] outline-none"
          style={{ background: "var(--ibs-bg-card)", border: "1px solid var(--ibs-border)", color: "var(--ibs-text)" }}>
          {[1, 2, 3, 4].map((q) => <option key={q} value={q}>Q{q}</option>)}
        </select>
        <select value={year} onChange={(e) => setYear(parseInt(e.target.value))}
          className="px-3 py-2 rounded-lg text-[13px] outline-none"
          style={{ background: "var(--ibs-bg-card)", border: "1px solid var(--ibs-border)", color: "var(--ibs-text)" }}>
          {[2025, 2026, 2027].map((y) => <option key={y} value={y}>{y}</option>)}
        </select>

        <div className="ml-auto flex gap-2">
          {tab === "scores" && (
            <button onClick={handleCalculate} disabled={calculating}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-medium text-white"
              style={{ background: calculating ? "rgba(0,180,216,0.5)" : "var(--ibs-accent)" }}>
              <RefreshCw size={13} className={calculating ? "animate-spin" : ""} />
              {calculating ? "Đang tính..." : `Tính KPI Q${quarter}/${year}`}
            </button>
          )}
          {tab === "evaluations" && (
            <button onClick={() => setShowEvalDialog(true)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-medium text-white"
              style={{ background: "var(--ibs-accent)" }}>
              <Star size={13} /> Đánh giá đồng nghiệp
            </button>
          )}
        </div>
      </div>

      {/* ── KPI Scores tab ──────────────────────────────────────────────── */}
      {tab === "scores" && (
        <div className="rounded-xl border overflow-hidden" style={cardStyle}>
          {loading ? (
            <div className="py-16 text-center text-[13px]" style={{ color: "var(--ibs-text-dim)" }}>Đang tải...</div>
          ) : scores.length === 0 ? (
            <div className="py-16 text-center text-[13px]" style={{ color: "var(--ibs-text-dim)" }}>
              Chưa có dữ liệu KPI cho Q{quarter}/{year}. Nhấn "Tính KPI" để tính tự động.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    {["Phòng ban", "Chuyên cần", "Năng suất", "Chất lượng", "An toàn", "Tổng điểm", "Xu hướng"].map((h) => (
                      <th key={h} className="text-left px-4 py-3 text-[11px] uppercase tracking-wider font-semibold border-b" style={thStyle}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {scores.map((s) => (
                    <tr key={s.id} className="border-b transition-colors hover:bg-white/[0.02]"
                      style={{ borderColor: "rgba(51,65,85,0.4)" }}>
                      <td className="px-4 py-3">
                        <div className="text-[13px] font-medium">{s.department.name}</div>
                        <div className="text-[11px]" style={{ color: "var(--ibs-text-dim)" }}>{s.department.code}</div>
                      </td>
                      <td className="px-4 py-3"><ScoreCell value={s.attendanceRate} /></td>
                      <td className="px-4 py-3"><ScoreCell value={s.productivityRate} /></td>
                      <td className="px-4 py-3"><ScoreCell value={s.qualityRate} /></td>
                      <td className="px-4 py-3"><ScoreCell value={s.safetyRate} /></td>
                      <td className="px-4 py-3">
                        <span className="text-[15px] font-extrabold">
                          <ScoreCell value={s.overallScore} />
                        </span>
                      </td>
                      <td className="px-4 py-3"><TrendCell value={s.trend} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Evaluations tab ──────────────────────────────────────────────── */}
      {tab === "evaluations" && (
        <div className="rounded-xl border overflow-hidden" style={cardStyle}>
          {loading ? (
            <div className="py-16 text-center text-[13px]" style={{ color: "var(--ibs-text-dim)" }}>Đang tải...</div>
          ) : evaluations.length === 0 ? (
            <div className="py-16 text-center text-[13px]" style={{ color: "var(--ibs-text-dim)" }}>
              Chưa có đánh giá nào cho Q{quarter}/{year}.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    {["Người đánh giá", "Mối quan hệ", "Lãnh đạo", "Nhóm", "Chuyên môn", "Giao tiếp", "Kỷ luật", "Nhận xét"].map((h) => (
                      <th key={h} className="text-left px-4 py-3 text-[11px] uppercase tracking-wider font-semibold border-b" style={thStyle}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {evaluations.map((ev) => (
                    <tr key={ev.id} className="border-b transition-colors hover:bg-white/[0.02]"
                      style={{ borderColor: "rgba(51,65,85,0.4)" }}>
                      <td className="px-4 py-3 text-[13px]">{ev.evaluator.fullName}</td>
                      <td className="px-4 py-3 text-[12px]" style={{ color: "var(--ibs-text-muted)" }}>
                        {RELATIONSHIP_LABELS[ev.relationship] || ev.relationship}
                      </td>
                      {EVAL_CRITERIA.map((c) => (
                        <td key={c.key} className="px-4 py-3 text-[13px] font-semibold" style={{ color: "var(--ibs-accent)" }}>
                          {ev.scores[c.key] ?? "—"}/5
                        </td>
                      ))}
                      <td className="px-4 py-3 text-[12px] max-w-[160px]" style={{ color: "var(--ibs-text-muted)" }}>
                        <span className="line-clamp-2">{ev.comment || "—"}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {showEvalDialog && (
        <EvalDialog
          employees={employees}
          onClose={() => setShowEvalDialog(false)}
          onSuccess={() => {
            setShowEvalDialog(false);
            // Refresh evaluations
            fetch(`/api/v1/kpi/evaluations?period=Q${quarter}/${year}`)
              .then((r) => r.json())
              .then((res) => setEvaluations(res.data || []));
          }}
        />
      )}
    </div>
  );
}
