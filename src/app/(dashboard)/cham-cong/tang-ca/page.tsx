"use client";

import { useState, useEffect, useMemo } from "react";
import { PageTitle } from "@/components/layout/page-title";
import { StatusBadge } from "@/components/shared/status-badge";
import { ApprovalWorkflow } from "@/components/shared/approval-workflow";
import { formatDate, apiError } from "@/lib/utils";
import { Plus, X, Clock, Calendar, Lock, Pencil, Trash2 } from "lucide-react";
import { DateInput, TimeInput } from "@/components/shared/date-input";
import { canSeeOTTab } from "@/lib/ot-access";
import { useCan } from "@/hooks/use-permission";
import { OT_PROJECTS } from "@/lib/projects";
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
// Tab "theo dự án": mỗi KHỐI = 1 dự án + NHIỀU xưởng (mỗi xưởng có KHUNG GIỜ riêng) + nhiều NV + 1 lý do.
//   NV ăn giờ theo Xưởng của mình (khỏi phải tạo lại dự án y hệt chỉ vì khác giờ).
// Mỗi Xưởng-group giữ NV RIÊNG + khung giờ riêng (nhân sự nằm ngay dưới dòng xưởng).
type ProjGroup = { key: string; startTime: string; endTime: string; memberIds: string[] };
type ProjBlock = { projectCode: string; groups: ProjGroup[]; reason: string };
const newGroup = (): ProjGroup => ({ key: "", startTime: "17:30", endTime: "20:00", memberIds: [] });
const blockMembers = (b: ProjBlock) => Array.from(new Set(b.groups.flatMap((g) => g.memberIds)));

