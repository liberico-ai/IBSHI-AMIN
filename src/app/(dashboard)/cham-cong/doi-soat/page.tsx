"use client";

import { useState, useEffect } from "react";
import { PageTitle } from "@/components/layout/page-title";
import { useCan } from "@/hooks/use-permission";
import { Check } from "lucide-react";

type Row = {
  id: string; employeeId: string; employeeName: string; date: string;
  departmentName: string; declaredHours: number; machineHours: number;
  actualHours: number | null; hcnsApproved: boolean; xuongApproved: boolean; status: string;
};

export default function DoiSoatPage() {
  const can = useCan();
  const canEdit = can("m3.doisoat:edit");
  const canApprove = can("m3.doisoat:approve");
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [draftActual, setDraftActual] = useState<Record<string, string>>({});

  function load() {
    setLoading(true);
    fetch(`/api/v1/attendance-reconcile?month=${month}&year=${year}`).then((r) => r.json())
      .then((j) => { setRows(j.data || []); setDraftActual({}); }).catch(() => {}).finally(() => setLoading(false));
  }
  useEffect(load, [month, year]); // eslint-disable-line

  async function saveActual(id: string) {
    const v = draftActual[id];
    if (v === undefined || v === "") return;
    const res = await fetch(`/api/v1/attendance-reconcile/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ actualHours: Number(v) }) });
    if (!res.ok) { const j = await res.json().catch(() => ({})); alert(j?.error?.message || "Lưu thất bại"); return; }
    load();
  }
  async function approve(id: string) {
    const res = await fetch(`/api/v1/attendance-reconcile/${id}/approve`, { method: "POST" });
    if (!res.ok) { const j = await res.json().catch(() => ({})); alert(j?.error?.message || "Duyệt thất bại"); return; }
    load();
  }

  const th = "px-3 py-2.5 text-left text-[11px] font-semibold uppercase";

  return (
    <div>
      <PageTitle title="Đối soát chấm công" description="So khớp giờ kê khai (phiếu tổ) với giờ máy — HCNS nhập giờ thực, cần TP HCNS + phụ trách Xưởng duyệt" />

      <div className="flex items-center gap-2 mb-3">
        <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="px-3 py-1.5 rounded-lg text-[13px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }}>
          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => <option key={m} value={m}>Tháng {m}</option>)}
        </select>
        <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="px-3 py-1.5 rounded-lg text-[13px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }}>
          {[year - 1, year, year + 1].map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      <div className="rounded-xl border overflow-x-auto" style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
        {loading ? (
          <div className="px-4 py-10 text-center text-[13px]" style={{ color: "var(--ibs-text-dim)" }}>Đang tải...</div>
        ) : rows.length === 0 ? (
          <div className="px-4 py-10 text-center text-[13px]" style={{ color: "var(--ibs-text-dim)" }}>Không có mục lệch nào trong tháng — kê khai khớp chấm công ✓</div>
        ) : (
          <table className="w-full text-[13px]">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--ibs-border)" }}>
                {["Ngày", "Nhân viên", "Phòng/Xưởng", "Kê khai", "Máy", "Chênh", "Giờ thực", "Duyệt", ""].map((h) => (
                  <th key={h} className={th} style={{ color: "var(--ibs-text-dim)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const diff = (r.declaredHours - r.machineHours);
                const resolved = r.status === "RESOLVED";
                return (
                  <tr key={r.id} style={{ borderBottom: "1px solid var(--ibs-border)" }} className="hover:bg-white/[0.02]">
                    <td className="px-3 py-2.5 whitespace-nowrap">{new Date(r.date).toLocaleDateString("vi-VN")}</td>
                    <td className="px-3 py-2.5">{r.employeeName}</td>
                    <td className="px-3 py-2.5">{r.departmentName}</td>
                    <td className="px-3 py-2.5">{r.declaredHours}h</td>
                    <td className="px-3 py-2.5">{r.machineHours}h</td>
                    <td className="px-3 py-2.5 font-semibold" style={{ color: diff === 0 ? "var(--ibs-text-dim)" : "#ef4444" }}>{diff > 0 ? "+" : ""}{diff}h</td>
                    <td className="px-3 py-2.5">
                      {resolved ? (
                        <span className="font-semibold" style={{ color: "#10b981" }}>{r.actualHours}h</span>
                      ) : canEdit ? (
                        <div className="flex items-center gap-1">
                          <input type="number" step="0.5" min="0"
                            value={draftActual[r.id] ?? (r.actualHours ?? "")}
                            onChange={(e) => setDraftActual((p) => ({ ...p, [r.id]: e.target.value }))}
                            onBlur={() => { if ((draftActual[r.id] ?? "") !== "" && Number(draftActual[r.id]) !== r.actualHours) saveActual(r.id); }}
                            className="w-16 px-2 py-1 rounded-md text-[12px] outline-none text-right border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }} />
                          <span className="text-[11px]" style={{ color: "var(--ibs-text-dim)" }}>h</span>
                        </div>
                      ) : (
                        <span style={{ color: "var(--ibs-text-dim)" }}>{r.actualHours != null ? `${r.actualHours}h` : "—"}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5 text-[11px]">
                        <span className="px-1.5 py-0.5 rounded font-semibold" style={{ color: r.hcnsApproved ? "#10b981" : "var(--ibs-text-dim)", background: r.hcnsApproved ? "rgba(16,185,129,0.12)" : "rgba(148,163,184,0.12)" }}>HCNS {r.hcnsApproved ? "✓" : "…"}</span>
                        <span className="px-1.5 py-0.5 rounded font-semibold" style={{ color: r.xuongApproved ? "#10b981" : "var(--ibs-text-dim)", background: r.xuongApproved ? "rgba(16,185,129,0.12)" : "rgba(148,163,184,0.12)" }}>Xưởng {r.xuongApproved ? "✓" : "…"}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      {resolved ? (
                        <span className="text-[11px] px-2 py-0.5 rounded font-semibold" style={{ color: "#10b981", background: "rgba(16,185,129,0.12)" }}>Đã ốp</span>
                      ) : canApprove && r.actualHours != null ? (
                        <button onClick={() => approve(r.id)} className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold text-white" style={{ background: "#10b981" }}><Check size={12} /> Duyệt</button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <p className="text-[11px] mt-2" style={{ color: "var(--ibs-text-dim)" }}>
        Đối soát theo tháng — không bắt buộc ngày nào ốp ngày đó. HCNS nhập <b>Giờ thực</b> → cần <b>TP HCNS</b> và <b>phụ trách Xưởng</b> cùng Duyệt → giờ thực được ốp vào chấm công (không đè giờ máy).
      </p>
    </div>
  );
}
