"use client";

import { useState, useEffect, useRef, Fragment } from "react";
import { PageTitle } from "@/components/layout/page-title";
import { DateInput } from "@/components/shared/date-input";
import { useCan } from "@/hooks/use-permission";
import { WORK_CATALOG, categoriesOf } from "@/lib/team-work-codes";
import { ProjectSelect } from "@/components/shared/project-select";
import { Plus, X, Send, Trash2, Pencil, ChevronRight, ChevronDown, Download } from "lucide-react";

type LogEntry = { id: string; employeeId: string; employeeName: string; employeeCode?: string | null; projectCode: string; hours: number; workCode?: string | null; categoryCode?: string | null; reinforce?: string | null; category: string };
type Log = {
  id: string; date: string; batchId?: string | null; departmentId: string; departmentName: string; status: string;
  rejectReason?: string | null; entries: LogEntry[];
};

const STATUS: Record<string, { label: string; color: string; bg: string }> = {
  DRAFT: { label: "Nháp", color: "#64748b", bg: "rgba(100,116,139,0.12)" },
  PENDING: { label: "Đã kê khai", color: "#10b981", bg: "rgba(16,185,129,0.12)" },
  APPROVED: { label: "Đã kê khai", color: "#10b981", bg: "rgba(16,185,129,0.12)" },
  REJECTED: { label: "Từ chối", color: "#ef4444", bg: "rgba(239,68,68,0.12)" },
};

// Gom logs theo đợt (batchId) → mỗi đợt là 1 "phiếu" ở giao diện. Giữ thứ tự xuất hiện.
function groupByBatch(logs: Log[]): { key: string; logs: Log[] }[] {
  const order: string[] = [];
  const map = new Map<string, Log[]>();
  for (const l of logs) {
    const k = l.batchId || l.id;
    if (!map.has(k)) { map.set(k, []); order.push(k); }
    map.get(k)!.push(l);
  }
  return order.map((k) => ({ key: k, logs: map.get(k)! }));
}

