"use client";

import { useState, useEffect, Fragment } from "react";
import { PageTitle } from "@/components/layout/page-title";
import { DateInput } from "@/components/shared/date-input";
import { useCan } from "@/hooks/use-permission";
import { OT_PROJECTS } from "@/lib/projects";
import { Plus, X, Send, Trash2, Pencil, ChevronRight, ChevronDown } from "lucide-react";

type Entry = { projectCode: string; hours: number; category: string };
type LogEntry = { id: string; employeeId: string; employeeName: string; projectCode: string; hours: number; category: string };
type Log = {
  id: string; date: string; departmentId: string; departmentName: string; status: string;
  rejectReason?: string | null; entries: LogEntry[];
};

const STATUS: Record<string, { label: string; color: string; bg: string }> = {
  DRAFT: { label: "Nháp", color: "#64748b", bg: "rgba(100,116,139,0.12)" },
  PENDING: { label: "Đã kê khai", color: "#10b981", bg: "rgba(16,185,129,0.12)" },
  APPROVED: { label: "Đã kê khai", color: "#10b981", bg: "rgba(16,185,129,0.12)" },
  REJECTED: { label: "Từ chối", color: "#ef4444", bg: "rgba(239,68,68,0.12)" },
};

export default function PhieuToPage() {
  const can = useCan();
  const canCreate = can("m3.phieuto:create");
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [editLog, setEditLog] = useState<Log | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  function load() {
    setLoading(true);
    fetch("/api/v1/team-work-logs").then((r) => r.json()).then((j) => setLogs(j.data || [])).catch(() => {}).finally(() => setLoading(false));
  }
  useEffect(load, []);

  async function doAction(id: string, path: string, body?: any) {
    const res = await fetch(`/api/v1/team-work-logs/${id}${path}`, {
      method: path === "" ? "DELETE" : "POST",
      headers: { "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!res.ok) { const j = await res.json().catch(() => ({})); alert(j?.error?.message || "Thao tác thất bại"); return; }
    load();
  }

  return (
    <div>
      <PageTitle title="Phiếu kê khai tổ trưởng (hàng ngày)" description="Tổ trưởng kê khai sản xuất — NV × dự án × giờ × hạng mục" />

      <div className="flex justify-end mb-3">
        {canCreate && (
          <button onClick={() => setShowNew(true)} className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[13px] font-semibold text-white" style={{ background: "var(--ibs-accent)" }}>
            <Plus size={15} /> Thêm phiếu
          </button>
        )}
      </div>

      <div className="rounded-xl border overflow-hidden" style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
        {loading ? (
          <div className="px-4 py-10 text-center text-[13px]" style={{ color: "var(--ibs-text-dim)" }}>Đang tải...</div>
        ) : logs.length === 0 ? (
          <div className="px-4 py-10 text-center text-[13px]" style={{ color: "var(--ibs-text-dim)" }}>Chưa có phiếu kê khai nào</div>
        ) : (
          <table className="w-full text-[13px]">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--ibs-border)" }}>
                {["Ngày", "Phòng/Xưởng", "Số dòng", "Tổng giờ", "Trạng thái", ""].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase" style={{ color: "var(--ibs-text-dim)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => {
                const totalH = l.entries.reduce((s, e) => s + (e.hours || 0), 0);
                const st = STATUS[l.status] || STATUS.DRAFT;
                const isDraft = l.status === "DRAFT";
                const open = openId === l.id;
                // Gom dòng theo nhân viên để hiển thị "ai làm dự án gì".
                const grouped: Record<string, { name: string; rows: LogEntry[] }> = {};
                for (const e of l.entries) (grouped[e.employeeId] ??= { name: e.employeeName, rows: [] }).rows.push(e);
                return (
                  <Fragment key={l.id}>
                  <tr style={{ borderBottom: open ? "none" : "1px solid var(--ibs-border)" }} className="hover:bg-white/[0.02] cursor-pointer" onClick={() => setOpenId(open ? null : l.id)}>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5">
                        {open ? <ChevronDown size={14} style={{ color: "var(--ibs-text-dim)" }} /> : <ChevronRight size={14} style={{ color: "var(--ibs-text-dim)" }} />}
                        {new Date(l.date).toLocaleDateString("vi-VN")}
                      </span>
                    </td>
                    <td className="px-4 py-3">{l.departmentName}</td>
                    <td className="px-4 py-3">{l.entries.length}</td>
                    <td className="px-4 py-3 font-semibold" style={{ color: "var(--ibs-accent)" }}>{totalH.toLocaleString("vi-VN")}h</td>
                    <td className="px-4 py-3">
                      <span className="text-[11px] px-2 py-0.5 rounded font-semibold" style={{ color: st.color, background: st.bg }}>{st.label}</span>
                      {l.status === "REJECTED" && l.rejectReason && <div className="text-[10px] mt-0.5" style={{ color: "var(--ibs-text-dim)" }} title={l.rejectReason}>Lý do: {l.rejectReason}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                        {isDraft && canCreate && (
                          <>
                            <button onClick={() => setEditLog(l)} className="p-1.5 rounded" title="Sửa" style={{ color: "var(--ibs-accent)" }}><Pencil size={14} /></button>
                            <button onClick={() => doAction(l.id, "/submit")} className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold" style={{ color: "#f59e0b", background: "rgba(245,158,11,0.1)" }}><Send size={12} /> Gửi</button>
                          </>
                        )}
                        {(isDraft && canCreate) && (
                          <button onClick={() => { if (confirm("Xóa phiếu này?")) doAction(l.id, ""); }} className="p-1.5 rounded" title="Xóa" style={{ color: "var(--ibs-danger)" }}><Trash2 size={14} /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {open && (
                    <tr style={{ borderBottom: "1px solid var(--ibs-border)" }}>
                      <td colSpan={6} className="px-4 pb-3 pt-0" style={{ background: "var(--ibs-bg)" }}>
                        <div className="rounded-lg border" style={{ borderColor: "var(--ibs-border)" }}>
                          {Object.entries(grouped).map(([eid, g], gi) => (
                            <div key={eid} className="px-3 py-2" style={{ borderTop: gi > 0 ? "1px solid var(--ibs-border)" : "none" }}>
                              <div className="text-[12.5px] font-semibold mb-1">{g.name}</div>
                              <div className="space-y-0.5">
                                {g.rows.map((r) => (
                                  <div key={r.id} className="flex items-center gap-2 text-[12px]" style={{ color: "var(--ibs-text-muted)" }}>
                                    <span className="inline-block px-1.5 py-0.5 rounded font-medium" style={{ background: "rgba(0,180,216,0.12)", color: "var(--ibs-accent)" }}>📁 {r.projectCode}</span>
                                    <span className="font-semibold">{r.hours}h</span>
                                    <span>·</span>
                                    <span>{r.category}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {(showNew || editLog) && (
        <PhieuModal log={editLog} onClose={() => { setShowNew(false); setEditLog(null); }} onDone={() => { setShowNew(false); setEditLog(null); load(); }} />
      )}
    </div>
  );
}

// ── Modal thêm/sửa phiếu ──────────────────────────────────────────────────────
function PhieuModal({ log, onClose, onDone }: { log: Log | null; onClose: () => void; onDone: () => void }) {
  const [depts, setDepts] = useState<{ id: string; name: string }[]>([]);
  const [emps, setEmps] = useState<{ id: string; fullName: string; departmentId?: string | null }[]>([]);
  const [departmentId, setDepartmentId] = useState(log?.departmentId || "");
  const [date, setDate] = useState(log ? String(log.date).slice(0, 10) : new Date().toISOString().slice(0, 10));
  const [memberIds, setMemberIds] = useState<string[]>(log ? Array.from(new Set(log.entries.map((e) => e.employeeId))) : []);
  const [byEmp, setByEmp] = useState<Record<string, Entry[]>>(() => {
    if (!log) return {};
    const m: Record<string, Entry[]> = {};
    for (const e of log.entries) (m[e.employeeId] ??= []).push({ projectCode: e.projectCode, hours: e.hours, category: e.category });
    return m;
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/v1/departments").then((r) => r.json()).then((j) => setDepts(j.data || [])).catch(() => {});
    fetch("/api/v1/employees?limit=1000").then((r) => r.json()).then((j) => setEmps((j.data || []).filter((e: any) => e.status === "ACTIVE" || e.status === "PROBATION"))).catch(() => {});
  }, []);

  const groupMembers = emps.filter((e) => e.departmentId === departmentId);
  const nameOf = (id: string) => emps.find((e) => e.id === id)?.fullName || "";

  function changeDept(id: string) {
    setDepartmentId(id); setMemberIds([]); setByEmp({}); setError(null);
  }
  function toggleMember(id: string) {
    setMemberIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
    setByEmp((prev) => { const n = { ...prev }; if (n[id]) delete n[id]; else n[id] = [{ projectCode: "", hours: 0, category: "" }]; return n; });
  }
  const addRow = (id: string) => setByEmp((p) => ({ ...p, [id]: [...(p[id] ?? []), { projectCode: "", hours: 0, category: "" }] }));
  const removeRow = (id: string, i: number) => setByEmp((p) => ({ ...p, [id]: (p[id] ?? []).filter((_, x) => x !== i) }));
  const setRow = (id: string, i: number, f: keyof Entry, v: string) => { setByEmp((p) => ({ ...p, [id]: (p[id] ?? []).map((r, x) => x === i ? { ...r, [f]: f === "hours" ? Number(v) : v } : r) })); setError(null); };

  async function save(submit: boolean) {
    if (!departmentId) { setError("Chọn phòng/ban/xưởng"); return; }
    if (memberIds.length === 0) { setError("Chọn ít nhất 1 nhân sự"); return; }
    const entries: { employeeId: string; employeeName: string; projectCode: string; hours: number; category: string }[] = [];
    for (const id of memberIds) {
      const rows = byEmp[id] ?? [];
      if (rows.length === 0) { setError(`Thêm dòng kê khai cho ${nameOf(id)}`); return; }
      for (const r of rows) {
        if (!r.projectCode) { setError(`Chọn dự án cho ${nameOf(id)}`); return; }
        if (!r.hours || r.hours <= 0) { setError(`Nhập giờ cho ${nameOf(id)}`); return; }
        if (!r.category.trim()) { setError(`Nhập hạng mục cho ${nameOf(id)}`); return; }
        entries.push({ employeeId: id, employeeName: nameOf(id), projectCode: r.projectCode, hours: r.hours, category: r.category.trim() });
      }
    }
    setSaving(true);
    try {
      const url = log ? `/api/v1/team-work-logs/${log.id}` : "/api/v1/team-work-logs";
      const res = await fetch(url, {
        method: log ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, departmentId, submit, entries }),
      });
      const j = await res.json();
      if (!res.ok) { setError(j?.error?.message || j?.error?.issues?.[0]?.message || "Lưu thất bại"); return; }
      onDone();
    } catch { setError("Lỗi kết nối"); } finally { setSaving(false); }
  }

  const inputCls = "w-full px-3 py-2 rounded-lg text-[13px] outline-none border";
  const inputStyle = { background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" };
  const lbl = "block text-[12px] font-medium mb-1";
  const lblStyle = { color: "var(--ibs-text-muted)" };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.7)" }}>
      <div className="w-full max-w-[520px] max-h-[90vh] flex flex-col rounded-xl border shadow-2xl" style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
        <div className="flex items-center justify-between px-5 py-4 border-b shrink-0" style={{ borderColor: "var(--ibs-border)" }}>
          <h3 className="text-[15px] font-semibold">{log ? "Sửa phiếu kê khai" : "Thêm phiếu kê khai tổ"}</h3>
          <button onClick={onClose} style={{ color: "var(--ibs-text-dim)" }}><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4 overflow-y-auto">
          {error && <div className="text-[13px] px-3 py-2 rounded-lg" style={{ background: "rgba(239,68,68,0.1)", color: "var(--ibs-danger)" }}>{error}</div>}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl} style={lblStyle}>Phòng/Ban/Xưởng *</label>
              <select value={departmentId} onChange={(e) => changeDept(e.target.value)} className={inputCls} style={inputStyle}>
                <option value="">-- Chọn phòng --</option>
                {depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <label className={lbl} style={lblStyle}>Ngày kê khai *</label>
              <DateInput value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} style={inputStyle} />
            </div>
          </div>

          {departmentId && (
            <div>
              <label className={lbl} style={lblStyle}>Nhân sự <span className="font-normal" style={{ color: "var(--ibs-text-dim)" }}>({memberIds.length}/{groupMembers.length}) — tích để khai</span></label>
              <div className="rounded-lg border max-h-[130px] overflow-y-auto" style={{ borderColor: "var(--ibs-border)", background: "var(--ibs-bg)" }}>
                {groupMembers.length === 0 ? <div className="px-3 py-2 text-[12px]" style={{ color: "var(--ibs-text-dim)" }}>Phòng này chưa có nhân sự.</div>
                  : groupMembers.map((m) => (
                    <label key={m.id} className="flex items-center gap-2 px-3 py-1.5 text-[13px] cursor-pointer hover:bg-white/[0.04]">
                      <input type="checkbox" checked={memberIds.includes(m.id)} onChange={() => toggleMember(m.id)} />
                      {m.fullName}
                    </label>
                  ))}
              </div>
            </div>
          )}

          {memberIds.map((id) => (
            <div key={id} className="rounded-lg border p-2.5" style={{ borderColor: "var(--ibs-border)", background: "var(--ibs-bg)" }}>
              <div className="text-[12.5px] font-medium mb-1.5">{nameOf(id)}</div>
              <div className="space-y-2">
                {(byEmp[id] ?? []).map((r, i) => (
                  <div key={i} className="flex items-start gap-1.5">
                    <div className="flex-1 space-y-1.5">
                      <div className="flex gap-1.5">
                        <select value={r.projectCode} onChange={(e) => setRow(id, i, "projectCode", e.target.value)} className="flex-1 px-2 py-1.5 rounded-md text-[12px] outline-none border" style={inputStyle}>
                          <option value="">-- Dự án --</option>
                          {OT_PROJECTS.map((p) => <option key={p} value={p}>{p}</option>)}
                        </select>
                        <input type="number" step="0.5" min="0" value={r.hours || ""} onChange={(e) => setRow(id, i, "hours", e.target.value)} placeholder="Giờ" className="w-20 px-2 py-1.5 rounded-md text-[12px] outline-none text-right border" style={inputStyle} />
                        <span className="text-[11px] self-center" style={{ color: "var(--ibs-text-dim)" }}>h</span>
                      </div>
                      <input value={r.category} onChange={(e) => setRow(id, i, "category", e.target.value)} placeholder="Hạng mục (bắt buộc)..." className="w-full px-2 py-1.5 rounded-md text-[12px] outline-none border" style={inputStyle} />
                    </div>
                    {(byEmp[id] ?? []).length > 1 && (
                      <button type="button" onClick={() => removeRow(id, i)} className="p-1 text-[12px] mt-1" style={{ color: "var(--ibs-danger)" }} title="Xóa dòng">×</button>
                    )}
                  </div>
                ))}
                <button type="button" onClick={() => addRow(id)} className="text-[11px] font-medium" style={{ color: "var(--ibs-accent)" }}>＋ Thêm dự án</button>
              </div>
            </div>
          ))}
        </div>
        <div className="flex gap-3 p-5 pt-3 border-t shrink-0" style={{ borderColor: "var(--ibs-border)" }}>
          <button onClick={onClose} className="flex-1 py-2 rounded-lg text-[13px] font-medium" style={{ border: "1px solid var(--ibs-border)", color: "var(--ibs-text-muted)" }}>Hủy</button>
          <button onClick={() => save(false)} disabled={saving} className="flex-1 py-2 rounded-lg text-[13px] font-medium" style={{ border: "1px solid var(--ibs-border)", color: "var(--ibs-text)" }}>Lưu nháp</button>
          <button onClick={() => save(true)} disabled={saving} className="flex-1 py-2 rounded-lg text-[13px] font-semibold text-white" style={{ background: saving ? "rgba(0,180,216,0.5)" : "var(--ibs-accent)" }}>{saving ? "Đang lưu..." : "Gửi duyệt"}</button>
        </div>
      </div>
    </div>
  );
}
