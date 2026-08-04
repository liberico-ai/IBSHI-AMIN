"use client";

import { useState, useEffect, useRef, Fragment } from "react";
import { PageTitle } from "@/components/layout/page-title";
import { DateInput } from "@/components/shared/date-input";
import { useCan } from "@/hooks/use-permission";
import { OT_PROJECTS } from "@/lib/projects";
import { WORK_CATALOG, categoriesOf } from "@/lib/team-work-codes";
import { Plus, X, Send, Trash2, Pencil, ChevronRight, ChevronDown } from "lucide-react";

type LogEntry = { id: string; employeeId: string; employeeName: string; employeeCode?: string | null; projectCode: string; hours: number; workCode?: string | null; categoryCode?: string | null; category: string };
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
                              <div className="text-[12.5px] font-semibold mb-1">
                                {g.rows[0]?.employeeCode && <span className="font-mono text-[11px] mr-1.5" style={{ color: "var(--ibs-text-dim)" }}>{g.rows[0].employeeCode}</span>}
                                {g.name}
                              </div>
                              <div className="space-y-0.5">
                                {g.rows.map((r) => (
                                  <div key={r.id} className="flex items-center gap-2 text-[12px] flex-wrap" style={{ color: "var(--ibs-text-muted)" }}>
                                    <span className="inline-block px-1.5 py-0.5 rounded font-medium" style={{ background: "rgba(0,180,216,0.12)", color: "var(--ibs-accent)" }}>📁 {r.projectCode}</span>
                                    <span className="font-semibold">{r.hours}h</span>
                                    {r.workCode && <><span>·</span><span title="Mã CV">CV: <b>{r.workCode}</b></span></>}
                                    {r.categoryCode && <><span>·</span><span title="Mã chủng loại">CL: <b>{r.categoryCode}</b></span></>}
                                    {r.category && <><span>·</span><span>{r.category}</span></>}
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

// ── Modal thêm/sửa phiếu — mỗi XƯỞNG 1 khối (đóng/mở), 1 đơn nhiều xưởng ───────
type Emp = { id: string; fullName: string; departmentId?: string | null; erpCode?: string | null; employeeCode?: string | null };
type Proj = { key: string; projectCode: string; hours: number; workCode: string; categoryCode: string; content: string };
type EmpRow = { rowId: string; employeeId: string; employeeCode: string; employeeName: string; projects: Proj[] };
type Block = { blockId: string; departmentId: string; collapsed: boolean; rows: EmpRow[] };

const emptyProj = (key: string): Proj => ({ key, projectCode: "", hours: 0, workCode: "", categoryCode: "", content: "" });
const empCodeOf = (e: Emp) => e.erpCode || e.employeeCode || "";
const isFilled = (p: Proj) => !!p.projectCode || (!!p.hours && p.hours > 0);

function PhieuModal({ log, onClose, onDone }: { log: Log | null; onClose: () => void; onDone: () => void }) {
  const isEdit = !!log;
  const [depts, setDepts] = useState<{ id: string; name: string }[]>([]);
  const [emps, setEmps] = useState<Emp[]>([]);
  const [date, setDate] = useState(log ? String(log.date).slice(0, 10) : new Date().toISOString().slice(0, 10));
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const cnt = useRef(0);
  const seeded = useRef(false);
  const uid = () => `k${cnt.current++}`;

  useEffect(() => {
    fetch("/api/v1/departments").then((r) => r.json()).then((j) => setDepts(j.data || [])).catch(() => {});
    fetch("/api/v1/employees?limit=1000&scopeModule=m3.bangcong").then((r) => r.json()).then((j) => setEmps((j.data || []).filter((e: any) => e.status === "ACTIVE" || e.status === "PROBATION"))).catch(() => {});
  }, []);

  // Khởi tạo blocks: TẠO mới → 1 khối trống; SỬA → 1 khối dựng từ log.entries (gom theo NV).
  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    if (!log) { setBlocks([{ blockId: uid(), departmentId: "", collapsed: false, rows: [] }]); return; }
    const byEmp = new Map<string, EmpRow>();
    for (const e of log.entries) {
      if (!byEmp.has(e.employeeId)) byEmp.set(e.employeeId, { rowId: uid(), employeeId: e.employeeId, employeeCode: e.employeeCode || "", employeeName: e.employeeName, projects: [] });
      byEmp.get(e.employeeId)!.projects.push({ key: uid(), projectCode: e.projectCode, hours: e.hours, workCode: e.workCode || "", categoryCode: e.categoryCode || "", content: e.category || "" });
    }
    setBlocks([{ blockId: uid(), departmentId: log.departmentId, collapsed: false, rows: Array.from(byEmp.values()) }]);
  }, [log]);

  // Backfill Mã NV (erpCode) từ danh sách NV khi tải xong.
  useEffect(() => {
    if (emps.length === 0) return;
    setBlocks((bs) => bs.map((b) => ({ ...b, rows: b.rows.map((r) => r.employeeCode ? r : { ...r, employeeCode: (() => { const e = emps.find((x) => x.id === r.employeeId); return e ? empCodeOf(e) : ""; })() }) })));
  }, [emps]);

  const deptName = (id: string) => depts.find((d) => d.id === id)?.name || "";
  const membersOf = (id: string) => emps.filter((e) => e.departmentId === id);
  const usedDepts = blocks.map((b) => b.departmentId).filter(Boolean);

  const patchBlock = (blockId: string, fn: (b: Block) => Block) => setBlocks((bs) => bs.map((b) => b.blockId === blockId ? fn(b) : b));

  // Chọn xưởng cho 1 khối → tự nạp toàn bộ NV của xưởng, mỗi NV 1 dòng dự án trống.
  function loadBlockDept(blockId: string, deptId: string) {
    setError(null);
    patchBlock(blockId, (b) => ({
      ...b, departmentId: deptId,
      rows: emps.filter((e) => e.departmentId === deptId).map((m) => ({ rowId: uid(), employeeId: m.id, employeeCode: empCodeOf(m), employeeName: m.fullName, projects: [emptyProj(uid())] })),
    }));
  }
  const addBlock = () => setBlocks((bs) => [...bs, { blockId: uid(), departmentId: "", collapsed: false, rows: [] }]);
  const removeBlock = (blockId: string) => setBlocks((bs) => bs.filter((b) => b.blockId !== blockId));
  const toggleCollapse = (blockId: string) => patchBlock(blockId, (b) => ({ ...b, collapsed: !b.collapsed }));

  const setProj = (blockId: string, rowId: string, key: string, f: keyof Proj, v: string) => {
    setError(null);
    patchBlock(blockId, (b) => ({
      ...b,
      rows: b.rows.map((r) => r.rowId !== rowId ? r : {
        ...r,
        projects: r.projects.map((p) => {
          if (p.key !== key) return p;
          const np = { ...p, [f]: f === "hours" ? Number(v) : v } as Proj;
          if (f === "workCode" && !categoriesOf(v).some((c) => c.code === np.categoryCode)) np.categoryCode = "";
          return np;
        }),
      }),
    }));
  };
  const addProj = (blockId: string, rowId: string) => patchBlock(blockId, (b) => ({ ...b, rows: b.rows.map((r) => r.rowId === rowId ? { ...r, projects: [...r.projects, emptyProj(uid())] } : r) }));
  // Xóa 1 dòng dự án; nếu là dòng cuối của NV → gỡ luôn NV khỏi khối.
  const removeProj = (blockId: string, rowId: string, key: string) => patchBlock(blockId, (b) => ({
    ...b, rows: b.rows.flatMap((r) => {
      if (r.rowId !== rowId) return [r];
      const projects = r.projects.filter((p) => p.key !== key);
      return projects.length ? [{ ...r, projects }] : [];
    }),
  }));
  function addEmp(blockId: string, deptId: string, empId: string) {
    const m = membersOf(deptId).find((e) => e.id === empId);
    if (!m) return;
    patchBlock(blockId, (b) => ({ ...b, rows: [...b.rows, { rowId: uid(), employeeId: m.id, employeeCode: empCodeOf(m), employeeName: m.fullName, projects: [emptyProj(uid())] }] }));
  }

  // Gom entries của 1 khối; trả { err } nếu thiếu, hoặc { entries }.
  function collectBlock(b: Block): { err?: string; entries: any[] } {
    const entries: any[] = [];
    const tag = `[${deptName(b.departmentId)}] `;
    for (const r of b.rows) for (const p of r.projects) {
      if (!isFilled(p)) continue;
      if (!p.projectCode) return { err: `${tag}Chọn Mã dự án cho ${r.employeeName}`, entries: [] };
      if (!p.hours || p.hours <= 0) return { err: `${tag}Nhập Hành chính (giờ) cho ${r.employeeName}`, entries: [] };
      if (!p.workCode) return { err: `${tag}Chọn Mã CV cho ${r.employeeName}`, entries: [] };
      if (categoriesOf(p.workCode).length > 0 && !p.categoryCode) return { err: `${tag}Chọn Mã chủng loại cho ${r.employeeName}`, entries: [] };
      if (!p.content.trim()) return { err: `${tag}Nhập Nội dung công việc cho ${r.employeeName}`, entries: [] };
      entries.push({ employeeId: r.employeeId, employeeName: r.employeeName, employeeCode: r.employeeCode || null, projectCode: p.projectCode, hours: p.hours, workCode: p.workCode, categoryCode: p.categoryCode || null, category: p.content.trim() });
    }
    return { entries };
  }

  async function save(submit: boolean) {
    // SỬA: 1 khối = 1 phiếu (PUT).
    if (isEdit) {
      const b = blocks[0];
      const r = collectBlock(b);
      if (r.err) { setError(r.err); return; }
      if (r.entries.length === 0) { setError("Chưa có dòng nào được kê khai"); return; }
      setSaving(true);
      try {
        const res = await fetch(`/api/v1/team-work-logs/${log!.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date, submit, entries: r.entries }) });
        const j = await res.json();
        if (!res.ok) { setError(j?.error?.message || j?.error?.issues?.[0]?.message || "Lưu thất bại"); return; }
        onDone();
      } catch { setError("Lỗi kết nối"); } finally { setSaving(false); }
      return;
    }
    // TẠO: mỗi xưởng (có kê khai) → 1 phiếu riêng, gửi tuần tự.
    const active = blocks.filter((b) => b.departmentId);
    if (active.length === 0) { setError("Chọn ít nhất 1 xưởng"); return; }
    const payloads: { departmentId: string; entries: any[] }[] = [];
    for (const b of active) {
      const r = collectBlock(b);
      if (r.err) { setError(r.err); return; }
      if (r.entries.length) payloads.push({ departmentId: b.departmentId, entries: r.entries });
    }
    if (payloads.length === 0) { setError("Chưa có dòng nào được kê khai"); return; }
    setSaving(true);
    try {
      for (const pl of payloads) {
        const res = await fetch("/api/v1/team-work-logs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date, departmentId: pl.departmentId, submit, entries: pl.entries }) });
        if (!res.ok) { const j = await res.json().catch(() => ({})); setError(`[${deptName(pl.departmentId)}] ${j?.error?.message || j?.error?.issues?.[0]?.message || "Lưu thất bại"}`); setSaving(false); return; }
      }
      onDone();
    } catch { setError("Lỗi kết nối"); } finally { setSaving(false); }
  }

  const inputCls = "w-full px-3 py-2 rounded-lg text-[13px] outline-none border";
  const inputStyle = { background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" };
  const cellSel = "px-2 py-1.5 rounded-md text-[12px] outline-none border";
  const lbl = "block text-[12px] font-medium mb-1";
  const lblStyle = { color: "var(--ibs-text-muted)" };
  const th = "px-2 py-2 text-left text-[11px] font-semibold uppercase whitespace-nowrap";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.7)" }}>
      <div className="w-full max-w-[1120px] max-h-[92vh] flex flex-col rounded-xl border shadow-2xl" style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
        <div className="flex items-center justify-between px-5 py-4 border-b shrink-0" style={{ borderColor: "var(--ibs-border)" }}>
          <h3 className="text-[15px] font-semibold">{isEdit ? "Sửa phiếu kê khai tổ" : "Thêm phiếu kê khai tổ"}</h3>
          <button onClick={onClose} style={{ color: "var(--ibs-text-dim)" }}><X size={18} /></button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          {error && <div className="text-[13px] px-3 py-2 rounded-lg" style={{ background: "rgba(239,68,68,0.1)", color: "var(--ibs-danger)" }}>{error}</div>}

          <div className="max-w-[260px]">
            <label className={lbl} style={lblStyle}>Ngày kê khai *</label>
            <DateInput value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} style={inputStyle} />
          </div>

          {/* Mỗi XƯỞNG 1 khối, đóng/mở được */}
          {blocks.map((b) => {
            const filledCount = b.rows.reduce((s, r) => s + r.projects.filter(isFilled).length, 0);
            const missing = membersOf(b.departmentId).filter((m) => !b.rows.some((r) => r.employeeId === m.id));
            return (
              <div key={b.blockId} className="rounded-lg border" style={{ borderColor: "var(--ibs-border)" }}>
                {/* Header khối */}
                <div className="flex items-center gap-2 px-3 py-2.5 flex-wrap" style={{ background: "var(--ibs-bg)", borderBottom: b.collapsed ? "none" : "1px solid var(--ibs-border)" }}>
                  <button type="button" onClick={() => toggleCollapse(b.blockId)} className="p-0.5" style={{ color: "var(--ibs-text-dim)" }} title={b.collapsed ? "Mở" : "Thu gọn"}>
                    {b.collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                  </button>
                  <span className="text-[13px] font-semibold">🏭 Xưởng/Phòng ban:</span>
                  <select value={b.departmentId} onChange={(e) => loadBlockDept(b.blockId, e.target.value)} disabled={isEdit} className="px-2.5 py-1.5 rounded-lg text-[13px] outline-none border" style={inputStyle}>
                    <option value="">-- Chọn xưởng --</option>
                    {depts.filter((d) => d.id === b.departmentId || !usedDepts.includes(d.id)).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                  {b.departmentId && <span className="text-[12px]" style={{ color: "var(--ibs-text-dim)" }}><b style={{ color: "var(--ibs-accent)" }}>{filledCount}</b> dòng đã khai</span>}
                  {!isEdit && blocks.length > 1 && (
                    <button type="button" onClick={() => removeBlock(b.blockId)} className="ml-auto p-1 rounded" style={{ color: "var(--ibs-danger)" }} title="Bỏ xưởng này"><Trash2 size={14} /></button>
                  )}
                </div>

                {!b.collapsed && (
                  !b.departmentId ? (
                    <div className="px-3 py-6 text-center text-[13px]" style={{ color: "var(--ibs-text-dim)" }}>Chọn xưởng để nạp danh sách nhân sự.</div>
                  ) : b.rows.length === 0 ? (
                    <div className="px-3 py-6 text-center text-[13px]" style={{ color: "var(--ibs-text-dim)" }}>Xưởng này chưa có nhân sự.</div>
                  ) : (
                    <div className="p-3 space-y-3">
                      <div className="text-[11px]" style={{ color: "var(--ibs-text-dim)" }}>Dòng để trống sẽ tự bỏ khi lưu · bấm <b>＋ dự án</b> để 1 NV khai thêm dự án.</div>
                      <div className="rounded-lg border overflow-x-auto" style={{ borderColor: "var(--ibs-border)" }}>
                        <table className="w-full text-[12px]" style={{ minWidth: 820 }}>
                          <thead>
                            <tr style={{ borderBottom: "1px solid var(--ibs-border)", background: "var(--ibs-bg)" }}>
                              {["Mã NV", "Tên nhân viên", "Mã dự án", "Hành chính", "Mã CV", "Mã chủng loại", "Nội dung công việc", ""].map((h, i) => (
                                <th key={i} className={th} style={{ color: "var(--ibs-text-dim)" }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {b.rows.map((r) => r.projects.map((p, pi) => {
                              const cats = categoriesOf(p.workCode);
                              const first = pi === 0;
                              return (
                                <tr key={p.key} style={{ borderBottom: pi === r.projects.length - 1 ? "2px solid var(--ibs-border)" : "1px dashed var(--ibs-border)" }}>
                                  {first && (
                                    <td className="px-2 py-1.5 align-top font-mono whitespace-nowrap" rowSpan={r.projects.length} style={{ color: "var(--ibs-text-muted)", borderRight: "1px solid var(--ibs-border)" }}>{r.employeeCode || "—"}</td>
                                  )}
                                  {first && (
                                    <td className="px-2 py-1.5 align-top" rowSpan={r.projects.length} style={{ borderRight: "1px solid var(--ibs-border)", minWidth: 140 }}>
                                      <div className="font-medium">{r.employeeName}</div>
                                      <button type="button" onClick={() => addProj(b.blockId, r.rowId)} className="mt-1 text-[11px] font-medium inline-flex items-center gap-0.5" style={{ color: "var(--ibs-accent)" }}><Plus size={11} /> dự án</button>
                                    </td>
                                  )}
                                  <td className="px-2 py-1.5">
                                    <select value={p.projectCode} onChange={(e) => setProj(b.blockId, r.rowId, p.key, "projectCode", e.target.value)} className={cellSel} style={{ ...inputStyle, width: 128 }}>
                                      <option value="">—</option>
                                      {OT_PROJECTS.map((x) => <option key={x} value={x}>{x}</option>)}
                                    </select>
                                  </td>
                                  <td className="px-2 py-1.5">
                                    <input type="number" step="0.5" min="0" value={p.hours || ""} onChange={(e) => setProj(b.blockId, r.rowId, p.key, "hours", e.target.value)} placeholder="Giờ" className="w-16 px-2 py-1.5 rounded-md text-[12px] outline-none text-right border" style={inputStyle} />
                                  </td>
                                  <td className="px-2 py-1.5">
                                    <select value={p.workCode} onChange={(e) => setProj(b.blockId, r.rowId, p.key, "workCode", e.target.value)} className={cellSel} style={{ ...inputStyle, width: 120 }} title={p.workCode}>
                                      <option value="">—</option>
                                      {WORK_CATALOG.map((w) => <option key={w.code} value={w.code}>{w.code} · {w.label}</option>)}
                                    </select>
                                  </td>
                                  <td className="px-2 py-1.5">
                                    <select value={p.categoryCode} onChange={(e) => setProj(b.blockId, r.rowId, p.key, "categoryCode", e.target.value)} disabled={!p.workCode || cats.length === 0} className={cellSel} style={{ ...inputStyle, width: 130, opacity: (!p.workCode || cats.length === 0) ? 0.5 : 1 }} title={p.categoryCode}>
                                      <option value="">{!p.workCode ? "—" : cats.length === 0 ? "(không có)" : "—"}</option>
                                      {cats.map((c) => <option key={c.code} value={c.code}>{c.code} · {c.label}</option>)}
                                    </select>
                                  </td>
                                  <td className="px-2 py-1.5">
                                    <input value={p.content} onChange={(e) => setProj(b.blockId, r.rowId, p.key, "content", e.target.value)} placeholder="Nội dung..." className="px-2 py-1.5 rounded-md text-[12px] outline-none border w-full" style={{ ...inputStyle, minWidth: 150 }} />
                                  </td>
                                  <td className="px-2 py-1.5 text-center">
                                    <button type="button" onClick={() => removeProj(b.blockId, r.rowId, p.key)} className="p-1 rounded" style={{ color: "var(--ibs-danger)" }} title={r.projects.length > 1 ? "Xóa dòng dự án" : "Xóa nhân sự khỏi xưởng"}><X size={14} /></button>
                                  </td>
                                </tr>
                              );
                            }))}
                          </tbody>
                        </table>
                      </div>
                      {/* Thêm lại NV (chỉ trong xưởng của khối) */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <select value="" onChange={(e) => addEmp(b.blockId, b.departmentId, e.target.value)} className="px-3 py-1.5 rounded-lg text-[12.5px] outline-none border" style={inputStyle}>
                          <option value="">＋ Thêm nhân sự...</option>
                          {membersOf(b.departmentId).map((m) => <option key={m.id} value={m.id}>{empCodeOf(m) ? `${empCodeOf(m)} · ` : ""}{m.fullName}{b.rows.some((r) => r.employeeId === m.id) ? " (đã có)" : ""}</option>)}
                        </select>
                        {missing.length > 0 && <span className="text-[11px]" style={{ color: "var(--ibs-text-dim)" }}>{missing.length} NV chưa có trong xưởng</span>}
                      </div>
                    </div>
                  )
                )}
              </div>
            );
          })}

          {!isEdit && (
            <button type="button" onClick={addBlock} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[13px] font-semibold border" style={{ borderColor: "var(--ibs-accent)", color: "var(--ibs-accent)", borderStyle: "dashed" }}>
              <Plus size={15} /> Thêm xưởng
            </button>
          )}
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