export default function PhieuToPage() {
  const can = useCan();
  const canCreate = can("m3.phieuto:create");
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [editLogs, setEditLogs] = useState<Log[] | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);

  function load() {
    setLoading(true);
    fetch("/api/v1/team-work-logs").then((r) => r.json()).then((j) => setLogs(j.data || [])).catch(() => {}).finally(() => setLoading(false));
  }
  useEffect(load, []);

  async function callLog(id: string, path: string) {
    const res = await fetch(`/api/v1/team-work-logs/${id}${path}`, { method: path === "" ? "DELETE" : "POST" });
    if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j?.error?.message || "Thao tác thất bại"); }
  }
  async function submitBatch(gl: Log[]) {
    try { for (const l of gl) if (l.status === "DRAFT") await callLog(l.id, "/submit"); load(); }
    catch (e: any) { alert(e.message); }
  }
  async function deleteBatch(gl: Log[]) {
    if (!confirm(`Xóa phiếu này (${gl.length} xưởng)?`)) return;
    try { for (const l of gl) await callLog(l.id, ""); load(); }
    catch (e: any) { alert(e.message); }
  }

  const groups = groupByBatch(logs);

  return (
    <div>
      <PageTitle title="Phiếu kê khai tổ trưởng (hàng ngày)" description="Tổ trưởng kê khai sản xuất — NV × dự án × giờ × nội dung" />

      <div className="flex justify-end gap-2 mb-3">
        <button onClick={() => setShowExport(true)} className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[13px] font-semibold border" style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }}>
          <Download size={15} /> Export Excel
        </button>
        {canCreate && (
          <button onClick={() => setShowNew(true)} className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[13px] font-semibold text-white" style={{ background: "var(--ibs-accent)" }}>
            <Plus size={15} /> Thêm phiếu
          </button>
        )}
      </div>

      <div className="rounded-xl border overflow-hidden" style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
        {loading ? (
          <div className="px-4 py-10 text-center text-[13px]" style={{ color: "var(--ibs-text-dim)" }}>Đang tải...</div>
        ) : groups.length === 0 ? (
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
              {groups.map((g) => {
                const first = g.logs[0];
                const totalH = g.logs.reduce((s, l) => s + l.entries.reduce((a, e) => a + (e.hours || 0), 0), 0);
                const totalRows = g.logs.reduce((s, l) => s + l.entries.length, 0);
                const st = STATUS[first.status] || STATUS.DRAFT;
                const anyDraft = g.logs.some((l) => l.status === "DRAFT");
                const open = openKey === g.key;
                const deptLabel = g.logs.length === 1 ? first.departmentName : `${g.logs.length} xưởng: ${g.logs.map((l) => l.departmentName).join(", ")}`;
                return (
                  <Fragment key={g.key}>
                  <tr style={{ borderBottom: open ? "none" : "1px solid var(--ibs-border)" }} className="hover:bg-white/[0.02] cursor-pointer" onClick={() => setOpenKey(open ? null : g.key)}>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5">
                        {open ? <ChevronDown size={14} style={{ color: "var(--ibs-text-dim)" }} /> : <ChevronRight size={14} style={{ color: "var(--ibs-text-dim)" }} />}
                        {new Date(first.date).toLocaleDateString("vi-VN")}
                      </span>
                    </td>
                    <td className="px-4 py-3">{deptLabel}</td>
                    <td className="px-4 py-3">{totalRows}</td>
                    <td className="px-4 py-3 font-semibold" style={{ color: "var(--ibs-accent)" }}>{totalH.toLocaleString("vi-VN")}h</td>
                    <td className="px-4 py-3">
                      <span className="text-[11px] px-2 py-0.5 rounded font-semibold" style={{ color: st.color, background: st.bg }}>{st.label}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                        {anyDraft && canCreate && (
                          <button onClick={() => submitBatch(g.logs)} className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold" style={{ color: "#f59e0b", background: "rgba(245,158,11,0.1)" }}><Send size={12} /> Gửi</button>
                        )}
                        {canCreate && (
                          <button onClick={() => deleteBatch(g.logs)} className="p-1.5 rounded" title="Xóa phiếu" style={{ color: "var(--ibs-danger)" }}><Trash2 size={14} /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {open && (
                    <tr style={{ borderBottom: "1px solid var(--ibs-border)" }}>
                      <td colSpan={6} className="px-4 pb-4 pt-1" style={{ background: "var(--ibs-bg)" }}>
                        <div className="space-y-3">
                          {g.logs.map((l) => <LogView key={l.id} log={l} />)}
                          {canCreate && (
                            <button onClick={() => setEditLogs(g.logs)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[13px] font-semibold text-white" style={{ background: "var(--ibs-accent)" }}>
                              <Pencil size={14} /> Sửa phiếu
                            </button>
                          )}
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

      {(showNew || editLogs) && (
        <PhieuModal logs={editLogs} onClose={() => { setShowNew(false); setEditLogs(null); }} onDone={() => { setShowNew(false); setEditLogs(null); load(); }} />
      )}
      {showExport && <ExportModal onClose={() => setShowExport(false)} />}
    </div>
  );
}

// ── Modal chọn khoảng ngày để Export Excel ────────────────────────────────────
function ExportModal({ onClose }: { onClose: () => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const firstOfMonth = today.slice(0, 8) + "01";
  const [from, setFrom] = useState(firstOfMonth);
  const [to, setTo] = useState(today);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (!from || !to) { setError("Chọn khoảng ngày"); return; }
    if (from > to) { setError("Từ ngày phải ≤ Đến ngày"); return; }
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/v1/team-work-logs/export?from=${from}&to=${to}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message || "Export thất bại");
      const { title, columns, rows } = json.data as { title: string; columns: { header: string; key: string; width?: number }[]; rows: Record<string, unknown>[] };
      if (rows.length === 0) { setError("Không có dữ liệu kê khai trong khoảng ngày này"); setBusy(false); return; }

      const { default: ExcelJS } = await import("exceljs");
      const wb = new ExcelJS.Workbook();
      wb.creator = "IBS ONE Platform"; wb.created = new Date();
      const ws = wb.addWorksheet("Kê khai tổ");

      ws.mergeCells(1, 1, 1, columns.length);
      const tc = ws.getCell(1, 1); tc.value = title; tc.font = { bold: true, size: 14 };
      ws.addRow([]);
      const hr = ws.addRow(columns.map((c) => c.header));
      hr.font = { bold: true, color: { argb: "FFFFFFFF" } };
      hr.eachCell((c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E293B" } }; c.alignment = { vertical: "middle", horizontal: "center", wrapText: true }; });
      for (const r of rows) {
        const row = ws.addRow(columns.map((c) => (r[c.key] ?? "") as any));
        row.eachCell((c) => { c.border = { top: { style: "thin", color: { argb: "FFE2E8F0" } }, bottom: { style: "thin", color: { argb: "FFE2E8F0" } }, left: { style: "thin", color: { argb: "FFE2E8F0" } }, right: { style: "thin", color: { argb: "FFE2E8F0" } } }; });
      }
      columns.forEach((c, i) => { ws.getColumn(i + 1).width = c.width || 16; });
      ws.views = [{ state: "frozen", ySplit: 3 }];

      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = `ke-khai-to_${from}_${to}.xlsx`; a.click(); URL.revokeObjectURL(a.href);
      onClose();
    } catch (e: any) { setError(e?.message || "Có lỗi khi export"); } finally { setBusy(false); }
  }

  const inputCls = "w-full px-3 py-2 rounded-lg text-[13px] outline-none border";
  const inputStyle = { background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" };
  const lbl = "block text-[12px] font-medium mb-1";
  const lblStyle = { color: "var(--ibs-text-muted)" };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.7)" }}>
      <div className="w-full max-w-[420px] rounded-xl border shadow-2xl" style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "var(--ibs-border)" }}>
          <h3 className="text-[15px] font-semibold">Export Excel — Kê khai tổ</h3>
          <button onClick={onClose} style={{ color: "var(--ibs-text-dim)" }}><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          {error && <div className="text-[13px] px-3 py-2 rounded-lg" style={{ background: "rgba(239,68,68,0.1)", color: "var(--ibs-danger)" }}>{error}</div>}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl} style={lblStyle}>Từ ngày *</label>
              <DateInput value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls} style={inputStyle} />
            </div>
            <div>
              <label className={lbl} style={lblStyle}>Đến ngày *</label>
              <DateInput value={to} onChange={(e) => setTo(e.target.value)} className={inputCls} style={inputStyle} />
            </div>
          </div>
          <div className="text-[11px]" style={{ color: "var(--ibs-text-dim)" }}>Xuất các phiếu ĐÃ KÊ KHAI trong khoảng ngày, theo đúng form (Ngày · Mã NV · Tên · Tổ · Mã dự án · Hành chính · Mã CV · Mã chủng loại · Tăng cường · Nội dung).</div>
        </div>
        <div className="flex gap-3 p-5 pt-0">
          <button onClick={onClose} className="flex-1 py-2 rounded-lg text-[13px] font-medium" style={{ border: "1px solid var(--ibs-border)", color: "var(--ibs-text-muted)" }}>Hủy</button>
          <button onClick={run} disabled={busy} className="flex-1 py-2 rounded-lg text-[13px] font-semibold text-white flex items-center justify-center gap-1.5" style={{ background: busy ? "rgba(0,180,216,0.5)" : "var(--ibs-accent)" }}>
            <Download size={15} /> {busy ? "Đang xuất..." : "Tải file"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Hiển thị 1 xưởng (read-only) dạng bảng giống form ─────────────────────────
function LogView({ log }: { log: Log }) {
  const byEmp = new Map<string, LogEntry[]>();
  for (const e of log.entries) { if (!byEmp.has(e.employeeId)) byEmp.set(e.employeeId, []); byEmp.get(e.employeeId)!.push(e); }
  const totalH = log.entries.reduce((s, e) => s + (e.hours || 0), 0);
  const td = "px-2 py-1.5 align-top whitespace-nowrap";
  return (
    <div className="rounded-lg border" style={{ borderColor: "var(--ibs-border)", background: "var(--ibs-bg-card)" }}>
      <div className="px-3 py-2 text-[13px] font-semibold flex items-center gap-2 border-b" style={{ borderColor: "var(--ibs-border)" }}>
        🏭 {log.departmentName}
        <span className="text-[11px] font-normal" style={{ color: "var(--ibs-text-dim)" }}>· {log.entries.length} dòng · {totalH.toLocaleString("vi-VN")}h</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]" style={{ minWidth: 840 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--ibs-border)" }}>
              {["Mã NV", "Tên nhân viên", "Mã dự án", "Hành chính", "Mã CV", "Mã chủng loại", "Tăng cường", "Nội dung công việc"].map((h, i) => (
                <th key={i} className="px-2 py-2 text-left text-[11px] font-semibold uppercase whitespace-nowrap" style={{ color: "var(--ibs-text-dim)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from(byEmp.values()).map((rows) => rows.map((e, i) => (
              <tr key={e.id} style={{ borderBottom: i === rows.length - 1 ? "1px solid var(--ibs-border)" : "1px dashed var(--ibs-border)" }}>
                {i === 0 && <td className={td + " font-mono"} rowSpan={rows.length} style={{ color: "var(--ibs-text-muted)", borderRight: "1px solid var(--ibs-border)" }}>{e.employeeCode || "—"}</td>}
                {i === 0 && <td className={td + " font-medium"} rowSpan={rows.length} style={{ borderRight: "1px solid var(--ibs-border)" }}>{e.employeeName}</td>}
                <td className={td}><span className="px-1.5 py-0.5 rounded font-medium" style={{ background: "rgba(0,180,216,0.12)", color: "var(--ibs-accent)" }}>{e.projectCode}</span></td>
                <td className={td + " font-semibold"}>{e.hours}h</td>
                <td className={td}>{e.workCode || "—"}</td>
                <td className={td}>{e.categoryCode || "—"}</td>
                <td className="px-2 py-1.5 align-top" style={{ color: "var(--ibs-text-muted)" }}>{e.reinforce || "—"}</td>
                <td className="px-2 py-1.5 align-top" style={{ color: "var(--ibs-text-muted)" }}>{e.category || "—"}</td>
              </tr>
            )))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Modal thêm/sửa phiếu — mỗi XƯỞNG 1 khối (đóng/mở), 1 đơn nhiều xưởng ───────
type Emp = { id: string; fullName: string; departmentId?: string | null; code?: string | null; erpCode?: string | null; employeeCode?: string | null };
type Proj = { key: string; projectCode: string; hours: number; workCode: string; categoryCode: string; reinforce: string; content: string };
type EmpRow = { rowId: string; employeeId: string; employeeCode: string; employeeName: string; projects: Proj[] };
type Block = { blockId: string; logId?: string; departmentId: string; collapsed: boolean; rows: EmpRow[] };

const emptyProj = (key: string): Proj => ({ key, projectCode: "", hours: 0, workCode: "", categoryCode: "", reinforce: "", content: "" });
const empCodeOf = (e: Emp) => e.code || e.erpCode || e.employeeCode || "";
const isFilled = (p: Proj) => !!p.projectCode || (!!p.hours && p.hours > 0);
// Chuẩn hoá để tìm không phân biệt dấu/hoa-thường ("yen" khớp "Yến").
const norm = (s: string) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d");

function PhieuModal({ logs, onClose, onDone }: { logs: Log[] | null; onClose: () => void; onDone: () => void }) {
  const isEdit = !!logs && logs.length > 0;
  const [depts, setDepts] = useState<{ id: string; name: string }[]>([]);
  const [emps, setEmps] = useState<Emp[]>([]);
  const [date, setDate] = useState(isEdit ? String(logs![0].date).slice(0, 10) : new Date().toISOString().slice(0, 10));
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [search, setSearch] = useState<Record<string, string>>({}); // gõ tên lọc NV theo từng khối (chỉ lọc hiển thị)
  const [sel, setSel] = useState<Record<string, boolean>>({});     // tick chọn NV (theo rowId) để điền hàng loạt
  const [bulk, setBulk] = useState<Record<string, { projectCode: string; hours: string; workCode: string; categoryCode: string; reinforce: string; content: string }>>({}); // bản nháp áp hàng loạt / khối
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const bulkOf = (blockId: string) => bulk[blockId] || { projectCode: "", hours: "", workCode: "", categoryCode: "", reinforce: "", content: "" };
  const setBulkField = (blockId: string, f: string, v: string) => setBulk((s) => {
    const cur = s[blockId] || { projectCode: "", hours: "", workCode: "", categoryCode: "", reinforce: "", content: "" };
    const nx = { ...cur, [f]: v };
    if (f === "workCode" && !categoriesOf(v).some((c) => c.code === nx.categoryCode)) nx.categoryCode = "";
    return { ...s, [blockId]: nx };
  });
  const cnt = useRef(0);
  const seeded = useRef(false);
  const uid = () => `k${cnt.current++}`;

  useEffect(() => {
    fetch("/api/v1/departments").then((r) => r.json()).then((j) => setDepts(j.data || [])).catch(() => {});
    fetch("/api/v1/employees?limit=1000&scopeModule=m3.bangcong").then((r) => r.json()).then((j) => setEmps((j.data || []).filter((e: any) => e.status === "ACTIVE" || e.status === "PROBATION"))).catch(() => {});
  }, []);

  // Khởi tạo blocks: TẠO → 1 khối trống; SỬA → mỗi log 1 khối (gom entries theo NV).
  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    if (!isEdit) { setBlocks([{ blockId: uid(), departmentId: "", collapsed: false, rows: [] }]); return; }
    setBlocks(logs!.map((lg) => {
      const byEmp = new Map<string, EmpRow>();
      for (const e of lg.entries) {
        if (!byEmp.has(e.employeeId)) byEmp.set(e.employeeId, { rowId: uid(), employeeId: e.employeeId, employeeCode: e.employeeCode || "", employeeName: e.employeeName, projects: [] });
        byEmp.get(e.employeeId)!.projects.push({ key: uid(), projectCode: e.projectCode, hours: e.hours, workCode: e.workCode || "", categoryCode: e.categoryCode || "", reinforce: e.reinforce || "", content: e.category || "" });
      }
      return { blockId: uid(), logId: lg.id, departmentId: lg.departmentId, collapsed: false, rows: Array.from(byEmp.values()) };
    }));
  }, [logs]);

  // Backfill Mã NV (erpCode) từ danh sách NV khi tải xong.
  useEffect(() => {
    if (emps.length === 0) return;
    setBlocks((bs) => bs.map((b) => ({ ...b, rows: b.rows.map((r) => r.employeeCode ? r : { ...r, employeeCode: (() => { const e = emps.find((x) => x.id === r.employeeId); return e ? empCodeOf(e) : ""; })() }) })));
  }, [emps]);

  const deptName = (id: string) => depts.find((d) => d.id === id)?.name || "";
  const membersOf = (id: string) => emps.filter((e) => e.departmentId === id);
  const usedDepts = blocks.map((b) => b.departmentId).filter(Boolean);

  const patchBlock = (blockId: string, fn: (b: Block) => Block) => setBlocks((bs) => bs.map((b) => b.blockId === blockId ? fn(b) : b));

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

  const toggleSel = (rowId: string) => setSel((s) => ({ ...s, [rowId]: !s[rowId] }));
  const setAllSel = (rowIds: string[], checked: boolean) => setSel((s) => { const n = { ...s }; rowIds.forEach((id) => (n[id] = checked)); return n; });
  // Áp các tiêu chí ĐÃ NHẬP ở thanh hàng loạt vào DÒNG DỰ ÁN ĐẦU của mỗi NV đã tick (ghi đè trường có nhập).
  function applyBulk(blockId: string) {
    const d = bulkOf(blockId);
    setError(null);
    patchBlock(blockId, (b) => ({
      ...b,
      rows: b.rows.map((r) => !sel[r.rowId] ? r : {
        ...r,
        projects: r.projects.map((p, i) => i !== 0 ? p : {
          ...p,
          ...(d.projectCode ? { projectCode: d.projectCode } : {}),
          ...(Number(d.hours) > 0 ? { hours: Number(d.hours) } : {}),
          ...(d.workCode ? { workCode: d.workCode } : {}),
          ...(d.categoryCode ? { categoryCode: d.categoryCode } : {}),
          ...(d.reinforce.trim() ? { reinforce: d.reinforce } : {}),
          ...(d.content.trim() ? { content: d.content } : {}),
        }),
      }),
    }));
  }

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

  function collectBlock(b: Block): { err?: string; entries: any[] } {
    const entries: any[] = [];
    const tag = `[${deptName(b.departmentId)}] `;
    for (const r of b.rows) for (const p of r.projects) {
      if (!isFilled(p)) continue;
      if (!p.projectCode) return { err: `${tag}Chọn Mã dự án cho ${r.employeeName}`, entries: [] };
      if (!p.hours || p.hours <= 0) return { err: `${tag}Nhập Hành chính (giờ) cho ${r.employeeName}`, entries: [] };
      if (!p.workCode) return { err: `${tag}Chọn Mã CV cho ${r.employeeName}`, entries: [] };
      // Mã chủng loại / Tăng cường / Nội dung: không bắt buộc.
      entries.push({ employeeId: r.employeeId, employeeName: r.employeeName, employeeCode: r.employeeCode || null, projectCode: p.projectCode, hours: p.hours, workCode: p.workCode, categoryCode: p.categoryCode || null, reinforce: p.reinforce.trim() || null, category: p.content.trim() });
    }
    return { entries };
  }

  async function save(submit: boolean) {
    // SỬA: khối cũ (có logId) → PUT; khối XƯỞNG MỚI thêm lúc sửa (chưa có logId) → POST kèm batchId của đợt.
    if (isEdit) {
      const groupBatchId = logs![0].batchId || logs![0].id;
      const puts: { logId: string; entries: any[] }[] = [];
      const posts: { departmentId: string; entries: any[] }[] = [];
      for (const b of blocks) {
        const r = collectBlock(b);
        if (r.err) { setError(r.err); return; }
        if (b.logId) {
          if (r.entries.length === 0) { setError(`[${deptName(b.departmentId)}] Cần ít nhất 1 dòng kê khai`); return; }
          puts.push({ logId: b.logId, entries: r.entries });
        } else if (b.departmentId && r.entries.length > 0) {
          posts.push({ departmentId: b.departmentId, entries: r.entries }); // xưởng mới có dữ liệu → tạo mới
        }
      }
      setSaving(true);
      try {
        for (const pl of puts) {
          const res = await fetch(`/api/v1/team-work-logs/${pl.logId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date, submit, entries: pl.entries }) });
          if (!res.ok) { const j = await res.json().catch(() => ({})); setError(j?.error?.message || j?.error?.issues?.[0]?.message || "Lưu thất bại"); setSaving(false); return; }
        }
        for (const pl of posts) {
          const res = await fetch("/api/v1/team-work-logs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date, departmentId: pl.departmentId, batchId: groupBatchId, submit, entries: pl.entries }) });
          if (!res.ok) { const j = await res.json().catch(() => ({})); setError(`[${deptName(pl.departmentId)}] ${j?.error?.message || j?.error?.issues?.[0]?.message || "Lưu thất bại"}`); setSaving(false); return; }
        }
        onDone();
      } catch { setError("Lỗi kết nối"); } finally { setSaving(false); }
      return;
    }
    // TẠO: gửi 1 lần cả đợt (nhiều xưởng chung batchId).
    const active = blocks.filter((b) => b.departmentId);
    if (active.length === 0) { setError("Chọn ít nhất 1 xưởng"); return; }
    const payloadBlocks: { departmentId: string; entries: any[] }[] = [];
    for (const b of active) {
      const r = collectBlock(b);
      if (r.err) { setError(r.err); return; }
      if (r.entries.length) payloadBlocks.push({ departmentId: b.departmentId, entries: r.entries });
    }
    if (payloadBlocks.length === 0) { setError("Chưa có dòng nào được kê khai"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/v1/team-work-logs/batch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date, submit, blocks: payloadBlocks }) });
      const j = await res.json();
      if (!res.ok) { setError(j?.error?.message || j?.error?.issues?.[0]?.message || "Lưu thất bại"); return; }
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

          {blocks.map((b) => {
            const filledCount = b.rows.reduce((s, r) => s + r.projects.filter(isFilled).length, 0);
            const missing = membersOf(b.departmentId).filter((m) => !b.rows.some((r) => r.employeeId === m.id));
            const q = (search[b.blockId] || "").trim();
            const nq = norm(q);
            const visibleRows = nq ? b.rows.filter((r) => norm(r.employeeName).includes(nq) || norm(r.employeeCode).includes(nq)) : b.rows;
            const bd = bulkOf(b.blockId);
            const bulkCats = categoriesOf(bd.workCode);
            const selCount = b.rows.filter((r) => sel[r.rowId]).length;
            const allVisSel = visibleRows.length > 0 && visibleRows.every((r) => sel[r.rowId]);
            return (
              <div key={b.blockId} className="rounded-lg border" style={{ borderColor: "var(--ibs-border)" }}>
                <div className="flex items-center gap-2 px-3 py-2.5 flex-wrap" style={{ background: "var(--ibs-bg)", borderBottom: b.collapsed ? "none" : "1px solid var(--ibs-border)" }}>
                  <button type="button" onClick={() => toggleCollapse(b.blockId)} className="p-0.5" style={{ color: "var(--ibs-text-dim)" }} title={b.collapsed ? "Mở" : "Thu gọn"}>
                    {b.collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                  </button>
                  <span className="text-[13px] font-semibold">🏭 Xưởng/Phòng ban:</span>
                  <select value={b.departmentId} onChange={(e) => loadBlockDept(b.blockId, e.target.value)} disabled={!!b.logId} className="px-2.5 py-1.5 rounded-lg text-[13px] outline-none border" style={inputStyle}>
                    <option value="">-- Chọn xưởng --</option>
                    {depts.filter((d) => d.id === b.departmentId || !usedDepts.includes(d.id)).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                  {b.departmentId && <span className="text-[12px]" style={{ color: "var(--ibs-text-dim)" }}><b style={{ color: "var(--ibs-accent)" }}>{filledCount}</b> dòng đã khai</span>}
                  {!b.logId && blocks.length > 1 && (
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
                      {/* Gõ tên tìm nhanh NV — chỉ lọc hiển thị, dữ liệu đã nhập vẫn giữ nguyên */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="relative">
                          <input
                            value={search[b.blockId] || ""}
                            onChange={(e) => setSearch((s) => ({ ...s, [b.blockId]: e.target.value }))}
                            placeholder="🔍 Gõ tên hoặc mã NV để tìm nhanh..."
                            className="px-3 py-1.5 rounded-lg text-[13px] outline-none border"
                            style={{ ...inputStyle, minWidth: 280 }}
                          />
                        </div>
                        {q && (
                          <>
                            <span className="text-[12px]" style={{ color: "var(--ibs-text-dim)" }}>Hiện {visibleRows.length}/{b.rows.length} NV</span>
                            <button type="button" onClick={() => setSearch((s) => ({ ...s, [b.blockId]: "" }))} className="px-3 py-1.5 rounded-lg text-[12.5px] font-semibold text-white" style={{ background: "var(--ibs-accent)" }}>Xong</button>
                          </>
                        )}
                      </div>
                      {/* ⚡ Điền hàng loạt: tick NV rồi nhập tiêu chí chung → Áp (ghi đè dòng dự án đầu của người đã tick) */}
                      <div className="rounded-lg border p-2.5" style={{ borderColor: "var(--ibs-accent)", background: "rgba(0,180,216,0.06)" }}>
                        <div className="text-[12px] font-semibold mb-2" style={{ color: "var(--ibs-accent)" }}>⚡ Điền hàng loạt <span className="font-normal" style={{ color: "var(--ibs-text-dim)" }}>— tick NV bên dưới, nhập tiêu chí chung rồi bấm Áp</span></div>
                        <div className="flex items-end gap-2 flex-wrap">
                          <div><div className="text-[10px] mb-0.5" style={{ color: "var(--ibs-text-dim)" }}>Mã dự án</div>
                            <ProjectSelect value={bd.projectCode} onChange={(v) => setBulkField(b.blockId, "projectCode", v)} cls={cellSel} style={inputStyle} wrapStyle={{ width: 128 }} /></div>
                          <div><div className="text-[10px] mb-0.5" style={{ color: "var(--ibs-text-dim)" }}>Hành chính</div>
                            <input type="number" step="0.5" min="0" value={bd.hours} onChange={(e) => setBulkField(b.blockId, "hours", e.target.value)} placeholder="Giờ" className="w-16 px-2 py-1.5 rounded-md text-[12px] outline-none text-right border" style={inputStyle} /></div>
                          <div><div className="text-[10px] mb-0.5" style={{ color: "var(--ibs-text-dim)" }}>Mã CV</div>
                            <select value={bd.workCode} onChange={(e) => setBulkField(b.blockId, "workCode", e.target.value)} className={cellSel} style={{ ...inputStyle, width: 120 }}><option value="">—</option>{WORK_CATALOG.map((w) => <option key={w.code} value={w.code}>{w.code} · {w.label}</option>)}</select></div>
                          <div><div className="text-[10px] mb-0.5" style={{ color: "var(--ibs-text-dim)" }}>Mã chủng loại</div>
                            <select value={bd.categoryCode} onChange={(e) => setBulkField(b.blockId, "categoryCode", e.target.value)} disabled={!bd.workCode || bulkCats.length === 0} className={cellSel} style={{ ...inputStyle, width: 130, opacity: (!bd.workCode || bulkCats.length === 0) ? 0.5 : 1 }}><option value="">—</option>{bulkCats.map((c) => <option key={c.code} value={c.code}>{c.code} · {c.label}</option>)}</select></div>
                          <div><div className="text-[10px] mb-0.5" style={{ color: "var(--ibs-text-dim)" }}>Tăng cường</div>
                            <input value={bd.reinforce} onChange={(e) => setBulkField(b.blockId, "reinforce", e.target.value)} placeholder="..." className="px-2 py-1.5 rounded-md text-[12px] outline-none border" style={{ ...inputStyle, width: 110 }} /></div>
                          <div><div className="text-[10px] mb-0.5" style={{ color: "var(--ibs-text-dim)" }}>Nội dung</div>
                            <input value={bd.content} onChange={(e) => setBulkField(b.blockId, "content", e.target.value)} placeholder="..." className="px-2 py-1.5 rounded-md text-[12px] outline-none border" style={{ ...inputStyle, width: 150 }} /></div>
                          <button type="button" onClick={() => applyBulk(b.blockId)} disabled={selCount === 0} className="px-3 py-1.5 rounded-lg text-[12.5px] font-semibold text-white" style={{ background: selCount ? "var(--ibs-accent)" : "rgba(0,180,216,0.4)" }}>Áp cho {selCount} người</button>
                        </div>
                      </div>
                      <div className="text-[11px]" style={{ color: "var(--ibs-text-dim)" }}>Dòng để trống sẽ tự bỏ khi lưu · bấm <b>＋ dự án</b> để 1 NV khai thêm dự án.</div>
                      <div className="rounded-lg border overflow-x-auto" style={{ borderColor: "var(--ibs-border)" }}>
                        <table className="w-full text-[12px]" style={{ minWidth: 990 }}>
                          <thead>
                            <tr style={{ borderBottom: "1px solid var(--ibs-border)", background: "var(--ibs-bg)" }}>
                              <th className={th} style={{ color: "var(--ibs-text-dim)" }}><input type="checkbox" checked={allVisSel} onChange={(e) => setAllSel(visibleRows.map((r) => r.rowId), e.target.checked)} title="Chọn tất cả" /></th>
                              {["Mã NV", "Tên nhân viên", "Mã dự án", "Hành chính", "Mã CV", "Mã chủng loại", "Tăng cường", "Nội dung công việc", ""].map((h, i) => (
                                <th key={i} className={th} style={{ color: "var(--ibs-text-dim)" }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {visibleRows.length === 0 && (
                              <tr><td colSpan={10} className="px-3 py-4 text-center text-[12px]" style={{ color: "var(--ibs-text-dim)" }}>Không tìm thấy NV khớp "{q}"</td></tr>
                            )}
                            {visibleRows.map((r) => r.projects.map((p, pi) => {
                              const cats = categoriesOf(p.workCode);
                              const first = pi === 0;
                              return (
                                <tr key={p.key} style={{ borderBottom: pi === r.projects.length - 1 ? "2px solid var(--ibs-border)" : "1px dashed var(--ibs-border)" }}>
                                  {first && (
                                    <td className="px-2 py-1.5 align-top text-center" rowSpan={r.projects.length} style={{ borderRight: "1px solid var(--ibs-border)" }}><input type="checkbox" checked={!!sel[r.rowId]} onChange={() => toggleSel(r.rowId)} /></td>
                                  )}
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
                                    <ProjectSelect value={p.projectCode} onChange={(v) => setProj(b.blockId, r.rowId, p.key, "projectCode", v)} cls={cellSel} style={inputStyle} wrapStyle={{ width: 128 }} />
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
                                    <input value={p.reinforce} onChange={(e) => setProj(b.blockId, r.rowId, p.key, "reinforce", e.target.value)} placeholder="Tăng cường..." className="px-2 py-1.5 rounded-md text-[12px] outline-none border w-full" style={{ ...inputStyle, minWidth: 120 }} />
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

          <button type="button" onClick={addBlock} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[13px] font-semibold border" style={{ borderColor: "var(--ibs-accent)", color: "var(--ibs-accent)", borderStyle: "dashed" }}>
            <Plus size={15} /> Thêm xưởng
          </button>
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
