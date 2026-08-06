"use client";

import { useState, useEffect, useMemo, useRef, type Dispatch, type SetStateAction } from "react";
import { PageTitle } from "@/components/layout/page-title";
import { StatusBadge } from "@/components/shared/status-badge";
import { ApprovalWorkflow } from "@/components/shared/approval-workflow";
import { formatDate, apiError } from "@/lib/utils";
import { Plus, X, Clock, Calendar, Lock, Pencil, Trash2 } from "lucide-react";
import { DateInput, TimeInput } from "@/components/shared/date-input";
import { canSeeOTTab } from "@/lib/ot-access";
import { useCan } from "@/hooks/use-permission";
import { ProjectSelect } from "@/components/shared/project-select";
import { confirmDialog, alertDialog } from "@/lib/confirm-dialog";

type OTRequest = {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  hours: number;
  otRate: number;
  reason: string;
  status: string;
  createdAt: string;
  teamName?: string | null;
  projectCode?: string | null;
  memberIds?: string[];
  memberNames?: string[];
  memberProjects?: { id: string; employeeId: string; employeeName: string; projectCode: string; hours: number; reason?: string | null; startTime?: string | null; endTime?: string | null }[];
  employee: {
    id: string;
    code: string;
    fullName: string;
    department: { id: string; name: string };
  };
};

const STATUS_OPTIONS = [
  { value: "", label: "Tất cả trạng thái" },
  { value: "PENDING", label: "Chờ duyệt" },
  { value: "APPROVED", label: "Đã duyệt" },
  { value: "REJECTED", label: "Từ chối" },
];

const OT_RATE_LABELS: Record<string, string> = {
  "1.5": "×1.5 (ngày thường)",
  "2":   "×2.0 (cuối tuần)",
  "3":   "×3.0 (ngày lễ)",
};

function hmToMin(t: string): number { const [h, m] = (t || "0:0").split(":").map(Number); return (h || 0) * 60 + (m || 0); }
// Phút kết thúc: "00:00" nghĩa là CUỐI ngày = 24:00 (để nhập được khung "22:00–00:00").
function endMin(t: string): number { const m = hmToMin(t); return m === 0 ? 1440 : m; }
// Giờ OT từ khung giờ (làm tròn 2 số lẻ). OT phải nằm TRONG 1 ngày (kết thúc sau bắt đầu) — làm qua
//   nửa đêm thì tách 2 đơn (…→00:00 và 00:00→…), nên end<=start (trừ 00:00) coi là 0h (không hợp lệ).
function calcHours(start: string, end: string): number {
  if (!start || !end) return 0;
  const s = hmToMin(start), e = endMin(end);
  return e > s ? Math.round(((e - s) / 60) * 100) / 100 : 0;
}