// ── New OT Dialog ──────────────────────────────────────────────────────────────
function NewOTDialog({ onClose, onSuccess }: { onClose: () => void; onSuccess: (item: OTRequest) => void }) {
  const [form, setForm] = useState({ date: "", startTime: "17:30", endTime: "20:00", reason: "" });
  // Phân bổ dự án theo TỪNG NV: { employeeId: [{projectCode, hours}, ...] }
  const [memberProjects, setMemberProjects] = useState<Record<string, ProjAlloc[]>>({});
  // Lý do tăng ca theo TỪNG NV: { employeeId: "lý do" }
  const [memberReasons, setMemberReasons] = useState<Record<string, string>>({});
  const [emps, setEmps] = useState<{ id: string; fullName: string; team?: { id: string; name: string } | null; department?: { id: string; name: string } | null }[]>([]);
  const [empsLoaded, setEmpsLoaded] = useState(false);
  const [groupKey, setGroupKey] = useState(""); // "dept:<id>" hoặc "team:<id>"
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Chế độ khai: theo nhân sự (mặc định) | theo dự án.
  const [mode, setMode] = useState<"byEmployee" | "byProject">("byEmployee");
  const [blocks, setBlocks] = useState<ProjBlock[]>([{ projectCode: "", groups: [newGroup()], reason: "" }]);

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

  // ── Tab "theo dự án": handlers cho các KHỐI dự án ──
  // NV của NHIỀU xưởng (gộp, bỏ trùng; bỏ key rỗng).
  function membersOfKeys(keys: string[]) {
    const seen = new Set<string>();
    const out: typeof emps = [];
    for (const k of keys) { if (!k) continue; for (const m of membersOfKey(k)) if (!seen.has(m.id)) { seen.add(m.id); out.push(m); } }
    return out;
  }
  function addBlock() {
    setBlocks((bs) => [...bs, { projectCode: "", groups: [newGroup()], reason: "" }]);
  }
  function removeBlock(idx: number) {
    setBlocks((bs) => bs.filter((_, i) => i !== idx));
  }
  function updateBlock(idx: number, patch: Partial<ProjBlock>) {
    setBlocks((bs) => bs.map((b, i) => (i === idx ? { ...b, ...patch } : b)));
    setError(null);
  }
  // Đổi XƯỞNG của 1 dòng → xóa NV đã tick của dòng đó (chọn lại theo xưởng mới).
  function setBlockGroupAt(idx: number, gi: number, key: string) {
    setBlocks((bs) => bs.map((b, i) => (i === idx ? { ...b, groups: b.groups.map((g, j) => (j === gi ? { ...g, key, memberIds: [] } : g)) } : b)));
    setError(null);
  }
  // Đổi KHUNG GIỜ riêng của 1 xưởng.
  function setBlockGroupTime(idx: number, gi: number, patch: Partial<ProjGroup>) {
    setBlocks((bs) => bs.map((b, i) => (i === idx ? { ...b, groups: b.groups.map((g, j) => (j === gi ? { ...g, ...patch } : g)) } : b)));
    setError(null);
  }
  function addBlockGroup(idx: number) {
    setBlocks((bs) => bs.map((b, i) => (i === idx ? { ...b, groups: [...b.groups, newGroup()] } : b)));
  }
  function removeBlockGroup(idx: number, gi: number) {
    setBlocks((bs) => bs.map((b, i) => (i === idx ? { ...b, groups: b.groups.length > 1 ? b.groups.filter((_, j) => j !== gi) : b.groups } : b)));
    setError(null);
  }
  // Tick/bỏ 1 NV Ở DÒNG XƯỞNG gi.
  function toggleGroupMember(idx: number, gi: number, empId: string) {
    setBlocks((bs) => bs.map((b, i) => {
      if (i !== idx) return b;
      return { ...b, groups: b.groups.map((g, j) => (j === gi ? { ...g, memberIds: g.memberIds.includes(empId) ? g.memberIds.filter((x) => x !== empId) : [...g.memberIds, empId] } : g)) };
    }));
    setError(null);
  }

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

    // ── Chế độ THEO DỰ ÁN ──
    if (mode === "byProject") {
      const fail = (msg: string) => { setError(msg); alertDialog(msg); };
      if (!form.date) { fail("Vui lòng chọn ngày tăng ca"); return; }
      const payload: { employeeId: string; employeeName: string; projectCode: string; hours: number; reason: string; startTime: string; endTime: string }[] = [];
      const allTimes: { s: string; e: string }[] = [];
      for (let i = 0; i < blocks.length; i++) {
        const b = blocks[i];
        if (!b.projectCode) { fail(`Dự án ${i + 1}: chọn dự án`); return; }
        if (!b.reason.trim()) { fail(`Dự án ${i + 1}: nhập lý do`); return; }
        if (blockMembers(b).length === 0) { fail(`Dự án ${i + 1}: chọn ít nhất 1 nhân sự`); return; }
        // Mỗi XƯỞNG có khung giờ + NV riêng.
        for (let gi = 0; gi < b.groups.length; gi++) {
          const g = b.groups[gi];
          if (g.memberIds.length === 0) continue; // xưởng chưa tick NV → bỏ qua
          if (!g.key) { fail(`Dự án ${i + 1}: có nhân sự nhưng chưa chọn Xưởng`); return; }
          const h = calcHours(g.startTime, g.endTime);
          if (!(h > 0)) { fail(`Dự án ${i + 1}: khung giờ Xưởng không hợp lệ. Làm qua nửa đêm thì tách 2 đơn (…→00:00 và 00:00→…)`); return; }
          for (const id of g.memberIds) {
            allTimes.push({ s: g.startTime, e: g.endTime });
            payload.push({ employeeId: id, employeeName: nameOf(id), projectCode: b.projectCode, hours: h, reason: b.reason.trim(), startTime: g.startTime, endTime: g.endTime });
          }
        }
      }
      if (payload.length === 0) { fail("Đơn phải có ít nhất 1 nhân sự"); return; }
      const allMembers = new Set(payload.map((p) => p.employeeId));
      const batchReason = Array.from(new Set(blocks.map((b) => b.reason.trim()).filter(Boolean))).join(" | ");
      // Khung giờ TỔNG của đơn = sớm nhất → muộn nhất (chỉ để hiển thị + suy hệ số; giờ mỗi NV theo xưởng).
      const starts = allTimes.map((t) => t.s).filter(Boolean).sort();
      const ends = allTimes.map((t) => t.e).filter(Boolean).sort();
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
      <div className="w-full max-w-[460px] max-h-[90vh] flex flex-col rounded-xl border shadow-2xl" style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
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
              <div className="max-h-[160px] overflow-y-auto rounded-lg border" style={{ borderColor: "var(--ibs-border)", background: "var(--ibs-bg)" }}>
                {groupMembers.length === 0 ? (
                  <div className="px-3 py-2 text-[12px]" style={{ color: "var(--ibs-text-dim)" }}>Nhóm này chưa có nhân sự đang làm.</div>
                ) : groupMembers.map((m) => (
                  <label key={m.id} className="flex items-center gap-2 px-3 py-1.5 text-[13px] cursor-pointer hover:bg-white/[0.04]">
                    <input type="checkbox" checked={memberIds.includes(m.id)} onChange={() => toggleMember(m.id)} />
                    {m.fullName}
                  </label>
                ))}
              </div>
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
                            <select value={r.projectCode} onChange={(e) => setProj(id, idx, "projectCode", e.target.value)} className="flex-1 px-2 py-1.5 rounded-md text-[12px] outline-none" style={inputStyle}>
                              <option value="">-- Dự án --</option>
                              {OT_PROJECTS.map((p) => <option key={p} value={p}>{p}</option>)}
                            </select>
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
            <div className="space-y-3">
              <label className={labelCls} style={labelStyle}>Đăng ký theo dự án <span className="font-normal" style={{ color: "var(--ibs-text-dim)" }}>(mỗi dự án chọn nhiều xưởng + NV + khung giờ riêng; khác giờ thì "Thêm dự án")</span></label>
              {blocks.map((b, idx) => {
                return (
                  <div key={idx} className="rounded-lg border p-3 space-y-2" style={{ borderColor: "var(--ibs-border)", background: "var(--ibs-bg)" }}>
                    <div className="flex items-center justify-between">
                      <span className="text-[12.5px] font-semibold">Dự án {idx + 1}</span>
                      {blocks.length > 1 && <button type="button" onClick={() => removeBlock(idx)} className="text-[12px]" style={{ color: "var(--ibs-danger)" }} title="Xóa dự án">× Xóa</button>}
                    </div>
                    {/* Dự án */}
                    <select value={b.projectCode} onChange={(e) => updateBlock(idx, { projectCode: e.target.value })} className={inputCls} style={inputStyle}>
                      <option value="">-- Chọn dự án --</option>
                      {OT_PROJECTS.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                    {/* Xưởng — MỖI xưởng 1 khung giờ riêng (giờ ngay trên dòng) */}
                    <div>
                      <div className="text-[12px] mb-1" style={{ color: "var(--ibs-text-muted)" }}>Xưởng / Phòng ban <span style={{ color: "var(--ibs-text-dim)" }}>(mỗi xưởng 1 khung giờ)</span></div>
                      <div className="space-y-1.5">
                        {b.groups.map((g, gi) => {
                          const gh = calcHours(g.startTime, g.endTime);
                          const gParts = otRateParts(g.startTime, g.endTime, form.date);
                          return (
                            <div key={gi}>
                              <div className="flex items-center gap-1">
                                <select value={g.key} onChange={(e) => setBlockGroupAt(idx, gi, e.target.value)} className="flex-1 min-w-0 px-2 py-1.5 rounded-md text-[12px] outline-none" style={inputStyle}>
                                  <option value="">-- Chọn Xưởng --</option>
                                  {departments.length > 0 && <optgroup label="Phòng ban">{departments.map((d) => <option key={"dept:" + d.id} value={"dept:" + d.id}>{d.name}</option>)}</optgroup>}
                                  {teams.length > 0 && <optgroup label="Tổ">{teams.map((t) => <option key={"team:" + t.id} value={"team:" + t.id}>{t.name}</option>)}</optgroup>}
                                </select>
                                <div className="w-[56px] shrink-0"><TimeInput value={g.startTime} onChange={(e) => setBlockGroupTime(idx, gi, { startTime: e.target.value })} className="w-full px-1 py-1.5 rounded-md text-[12px] text-center outline-none" style={inputStyle} /></div>
                                <span className="text-[10px] shrink-0" style={{ color: "var(--ibs-text-dim)" }}>→</span>
                                <div className="w-[56px] shrink-0"><TimeInput value={g.endTime} onChange={(e) => setBlockGroupTime(idx, gi, { endTime: e.target.value })} className="w-full px-1 py-1.5 rounded-md text-[12px] text-center outline-none" style={inputStyle} /></div>
                                {b.groups.length > 1 && <button type="button" onClick={() => removeBlockGroup(idx, gi)} className="px-1 text-[14px] shrink-0" style={{ color: "var(--ibs-danger)" }} title="Bỏ xưởng">×</button>}
                              </div>
                              <div className="text-[10.5px] pl-1 mt-0.5" style={{ color: gh > 0 ? "var(--ibs-text-dim)" : "var(--ibs-danger)" }}>
                                {gh > 0 ? <>= {gh}h · <strong style={{ color: "var(--ibs-accent)" }}>{fmtRateParts(gParts)}</strong>{gParts.some((p) => p.night) ? " · có đêm" : ""}</> : "Khung giờ không hợp lệ (qua đêm → tách 2 đơn: …→00:00 và 00:00→…)"}
                              </div>
                              {/* Nhân sự CỦA xưởng này (ngay dưới dòng xưởng) */}
                              {g.key && (<>
                                <div className="mt-1 max-h-[130px] overflow-y-auto rounded-md border" style={{ borderColor: "var(--ibs-border)", background: "var(--ibs-bg-card)" }}>
                                  {membersOfKey(g.key).length === 0 ? (
                                    <div className="px-3 py-1.5 text-[12px]" style={{ color: "var(--ibs-text-dim)" }}>Xưởng này chưa có nhân sự.</div>
                                  ) : membersOfKey(g.key).map((m) => (
                                    <label key={m.id} className="flex items-center gap-2 px-3 py-1.5 text-[13px] cursor-pointer hover:bg-white/[0.04]">
                                      <input type="checkbox" checked={g.memberIds.includes(m.id)} onChange={() => toggleGroupMember(idx, gi, m.id)} />
                                      <span>{m.fullName}</span>
                                    </label>
                                  ))}
                                </div>
                                <div className="text-[11px] mt-0.5 pl-1" style={{ color: "var(--ibs-text-dim)" }}>Số người đang chọn: <strong style={{ color: "var(--ibs-accent)" }}>{g.memberIds.length}</strong></div>
                              </>)}
                            </div>
                          );
                        })}
                        <button type="button" onClick={() => addBlockGroup(idx)} className="text-[11px] font-medium" style={{ color: "var(--ibs-accent)" }}>＋ Thêm Xưởng</button>
                      </div>
                    </div>
                    {/* Lý do */}
                    <textarea rows={2} value={b.reason} onChange={(e) => updateBlock(idx, { reason: e.target.value })}
                      placeholder="Lý do tăng ca... (bắt buộc)"
                      className="w-full px-2 py-1.5 rounded-md text-[12px] outline-none resize-none" style={inputStyle} />
                  </div>
                );
              })}
              <button type="button" onClick={addBlock} className="text-[12px] font-medium" style={{ color: "var(--ibs-accent)" }}>＋ Thêm dự án</button>
            </div>
          )}

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
  const [emps, setEmps] = useState<{ id: string; fullName: string; team?: { id: string; name: string } | null; department?: { id: string; name: string } | null }[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Tái tạo các KHỐI DỰ ÁN từ dữ liệu đã lưu — gom theo (dự án + lý do). Mỗi khối = 1 dự án + nhiều NV +
  //   1 lý do + 1 khung giờ (suy từ giờ đã lưu, bắt đầu từ giờ đơn) → hiển thị đúng như đăng ký THEO DỰ ÁN.
  const initBlocks: ProjBlock[] = useMemo(() => {
    const rows = (target.memberProjects && target.memberProjects.length > 0)
      ? target.memberProjects.map((mp) => ({ employeeId: mp.employeeId, projectCode: mp.projectCode, hours: mp.hours, reason: mp.reason || target.reason || "", startTime: mp.startTime || null, endTime: mp.endTime || null }))
      : (target.memberIds && target.memberIds.length > 0)
        ? target.memberIds.map((eid) => ({ employeeId: eid, projectCode: target.projectCode || "", hours: target.hours, reason: target.reason || "", startTime: null as string | null, endTime: null as string | null }))
        : [{ employeeId: target.employee.id, projectCode: target.projectCode || "", hours: target.hours, reason: target.reason || "", startTime: null as string | null, endTime: null as string | null }];
    // KHỐI = (dự án + lý do); trong khối, mỗi khung giờ = 1 XƯỞNG-group giữ NV riêng (key suy từ NV sau khi load emps).
    const blockMap = new Map<string, ProjBlock>();
    for (const r of rows) {
      const bKey = JSON.stringify([r.projectCode, r.reason || ""]);
      let b = blockMap.get(bKey);
      if (!b) { b = { projectCode: r.projectCode, groups: [], reason: r.reason || "" }; blockMap.set(bKey, b); }
      const hrs = r.hours > 0 ? r.hours : calcHours(target.startTime, target.endTime);
      const st = r.startTime || target.startTime;
      const et = r.endTime || addHoursTo(st, hrs);
      let g = b.groups.find((x) => x.startTime === st && x.endTime === et);
      if (!g) { g = { key: "", startTime: st, endTime: et, memberIds: [] }; b.groups.push(g); }
      if (!g.memberIds.includes(r.employeeId)) g.memberIds.push(r.employeeId);
    }
    return Array.from(blockMap.values());
  }, []); // eslint-disable-line
  const [blocks, setBlocks] = useState<ProjBlock[]>(initBlocks);

  useEffect(() => {
    fetch(`/api/v1/ot-requests/team-members`).then((r) => r.json())
      .then((res) => setEmps(res.data || [])).catch(() => {});
  }, []);

  // Sau khi load emps: suy XƯỞNG (key) cho các group đang trống, từ phòng/tổ chung của NV trong group.
  useEffect(() => {
    if (emps.length === 0) return;
    setBlocks((bs) => bs.map((b) => ({
      ...b,
      groups: b.groups.map((g) => {
        if (g.key) return g;
        const keys = new Set<string>();
        for (const id of g.memberIds) {
          const e = emps.find((x) => x.id === id);
          if (!e) continue;
          const k = e.department?.id ? "dept:" + e.department.id : (e.team?.id ? "team:" + e.team.id : "");
          if (k) keys.add(k);
        }
        return keys.size === 1 ? { ...g, key: Array.from(keys)[0] } : g;
      }),
    })));
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
  function membersOfKeys(keys: string[]) {
    const seen = new Set<string>(); const out: typeof emps = [];
    for (const k of keys) { if (!k) continue; for (const m of membersOfKey(k)) if (!seen.has(m.id)) { seen.add(m.id); out.push(m); } }
    return out;
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

  // NV hiển thị cho 1 XƯỞNG-group = NV thuộc xưởng (theo key) ∪ NV đã có trong group (giữ NV ngoài phạm vi).
  function groupMemberRows(g: ProjGroup) {
    const seen = new Set<string>(); const out: { id: string; name: string; dept?: string; outside?: boolean }[] = [];
    for (const m of membersOfKey(g.key)) { seen.add(m.id); out.push({ id: m.id, name: m.fullName, dept: m.department?.name || m.team?.name }); }
    for (const id of g.memberIds) if (!seen.has(id)) {
      seen.add(id);
      const e = emps.find((x) => x.id === id);
      out.push({ id, name: nameById.get(id) || id, dept: e?.department?.name || e?.team?.name, outside: !e });
    }
    return out;
  }

  const addBlock = () => setBlocks((bs) => [...bs, { projectCode: "", groups: [newGroup()], reason: "" }]);
  const removeBlock = (idx: number) => setBlocks((bs) => bs.filter((_, i) => i !== idx));
  const updateBlock = (idx: number, patch: Partial<ProjBlock>) => { setBlocks((bs) => bs.map((b, i) => (i === idx ? { ...b, ...patch } : b))); setError(null); };
  const setBlockGroupAt = (idx: number, gi: number, key: string) => { setBlocks((bs) => bs.map((b, i) => (i === idx ? { ...b, groups: b.groups.map((g, j) => (j === gi ? { ...g, key, memberIds: [] } : g)) } : b))); setError(null); };
  const setBlockGroupTime = (idx: number, gi: number, patch: Partial<ProjGroup>) => { setBlocks((bs) => bs.map((b, i) => (i === idx ? { ...b, groups: b.groups.map((g, j) => (j === gi ? { ...g, ...patch } : g)) } : b))); setError(null); };
  const addBlockGroup = (idx: number) => setBlocks((bs) => bs.map((b, i) => (i === idx ? { ...b, groups: [...b.groups, newGroup()] } : b)));
  const removeBlockGroup = (idx: number, gi: number) => { setBlocks((bs) => bs.map((b, i) => (i === idx ? { ...b, groups: b.groups.length > 1 ? b.groups.filter((_, j) => j !== gi) : b.groups } : b))); setError(null); };
  const toggleGroupMember = (idx: number, gi: number, empId: string) => { setBlocks((bs) => bs.map((b, i) => (i === idx ? { ...b, groups: b.groups.map((g, j) => (j === gi ? { ...g, memberIds: g.memberIds.includes(empId) ? g.memberIds.filter((x) => x !== empId) : [...g.memberIds, empId] } : g)) } : b))); setError(null); };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const fail = (msg: string) => { setError(msg); alertDialog(msg); };
    if (!dateStr) { fail("Vui lòng chọn ngày"); return; }
    const payload: { employeeId: string; employeeName: string; projectCode: string; hours: number; reason: string; startTime: string; endTime: string }[] = [];
    const allTimes: { s: string; e: string }[] = [];
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      if (!b.projectCode) { fail(`Dự án ${i + 1}: chọn dự án`); return; }
      if (!b.reason.trim()) { fail(`Dự án ${i + 1}: nhập lý do`); return; }
      if (blockMembers(b).length === 0) { fail(`Dự án ${i + 1}: chọn ít nhất 1 nhân sự`); return; }
      // Mỗi XƯỞNG có khung giờ + NV riêng → giờ mỗi NV theo xưởng của mình.
      for (const g of b.groups) {
        if (g.memberIds.length === 0) continue;
        const h = calcHours(g.startTime, g.endTime);
        if (!(h > 0)) { fail(`Dự án ${i + 1}: khung giờ Xưởng không hợp lệ (qua đêm → tách 2 đơn: …→00:00 và 00:00→…)`); return; }
        for (const id of g.memberIds) {
          allTimes.push({ s: g.startTime, e: g.endTime });
          payload.push({ employeeId: id, employeeName: nameById.get(id) || "", projectCode: b.projectCode, hours: h, reason: b.reason.trim(), startTime: g.startTime, endTime: g.endTime });
        }
      }
    }
    if (payload.length === 0) { fail("Đơn phải có ít nhất 1 nhân sự"); return; }
    const starts = allTimes.map((t) => t.s).filter(Boolean).sort();
    const ends = allTimes.map((t) => t.e).filter(Boolean).sort();
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
  const totalPeople = new Set(blocks.flatMap((b) => blockMembers(b))).size;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.4)" }} onClick={onClose}>
      <div className="w-full max-w-[540px] max-h-[90vh] flex flex-col rounded-2xl" style={{ background: "var(--ibs-bg-card)" }} onClick={(e) => e.stopPropagation()}>
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

            {/* Chi tiết THEO DỰ ÁN — mỗi khối: dự án + xưởng + NV + lý do + khung giờ (fill sẵn từ đơn) */}
            <div className="space-y-3">
              <label className={labelCls} style={labelStyle}>Chi tiết theo dự án <span className="font-normal" style={{ color: "var(--ibs-text-dim)" }}>(mỗi dự án: nhiều Xưởng + NV + khung giờ riêng)</span></label>
              {blocks.map((b, idx) => {
                return (
                  <div key={idx} className="rounded-lg border p-3 space-y-2" style={{ borderColor: "var(--ibs-border)", background: "var(--ibs-bg)" }}>
                    <div className="flex items-center justify-between">
                      <span className="text-[12.5px] font-semibold">Dự án {idx + 1}</span>
                      {blocks.length > 1 && <button type="button" onClick={() => removeBlock(idx)} className="text-[12px]" style={{ color: "var(--ibs-danger)" }} title="Xóa dự án">× Xóa</button>}
                    </div>
                    {/* Dự án */}
                    <select value={b.projectCode} onChange={(e) => updateBlock(idx, { projectCode: e.target.value })} className={inputCls} style={inputStyle}>
                      <option value="">-- Chọn dự án --</option>
                      {OT_PROJECTS.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                    {/* Xưởng — MỖI xưởng 1 khung giờ riêng (giờ ngay trên dòng) */}
                    <div>
                      <div className="text-[12px] mb-1" style={{ color: "var(--ibs-text-muted)" }}>Xưởng / Phòng ban <span style={{ color: "var(--ibs-text-dim)" }}>(mỗi xưởng 1 khung giờ)</span></div>
                      <div className="space-y-1.5">
                        {b.groups.map((g, gi) => {
                          const gh = calcHours(g.startTime, g.endTime);
                          const gParts = otRateParts(g.startTime, g.endTime, dateStr);
                          return (
                            <div key={gi}>
                              <div className="flex items-center gap-1">
                                <select value={g.key} onChange={(e) => setBlockGroupAt(idx, gi, e.target.value)} className="flex-1 min-w-0 px-2 py-1.5 rounded-md text-[12px] outline-none" style={inputStyle}>
                                  <option value="">-- Chọn Xưởng --</option>
                                  {departments.length > 0 && <optgroup label="Phòng ban">{departments.map((d) => <option key={"dept:" + d.id} value={"dept:" + d.id}>{d.name}</option>)}</optgroup>}
                                  {teams.length > 0 && <optgroup label="Tổ">{teams.map((t) => <option key={"team:" + t.id} value={"team:" + t.id}>{t.name}</option>)}</optgroup>}
                                </select>
                                <div className="w-[56px] shrink-0"><TimeInput value={g.startTime} onChange={(e) => setBlockGroupTime(idx, gi, { startTime: e.target.value })} className="w-full px-1 py-1.5 rounded-md text-[12px] text-center outline-none" style={inputStyle} /></div>
                                <span className="text-[10px] shrink-0" style={{ color: "var(--ibs-text-dim)" }}>→</span>
                                <div className="w-[56px] shrink-0"><TimeInput value={g.endTime} onChange={(e) => setBlockGroupTime(idx, gi, { endTime: e.target.value })} className="w-full px-1 py-1.5 rounded-md text-[12px] text-center outline-none" style={inputStyle} /></div>
                                {b.groups.length > 1 && <button type="button" onClick={() => removeBlockGroup(idx, gi)} className="px-1 text-[14px] shrink-0" style={{ color: "var(--ibs-danger)" }} title="Bỏ xưởng">×</button>}
                              </div>
                              <div className="text-[10.5px] pl-1 mt-0.5" style={{ color: gh > 0 ? "var(--ibs-text-dim)" : "var(--ibs-danger)" }}>
                                {gh > 0 ? <>= {gh}h · <strong style={{ color: "var(--ibs-accent)" }}>{fmtRateParts(gParts)}</strong>{gParts.some((p) => p.night) ? " · có đêm" : ""}</> : "Khung giờ không hợp lệ (qua đêm → tách 2 đơn: …→00:00 và 00:00→…)"}
                              </div>
                              {/* Nhân sự CỦA xưởng này (ngay dưới dòng xưởng) */}
                              {(g.key || g.memberIds.length > 0) && (() => {
                                const rows = groupMemberRows(g);
                                return (<>
                                  <div className="mt-1 max-h-[130px] overflow-y-auto rounded-md border" style={{ borderColor: "var(--ibs-border)", background: "var(--ibs-bg-card)" }}>
                                    {rows.length === 0 ? (
                                      <div className="px-3 py-1.5 text-[12px]" style={{ color: "var(--ibs-text-dim)" }}>Xưởng này chưa có nhân sự.</div>
                                    ) : rows.map((m) => (
                                      <label key={m.id} className="flex items-center gap-2 px-3 py-1.5 text-[13px] cursor-pointer hover:bg-white/[0.04]">
                                        <input type="checkbox" checked={g.memberIds.includes(m.id)} onChange={() => toggleGroupMember(idx, gi, m.id)} />
                                        <span>{m.name}{m.outside ? <span className="text-[11px]" style={{ color: "var(--ibs-text-dim)" }}> (ngoài phạm vi)</span> : null}</span>
                                      </label>
                                    ))}
                                  </div>
                                  <div className="text-[11px] mt-0.5 pl-1" style={{ color: "var(--ibs-text-dim)" }}>Số người đang chọn: <strong style={{ color: "var(--ibs-accent)" }}>{g.memberIds.length}</strong></div>
                                </>);
                              })()}
                            </div>
                          );
                        })}
                        <button type="button" onClick={() => addBlockGroup(idx)} className="text-[11px] font-medium" style={{ color: "var(--ibs-accent)" }}>＋ Thêm Xưởng</button>
                      </div>
                    </div>
                    {/* Lý do */}
                    <textarea rows={2} value={b.reason} onChange={(e) => updateBlock(idx, { reason: e.target.value })} placeholder="Lý do tăng ca... (bắt buộc)"
                      className="w-full px-2 py-1.5 rounded-md text-[12px] outline-none resize-none" style={inputStyle} />
                  </div>
                );
              })}
              <button type="button" onClick={addBlock} className="text-[12px] font-medium" style={{ color: "var(--ibs-accent)" }}>＋ Thêm dự án</button>
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