// Tách khung giờ thành phần NGÀY và ĐÊM (giờ đêm 22:00–06:00) rồi gán hệ số. Ngày trong tuần → ngày ×1.5
//   /đêm ×2.0; cuối tuần (T7/CN) → ngày ×2.0 / đêm ×2.7. (Lễ ×3.0/×3.9 chưa auto — cần lịch lễ.)
type OTRatePart = { hours: number; rate: number; night: boolean };
function otRateParts(start: string, end: string, dateStr?: string): OTRatePart[] {
  const s = hmToMin(start), e = endMin(end);
  if (!(e > s)) return [];
  const weekend = dateStr ? [0, 6].includes(new Date(dateStr).getDay()) : false;
  const dayRate = weekend ? 2.0 : 1.5;
  const nightRate = weekend ? 2.7 : 2.0;
  const overlap = (b1: number, b2: number) => Math.max(0, Math.min(e, b2) - Math.max(s, b1));
  const nightMin = overlap(1320, 1440) + overlap(0, 360); // 22:00–24:00 + 00:00–06:00
  const dayMin = (e - s) - nightMin;
  const parts: OTRatePart[] = [];
  if (dayMin > 0) parts.push({ hours: Math.round((dayMin / 60) * 100) / 100, rate: dayRate, night: false });
  if (nightMin > 0) parts.push({ hours: Math.round((nightMin / 60) * 100) / 100, rate: nightRate, night: true });
  return parts;
}
const fmtH = (h: number) => h.toLocaleString("vi-VN", { maximumFractionDigits: 2 });
// Nhãn hệ số: 1 phần → "×1.5"; nhiều phần → "×1.5·2h + ×2.0·2h".
function fmtRateParts(parts: OTRatePart[]): string {
  if (parts.length === 0) return "—";
  if (parts.length === 1) return `×${parts[0].rate}`;
  return parts.map((p) => `×${p.rate}·${fmtH(p.hours)}h`).join(" + ");
}
// Cộng thêm `hours` giờ vào mốc "HH:mm" (kẹp trong ngày) — dùng tái tạo khung giờ khối khi SỬA đơn.
function addHoursTo(start: string, hours: number): string {
  const [h, m] = (start || "0:0").split(":").map(Number);
  const total = Math.max(0, Math.min(23 * 60 + 59, (h || 0) * 60 + (m || 0) + Math.round((hours || 0) * 60)));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
// Gom memberProjects thành các NHÓM DỰ ÁN (theo mã dự án + khung giờ) để hiển thị Giờ làm/Thời lượng
//   riêng từng dự án ở danh sách. Khung giờ lấy từ dòng (nếu đã lưu) — fallback về khung chung của đơn.
function projectTimeGroups(r: OTRequest): { projectCode: string; startTime: string; endTime: string; hours: number; count: number }[] {
  const mps = r.memberProjects ?? [];
  if (mps.length === 0) return [];
  const map = new Map<string, { projectCode: string; startTime: string; endTime: string; hours: number; count: number }>();
  for (const mp of mps) {
    const st = mp.startTime || r.startTime;
    const et = mp.endTime || r.endTime;
    const key = mp.projectCode + "|" + st + "|" + et;
    let g = map.get(key);
    if (!g) { g = { projectCode: mp.projectCode, startTime: st, endTime: et, hours: mp.hours, count: 0 }; map.set(key, g); }
    g.count++;
  }
  return Array.from(map.values());
}
type ProjAlloc = { projectCode: string; hours: number };

// Checklist chọn NV có Ô GÕ TÌM (lọc theo tên hoặc mã NV) — chỉ lọc trong danh sách đã truyền vào
//   (đã scope sẵn theo Xưởng/phòng). Hiển thị mã NV bên cạnh để phân biệt trùng tên.
type PickMember = { id: string; name: string; code?: string | null; dept?: string; outside?: boolean };
function MemberPicker({ members, selected, onToggle, emptyText }: {
  members: PickMember[]; selected: string[]; onToggle: (id: string) => void; emptyText?: string;
}) {
  const [q, setQ] = useState("");
  const qq = q.trim().toLowerCase();
  const filtered = qq ? members.filter((m) => m.name.toLowerCase().includes(qq) || (m.code || "").toLowerCase().includes(qq)) : members;
  return (
    <div className="rounded-md border" style={{ borderColor: "var(--ibs-border)", background: "var(--ibs-bg-card)" }}>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔎 Gõ tên hoặc mã NV để tìm..."
        className="w-full px-3 py-1.5 text-[12.5px] outline-none border-b" style={{ background: "transparent", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }} />
      <div className="max-h-[150px] overflow-y-auto">
        {members.length === 0 ? (
          <div className="px-3 py-2 text-[12px]" style={{ color: "var(--ibs-text-dim)" }}>{emptyText || "Chưa có nhân sự."}</div>
        ) : filtered.length === 0 ? (
          <div className="px-3 py-2 text-[12px]" style={{ color: "var(--ibs-text-dim)" }}>Không tìm thấy nhân sự khớp.</div>
        ) : filtered.map((m) => (
          <label key={m.id} className="flex items-center gap-2 px-3 py-1.5 text-[13px] cursor-pointer hover:bg-white/[0.04]">
            <input type="checkbox" checked={selected.includes(m.id)} onChange={() => onToggle(m.id)} />
            <span>{m.name}{m.code ? <span className="text-[11px] font-mono" style={{ color: "var(--ibs-text-dim)" }}> · {m.code}</span> : null}{m.dept ? <span className="text-[11px]" style={{ color: "var(--ibs-text-dim)" }}> · {m.dept}</span> : null}{m.outside ? <span className="text-[11px]" style={{ color: "var(--ibs-text-dim)" }}> (ngoài phạm vi)</span> : null}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

// ── Tab "theo dự án" (BỐ CỤC BẢNG như Kê khai tổ) ────────────────────────────
// Chọn Xưởng → nạp hết NV thành bảng; mỗi NV×dự án 1 dòng có khung giờ + lý do riêng.
type OtEmp = { id: string; fullName: string; code?: string | null; team?: { id: string; name: string } | null; department?: { id: string; name: string } | null };
type OtProj = { key: string; projectCode: string; startTime: string; endTime: string; reason: string };
type OtRow = { rowId: string; employeeId: string; employeeCode: string; employeeName: string; projects: OtProj[] };
type OtBlock = { blockId: string; deptKey: string; collapsed: boolean; rows: OtRow[] };

const emptyOtProj = (key: string): OtProj => ({ key, projectCode: "", startTime: "17:30", endTime: "19:30", reason: "" });
const otProjFilled = (p: OtProj) => !!p.projectCode;
// Chuẩn hoá để tìm không phân biệt dấu/hoa-thường ("yen" khớp "Yến").
const normVi = (s: string) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d");

// Gom payload memberProjects (byProject) từ các khối; trả {err} nếu khung giờ sai.
function collectByProject(blocks: OtBlock[], nameOf: (id: string) => string): {
  err?: string; payload: { employeeId: string; employeeName: string; projectCode: string; hours: number; reason: string; startTime: string; endTime: string }[];
} {
  const payload: { employeeId: string; employeeName: string; projectCode: string; hours: number; reason: string; startTime: string; endTime: string }[] = [];
  for (const b of blocks) {
    if (!b.deptKey) continue;
    for (const r of b.rows) for (const p of r.projects) {
      if (!otProjFilled(p)) continue; // dòng chưa chọn dự án → bỏ
      const h = calcHours(p.startTime, p.endTime);
      if (!(h > 0)) return { err: `${r.employeeName}: khung giờ không hợp lệ (làm qua nửa đêm thì tách 2 đơn: …→00:00 và 00:00→…)`, payload: [] };
      payload.push({ employeeId: r.employeeId, employeeName: r.employeeName || nameOf(r.employeeId), projectCode: p.projectCode, hours: h, reason: (p.reason || "").trim(), startTime: p.startTime, endTime: p.endTime });
    }
  }
  return { payload };
}

let __otBlockSeq = 0;
const otUid = () => `ob${__otBlockSeq++}`;

function ProjectBlocks({ blocks, setBlocks, emps, departments, teams, membersOfKey, dateStr, onDirty }: {
  blocks: OtBlock[];
  setBlocks: Dispatch<SetStateAction<OtBlock[]>>;
  emps: OtEmp[];
  departments: { id: string; name: string }[];
  teams: { id: string; name: string }[];
  membersOfKey: (key: string) => OtEmp[];
  dateStr: string;
  onDirty?: () => void;
}) {
  const [search, setSearch] = useState<Record<string, string>>({});
  const [sel, setSel] = useState<Record<string, boolean>>({});   // tick chọn NV để điền hàng loạt
  const [bulk, setBulk] = useState<Record<string, { projectCode: string; startTime: string; endTime: string; reason: string }>>({});
  const bulkOf = (blockId: string) => bulk[blockId] || { projectCode: "", startTime: "17:30", endTime: "19:30", reason: "" };
  const setBulkField = (blockId: string, f: string, v: string) => setBulk((s) => ({ ...s, [blockId]: { ...(s[blockId] || { projectCode: "", startTime: "17:30", endTime: "19:30", reason: "" }), [f]: v } }));
  const toggleSel = (rowId: string) => setSel((s) => ({ ...s, [rowId]: !s[rowId] }));
  const setAllSel = (rowIds: string[], checked: boolean) => setSel((s) => { const n = { ...s }; rowIds.forEach((id) => (n[id] = checked)); return n; });
  const codeOf = (m: OtEmp) => m.code || "";
  const usedKeys = blocks.map((b) => b.deptKey).filter(Boolean);
  const keyName = (key: string) => {
    if (!key) return "";
    const [t, id] = key.split(":");
    return (t === "dept" ? departments.find((d) => d.id === id)?.name : teams.find((x) => x.id === id)?.name) || "";
  };
  const patch = (blockId: string, fn: (b: OtBlock) => OtBlock) => { setBlocks((bs) => bs.map((b) => b.blockId === blockId ? fn(b) : b)); onDirty?.(); };

  function loadDept(blockId: string, key: string) {
    setBlocks((bs) => bs.map((b) => b.blockId !== blockId ? b : {
      ...b, deptKey: key,
      rows: membersOfKey(key).map((m) => ({ rowId: otUid(), employeeId: m.id, employeeCode: codeOf(m), employeeName: m.fullName, projects: [emptyOtProj(otUid())] })),
    }));
    onDirty?.();
  }
  const addBlock = () => setBlocks((bs) => [...bs, { blockId: otUid(), deptKey: "", collapsed: false, rows: [] }]);
  const removeBlock = (blockId: string) => setBlocks((bs) => bs.filter((b) => b.blockId !== blockId));
  const toggleCollapse = (blockId: string) => patch(blockId, (b) => ({ ...b, collapsed: !b.collapsed }));
  const setProj = (blockId: string, rowId: string, key: string, f: keyof OtProj, v: string) =>
    patch(blockId, (b) => ({ ...b, rows: b.rows.map((r) => r.rowId !== rowId ? r : { ...r, projects: r.projects.map((p) => p.key === key ? { ...p, [f]: v } : p) }) }));
  const addProj = (blockId: string, rowId: string) => patch(blockId, (b) => ({ ...b, rows: b.rows.map((r) => r.rowId === rowId ? { ...r, projects: [...r.projects, emptyOtProj(otUid())] } : r) }));
  const removeProj = (blockId: string, rowId: string, key: string) => patch(blockId, (b) => ({
    ...b, rows: b.rows.flatMap((r) => {
      if (r.rowId !== rowId) return [r];
      const projects = r.projects.filter((p) => p.key !== key);
      return projects.length ? [{ ...r, projects }] : [];
    }),
  }));
  function addEmp(blockId: string, empId: string) {
    const m = emps.find((e) => e.id === empId);
    if (!m) return;
    patch(blockId, (b) => ({ ...b, rows: [...b.rows, { rowId: otUid(), employeeId: m.id, employeeCode: codeOf(m), employeeName: m.fullName, projects: [emptyOtProj(otUid())] }] }));
  }
  // Áp tiêu chí chung vào DÒNG DỰ ÁN ĐẦU của mỗi NV đã tick (giờ đi/về + dự án luôn áp; lý do áp nếu có nhập).
  function applyBulk(blockId: string) {
    const d = bulkOf(blockId);
    patch(blockId, (b) => ({
      ...b,
      rows: b.rows.map((r) => !sel[r.rowId] ? r : {
        ...r,
        projects: r.projects.map((p, i) => i !== 0 ? p : {
          ...p, startTime: d.startTime, endTime: d.endTime,
          ...(d.projectCode ? { projectCode: d.projectCode } : {}),
          ...(d.reason.trim() ? { reason: d.reason } : {}),
        }),
      }),
    }));
  }

  const inputStyle = { background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" };
  const cellSel = "px-2 py-1.5 rounded-md text-[12px] outline-none border";
  const th = "px-2 py-2 text-left text-[11px] font-semibold uppercase whitespace-nowrap";

  return (
    <div className="space-y-3">
      {blocks.map((b) => {
        const q = (search[b.blockId] || "").trim();
        const nq = normVi(q);
        const visibleRows = nq ? b.rows.filter((r) => normVi(r.employeeName).includes(nq) || normVi(r.employeeCode).includes(nq)) : b.rows;
        const filledCount = b.rows.reduce((s, r) => s + r.projects.filter(otProjFilled).length, 0);
        const memberIds = new Set(b.rows.map((r) => r.employeeId));
        const missing = membersOfKey(b.deptKey).filter((m) => !memberIds.has(m.id));
        const bd = bulkOf(b.blockId);
        const selCount = b.rows.filter((r) => sel[r.rowId]).length;
        const allVisSel = visibleRows.length > 0 && visibleRows.every((r) => sel[r.rowId]);
        return (
          <div key={b.blockId} className="rounded-lg border" style={{ borderColor: "var(--ibs-border)" }}>
            <div className="flex items-center gap-2 px-3 py-2.5 flex-wrap" style={{ background: "var(--ibs-bg)", borderBottom: b.collapsed ? "none" : "1px solid var(--ibs-border)" }}>
              <button type="button" onClick={() => toggleCollapse(b.blockId)} className="p-0.5 text-[13px]" style={{ color: "var(--ibs-text-dim)" }} title={b.collapsed ? "Mở" : "Thu gọn"}>{b.collapsed ? "▶" : "▼"}</button>
              <span className="text-[13px] font-semibold">🏭 Xưởng/Phòng ban:</span>
              <select value={b.deptKey} onChange={(e) => loadDept(b.blockId, e.target.value)} className="px-2.5 py-1.5 rounded-lg text-[13px] outline-none border" style={inputStyle}>
                <option value="">-- Chọn xưởng --</option>
                {departments.length > 0 && <optgroup label="Phòng ban">{departments.filter((d) => b.deptKey === "dept:" + d.id || !usedKeys.includes("dept:" + d.id)).map((d) => <option key={"dept:" + d.id} value={"dept:" + d.id}>{d.name}</option>)}</optgroup>}
                {teams.length > 0 && <optgroup label="Tổ">{teams.filter((t) => b.deptKey === "team:" + t.id || !usedKeys.includes("team:" + t.id)).map((t) => <option key={"team:" + t.id} value={"team:" + t.id}>{t.name}</option>)}</optgroup>}
              </select>
              {b.deptKey && <span className="text-[12px]" style={{ color: "var(--ibs-text-dim)" }}><b style={{ color: "var(--ibs-accent)" }}>{filledCount}</b> dòng đã khai</span>}
              {blocks.length > 1 && <button type="button" onClick={() => removeBlock(b.blockId)} className="ml-auto p-1 rounded text-[13px]" style={{ color: "var(--ibs-danger)" }} title="Bỏ xưởng này">🗑</button>}
            </div>

            {!b.collapsed && (
              b.rows.length === 0 ? (
                <div className="px-3 py-6 text-center text-[13px]" style={{ color: "var(--ibs-text-dim)" }}>{!b.deptKey ? "Chọn xưởng để nạp danh sách nhân sự." : "Xưởng này chưa có nhân sự."}</div>
              ) : (
                <div className="p-3 space-y-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <input value={search[b.blockId] || ""} onChange={(e) => setSearch((s) => ({ ...s, [b.blockId]: e.target.value }))} placeholder="🔎 Gõ tên hoặc mã NV để tìm nhanh..." className="px-3 py-1.5 rounded-lg text-[13px] outline-none border" style={{ ...inputStyle, minWidth: 280 }} />
                    {q && (<>
                      <span className="text-[12px]" style={{ color: "var(--ibs-text-dim)" }}>Hiện {visibleRows.length}/{b.rows.length} NV</span>
                      <button type="button" onClick={() => setSearch((s) => ({ ...s, [b.blockId]: "" }))} className="px-3 py-1.5 rounded-lg text-[12.5px] font-semibold text-white" style={{ background: "var(--ibs-accent)" }}>Xong</button>
                    </>)}
                  </div>
                  {/* ⚡ Điền hàng loạt: tick NV rồi nhập tiêu chí chung → Áp (ghi đè dòng dự án đầu) */}
                  <div className="rounded-lg border p-2.5" style={{ borderColor: "var(--ibs-accent)", background: "rgba(0,180,216,0.06)" }}>
                    <div className="text-[12px] font-semibold mb-2" style={{ color: "var(--ibs-accent)" }}>⚡ Điền hàng loạt <span className="font-normal" style={{ color: "var(--ibs-text-dim)" }}>— tick NV bên dưới, nhập tiêu chí chung rồi bấm Áp</span></div>
                    <div className="flex items-end gap-2 flex-wrap">
                      <div><div className="text-[10px] mb-0.5" style={{ color: "var(--ibs-text-dim)" }}>Mã dự án</div>
                        <ProjectSelect value={bd.projectCode} onChange={(v) => setBulkField(b.blockId, "projectCode", v)} cls={cellSel} style={inputStyle} wrapStyle={{ width: 128 }} /></div>
                      <div><div className="text-[10px] mb-0.5" style={{ color: "var(--ibs-text-dim)" }}>Giờ đi</div><div className="w-[54px]"><TimeInput value={bd.startTime} onChange={(e) => setBulkField(b.blockId, "startTime", e.target.value)} className="w-full px-1 py-1.5 rounded-md text-[12px] text-center outline-none border" style={inputStyle} /></div></div>
                      <div><div className="text-[10px] mb-0.5" style={{ color: "var(--ibs-text-dim)" }}>Giờ về</div><div className="w-[54px]"><TimeInput value={bd.endTime} onChange={(e) => setBulkField(b.blockId, "endTime", e.target.value)} className="w-full px-1 py-1.5 rounded-md text-[12px] text-center outline-none border" style={inputStyle} /></div></div>
                      <div className="flex-1 min-w-[150px]"><div className="text-[10px] mb-0.5" style={{ color: "var(--ibs-text-dim)" }}>Lý do</div><input value={bd.reason} onChange={(e) => setBulkField(b.blockId, "reason", e.target.value)} placeholder="..." className="px-2 py-1.5 rounded-md text-[12px] outline-none border w-full" style={inputStyle} /></div>
                      <button type="button" onClick={() => applyBulk(b.blockId)} disabled={selCount === 0} className="px-3 py-1.5 rounded-lg text-[12.5px] font-semibold text-white" style={{ background: selCount ? "var(--ibs-accent)" : "rgba(0,180,216,0.4)" }}>Áp cho {selCount} người</button>
                    </div>
                  </div>
                  <div className="text-[11px]" style={{ color: "var(--ibs-text-dim)" }}>Dòng chưa chọn dự án sẽ tự bỏ khi gửi · bấm <b>＋ dự án</b> để 1 NV khai thêm dự án · làm qua nửa đêm thì tách 2 đơn.</div>
                  <div className="rounded-lg border overflow-x-auto" style={{ borderColor: "var(--ibs-border)" }}>
                    <table className="w-full text-[12px]" style={{ minWidth: 900 }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid var(--ibs-border)", background: "var(--ibs-bg)" }}>
                          <th className={th} style={{ color: "var(--ibs-text-dim)" }}><input type="checkbox" checked={allVisSel} onChange={(e) => setAllSel(visibleRows.map((r) => r.rowId), e.target.checked)} title="Chọn tất cả" /></th>
                          {["Mã NV", "Tên nhân viên", "Mã dự án", "Giờ đi", "Giờ về", "Số giờ", "Lý do", ""].map((h, i) => <th key={i} className={th} style={{ color: "var(--ibs-text-dim)" }}>{h}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {visibleRows.length === 0 && <tr><td colSpan={9} className="px-3 py-4 text-center text-[12px]" style={{ color: "var(--ibs-text-dim)" }}>Không tìm thấy NV khớp &quot;{q}&quot;</td></tr>}
                        {visibleRows.map((r) => r.projects.map((p, pi) => {
                          const first = pi === 0;
                          const parts = otRateParts(p.startTime, p.endTime, dateStr);
                          const h = calcHours(p.startTime, p.endTime);
                          return (
                            <tr key={p.key} style={{ borderBottom: pi === r.projects.length - 1 ? "2px solid var(--ibs-border)" : "1px dashed var(--ibs-border)" }}>
                              {first && <td className="px-2 py-1.5 align-top text-center" rowSpan={r.projects.length} style={{ borderRight: "1px solid var(--ibs-border)" }}><input type="checkbox" checked={!!sel[r.rowId]} onChange={() => toggleSel(r.rowId)} /></td>}
                              {first && <td className="px-2 py-1.5 align-top font-mono whitespace-nowrap" rowSpan={r.projects.length} style={{ color: "var(--ibs-text-muted)", borderRight: "1px solid var(--ibs-border)" }}>{r.employeeCode || "—"}</td>}
                              {first && <td className="px-2 py-1.5 align-top" rowSpan={r.projects.length} style={{ borderRight: "1px solid var(--ibs-border)", minWidth: 140 }}>
                                <div className="font-medium">{r.employeeName}</div>
                                <button type="button" onClick={() => addProj(b.blockId, r.rowId)} className="mt-1 text-[11px] font-medium inline-flex items-center gap-0.5" style={{ color: "var(--ibs-accent)" }}>＋ dự án</button>
                              </td>}
                              <td className="px-2 py-1.5">
                                <ProjectSelect value={p.projectCode} onChange={(v) => setProj(b.blockId, r.rowId, p.key, "projectCode", v)} cls={cellSel} style={inputStyle} wrapStyle={{ width: 128 }} />
                              </td>
                              <td className="px-2 py-1.5"><div className="w-[54px]"><TimeInput value={p.startTime} onChange={(e) => setProj(b.blockId, r.rowId, p.key, "startTime", e.target.value)} className="w-full px-1 py-1.5 rounded-md text-[12px] text-center outline-none border" style={inputStyle} /></div></td>
                              <td className="px-2 py-1.5"><div className="w-[54px]"><TimeInput value={p.endTime} onChange={(e) => setProj(b.blockId, r.rowId, p.key, "endTime", e.target.value)} className="w-full px-1 py-1.5 rounded-md text-[12px] text-center outline-none border" style={inputStyle} /></div></td>
                              <td className="px-2 py-1.5 whitespace-nowrap" style={{ color: h > 0 ? "var(--ibs-text-muted)" : "var(--ibs-danger)" }}>
                                {h > 0 ? <>{fmtH(h)}h · <b style={{ color: "var(--ibs-accent)" }}>{fmtRateParts(parts)}</b>{parts.some((x) => x.night) ? " · đêm" : ""}</> : "sai giờ"}
                              </td>
                              <td className="px-2 py-1.5"><input value={p.reason} onChange={(e) => setProj(b.blockId, r.rowId, p.key, "reason", e.target.value)} placeholder="Lý do..." className="px-2 py-1.5 rounded-md text-[12px] outline-none border w-full" style={{ ...inputStyle, minWidth: 150 }} /></td>
                              <td className="px-2 py-1.5 text-center"><button type="button" onClick={() => removeProj(b.blockId, r.rowId, p.key)} className="p-1 rounded text-[13px]" style={{ color: "var(--ibs-danger)" }} title={r.projects.length > 1 ? "Xóa dòng dự án" : "Xóa nhân sự khỏi xưởng"}>✕</button></td>
                            </tr>
                          );
                        }))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <select value="" onChange={(e) => addEmp(b.blockId, e.target.value)} className="px-3 py-1.5 rounded-lg text-[12.5px] outline-none border" style={inputStyle}>
                      <option value="">＋ Thêm nhân sự...</option>
                      {membersOfKey(b.deptKey).map((m) => <option key={m.id} value={m.id}>{codeOf(m) ? `${codeOf(m)} · ` : ""}{m.fullName}{memberIds.has(m.id) ? " (đã có)" : ""}</option>)}
                    </select>
                    {missing.length > 0 && <span className="text-[11px]" style={{ color: "var(--ibs-text-dim)" }}>{missing.length} NV chưa có trong xưởng</span>}
                  </div>
                </div>
              )
            )}
          </div>
        );
      })}
      <button type="button" onClick={addBlock} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[13px] font-semibold border" style={{ borderColor: "var(--ibs-accent)", color: "var(--ibs-accent)", borderStyle: "dashed" }}>＋ Thêm xưởng</button>
    </div>
  );
}

// ── New OT Dialog ──────────────────────────────────────────────────────────────
function NewOTDialog({ onClose, onSuccess }: { onClose: () => void; onSuccess: (item: OTRequest) => void }) {
  const [form, setForm] = useState({ date: "", startTime: "17:30", endTime: "20:00", reason: "" });
  // Phân bổ dự án theo TỪNG NV: { employeeId: [{projectCode, hours}, ...] }
  const [memberProjects, setMemberProjects] = useState<Record<string, ProjAlloc[]>>({});
  // Lý do tăng ca theo TỪNG NV: { employeeId: "lý do" }
  const [memberReasons, setMemberReasons] = useState<Record<string, string>>({});
  const [emps, setEmps] = useState<{ id: string; fullName: string; code?: string | null; team?: { id: string; name: string } | null; department?: { id: string; name: string } | null }[]>([]);
  const [empsLoaded, setEmpsLoaded] = useState(false);
  const [groupKey, setGroupKey] = useState(""); // "dept:<id>" hoặc "team:<id>"
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Chế độ khai: theo nhân sự (mặc định) | theo dự án.
  const [mode, setMode] = useState<"byEmployee" | "byProject">("byEmployee");
  const [blocks, setBlocks] = useState<OtBlock[]>([{ blockId: otUid(), deptKey: "", collapsed: false, rows: [] }]);

  useEffect(() => {
    fetch(`/api/v1/ot-requests/team-members`).then((r) => r.json())
      .then((res) => setEmps(res.data || [])).catch(() => {}).finally(() => setEmpsLoaded(true));
  }, []);

  const departments = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of emps) if (e.department?.id) m.set(e.department.id, e.department.name);
    return Array.from(m.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, "vi"));
  }, [emps]);
  const teams = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of emps) if (e.team?.id) m.set(e.team.id, e.team.name);
    return Array.from(m.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, "vi"));
  }, [emps]);

  function membersOfKey(key: string) {
    if (!key) return [];
    const [type, id] = key.split(":");
    return emps.filter((e) => type === "dept" ? e.department?.id === id : e.team?.id === id);
  }
  const groupMembers = useMemo(() => membersOfKey(groupKey), [emps, groupKey]); // eslint-disable-line
  const groupName = useMemo(() => {
    if (!groupKey) return "";
    const [type, id] = groupKey.split(":");
    return (type === "dept" ? departments.find((d) => d.id === id)?.name : teams.find((t) => t.id === id)?.name) || "";
  }, [groupKey, departments, teams]);

  const durationH = calcHours(form.startTime, form.endTime);

  // Tổ trưởng chỉ có đúng 1 tổ → tự chọn sẵn NHÓM (không tự tích nhân sự — mặc định chưa tích ai).
  useEffect(() => {
    if (teams.length === 1 && !groupKey) {
      setGroupKey("team:" + teams[0].id);
    }
  }, [teams, groupKey, emps]); // eslint-disable-line

  // Khi đổi khung giờ → cập nhật giờ cho NV chỉ có 1 dòng dự án (còn nhiều dòng thì user tự chia).
  useEffect(() => {
    setMemberProjects((prev) => {
      const n: Record<string, ProjAlloc[]> = {};
      for (const [id, rows] of Object.entries(prev)) {
        n[id] = rows.length === 1 ? [{ ...rows[0], hours: durationH }] : rows;
      }
      return n;
    });
  }, [durationH]); // eslint-disable-line

  function selectGroup(key: string) {
    setGroupKey(key);
    setMemberIds([]);            // MẶC ĐỊNH KHÔNG tích ai — tự chọn từng NV
    setMemberProjects({});
    setMemberReasons({});
    setError(null);
  }
  function toggleMember(id: string) {
    setMemberIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
    setMemberProjects((prev) => {
      const n = { ...prev };
      if (n[id]) delete n[id]; else n[id] = [{ projectCode: "", hours: durationH }];
      return n;
    });
    setMemberReasons((prev) => {
      const n = { ...prev };
      if (id in n) delete n[id]; else n[id] = "";
      return n;
    });
  }
  function setMemberReason(id: string, value: string) {
    setMemberReasons((prev) => ({ ...prev, [id]: value }));
    setError(null);
  }
  // Handlers phân bổ dự án cho 1 NV.
  function addProj(empId: string) {
    setMemberProjects((prev) => ({ ...prev, [empId]: [...(prev[empId] ?? []), { projectCode: "", hours: 0 }] }));
  }
  function removeProj(empId: string, idx: number) {
    setMemberProjects((prev) => ({ ...prev, [empId]: (prev[empId] ?? []).filter((_, i) => i !== idx) }));
  }
  function setProj(empId: string, idx: number, field: keyof ProjAlloc, value: string) {
    setMemberProjects((prev) => ({
      ...prev,
      [empId]: (prev[empId] ?? []).map((r, i) => i === idx ? { ...r, [field]: field === "hours" ? Number(value) : value } : r),
    }));
    setError(null);
  }

  function handleChange(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
    setError(null);
  }

  // ── Tab "theo dự án": UI dùng component ProjectBlocks (xưởng → bảng NV). ──

  // Auto-detect OT rate from date
  function getOTRate(dateStr: string): number {
    if (!dateStr) return 1.5;
    const d = new Date(dateStr).getDay();
    return d === 0 || d === 6 ? 2.0 : 1.5;
  }

  const nameOf = (id: string) => emps.find((e2) => e2.id === id)?.fullName || "";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // ── Chế độ THEO DỰ ÁN (bố cục bảng: xưởng → NV → dự án) ──
    if (mode === "byProject") {
      const fail = (msg: string) => { setError(msg); alertDialog(msg); };
      if (!form.date) { fail("Vui lòng chọn ngày tăng ca"); return; }
      const { err, payload } = collectByProject(blocks, nameOf);
      if (err) { fail(err); return; }
      if (payload.length === 0) { fail("Chưa có dòng nào (chọn xưởng, chọn dự án cho NV)"); return; }
      const allMembers = new Set(payload.map((p) => p.employeeId));
      const batchReason = Array.from(new Set(payload.map((p) => p.reason).filter(Boolean))).join(" | ") || "Tăng ca theo dự án";
      // Khung giờ TỔNG của đơn = sớm nhất → muộn nhất (chỉ để hiển thị + suy hệ số; giờ mỗi NV theo dòng).
      const starts = payload.map((p) => p.startTime).filter(Boolean).sort();
      const ends = payload.map((p) => p.endTime).filter(Boolean).sort();
      const overallStart = starts[0] || "17:30";
      const overallEnd = ends[ends.length - 1] || "20:00";
      setSaving(true);
      try {
        const res = await fetch("/api/v1/ot-requests", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            date: form.date, startTime: overallStart, endTime: overallEnd,
            reason: batchReason, allocMode: "byProject",
            teamId: null, teamName: null, // theo dự án → không gắn tên phòng ban, nhận diện theo đơn/ngày
            memberIds: Array.from(allMembers), memberNames: Array.from(allMembers).map(nameOf),
            memberProjects: payload,
          }),
        });
        const json = await res.json();
        if (!res.ok) { fail(apiError(res.status, json?.error)); return; }
        onSuccess(json.data);
      } catch { fail("Lỗi kết nối"); } finally { setSaving(false); }
      return;
    }

    const fail = (msg: string) => { setError(msg); alertDialog(msg); };
    if (!groupKey) { fail("Vui lòng chọn Phòng ban / Tổ"); return; }
    if (memberIds.length === 0) { fail("Vui lòng chọn ít nhất 1 nhân sự"); return; }

    // Dựng danh sách NV × dự án × giờ + validate: mỗi NV phải chọn dự án, nhập lý do, và tổng giờ = giờ OT.
    const memberProjectsPayload: { employeeId: string; employeeName: string; projectCode: string; hours: number; reason: string }[] = [];
    for (const id of memberIds) {
      const rows = memberProjects[id] ?? [];
      const rsn = (memberReasons[id] || "").trim();
      if (rows.length === 0 || rows.some((r) => !r.projectCode)) {
        fail(`Chọn dự án cho ${nameOf(id)}`); return;
      }
      if (!rsn) { fail(`Nhập lý do tăng ca cho ${nameOf(id)}`); return; }
      const sum = rows.reduce((s, r) => s + (r.hours || 0), 0);
      if (Math.abs(sum - durationH) > 0.01) {
        fail(`Tổng giờ dự án của ${nameOf(id)} (${sum}h) phải bằng giờ OT (${durationH}h)`); return;
      }
      for (const r of rows) memberProjectsPayload.push({ employeeId: id, employeeName: nameOf(id), projectCode: r.projectCode, hours: r.hours, reason: rsn });
    }
    // Lý do cấp đơn (tương thích cột cũ): gộp các lý do khác nhau của NV.
    const batchReason = Array.from(new Set(memberIds.map((id) => (memberReasons[id] || "").trim()).filter(Boolean))).join(" | ");

    setSaving(true);
    try {
      const groupId = groupKey.split(":")[1] || null;
      const memberNames = emps.filter((e2) => memberIds.includes(e2.id)).map((e2) => e2.fullName);
      const res = await fetch("/api/v1/ot-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: form.date, startTime: form.startTime, endTime: form.endTime, reason: batchReason, teamId: groupId, teamName: groupName || null, memberIds, memberNames, memberProjects: memberProjectsPayload }),
      });
      const json = await res.json();
      if (!res.ok) {
        fail(apiError(res.status, json?.error));
        return;
      }
      onSuccess(json.data);
    } catch {
      fail("Lỗi kết nối");
    } finally {
      setSaving(false);
    }
  }

  const otRate = getOTRate(form.date);

  const inputCls = "w-full px-3 py-2 rounded-lg text-[13px] outline-none";
  const inputStyle = { background: "var(--ibs-bg)", border: "1px solid var(--ibs-border)", color: "var(--ibs-text)" };
  const labelCls = "block text-[12px] font-medium mb-1.5";
  const labelStyle = { color: "var(--ibs-text-muted)" };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.7)" }}>
      <div className={`w-full ${mode === "byProject" ? "max-w-[1120px]" : "max-w-[460px]"} max-h-[90vh] flex flex-col rounded-xl border shadow-2xl`} style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
        <div className="flex items-center justify-between px-5 py-4 border-b shrink-0" style={{ borderColor: "var(--ibs-border)" }}>
          <h3 className="text-[15px] font-semibold">Đề xuất tăng ca</h3>
          <button onClick={onClose} style={{ color: "var(--ibs-text-dim)" }}><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col min-h-0 flex-1">
          <div className="p-5 space-y-4 overflow-y-auto">
          {error && (
            <div className="text-[13px] px-3 py-2 rounded-lg" style={{ background: "rgba(239,68,68,0.1)", color: "var(--ibs-danger)" }}>
              {error}
            </div>
          )}

          {/* 2 tab: theo nhân sự | theo dự án */}
          <div className="flex rounded-lg border overflow-hidden" style={{ borderColor: "var(--ibs-border)" }}>
            {([["byEmployee", "Đăng ký theo nhân sự"], ["byProject", "Đăng ký theo dự án"]] as const).map(([m, lbl]) => (
              <button key={m} type="button" onClick={() => { setMode(m); setError(null); }}
                className="flex-1 py-2 text-[12.5px] font-semibold transition-colors"
                style={{ background: mode === m ? "var(--ibs-accent)" : "var(--ibs-bg)", color: mode === m ? "#fff" : "var(--ibs-text-muted)" }}>
                {lbl}
              </button>
            ))}
          </div>

          <div>
            <label className={labelCls} style={labelStyle}>Ngày tăng ca *</label>
            <DateInput required value={form.date} onChange={(e) => handleChange("date", e.target.value)}
              className={inputCls} style={inputStyle} />
            {form.date && (
              <p className="text-[11px] mt-1" style={{ color: "var(--ibs-text-dim)" }}>
                Hệ số: ngày <strong style={{ color: "var(--ibs-accent)" }}>×{otRate}</strong> · đêm <strong style={{ color: "var(--ibs-accent)" }}>×{otRate === 2 ? 2.7 : 2.0}</strong> {otRate === 2 ? "(Cuối tuần)" : "(Ngày thường)"} · <span style={{ color: "var(--ibs-text-dim)" }}>đêm = 22:00–06:00</span>
              </p>
            )}
          </div>

          {mode === "byEmployee" && (<>
          <div>
            <label className={labelCls} style={labelStyle}>Phòng ban / Tổ <span style={{ color: "var(--ibs-danger)" }}>*</span></label>
            <select required value={groupKey} onChange={(e) => selectGroup(e.target.value)} className={inputCls} style={inputStyle}>
              <option value="">-- Chọn phòng ban / tổ --</option>
              {departments.length > 0 && (
                <optgroup label="Phòng ban">
                  {departments.map((d) => <option key={"dept:" + d.id} value={"dept:" + d.id}>{d.name}</option>)}
                </optgroup>
              )}
              {teams.length > 0 && (
                <optgroup label="Tổ">
                  {teams.map((t) => <option key={"team:" + t.id} value={"team:" + t.id}>{t.name}</option>)}
                </optgroup>
              )}
            </select>
            {empsLoaded && departments.length === 0 && teams.length === 0 && <p className="text-[11px] mt-1" style={{ color: "var(--ibs-text-dim)" }}>Chưa có phòng ban / tổ để chọn.</p>}
          </div>

          {groupKey && (
            <div>
              <label className={labelCls} style={labelStyle}>Nhân sự tăng ca <span style={{ color: "var(--ibs-danger)" }}>*</span> <span className="font-normal" style={{ color: "var(--ibs-text-dim)" }}>({memberIds.length}/{groupMembers.length})</span></label>
              <MemberPicker members={groupMembers.map((m) => ({ id: m.id, name: m.fullName, code: m.code }))} selected={memberIds} onToggle={toggleMember} emptyText="Nhóm này chưa có nhân sự đang làm." />
            </div>
          )}

          {memberIds.length > 0 && (
            <div>
              <label className={labelCls} style={labelStyle}>Dự án theo nhân sự <span className="font-normal" style={{ color: "var(--ibs-text-dim)" }}>(mỗi NV chia giờ OT theo dự án, tổng = {durationH}h)</span></label>
              <div className="space-y-2">
                {memberIds.map((id) => {
                  const rows = memberProjects[id] ?? [];
                  const sum = rows.reduce((s, r) => s + (r.hours || 0), 0);
                  const ok = Math.abs(sum - durationH) < 0.01;
                  const name = emps.find((e2) => e2.id === id)?.fullName || "";
                  return (
                    <div key={id} className="rounded-lg border p-2" style={{ borderColor: "var(--ibs-border)", background: "var(--ibs-bg)" }}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[12.5px] font-medium">{name}</span>
                        <span className="text-[11px] font-semibold" style={{ color: ok ? "var(--ibs-accent)" : "var(--ibs-danger)" }}>{sum}/{durationH}h</span>
                      </div>
                      <div className="space-y-1.5">
                        {rows.map((r, idx) => (
                          <div key={idx} className="flex items-center gap-1.5">
                            <ProjectSelect value={r.projectCode} onChange={(v) => setProj(id, idx, "projectCode", v)} cls="px-2 py-1.5 rounded-md text-[12px] outline-none" style={inputStyle} wrapClassName="flex-1" />
                            <input type="number" step="0.5" min="0" value={r.hours} onChange={(e) => setProj(id, idx, "hours", e.target.value)} className="w-16 px-2 py-1.5 rounded-md text-[12px] outline-none text-right" style={inputStyle} />
                            <span className="text-[11px]" style={{ color: "var(--ibs-text-dim)" }}>h</span>
                            {rows.length > 1 && (
                              <button type="button" onClick={() => removeProj(id, idx)} className="px-1.5 text-[12px]" style={{ color: "var(--ibs-danger)" }} title="Xóa dự án">×</button>
                            )}
                          </div>
                        ))}
                        <button type="button" onClick={() => addProj(id)} className="text-[11px] font-medium" style={{ color: "var(--ibs-accent)" }}>＋ Thêm dự án</button>
                      </div>
                      <textarea rows={2} value={memberReasons[id] ?? ""} onChange={(e) => setMemberReason(id, e.target.value)}
                        placeholder="Lý do tăng ca..."
                        className="w-full mt-1.5 px-2 py-1.5 rounded-md text-[12px] outline-none resize-none" style={inputStyle} />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          </>)}

          {mode === "byProject" && (
            <div className="space-y-2">
              <label className={labelCls} style={labelStyle}>Đăng ký theo dự án <span className="font-normal" style={{ color: "var(--ibs-text-dim)" }}>(chọn Xưởng → nạp hết NV; mỗi dòng có khung giờ + lý do riêng; ＋ dự án để 1 NV nhiều dự án)</span></label>
              <ProjectBlocks blocks={blocks} setBlocks={setBlocks} emps={emps} departments={departments} teams={teams} membersOfKey={membersOfKey} dateStr={form.date} onDirty={() => setError(null)} />
            </div>
          )}

          {/* Giờ bắt đầu/kết thúc CHUNG chỉ dùng ở Tab "theo nhân sự". Tab "theo dự án" mỗi khối có khung giờ riêng. */}
          {mode === "byEmployee" && (<>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls} style={labelStyle}>Giờ bắt đầu *</label>
              <TimeInput required value={form.startTime} onChange={(e) => handleChange("startTime", e.target.value)}
                className={inputCls} style={inputStyle} />
            </div>
            <div>
              <label className={labelCls} style={labelStyle}>Giờ kết thúc *</label>
              <TimeInput required value={form.endTime} onChange={(e) => handleChange("endTime", e.target.value)}
                className={inputCls} style={inputStyle} />
            </div>
          </div>

          {durationH > 0 && (
            <div className="px-3 py-2 rounded-lg flex items-center gap-2" style={{ background: "rgba(0,180,216,0.08)", border: "1px solid rgba(0,180,216,0.2)" }}>
              <Clock size={13} style={{ color: "var(--ibs-accent)" }} />
              <span className="text-[12px]">
                Thời gian OT: <strong style={{ color: "var(--ibs-accent)" }}>{durationH.toLocaleString("vi-VN", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} giờ</strong> · Hệ số: <strong style={{ color: "var(--ibs-accent)" }}>{fmtRateParts(otRateParts(form.startTime, form.endTime, form.date))}</strong>
              </span>
            </div>
          )}
          {mode === "byEmployee" && form.startTime && form.endTime && durationH === 0 && (
            <div className="text-[11px]" style={{ color: "var(--ibs-danger)" }}>Khung giờ không hợp lệ. Làm qua nửa đêm? Tách 2 đơn: …→00:00 và 00:00→…</div>
          )}
          </>)}

          </div>
          <div className="flex gap-3 p-5 pt-3 border-t shrink-0" style={{ borderColor: "var(--ibs-border)" }}>
            <button type="button" onClick={onClose}
              className="flex-1 py-2 rounded-lg text-[13px] font-medium"
              style={{ border: "1px solid var(--ibs-border)", color: "var(--ibs-text-muted)" }}>
              Hủy
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 py-2 rounded-lg text-[13px] font-medium text-white"
              style={{ background: saving ? "rgba(0,180,216,0.5)" : "var(--ibs-accent)" }}>
              {saving ? "Đang gửi..." : "Gửi đề xuất"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function TangCaPage() {
  const [requests, setRequests] = useState<OTRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string>("EMPLOYEE");
  const [jobRole, setJobRole] = useState<string | null>(null);
  const [myDeptId, setMyDeptId] = useState<string | null>(null);
  const [meLoaded, setMeLoaded] = useState(false);
  const [editTarget, setEditTarget] = useState<OTRequest | null>(null);
  const can = useCan();

  useEffect(() => {
    fetch("/api/v1/me").then((r) => r.json()).then((res) => {
      if (res.role) setUserRole(res.role);
      setJobRole(res.jobRole ?? null);
      setMyDeptId(res.departmentId ?? null);
    }).catch(() => {}).finally(() => setMeLoaded(true));
  }, []);

  // Cấp quyền qua ma trận (m3.tangca:view) vẫn xem được, dù role/chức vụ không thuộc luồng cũ.
  const canSee = can("m3.tangca:view") || canSeeOTTab({ jobRole, role: userRole });

  useEffect(() => {
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    setLoading(true);
    fetch(`/api/v1/ot-requests?${params}`)
      .then((r) => r.json())
      .then((res) => setRequests(res.data || []))
      .finally(() => setLoading(false));
  }, [statusFilter]);

  const canApprove = userRole === "MANAGER" || userRole === "HR_ADMIN" || userRole === "BOM" || userRole === "ADMIN"
    || can("m3.tangca:approve");   // cộng dồn: ai được tick Duyệt qua ma trận cũng duyệt/từ chối được

  async function handleAction(id: string, action: "APPROVE" | "REJECT") {
    setActionLoading(id + action);
    try {
      const res = await fetch(`/api/v1/ot-requests/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        const json = await res.json();
        setRequests((prev) => prev.map((r) => (r.id === id ? { ...r, status: json.data.status } : r)));
      }
    } finally {
      setActionLoading(null);
    }
  }

  // SỬA/XOÁ đơn OT CHƯA duyệt — CỘNG DỒN: role cũ (HC/ADMIN/BOM, TP phòng mình) HOẶC tick ma trận
  //   (m3.tangca:edit / :delete). Phạm vi do backend enforce (danh sách vốn đã lọc theo phạm vi).
  const roleCanManageOT = (r: OTRequest) =>
    ["HR_ADMIN", "ADMIN", "BOM"].includes(userRole) ||
    (userRole === "MANAGER" && !!myDeptId && r.employee.department.id === myDeptId);
  const canEditOT = (r: OTRequest) => r.status === "PENDING" && (roleCanManageOT(r) || can("m3.tangca:edit"));
  const canDeleteOT = (r: OTRequest) => r.status === "PENDING" && (roleCanManageOT(r) || can("m3.tangca:delete"));

  async function handleDelete(r: OTRequest) {
    if (!(await confirmDialog({ message: `Xoá đơn tăng ca ngày ${formatDate(new Date(r.date))} của ${r.employee.fullName}?`, confirmText: "Xoá", tone: "danger" }))) return;
    setActionLoading(r.id + "DELETE");
    try {
      const res = await fetch(`/api/v1/ot-requests/${r.id}`, { method: "DELETE" });
      if (res.ok) {
        setRequests((prev) => prev.filter((x) => x.id !== r.id));
      } else {
        const json = await res.json().catch(() => ({}));
        void alertDialog(apiError(res.status, json?.error) || "Xoá thất bại");
      }
    } finally {
      setActionLoading(null);
    }
  }

  const pendingCount  = requests.filter((r) => r.status === "PENDING").length;
  const approvedCount = requests.filter((r) => r.status === "APPROVED").length;
  const totalHours    = requests.filter((r) => r.status === "APPROVED").reduce((s, r) => s + r.hours, 0);

  if (meLoaded && !canSee) {
    return (
      <div>
        <PageTitle title="Tăng ca (OT)" description="Quản lý đề xuất làm ngoài giờ" />
        <div className="rounded-xl border p-10 text-center" style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
          <Lock size={28} className="mx-auto mb-3" style={{ color: "var(--ibs-text-dim)" }} />
          <div className="text-[14px] font-semibold mb-1">Không có quyền truy cập</div>
          <div className="text-[12px]" style={{ color: "var(--ibs-text-dim)" }}>Chỉ <strong>Tổ trưởng / Trưởng phòng</strong> (và HCNS/BGĐ) mới xem được mục Tăng ca.</div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageTitle title="Tăng ca (OT)" description="Quản lý đề xuất làm ngoài giờ" />

      {/* Summary */}
      <div className="grid grid-cols-4 gap-4 mb-5">
        {[
          { label: "Chờ duyệt",   value: pendingCount,           color: "#f59e0b" },
          { label: "Đã duyệt",    value: approvedCount,          color: "#10b981" },
          { label: "Tổng giờ OT", value: `${totalHours.toLocaleString("vi-VN", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}h`, color: "var(--ibs-accent)" },
          { label: "Tổng đề xuất",value: requests.length,        color: "var(--ibs-text)" },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border p-4" style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
            <div className="text-[26px] font-extrabold" style={{ color: s.color }}>{s.value}</div>
            <div className="text-[12px] mt-0.5" style={{ color: "var(--ibs-text-dim)" }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 rounded-lg text-[13px] outline-none"
          style={{ background: "var(--ibs-bg-card)", border: "1px solid var(--ibs-border)", color: "var(--ibs-text)" }}>
          {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <div className="ml-auto">
          <button onClick={() => setShowNew(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-medium text-white"
            style={{ background: "var(--ibs-accent)" }}>
            <Plus size={14} /> Đề xuất tăng ca
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border overflow-hidden" style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
        {loading ? (
          <div className="py-16 text-center text-[13px]" style={{ color: "var(--ibs-text-dim)" }}>Đang tải...</div>
        ) : requests.length === 0 ? (
          <div className="py-16 text-center text-[13px]" style={{ color: "var(--ibs-text-dim)" }}>Chưa có đề xuất tăng ca nào</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  {["Tổ / Nhân sự", "Ngày", "Giờ làm", "Thời lượng", "Hệ số", "Lý do", "Trạng thái", ""].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-[11px] uppercase tracking-wider font-semibold border-b"
                      style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-dim)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => {
                  const tg = projectTimeGroups(r);
                  const multiWin = new Set(tg.map((g) => g.startTime + "|" + g.endTime)).size > 1;
                  return (
                  <tr key={r.id} className="border-b transition-colors hover:bg-white/[0.02]"
                    style={{ borderColor: "rgba(51,65,85,0.4)" }}>
                    <td className="px-4 py-3">
                      {(r.memberNames?.length ?? 0) > 0 ? (
                        <>
                          <div className="text-[13px] font-medium">{r.teamName || "Nhóm"} <span className="text-[11px] font-normal" style={{ color: "var(--ibs-text-dim)" }}>({r.memberNames!.length} người)</span></div>
                          <div className="text-[11px]" style={{ color: "var(--ibs-text-dim)" }} title={r.memberNames!.join(", ")}>
                            {r.memberNames!.slice(0, 3).join(", ")}{r.memberNames!.length > 3 ? `, +${r.memberNames!.length - 3}` : ""}
                          </div>
                          <div className="text-[10px]" style={{ color: "var(--ibs-text-dim)" }}>Đề xuất: {r.employee.fullName}</div>
                        </>
                      ) : (
                        <>
                          <div className="text-[13px] font-medium">{r.employee.fullName}</div>
                          <div className="text-[11px]" style={{ color: "var(--ibs-text-dim)" }}>
                            {r.employee.code} · {r.employee.department.name}
                          </div>
                        </>
                      )}
                      {tg.length > 0 ? (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {tg.map((g, gi) => (
                            <span key={gi} className="text-[10px] inline-block px-1.5 py-0.5 rounded font-medium" style={{ background: "rgba(0,180,216,0.12)", color: "var(--ibs-accent)" }} title={`${g.projectCode}: ${g.startTime}–${g.endTime} · ${g.hours}h/người · ${g.count} người`}>📁 {g.projectCode} · {g.startTime}–{g.endTime} · {g.hours}h</span>
                          ))}
                        </div>
                      ) : r.projectCode ? (
                        <div className="text-[10px] mt-1 inline-block px-1.5 py-0.5 rounded font-medium" style={{ background: "rgba(0,180,216,0.12)", color: "var(--ibs-accent)" }}>📁 {r.projectCode}</div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-[13px]">
                      <span className="flex items-center gap-1" style={{ color: "var(--ibs-text-muted)" }}>
                        <Calendar size={12} />
                        {formatDate(new Date(r.date))}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[13px]" style={{ color: "var(--ibs-text-muted)" }}>
                      {multiWin ? (
                        <div className="space-y-0.5">
                          {tg.map((g, gi) => <div key={gi} className="whitespace-nowrap">{g.startTime} – {g.endTime}</div>)}
                        </div>
                      ) : (
                        <span>{r.startTime} – {r.endTime}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {multiWin ? (
                        <div className="space-y-0.5">
                          {tg.map((g, gi) => (
                            <span key={gi} className="flex items-center gap-1 text-[13px] font-semibold whitespace-nowrap" style={{ color: "var(--ibs-accent)" }}>
                              <Clock size={12} />{g.hours.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}h
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="flex items-center gap-1 text-[13px] font-semibold" style={{ color: "var(--ibs-accent)" }}>
                          <Clock size={12} />
                          {r.hours.toLocaleString("vi-VN", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}h
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[12px]" style={{ color: "var(--ibs-text-muted)" }}>
                      {multiWin ? (
                        <div className="space-y-0.5">
                          {tg.map((g, gi) => <div key={gi} className="whitespace-nowrap">{fmtRateParts(otRateParts(g.startTime, g.endTime, r.date))}</div>)}
                        </div>
                      ) : tg.length > 0 ? (
                        <span className="whitespace-nowrap">{fmtRateParts(otRateParts(tg[0].startTime, tg[0].endTime, r.date))}</span>
                      ) : (
                        <span>{OT_RATE_LABELS[String(r.otRate)] || `×${r.otRate}`}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[12px] max-w-[160px]" style={{ color: "var(--ibs-text-muted)" }}>
                      <span className="line-clamp-2">{r.reason}</span>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {canApprove && (
                          <ApprovalWorkflow
                            status={r.status}
                            loading={actionLoading === r.id + "APPROVE" || actionLoading === r.id + "REJECT"}
                            onApprove={() => handleAction(r.id, "APPROVE")}
                            onReject={() => handleAction(r.id, "REJECT")}
                          />
                        )}
                        {canEditOT(r) && (
                          <button type="button" title="Sửa đơn" onClick={() => setEditTarget(r)}
                            disabled={actionLoading === r.id + "DELETE"}
                            className="p-1 rounded hover:opacity-70" style={{ color: "var(--ibs-text-dim)" }}>
                            <Pencil size={15} />
                          </button>
                        )}
                        {canDeleteOT(r) && (
                          <button type="button" title="Xoá đơn" onClick={() => handleDelete(r)}
                            disabled={actionLoading === r.id + "DELETE"}
                            className="p-1 rounded hover:opacity-70" style={{ color: "var(--ibs-danger)" }}>
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="mt-3 flex items-center gap-1.5 text-[11px]" style={{ color: "var(--ibs-text-dim)" }}>
        <Clock size={11} />
        Hiển thị 50 đề xuất gần nhất. Hệ số OT: ×1.5 ngày thường, ×2.0 cuối tuần, ×3.0 ngày lễ.
      </div>

      {showNew && (
        <NewOTDialog
          onClose={() => setShowNew(false)}
          onSuccess={(item) => {
            setRequests((prev) => [item, ...prev]);
            setShowNew(false);
          }}
        />
      )}

      {editTarget && (
        <EditOTDialog
          target={editTarget}
          onClose={() => setEditTarget(null)}
          onSuccess={(item) => {
            setRequests((prev) => prev.map((r) => (r.id === item.id ? item : r)));
            setEditTarget(null);
          }}
        />
      )}
    </div>
  );
}

// ── Edit OT Dialog — sửa đơn CHƯA duyệt: ngày / khung giờ + CHI TIẾT NV × dự án × giờ × lý do ──────────
function EditOTDialog({ target, onClose, onSuccess }: { target: OTRequest; onClose: () => void; onSuccess: (item: OTRequest) => void }) {
  const [dateStr, setDateStr] = useState(String(target.date).slice(0, 10));
  const [emps, setEmps] = useState<{ id: string; fullName: string; code?: string | null; team?: { id: string; name: string } | null; department?: { id: string; name: string } | null }[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [blocks, setBlocks] = useState<OtBlock[]>([]);
  const seededRef = useRef(false);

  useEffect(() => {
    fetch(`/api/v1/ot-requests/team-members`).then((r) => r.json())
      .then((res) => setEmps(res.data || [])).catch(() => {});
  }, []);

  // Dựng bảng THEO XƯỞNG → NV → dự án từ dữ liệu đã lưu (chờ emps để suy xưởng của NV). Chạy 1 lần.
  useEffect(() => {
    if (seededRef.current || emps.length === 0) return;
    seededRef.current = true;
    const src = (target.memberProjects && target.memberProjects.length > 0)
      ? target.memberProjects.map((mp) => ({ employeeId: mp.employeeId, employeeName: mp.employeeName, projectCode: mp.projectCode, hours: mp.hours, reason: mp.reason || target.reason || "", startTime: mp.startTime || null, endTime: mp.endTime || null }))
      : (target.memberIds && target.memberIds.length > 0)
        ? target.memberIds.map((eid) => ({ employeeId: eid, employeeName: "", projectCode: target.projectCode || "", hours: target.hours, reason: target.reason || "", startTime: null as string | null, endTime: null as string | null }))
        : [{ employeeId: target.employee.id, employeeName: target.employee.fullName, projectCode: target.projectCode || "", hours: target.hours, reason: target.reason || "", startTime: null as string | null, endTime: null as string | null }];
    const blockMap = new Map<string, OtBlock>();
    const rowMap = new Map<string, OtRow>();
    for (const r of src) {
      const e = emps.find((x) => x.id === r.employeeId);
      const deptKey = e?.department?.id ? "dept:" + e.department.id : (e?.team?.id ? "team:" + e.team.id : "");
      let blk = blockMap.get(deptKey);
      if (!blk) { blk = { blockId: otUid(), deptKey, collapsed: false, rows: [] }; blockMap.set(deptKey, blk); }
      const rk = deptKey + "|" + r.employeeId;
      let row = rowMap.get(rk);
      if (!row) { row = { rowId: otUid(), employeeId: r.employeeId, employeeCode: e?.code || "", employeeName: r.employeeName || e?.fullName || r.employeeId, projects: [] }; rowMap.set(rk, row); blk.rows.push(row); }
      const st = r.startTime || target.startTime;
      const hrs = r.hours > 0 ? r.hours : calcHours(target.startTime, target.endTime);
      const et = r.endTime || addHoursTo(st, hrs);
      row.projects.push({ key: otUid(), projectCode: r.projectCode, startTime: st, endTime: et, reason: r.reason });
    }
    setBlocks(Array.from(blockMap.values()));
  }, [emps]);

  const departments = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of emps) if (e.department?.id) m.set(e.department.id, e.department.name);
    return Array.from(m.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, "vi"));
  }, [emps]);
  const teams = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of emps) if (e.team?.id) m.set(e.team.id, e.team.name);
    return Array.from(m.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, "vi"));
  }, [emps]);
  function membersOfKey(key: string) {
    if (!key) return [];
    const [type, id] = key.split(":");
    return emps.filter((e) => type === "dept" ? e.department?.id === id : e.team?.id === id);
  }

  // Tên NV theo id: danh sách trong phạm vi → snapshot trong đơn → người tạo.
  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of emps) m.set(e.id, e.fullName);
    for (const mp of target.memberProjects || []) if (mp.employeeId && !m.has(mp.employeeId)) m.set(mp.employeeId, mp.employeeName);
    if (!m.has(target.employee.id)) m.set(target.employee.id, target.employee.fullName);
    return m;
  }, [emps]); // eslint-disable-line

  const otRate = dateStr ? ((): number => { const d = new Date(dateStr).getDay(); return d === 0 || d === 6 ? 2.0 : 1.5; })() : target.otRate;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const fail = (msg: string) => { setError(msg); alertDialog(msg); };
    if (!dateStr) { fail("Vui lòng chọn ngày"); return; }
    const { err, payload } = collectByProject(blocks, (id) => nameById.get(id) || "");
    if (err) { fail(err); return; }
    if (payload.length === 0) { fail("Chưa có dòng nào (chọn dự án cho NV)"); return; }
    const starts = payload.map((p) => p.startTime).filter(Boolean).sort();
    const ends = payload.map((p) => p.endTime).filter(Boolean).sort();
    const overallStart = starts[0] || target.startTime;
    const overallEnd = ends[ends.length - 1] || target.endTime;
    setSaving(true);
    try {
      const res = await fetch(`/api/v1/ot-requests/${target.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: dateStr, startTime: overallStart, endTime: overallEnd, memberProjects: payload }),
      });
      const json = await res.json();
      if (!res.ok) { fail(apiError(res.status, json?.error)); return; }
      onSuccess(json.data);
    } catch {
      fail("Lỗi kết nối");
    } finally {
      setSaving(false);
    }
  }

  const inputCls = "w-full px-3 py-2 rounded-lg text-[13px] outline-none";
  const inputStyle = { background: "var(--ibs-bg)", border: "1px solid var(--ibs-border)", color: "var(--ibs-text)" };
  const labelCls = "block text-[12px] font-medium mb-1.5";
  const labelStyle = { color: "var(--ibs-text-dim)" };
  const totalPeople = new Set(blocks.flatMap((b) => b.rows.filter((r) => r.projects.some(otProjFilled)).map((r) => r.employeeId))).size;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.4)" }} onClick={onClose}>
      <div className="w-full max-w-[1120px] max-h-[90vh] flex flex-col rounded-2xl" style={{ background: "var(--ibs-bg-card)" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b shrink-0" style={{ borderColor: "var(--ibs-border)" }}>
          <div className="text-[15px] font-bold">Sửa đơn tăng ca</div>
          <button onClick={onClose} style={{ color: "var(--ibs-text-dim)" }}><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col min-h-0 flex-1">
          <div className="p-5 space-y-4 overflow-y-auto">
            <div className="text-[12px]" style={{ color: "var(--ibs-text-dim)" }}>
              {target.teamName || target.employee.department.name} · {blocks.length} dự án · {totalPeople} người
            </div>
            <div>
              <label className={labelCls} style={labelStyle}>Ngày <span style={{ color: "var(--ibs-danger)" }}>*</span></label>
              <DateInput value={dateStr} onChange={(e) => { setDateStr(e.target.value); setError(null); }} className={inputCls} style={inputStyle} />
              {dateStr && <p className="text-[11px] mt-1" style={{ color: "var(--ibs-text-dim)" }}>Hệ số: ngày <strong style={{ color: "var(--ibs-accent)" }}>×{otRate}</strong> · đêm <strong style={{ color: "var(--ibs-accent)" }}>×{otRate === 2 ? 2.7 : 2.0}</strong> {otRate === 2 ? "(cuối tuần)" : "(ngày thường)"} · đêm = 22:00–06:00</p>}
            </div>

            {/* Chi tiết THEO DỰ ÁN — bảng xưởng → NV → dự án (khung giờ + lý do theo dòng), giống Kê khai tổ */}
            <div className="space-y-2">
              <label className={labelCls} style={labelStyle}>Chi tiết theo dự án <span className="font-normal" style={{ color: "var(--ibs-text-dim)" }}>(mỗi dòng NV×dự án có khung giờ + lý do riêng; ＋ dự án để 1 NV nhiều dự án)</span></label>
              <ProjectBlocks blocks={blocks} setBlocks={setBlocks} emps={emps} departments={departments} teams={teams} membersOfKey={membersOfKey} dateStr={dateStr} onDirty={() => setError(null)} />
            </div>

            {error && <div className="text-[12px] px-3 py-2 rounded-lg" style={{ background: "rgba(239,68,68,0.1)", color: "var(--ibs-danger)" }}>{error}</div>}
          </div>
          <div className="flex justify-end gap-2 px-5 py-3 border-t shrink-0" style={{ borderColor: "var(--ibs-border)" }}>
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-[13px]" style={{ border: "1px solid var(--ibs-border)", color: "var(--ibs-text-muted)" }}>Huỷ</button>
            <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg text-[13px] font-medium text-white" style={{ background: "var(--ibs-accent)", opacity: saving ? 0.6 : 1 }}>{saving ? "Đang lưu..." : "Lưu"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
