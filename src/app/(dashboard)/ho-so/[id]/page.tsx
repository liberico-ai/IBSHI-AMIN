"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { PageTitle } from "@/components/layout/page-title";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatDate, getInitials, formatVND, apiError } from "@/lib/utils";
import { confirmDialog, alertDialog } from "@/lib/confirm-dialog";
import {
  ArrowLeft,
  Phone,
  MapPin,
  CreditCard,
  Building2,
  Briefcase,
  Calendar,
  FileText,
  Award,
  History,
  User,
  Mail,
  Plus,
  X,
  Pencil,
} from "lucide-react";
import { FileUpload } from "@/components/shared/file-upload";
import { BUCKETS } from "@/lib/minio-constants";
import { DateInput } from "@/components/shared/date-input";

type Employee = {
  id: string;
  code: string;
  fullName: string;
  gender: string;
  dateOfBirth: string;
  idNumber: string;
  phone: string;
  address: string;
  currentAddress?: string;
  status: string;
  startDate: string;
  salaryGrade?: number;
  salaryCoefficient?: number;
  bankAccount?: string;
  bankName?: string;
  insuranceNumber?: string;
  emergencyContact?: string;
  emergencyPhone?: string;
  taxCode?: string;
  departmentId?: string;
  teamId?: string | null;
  department: { name: string };
  position: { name: string; level: string };
  team?: { name: string };
  jobRole?: string | null;
  jobPosition?: string | null;
  skillLevel?: string | null;
  user: { email: string; isActive: boolean };
  contracts: {
    id: string;
    contractNumber: string;
    contractType: string;
    position?: string | null;
    startDate: string;
    endDate?: string;
    baseSalary: number;
    insuranceSalary?: number | null;
    allowance?: number | null;
    status: string;
    fileUrl?: string | null;
    addendums?: {
      id: string; addendumNumber: string; effectiveDate: string; status: string;
      newJobRole?: string | null; newJobPosition?: string | null;
      newBaseSalary?: number | null;
      newFarAllowance?: number | null; newKpi?: number | null; newPositionAllowance?: number | null;
      newAllowance?: number | null;
      rejectedReason?: string | null; fileUrl?: string | null;
    }[];
  }[];
  dependentsList: {
    id: string;
    fullName: string;
    relationship: string;
    dateOfBirth?: string | null;
    taxCode?: string | null;
  }[];
  certificates: {
    id: string;
    name: string;
    issuer: string;
    issueDate: string;
    expiryDate?: string;
    status: string;
  }[];
  workHistory: {
    id: string;
    eventType: string;
    fromDepartment?: string;
    toDepartment?: string;
    fromPosition?: string;
    toPosition?: string;
    effectiveDate: string;
    decisionNumber?: string;
    note?: string;
  }[];
  leaveBalances: {
    year: number;
    totalDays: number;
    usedDays: number;
    remainingDays: number;
  }[];
};

const CONTRACT_TYPE_LABELS: Record<string, string> = {
  DEFINITE_12M: "12 tháng",
  DEFINITE_24M: "24 tháng",
  DEFINITE_36M: "36 tháng",
  INDEFINITE: "Không XĐ",
  PROBATION: "Thử việc",
};

// Bậc thời hạn HĐ tăng dần — ký HĐ mới tự lên 1 bậc so với HĐ cũ (Thử việc → 12 → 24 → Không XĐ).
const CONTRACT_TIER_ORDER = ["PROBATION", "DEFINITE_12M", "DEFINITE_24M", "INDEFINITE"];
function nextContractType(t: string): string {
  const i = CONTRACT_TIER_ORDER.indexOf(t);
  if (i < 0 || i >= CONTRACT_TIER_ORDER.length - 1) return "INDEFINITE";
  return CONTRACT_TIER_ORDER[i + 1];
}
// Số ngày còn lại tới khi hết hạn HĐ (null nếu vô thời hạn / không có ngày KT).
function daysUntil(dateStr?: string | null): number | null {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
}

// Chức vụ (chọn từ droplist) + phụ cấp trách nhiệm tự động.
const ROLE_OPTIONS = ["Trưởng phòng", "Tổ trưởng", "Nhân viên"];
const RESP_ALLOWANCE = 2_600_000;           // phụ cấp trách nhiệm
const RESP_ROLES = ["Trưởng phòng", "Tổ trưởng"]; // chức vụ được hưởng phụ cấp trách nhiệm

const WORK_EVENT_LABELS: Record<string, string> = {
  JOINED: "Gia nhập",
  PROMOTED: "Thăng chức",
  TRANSFERRED: "Điều chuyển",
  DEMOTED: "Giáng chức",
  SALARY_CHANGE: "Điều chỉnh lương",
  RESIGNED: "Thôi việc",
  TERMINATED: "Chấm dứt HĐ",
};

type Tab = "info" | "contracts" | "certificates" | "history";

// ── Contract Dialog ──────────────────────────────────────────────────────────
const CONTRACT_TYPE_OPTIONS = [
  { value: "PROBATION", label: "Thử việc" },
  { value: "DEFINITE_12M", label: "Có thời hạn 12 tháng" },
  { value: "DEFINITE_24M", label: "Có thời hạn 24 tháng" },
  { value: "INDEFINITE", label: "Không xác định thời hạn" },
];

// Trình soạn HĐ dạng Word khi KÝ HỢP ĐỒNG MỚI (gia hạn) — pre-fill bậc thời hạn +1, lương/chức vụ/bậc thợ.
function AddContractDialog({
  employeeId,
  onClose,
  onSuccess,
}: {
  employeeId: string;
  onClose: () => void;
  onSuccess: (contract: any) => void;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [contractType, setContractType] = useState("DEFINITE_12M");
  const [employeeCode, setEmployeeCode] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [baseSalary, setBaseSalary] = useState("");
  const [allowance, setAllowance] = useState("");
  const [position, setPosition] = useState("");
  const [skillLevel, setSkillLevel] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Tải nội dung HĐ pre-fill (bậc thời hạn +1 so với HĐ cũ)
  useEffect(() => {
    fetch(`/api/v1/employees/${employeeId}/contracts/prefill`)
      .then((r) => r.json())
      .then((res) => {
        const s = res.data?.suggested || {};
        setContractType(s.contractType || "DEFINITE_12M");
        setEmployeeCode(s.employeeCode || "");
        setStartDate(s.startDate || "");
        setEndDate(s.endDate || "");
        setBaseSalary(s.baseSalary ? Number(s.baseSalary).toLocaleString("vi-VN") : "");
        setAllowance(s.allowance ? Number(s.allowance).toLocaleString("vi-VN") : "");
        setPosition(ROLE_OPTIONS.includes(s.jobTitle) ? s.jobTitle : "Nhân viên");
        setSkillLevel(s.skillLevel || "");
        if (editorRef.current && res.data?.html) editorRef.current.innerHTML = res.data.html;
      })
      .catch(() => setError("Không tải được nội dung hợp đồng"))
      .finally(() => setLoading(false));
  }, [employeeId]);

  const exec = (cmd: string) => { document.execCommand(cmd, false); editorRef.current?.focus(); };

  // Đổi chức vụ → tự cộng/trừ phụ cấp trách nhiệm (Trưởng phòng/Tổ trưởng = +2.600.000).
  function changeRole(newRole: string) {
    const oldResp = RESP_ROLES.includes(position) ? RESP_ALLOWANCE : 0;
    const newResp = RESP_ROLES.includes(newRole) ? RESP_ALLOWANCE : 0;
    if (oldResp !== newResp) {
      const cur = parseInt(allowance.replace(/\D/g, ""), 10) || 0;
      const next = Math.max(0, cur - oldResp + newResp);
      setAllowance(next ? next.toLocaleString("vi-VN") : "");
    }
    setPosition(newRole);
  }

  // Số HĐLĐ cố định: <mã NV>/<năm ký>/HĐLĐ/IBS HI — không cho sửa.
  const contractNumber = employeeCode && startDate ? `${employeeCode}/${new Date(startDate).getFullYear()}/HĐLĐ/IBS HI` : "";

  async function handleSubmit() {
    setError(null);
    if (!contractNumber.trim() || !startDate || !baseSalary) { setError("Cần số HĐ, ngày bắt đầu và lương cơ bản"); return; }
    setSaving(true);
    try {
      const base = parseInt(baseSalary.replace(/\D/g, ""), 10) || 0;
      const body: any = {
        contractNumber: contractNumber.trim(),
        contractType,
        startDate,
        baseSalary: base,
        insuranceSalary: base,
        allowance: parseInt(allowance.replace(/\D/g, ""), 10) || 0,
        documentHtml: editorRef.current?.innerHTML || null,
      };
      if (endDate && contractType !== "INDEFINITE") body.endDate = endDate;
      if (position.trim()) body.position = position.trim();
      if (skillLevel.trim()) body.skillLevel = skillLevel.trim();

      const res = await fetch(`/api/v1/employees/${employeeId}/contracts`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) { setError(apiError(res.status, json?.error)); return; }
      onSuccess(json.data);
    } catch {
      setError("Lỗi kết nối");
    } finally {
      setSaving(false);
    }
  }

  const fcls = "w-full rounded-lg px-2.5 py-1.5 text-[12px] border outline-none";
  const fst = { background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" } as React.CSSProperties;
  const L = ({ children }: { children: React.ReactNode }) => <label className="text-[11px] font-medium block mb-1" style={{ color: "var(--ibs-text-dim)" }}>{children}</label>;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4">
      <div className="rounded-2xl w-full max-w-3xl p-6 max-h-[92vh] overflow-y-auto flex flex-col" style={{ background: "var(--ibs-bg-card)", border: "1px solid var(--ibs-border)" }}>
        <div className="flex items-center justify-between mb-3">
          <div className="text-[16px] font-bold">Ký hợp đồng mới</div>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <div className="text-[12px] mb-3 p-2.5 rounded-lg" style={{ background: "rgba(0,180,216,0.06)", color: "var(--ibs-text-dim)" }}>
          ⓘ Thời hạn đã tự nâng <strong>1 bậc</strong> so với HĐ cũ. Anh chỉnh sửa &amp; xác nhận lương / chức vụ / bậc thợ rồi <strong>Lưu &amp; ký</strong>. HĐ cũ sẽ tự chuyển thành "Đã gia hạn".
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-3 p-3 rounded-lg" style={{ background: "var(--ibs-bg)" }}>
          <div className="col-span-2 md:col-span-1"><L>Số HĐLĐ (tự sinh)</L><input value={contractNumber} readOnly title="Số HĐ tự sinh theo mã NV/năm ký — không sửa" className={fcls} style={{ ...fst, opacity: 0.75, cursor: "not-allowed" }} /></div>
          <div>
            <L>Loại HĐ *</L>
            <select value={contractType} onChange={(e) => setContractType(e.target.value)} className={fcls} style={fst}>
              {CONTRACT_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div><L>Ngày bắt đầu *</L><DateInput value={startDate} onChange={(e) => setStartDate(e.target.value)} className={fcls} style={fst} /></div>
          <div><L>Ngày kết thúc</L><DateInput value={endDate} onChange={(e) => setEndDate(e.target.value)} className={fcls} style={fst} /></div>
          <div><L>Lương cơ bản (BHXH) *</L><input type="text" inputMode="numeric" value={baseSalary} onChange={(e) => { const d = e.target.value.replace(/\D/g, ""); setBaseSalary(d ? Number(d).toLocaleString("vi-VN") : ""); }} placeholder="0" className={fcls} style={fst} /></div>
          <div><L>Phụ cấp</L><input type="text" inputMode="numeric" value={allowance} onChange={(e) => { const d = e.target.value.replace(/\D/g, ""); setAllowance(d ? Number(d).toLocaleString("vi-VN") : ""); }} placeholder="0" className={fcls} style={fst} /></div>
          <div>
            <L>Chức vụ</L>
            <select value={position} onChange={(e) => changeRole(e.target.value)} className={fcls} style={fst}>
              {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div><L>Bậc thợ</L><input value={skillLevel} onChange={(e) => setSkillLevel(e.target.value)} placeholder="VD: Bậc 5" className={fcls} style={fst} /></div>
        </div>
        {RESP_ROLES.includes(position) && (
          <div className="text-[11px] mb-3 -mt-1" style={{ color: "#10b981" }}>
            ✓ Chức vụ <b>{position}</b> được cộng <b>+{RESP_ALLOWANCE.toLocaleString("vi-VN")}đ</b> phụ cấp trách nhiệm (đã gồm trong ô Phụ cấp).
          </div>
        )}

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
          <button onClick={handleSubmit} disabled={saving || loading} className="px-4 py-2 rounded-lg text-[13px] font-semibold text-white" style={{ background: "var(--ibs-accent)", opacity: saving || loading ? 0.6 : 1 }}>
            {saving ? "Đang lưu..." : "Lưu & ký hợp đồng"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Xem hợp đồng (modal nội dung + tải PDF/Word + bản scan đính kèm) ──────────
function ViewContractDialog({
  employeeId, contractId, contractNumber, scanUrl, onClose,
}: {
  employeeId: string; contractId: string; contractNumber: string; scanUrl?: string | null; onClose: () => void;
}) {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const base = `/api/v1/employees/${employeeId}/contracts/${contractId}`;

  useEffect(() => {
    fetch(`${base}/html`)
      .then((r) => r.json())
      .then((res) => { if (res.data?.html) setHtml(res.data.html); else setError("Không tải được nội dung hợp đồng"); })
      .catch(() => setError("Lỗi kết nối"));
  }, [base]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4">
      <div className="rounded-2xl w-full max-w-3xl p-6 max-h-[92vh] overflow-hidden flex flex-col" style={{ background: "var(--ibs-bg-card)", border: "1px solid var(--ibs-border)" }}>
        <div className="flex items-center justify-between mb-3">
          <div className="text-[16px] font-bold">Hợp đồng {contractNumber}</div>
          <button onClick={onClose}><X size={18} /></button>
        </div>

        <style>{`.contract-view h1{font-size:17px;font-weight:700;text-align:center;margin:0 0 10px} .contract-view .center,.contract-view .sign{text-align:center} .contract-view p{margin:4px 0}`}</style>
        <div className="flex-1 overflow-y-auto rounded-lg border p-5" style={{ background: "#fff", color: "#111", borderColor: "var(--ibs-border)" }}>
          {error ? (
            <div className="text-[13px] text-red-500">{error}</div>
          ) : html === null ? (
            <div className="text-[13px] text-center py-8" style={{ color: "#888" }}>Đang tải nội dung hợp đồng…</div>
          ) : (
            <div className="contract-view text-[12.5px] leading-relaxed" dangerouslySetInnerHTML={{ __html: html }} />
          )}
        </div>

        {scanUrl && (
          <div className="mt-3 px-3 py-2 rounded-lg flex items-center justify-between gap-2" style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.3)" }}>
            <span className="text-[12px]" style={{ color: "var(--ibs-success)" }}>📎 HĐ này có bản scan đã ký đính kèm</span>
            <a href={scanUrl} target="_blank" rel="noreferrer" className="text-[12px] font-semibold underline" style={{ color: "var(--ibs-success)" }}>Xem bản scan →</a>
          </div>
        )}
        <div className="flex gap-2 justify-end mt-4">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-[13px] border" style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-dim)" }}>Đóng</button>
          <a href={`${base}/pdf`} className="px-4 py-2 rounded-lg text-[13px] font-semibold border" style={{ borderColor: "var(--ibs-accent)", color: "var(--ibs-accent)" }}>Tải PDF</a>
          <a href={`${base}/docx`} className="px-4 py-2 rounded-lg text-[13px] font-semibold text-white" style={{ background: "var(--ibs-accent)" }}>Tải Word</a>
        </div>
      </div>
    </div>
  );
}

// ── Soạn phụ lục hợp đồng ─────────────────────────────────────────────────────
function AddendumDialog({
  employeeId, contractId, contractNumber, onClose, onCreated,
}: {
  employeeId: string; contractId: string; contractNumber: string; onClose: () => void; onCreated: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [addendumNumber, setAddendumNumber] = useState("");
  const [effectiveDate, setEffectiveDate] = useState("");
  const [contractStart, setContractStart] = useState(""); const [contractEnd, setContractEnd] = useState("");
  // giá trị hiện tại của HĐ (cũ)
  const [curRole, setCurRole] = useState(""); const [curPos, setCurPos] = useState("");
  const [curBase, setCurBase] = useState(0);
  const [curFar, setCurFar] = useState(0); const [curKpi, setCurKpi] = useState(0); const [curPosAllow, setCurPosAllow] = useState(0);
  const [employeeName, setEmployeeName] = useState(""); const [employeeIdNum, setEmployeeIdNum] = useState("");
  // giá trị mới
  const [newRole, setNewRole] = useState(""); const [newPos, setNewPos] = useState("");
  const [newBase, setNewBase] = useState("");
  const [newFar, setNewFar] = useState(""); const [newKpi, setNewKpi] = useState(""); const [newPosAllow, setNewPosAllow] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/v1/employees/${employeeId}/contracts/${contractId}/addendums`)
      .then((r) => r.json())
      .then((res) => {
        const s = res.data?.suggested || {};
        const c = res.data?.contract || {};
        const e = res.data?.employee || {};
        setAddendumNumber(s.addendumNumber || "");
        setContractStart(c.startDate ? String(c.startDate).slice(0, 10) : "");
        setContractEnd(c.endDate ? String(c.endDate).slice(0, 10) : "");
        setEffectiveDate(new Date().toISOString().slice(0, 10));
        setCurRole(s.currentJobRole || ""); setCurPos(s.currentJobPosition || "");
        setCurBase(s.currentBaseSalary || 0);
        setCurFar(s.currentFarAllowance || 0); setCurKpi(s.currentKpiAllowance || 0); setCurPosAllow(s.currentPositionAllowance || 0);
        setEmployeeName(e.fullName || ""); setEmployeeIdNum(e.idNumber || "");
        setNewRole(s.currentJobRole || ""); setNewPos(s.currentJobPosition || "");
        setNewBase(s.currentBaseSalary ? Number(s.currentBaseSalary).toLocaleString("vi-VN") : "");
        setNewFar(s.currentFarAllowance ? Number(s.currentFarAllowance).toLocaleString("vi-VN") : "");
        setNewKpi(s.currentKpiAllowance ? Number(s.currentKpiAllowance).toLocaleString("vi-VN") : "");
        setNewPosAllow(s.currentPositionAllowance ? Number(s.currentPositionAllowance).toLocaleString("vi-VN") : "");
      })
      .catch(() => setError("Không tải được dữ liệu phụ lục"))
      .finally(() => setLoading(false));
  }, [employeeId, contractId]);

  async function publish() {
    setError(null);
    if (!effectiveDate) { setError("Cần ngày hiệu lực"); return; }
    if (contractStart && effectiveDate < contractStart) { setError("Ngày hiệu lực phải sau ngày bắt đầu HĐ"); return; }
    if (contractEnd && effectiveDate > contractEnd) { setError("Ngày hiệu lực phải trước ngày kết thúc HĐ"); return; }
    const newBaseN = parseInt(newBase.replace(/\D/g, ""), 10) || 0;
    const newFarN = parseInt(newFar.replace(/\D/g, ""), 10) || 0;
    const newKpiN = parseInt(newKpi.replace(/\D/g, ""), 10) || 0;
    const newPosAllowN = parseInt(newPosAllow.replace(/\D/g, ""), 10) || 0;
    setSaving(true);
    const res = await fetch(`/api/v1/employees/${employeeId}/contracts/${contractId}/addendums`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        addendumNumber, effectiveDate,
        newJobRole: newRole.trim() || null,
        newJobPosition: newPos.trim() || null,
        newBaseSalary: newBaseN || null,
        newFarAllowance: newFarN || null,
        newKpi: newKpiN || null,
        newPositionAllowance: newPosAllowN || null,
      }),
    });
    setSaving(false);
    if (res.ok) onCreated();
    else { const d = await res.json(); setError(apiError(res.status, d.error)); }
  }

  const fcls = "w-full rounded-lg px-2.5 py-1.5 text-[12px] border outline-none";
  const fst = { background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" } as React.CSSProperties;
  const L = ({ children }: { children: React.ReactNode }) => <label className="text-[11px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>{children}</label>;
  const Money = (v: string, set: (s: string) => void) => (
    <input type="text" inputMode="numeric" value={v} onChange={(e) => { const d = e.target.value.replace(/\D/g, ""); set(d ? Number(d).toLocaleString("vi-VN") : ""); }} className={fcls} style={fst} />
  );

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4">
      <div className="rounded-2xl w-full max-w-3xl p-6 max-h-[92vh] overflow-y-auto" style={{ background: "var(--ibs-bg-card)", border: "1px solid var(--ibs-border)" }}>
        <div className="flex items-center justify-between mb-3">
          <div className="text-[16px] font-bold">Soạn phụ lục HĐ — {contractNumber}</div>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <div className="text-[12px] mb-3 p-2.5 rounded-lg" style={{ background: "rgba(139,92,246,0.08)", color: "var(--ibs-text-dim)" }}>
          ⓘ Chỉnh sửa các điều khoản (chức vụ / vị trí / lương / phụ cấp / KPI) + ngày hiệu lực (trong khoảng HĐ) → <strong>Phát hành</strong> → TP HCNS duyệt. Sau khi duyệt và ký scan, hệ thống sẽ áp giá trị mới vào HĐ gốc.
        </div>

        {loading ? (
          <div className="text-[12px] py-4 text-center" style={{ color: "var(--ibs-text-dim)" }}>Đang tải…</div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-2 p-3 rounded-lg" style={{ background: "var(--ibs-bg)" }}>
              <div><L>Số phụ lục</L><input value={addendumNumber} readOnly className={fcls} style={{ ...fst, opacity: 0.75 }} /></div>
              <div><L>Ngày hiệu lực *</L><DateInput value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} min={contractStart} max={contractEnd || undefined} className={fcls} style={fst} /></div>
              <div className="text-[10px] flex items-end" style={{ color: "var(--ibs-text-dim)" }}>Trong khoảng {contractStart} → {contractEnd || "(vô thời hạn)"}</div>
            </div>

            <div className="text-[11px] font-semibold mb-1" style={{ color: "var(--ibs-text-dim)" }}>NỘI DUNG ĐIỀU CHỈNH (cũ → mới)</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-3 p-3 rounded-lg" style={{ background: "var(--ibs-bg)" }}>
              <div><L>Chức vụ — hiện tại</L><input value={curRole} readOnly className={fcls} style={{ ...fst, opacity: 0.65 }} /></div>
              <div><L>Chức vụ — mới</L><input value={newRole} onChange={(e) => setNewRole(e.target.value)} className={fcls} style={fst} /></div>
              <div><L>Vị trí công việc — hiện tại</L><input value={curPos} readOnly className={fcls} style={{ ...fst, opacity: 0.65 }} /></div>
              <div><L>Vị trí công việc — mới</L><input value={newPos} onChange={(e) => setNewPos(e.target.value)} className={fcls} style={fst} /></div>
              <div><L>Lương cơ bản (BHXH) — hiện tại</L><input value={curBase ? curBase.toLocaleString("vi-VN") : ""} readOnly className={fcls} style={{ ...fst, opacity: 0.65 }} /></div>
              <div><L>Lương cơ bản (BHXH) — mới</L>{Money(newBase, setNewBase)}</div>
              <div><L>Phụ cấp nhà xa — hiện tại</L><input value={curFar ? curFar.toLocaleString("vi-VN") : ""} readOnly className={fcls} style={{ ...fst, opacity: 0.65 }} /></div>
              <div><L>Phụ cấp nhà xa — mới</L>{Money(newFar, setNewFar)}</div>
              <div><L>Phụ cấp KPI — hiện tại</L><input value={curKpi ? curKpi.toLocaleString("vi-VN") : ""} readOnly className={fcls} style={{ ...fst, opacity: 0.65 }} /></div>
              <div><L>Phụ cấp KPI — mới</L>{Money(newKpi, setNewKpi)}</div>
              <div><L>Phụ cấp chức vụ — hiện tại</L><input value={curPosAllow ? curPosAllow.toLocaleString("vi-VN") : ""} readOnly className={fcls} style={{ ...fst, opacity: 0.65 }} /></div>
              <div><L>Phụ cấp chức vụ — mới</L>{Money(newPosAllow, setNewPosAllow)}</div>
            </div>
            <div className="text-[11px] mb-2 px-3 py-1.5 rounded-lg" style={{ background: "rgba(0,180,216,0.06)", color: "var(--ibs-text-dim)" }}>
              ⓘ Tổng phụ cấp mới = nhà xa + KPI + chức vụ = <b>{(
                (parseInt(newFar.replace(/\D/g, ""), 10) || 0) +
                (parseInt(newKpi.replace(/\D/g, ""), 10) || 0) +
                (parseInt(newPosAllow.replace(/\D/g, ""), 10) || 0)
              ).toLocaleString("vi-VN")}đ</b> · Tổng thu nhập mới = lương CB + tổng phụ cấp
            </div>

            <div className="text-[11px] mt-1" style={{ color: "var(--ibs-text-dim)" }}>
              Nội dung phụ lục sẽ được hệ thống tự dựng theo các trường đã nhập. Bấm <b>"Xem"</b> ở danh sách phụ lục sau khi phát hành để xem & tải Word/PDF.
            </div>
          </>
        )}

        {error && <div className="text-[12px] text-red-500 mt-2">{error}</div>}
        <div className="flex gap-2 justify-end mt-4">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-[13px] border" style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-dim)" }}>Hủy</button>
          <button onClick={publish} disabled={saving || loading} className="px-4 py-2 rounded-lg text-[13px] font-semibold text-white" style={{ background: "#8b5cf6", opacity: saving || loading ? 0.6 : 1 }}>
            {saving ? "Đang phát hành..." : "Phát hành phụ lục"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Xem nội dung phụ lục + tải Word/PDF ───────────────────────────────────────
function ViewAddendumDialog({ employeeId, contractId, addendumId, addendumNumber, onClose }: {
  employeeId: string; contractId: string; addendumId: string; addendumNumber: string; onClose: () => void;
}) {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const base = `/api/v1/employees/${employeeId}/contracts/${contractId}/addendums/${addendumId}`;

  useEffect(() => {
    fetch(`${base}/html`)
      .then((r) => r.json())
      .then((res) => { if (res.data?.html) setHtml(res.data.html); else setError("Không tải được nội dung phụ lục"); })
      .catch(() => setError("Lỗi kết nối"));
  }, [base]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4">
      <div className="rounded-2xl w-full max-w-3xl p-6 max-h-[92vh] overflow-hidden flex flex-col" style={{ background: "var(--ibs-bg-card)", border: "1px solid var(--ibs-border)" }}>
        <div className="flex items-center justify-between mb-3">
          <div className="text-[16px] font-bold">Phụ lục {addendumNumber}</div>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <style>{`.contract-view h1{font-size:17px;font-weight:700;text-align:center;margin:0 0 10px} .contract-view .center,.contract-view .sign{text-align:center} .contract-view p{margin:4px 0}`}</style>
        <div className="flex-1 overflow-y-auto rounded-lg border p-5 contract-view" style={{ background: "#fff", color: "#111", borderColor: "var(--ibs-border)" }}>
          {error ? (
            <div className="text-[13px] text-red-500">{error}</div>
          ) : html === null ? (
            <div className="text-[13px] text-center py-8" style={{ color: "#888" }}>Đang tải nội dung…</div>
          ) : (
            <div className="text-[12.5px] leading-relaxed" dangerouslySetInnerHTML={{ __html: html }} />
          )}
        </div>
        <div className="flex gap-2 justify-end mt-4">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-[13px] border" style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-dim)" }}>Đóng</button>
          <a href={`${base}/pdf`} className="px-4 py-2 rounded-lg text-[13px] font-semibold border" style={{ borderColor: "var(--ibs-accent)", color: "var(--ibs-accent)" }}>Tải PDF</a>
          <a href={`${base}/docx`} className="px-4 py-2 rounded-lg text-[13px] font-semibold text-white" style={{ background: "var(--ibs-accent)" }}>Tải Word</a>
        </div>
      </div>
    </div>
  );
}

// ── Xác nhận đã ký phụ lục (upload bản scan) ──────────────────────────────────
function SignAddendumDialog({ employeeId, contractId, addendumId, addendumNumber, onClose, onSigned }: {
  employeeId: string; contractId: string; addendumId: string; addendumNumber: string; onClose: () => void; onSigned: () => void;
}) {
  const [fileUrl, setFileUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!fileUrl) { setError("Cần upload file scan phụ lục đã ký"); return; }
    setSaving(true);
    const res = await fetch(`/api/v1/employees/${employeeId}/contracts/${contractId}/addendums/${addendumId}/sign`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fileUrl }),
    });
    setSaving(false);
    if (res.ok) onSigned();
    else { const d = await res.json(); setError(apiError(res.status, d.error)); }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4">
      <div className="rounded-2xl w-full max-w-md p-6" style={{ background: "var(--ibs-bg-card)", border: "1px solid var(--ibs-border)" }}>
        <div className="flex items-center justify-between mb-3">
          <div className="text-[15px] font-semibold">Xác nhận đã ký phụ lục — {addendumNumber}</div>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <div className="text-[12px] mb-3 p-2.5 rounded-lg" style={{ background: "rgba(0,180,216,0.06)", color: "var(--ibs-text-dim)" }}>
          ⓘ Upload bản scan phụ lục đã ký tay. Sau khi xác nhận, hệ thống tự áp giá trị mới (chức vụ / vị trí / lương / phụ cấp) vào HĐ gốc và hồ sơ NV.
        </div>
        <div className="mb-3">
          <FileUpload bucket={BUCKETS.HR_DOCUMENTS} folder="addendums" accept=".pdf,.jpg,.jpeg,.png"
            label="Upload bản scan phụ lục đã ký"
            currentUrl={fileUrl || undefined}
            onUploaded={(r) => setFileUrl(r.url)}
            onError={(msg) => void alertDialog(msg)} />
        </div>
        {error && <div className="text-[12px] text-red-500 mb-2">{error}</div>}
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-[13px] border" style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-dim)" }}>Hủy</button>
          <button onClick={submit} disabled={saving || !fileUrl} className="px-4 py-2 rounded-lg text-[13px] font-semibold text-white" style={{ background: "var(--ibs-accent)", opacity: saving || !fileUrl ? 0.6 : 1 }}>
            {saving ? "Đang xác nhận..." : "Xác nhận đã ký"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Certificate Dialog ────────────────────────────────────────────────────────
function AddCertificateDialog({
  employeeId,
  onClose,
  onSuccess,
}: {
  employeeId: string;
  onClose: () => void;
  onSuccess: (cert: any) => void;
}) {
  const [form, setForm] = useState({
    name: "",
    issuer: "",
    issueDate: "",
    expiryDate: "",
    fileUrl: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = (field: string, value: string) =>
    setForm((f) => ({ ...f, [field]: value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const body: any = {
        name: form.name.trim(),
        issuer: form.issuer.trim(),
        issueDate: form.issueDate,
      };
      if (form.expiryDate) body.expiryDate = form.expiryDate;
      if (form.fileUrl) body.fileUrl = form.fileUrl;

      const res = await fetch(`/api/v1/employees/${employeeId}/certificates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(apiError(res.status, json?.error));
        return;
      }
      onSuccess(json.data);
    } catch {
      setError("Lỗi kết nối");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.7)" }}>
      <div
        className="w-full max-w-[480px] rounded-xl border shadow-2xl"
        style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "var(--ibs-border)" }}>
          <h3 className="text-[15px] font-semibold">Thêm chứng chỉ / bằng cấp</h3>
          <button onClick={onClose} style={{ color: "var(--ibs-text-dim)" }}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="text-[13px] px-3 py-2 rounded-lg" style={{ background: "rgba(239,68,68,0.1)", color: "var(--ibs-danger)" }}>
              {error}
            </div>
          )}

          <div>
            <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--ibs-text-muted)" }}>
              Tên chứng chỉ / bằng cấp *
            </label>
            <input
              required
              value={form.name}
              onChange={(e) => handleChange("name", e.target.value)}
              placeholder="VD: Chứng chỉ hàn AWS D1.1"
              className="w-full px-3 py-2 rounded-lg text-[13px] outline-none"
              style={{ background: "var(--ibs-bg)", border: "1px solid var(--ibs-border)", color: "var(--ibs-text)" }}
            />
          </div>

          <div>
            <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--ibs-text-muted)" }}>
              Đơn vị cấp *
            </label>
            <input
              required
              value={form.issuer}
              onChange={(e) => handleChange("issuer", e.target.value)}
              placeholder="VD: Bộ Lao động - TBXH"
              className="w-full px-3 py-2 rounded-lg text-[13px] outline-none"
              style={{ background: "var(--ibs-bg)", border: "1px solid var(--ibs-border)", color: "var(--ibs-text)" }}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--ibs-text-muted)" }}>
                Ngày cấp *
              </label>
              <DateInput
                required
                value={form.issueDate}
                onChange={(e) => handleChange("issueDate", e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-[13px] outline-none"
                style={{ background: "var(--ibs-bg)", border: "1px solid var(--ibs-border)", color: "var(--ibs-text)" }}
              />
            </div>
            <div>
              <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--ibs-text-muted)" }}>
                Ngày hết hạn
              </label>
              <DateInput
                value={form.expiryDate}
                onChange={(e) => handleChange("expiryDate", e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-[13px] outline-none"
                style={{ background: "var(--ibs-bg)", border: "1px solid var(--ibs-border)", color: "var(--ibs-text)" }}
              />
            </div>
          </div>

          <div>
            <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--ibs-text-muted)" }}>
              File chứng chỉ (PDF / ảnh)
            </label>
            <FileUpload
              bucket={BUCKETS.CERTIFICATES}
              folder="certificates"
              accept=".pdf,.jpg,.jpeg,.png"
              label="Tải file chứng chỉ lên"
              onUploaded={(r) => handleChange("fileUrl", r.url)}
              onError={(msg) => setError(msg)}
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 rounded-lg text-[13px] font-medium transition-colors"
              style={{ border: "1px solid var(--ibs-border)", color: "var(--ibs-text-muted)" }}
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2 rounded-lg text-[13px] font-medium text-white transition-colors"
              style={{ background: saving ? "rgba(0,180,216,0.5)" : "var(--ibs-accent)" }}
            >
              {saving ? "Đang lưu..." : "Lưu chứng chỉ"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Edit Employee Dialog ──────────────────────────────────────────────────────
function EditEmployeeDialog({
  employee,
  userRole,
  onClose,
  onSuccess,
}: {
  employee: Employee;
  userRole: string;
  onClose: () => void;
  onSuccess: (updated: Partial<Employee>) => void;
}) {
  const isHR = userRole === "HR_ADMIN" || userRole === "BOM";
  const [form, setForm] = useState({
    fullName: employee.fullName || "",
    gender: employee.gender || "MALE",
    dateOfBirth: employee.dateOfBirth ? String(employee.dateOfBirth).slice(0, 10) : "",
    idNumber: employee.idNumber || "",
    phone: employee.phone || "",
    currentAddress: employee.currentAddress || "",
    address: employee.address || "",
    departmentId: employee.departmentId || "",
    teamId: employee.teamId || "",
    startDate: employee.startDate ? String(employee.startDate).slice(0, 10) : "",
    bankAccount: employee.bankAccount || "",
    bankName: employee.bankName || "",
    taxCode: employee.taxCode || "",
    insuranceNumber: employee.insuranceNumber || "",
    emergencyContact: employee.emergencyContact || "",
    emergencyPhone: employee.emergencyPhone || "",
    status: employee.status || "ACTIVE",
    jobRole: employee.jobRole || "",
    jobPosition: employee.jobPosition || "",
    skillLevel: employee.skillLevel || "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [depts, setDepts] = useState<{ id: string; name: string }[]>([]);
  const [teams, setTeams] = useState<{ id: string; name: string; departmentId: string }[]>([]);
  useEffect(() => {
    fetch("/api/v1/departments").then((r) => r.json()).then((res) => {
      setDepts(res.data || []);
      setTeams(res.teams || []);
    }).catch(() => {});
  }, []);

  const handleChange = (field: string, value: string) =>
    setForm((f) => ({ ...f, [field]: value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const body: any = {
        phone: form.phone,
        currentAddress: form.currentAddress,
        emergencyContact: form.emergencyContact,
        emergencyPhone: form.emergencyPhone,
      };
      if (isHR) {
        body.fullName = form.fullName;
        body.gender = form.gender;
        if (form.dateOfBirth) body.dateOfBirth = form.dateOfBirth;
        body.idNumber = form.idNumber;
        body.address = form.address;
        if (form.departmentId) body.departmentId = form.departmentId;
        body.teamId = form.teamId || null;
        if (form.startDate) body.startDate = form.startDate;
        body.bankAccount = form.bankAccount;
        body.bankName = form.bankName;
        body.taxCode = form.taxCode;
        body.insuranceNumber = form.insuranceNumber;
        body.status = form.status;
        body.jobRole = form.jobRole;
        body.jobPosition = form.jobPosition;
        body.skillLevel = form.skillLevel;
      }

      const res = await fetch(`/api/v1/employees/${employee.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(apiError(res.status, json?.error));
        return;
      }
      onSuccess(body);
    } catch {
      setError("Lỗi kết nối");
    } finally {
      setSaving(false);
    }
  }

  const inputCls = "w-full px-3 py-2 rounded-lg text-[13px] outline-none";
  const inputStyle = {
    background: "var(--ibs-bg)",
    border: "1px solid var(--ibs-border)",
    color: "var(--ibs-text)",
  };
  const labelCls = "block text-[12px] font-medium mb-1.5";
  const labelStyle = { color: "var(--ibs-text-muted)" };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.7)" }}>
      <div
        className="w-full max-w-[560px] rounded-xl border shadow-2xl max-h-[90vh] overflow-y-auto"
        style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b sticky top-0 z-10"
          style={{ borderColor: "var(--ibs-border)", background: "var(--ibs-bg-card)" }}>
          <h3 className="text-[15px] font-semibold">Cập nhật thông tin nhân viên</h3>
          <button onClick={onClose} style={{ color: "var(--ibs-text-dim)" }}><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="text-[13px] px-3 py-2 rounded-lg"
              style={{ background: "rgba(239,68,68,0.1)", color: "var(--ibs-danger)" }}>
              {error}
            </div>
          )}

          {isHR && (
            <div>
              <p className="text-[11px] uppercase tracking-wider font-semibold mb-3"
                style={{ color: "var(--ibs-text-dim)" }}>Thông tin cơ bản</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls} style={labelStyle}>Họ tên đầy đủ</label>
                  <input value={form.fullName} onChange={(e) => handleChange("fullName", e.target.value)}
                    className={inputCls} style={inputStyle} />
                </div>
                <div>
                  <label className={labelCls} style={labelStyle}>Giới tính</label>
                  <select value={form.gender} onChange={(e) => handleChange("gender", e.target.value)}
                    className={inputCls} style={inputStyle}>
                    <option value="MALE">Nam</option>
                    <option value="FEMALE">Nữ</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls} style={labelStyle}>Ngày sinh</label>
                  <input type="date" value={form.dateOfBirth} onChange={(e) => handleChange("dateOfBirth", e.target.value)}
                    className={inputCls} style={inputStyle} />
                </div>
                <div>
                  <label className={labelCls} style={labelStyle}>Số CCCD/CMND</label>
                  <input value={form.idNumber} onChange={(e) => handleChange("idNumber", e.target.value)}
                    className={inputCls} style={inputStyle} />
                </div>
              </div>
            </div>
          )}

          <div>
            <p className="text-[11px] uppercase tracking-wider font-semibold mb-3"
              style={{ color: "var(--ibs-text-dim)" }}>Liên hệ cá nhân</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls} style={labelStyle}>Số điện thoại *</label>
                <input required value={form.phone} onChange={(e) => handleChange("phone", e.target.value)}
                  pattern="^0\d{9}$" title="Số điện thoại 10 chữ số bắt đầu bằng 0"
                  className={inputCls} style={inputStyle} />
              </div>
              <div>
                <label className={labelCls} style={labelStyle}>Địa chỉ hiện tại</label>
                <input value={form.currentAddress} onChange={(e) => handleChange("currentAddress", e.target.value)}
                  className={inputCls} style={inputStyle} />
              </div>
            </div>
          </div>

          {isHR && (
            <div>
              <p className="text-[11px] uppercase tracking-wider font-semibold mb-3"
                style={{ color: "var(--ibs-text-dim)" }}>Thông tin HR (HR_ADMIN+)</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls} style={labelStyle}>Địa chỉ thường trú</label>
                  <input value={form.address} onChange={(e) => handleChange("address", e.target.value)}
                    className={inputCls} style={inputStyle} />
                </div>
                <div>
                  <label className={labelCls} style={labelStyle}>Trạng thái</label>
                  <select value={form.status} onChange={(e) => handleChange("status", e.target.value)}
                    className={inputCls} style={inputStyle}>
                    <option value="ACTIVE">Đang làm việc</option>
                    <option value="PROBATION">Thử việc</option>
                    <option value="ON_LEAVE">Tạm nghỉ</option>
                    <option value="RESIGNED">Đã nghỉ việc</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls} style={labelStyle}>Số tài khoản</label>
                  <input value={form.bankAccount} onChange={(e) => handleChange("bankAccount", e.target.value)}
                    className={inputCls} style={inputStyle} />
                </div>
                <div>
                  <label className={labelCls} style={labelStyle}>Ngân hàng</label>
                  <input value={form.bankName} onChange={(e) => handleChange("bankName", e.target.value)}
                    placeholder="VD: Vietcombank" className={inputCls} style={inputStyle} />
                </div>
                <div>
                  <label className={labelCls} style={labelStyle}>Mã số thuế</label>
                  <input value={form.taxCode} onChange={(e) => handleChange("taxCode", e.target.value)}
                    className={inputCls} style={inputStyle} />
                </div>
                <div>
                  <label className={labelCls} style={labelStyle}>Số BHXH</label>
                  <input value={form.insuranceNumber} onChange={(e) => handleChange("insuranceNumber", e.target.value)}
                    className={inputCls} style={inputStyle} />
                </div>
                <div>
                  <label className={labelCls} style={labelStyle}>Phòng ban</label>
                  <select value={form.departmentId} onChange={(e) => handleChange("departmentId", e.target.value)}
                    className={inputCls} style={inputStyle}>
                    <option value="">-- Chọn phòng ban --</option>
                    {depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls} style={labelStyle}>Tổ / Đội / Bộ phận</label>
                  <select value={form.teamId} onChange={(e) => handleChange("teamId", e.target.value)}
                    className={inputCls} style={inputStyle}>
                    <option value="">-- Không thuộc tổ --</option>
                    {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls} style={labelStyle}>Ngày vào làm</label>
                  <input type="date" value={form.startDate} onChange={(e) => handleChange("startDate", e.target.value)}
                    className={inputCls} style={inputStyle} />
                </div>
                <div>
                  <label className={labelCls} style={labelStyle}>Chức vụ</label>
                  <input value={form.jobRole} onChange={(e) => handleChange("jobRole", e.target.value)}
                    placeholder="VD: Công nhân / Tổ trưởng" className={inputCls} style={inputStyle} />
                </div>
                <div>
                  <label className={labelCls} style={labelStyle}>Vị trí công việc</label>
                  <input value={form.jobPosition} onChange={(e) => handleChange("jobPosition", e.target.value)}
                    placeholder="VD: Thợ hàn / Thợ mài" className={inputCls} style={inputStyle} />
                </div>
                {form.jobRole === "Công nhân" && (
                  <div>
                    <label className={labelCls} style={labelStyle}>Cấp bậc</label>
                    <input value={form.skillLevel} onChange={(e) => handleChange("skillLevel", e.target.value)}
                      placeholder="VD: Bậc 5" className={inputCls} style={inputStyle} />
                  </div>
                )}
              </div>
            </div>
          )}

          <div>
            <p className="text-[11px] uppercase tracking-wider font-semibold mb-3"
              style={{ color: "var(--ibs-text-dim)" }}>Liên hệ khẩn cấp</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls} style={labelStyle}>Người liên hệ</label>
                <input value={form.emergencyContact} onChange={(e) => handleChange("emergencyContact", e.target.value)}
                  className={inputCls} style={inputStyle} />
              </div>
              <div>
                <label className={labelCls} style={labelStyle}>Số điện thoại</label>
                <input value={form.emergencyPhone} onChange={(e) => handleChange("emergencyPhone", e.target.value)}
                  className={inputCls} style={inputStyle} />
              </div>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 py-2 rounded-lg text-[13px] font-medium transition-colors"
              style={{ border: "1px solid var(--ibs-border)", color: "var(--ibs-text-muted)" }}>
              Hủy
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 py-2 rounded-lg text-[13px] font-medium text-white transition-colors"
              style={{ background: saving ? "rgba(0,180,216,0.5)" : "var(--ibs-accent)" }}>
              {saving ? "Đang lưu..." : "Lưu thay đổi"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function InfoRow({ label, value, icon: Icon }: { label: string; value?: string | null; icon?: any }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3 py-2.5 border-b" style={{ borderColor: "rgba(51,65,85,0.4)" }}>
      {Icon && <Icon size={14} className="mt-0.5 flex-shrink-0" style={{ color: "var(--ibs-text-dim)" }} />}
      <span className="text-[12px] w-[140px] flex-shrink-0" style={{ color: "var(--ibs-text-dim)" }}>
        {label}
      </span>
      <span className="text-[13px] font-medium">{value}</span>
    </div>
  );
}

export default function EmployeeDetailPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const router = useRouter();
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("info");
  const [showAddContract, setShowAddContract] = useState(false);
  const [viewContract, setViewContract] = useState<{ id: string; number: string; fileUrl?: string | null } | null>(null);
  const [addendumTarget, setAddendumTarget] = useState<{ id: string; number: string } | null>(null);
  const [signAddendum, setSignAddendum] = useState<{ id: string; number: string; contractId: string } | null>(null);
  const [viewAddendum, setViewAddendum] = useState<{ id: string; number: string; contractId: string } | null>(null);
  const [showAddCertificate, setShowAddCertificate] = useState(false);
  const [showEditEmployee, setShowEditEmployee] = useState(false);
  const [showDependentForm, setShowDependentForm] = useState<null | { mode: "create" } | { mode: "edit"; dep: any }>(null);
  const [userRole, setUserRole] = useState<string>("EMPLOYEE");
  const [canViewPayroll, setCanViewPayroll] = useState(false);

  useEffect(() => {
    fetch("/api/v1/me")
      .then((r) => r.json())
      .then((res) => { if (res.role) setUserRole(res.role); setCanViewPayroll(!!res.canViewPayroll); })
      .catch(() => {});
  }, []);

  function loadEmployee() {
    return fetch(`/api/v1/employees/${id}`)
      .then((r) => r.json())
      .then((res) => setEmployee(res.data))
      .finally(() => setLoading(false));
  }
  useEffect(() => {
    loadEmployee();
  }, [id]);

  if (loading) {
    return (
      <div>
        <PageTitle title="Hồ sơ nhân viên" description="Đang tải..." />
        <div className="flex items-center justify-center py-20 text-[13px]" style={{ color: "var(--ibs-text-dim)" }}>
          Đang tải hồ sơ...
        </div>
      </div>
    );
  }

  if (!employee) {
    return (
      <div>
        <PageTitle title="Không tìm thấy" description="Nhân viên không tồn tại" />
        <div className="flex items-center justify-center py-20 text-[13px]" style={{ color: "var(--ibs-text-dim)" }}>
          Không tìm thấy thông tin nhân viên.
        </div>
      </div>
    );
  }

  const tabs: { key: Tab; label: string; icon: any; count?: number }[] = [
    { key: "info", label: "Thông tin cá nhân", icon: User },
    ...(canViewPayroll ? [{ key: "contracts" as Tab, label: "Hợp đồng", icon: FileText, count: employee.contracts.length }] : []),
    { key: "certificates", label: "Chứng chỉ", icon: Award, count: employee.certificates.length },
    { key: "history", label: "Lịch sử công tác", icon: History, count: employee.workHistory.length },
  ];

  // Quỹ phép năm — chỉ áp dụng cho NV ĐANG LÀM (ACTIVE). NV thử việc chưa có phép năm.
  // Nếu chưa có bản ghi → tính tạm (12 + thâm niên).
  const leaveBalance = employee.status === "ACTIVE"
    ? (employee.leaveBalances?.[0] || (() => {
        const yos = Math.floor((Date.now() - new Date(employee.startDate).getTime()) / (365.25 * 864e5));
        const totalDays = 12 + Math.floor(yos / 5);
        return { year: new Date().getFullYear(), totalDays, usedDays: 0, remainingDays: totalDays };
      })())
    : null;

  return (
    <div>
      {/* Back */}
      <button
        onClick={() => router.push("/ho-so")}
        className="flex items-center gap-1.5 text-[13px] mb-4 transition-colors"
        style={{ color: "var(--ibs-text-dim)" }}
        onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "var(--ibs-accent)")}
        onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "var(--ibs-text-dim)")}
      >
        <ArrowLeft size={14} /> Quay lại danh sách
      </button>

      {/* Header Card */}
      <div
        className="rounded-xl border p-6 mb-5 flex items-start gap-5"
        style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}
      >
        {/* Avatar */}
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center text-[20px] font-bold text-white flex-shrink-0"
          style={{ background: "var(--ibs-accent)" }}
        >
          {getInitials(employee.fullName)}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-1 flex-wrap">
            <h2 className="text-[20px] font-bold">{employee.fullName}</h2>
            <StatusBadge status={employee.status} />
            {!employee.user.isActive && <StatusBadge status="TERMINATED" label="Khóa TK" variant="red" />}
            <button
              onClick={() => setShowEditEmployee(true)}
              className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors"
              style={{ border: "1px solid var(--ibs-border)", color: "var(--ibs-text-muted)" }}
            >
              <Pencil size={12} /> Sửa thông tin
            </button>
          </div>
          <div className="text-[13px] mb-3" style={{ color: "var(--ibs-text-dim)" }}>
            {employee.code} · {employee.department.name} · {employee.jobRole || employee.position.name}
            {employee.team && ` · ${employee.team.name}`}
          </div>
          <div className="flex items-center gap-5 flex-wrap">
            <span className="flex items-center gap-1.5 text-[12px]" style={{ color: "var(--ibs-text-muted)" }}>
              <Mail size={12} /> {employee.user.email}
            </span>
            <span className="flex items-center gap-1.5 text-[12px]" style={{ color: "var(--ibs-text-muted)" }}>
              <Phone size={12} /> {employee.phone}
            </span>
            <span className="flex items-center gap-1.5 text-[12px]" style={{ color: "var(--ibs-text-muted)" }}>
              <Calendar size={12} /> Ngày vào: {formatDate(new Date(employee.startDate))}
            </span>
          </div>
        </div>

        {/* Leave Balance */}
        {leaveBalance && (
          <div
            className="rounded-xl p-4 flex-shrink-0 text-center min-w-[120px]"
            style={{ background: "var(--ibs-bg)", border: "1px solid var(--ibs-border)" }}
          >
            <div className="text-[28px] font-extrabold" style={{ color: "var(--ibs-accent)" }}>
              {leaveBalance.remainingDays}
            </div>
            <div className="text-[11px] font-semibold" style={{ color: "var(--ibs-text-dim)" }}>
              Ngày phép còn
            </div>
            <div className="text-[10px] mt-1" style={{ color: "var(--ibs-text-dim)" }}>
              {leaveBalance.usedDays}/{leaveBalance.totalDays} đã dùng
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b" style={{ borderColor: "var(--ibs-border)" }}>
        {tabs.map((t) => {
          const Icon = t.icon;
          const isActive = activeTab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className="flex items-center gap-2 px-4 py-2.5 text-[13px] font-medium border-b-2 transition-colors"
              style={{
                borderBottomColor: isActive ? "var(--ibs-accent)" : "transparent",
                color: isActive ? "var(--ibs-accent)" : "var(--ibs-text-muted)",
                marginBottom: "-1px",
              }}
            >
              <Icon size={14} />
              {t.label}
              {t.count !== undefined && (
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded-full font-bold"
                  style={{
                    background: isActive ? "rgba(0,180,216,0.15)" : "rgba(100,116,139,0.15)",
                    color: isActive ? "var(--ibs-accent)" : "var(--ibs-text-dim)",
                  }}
                >
                  {t.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Dialogs */}
      {showEditEmployee && employee && (
        <EditEmployeeDialog
          employee={employee}
          userRole={userRole}
          onClose={() => setShowEditEmployee(false)}
          onSuccess={() => {
            loadEmployee();
            setShowEditEmployee(false);
          }}
        />
      )}
      {showAddContract && employee && (
        <AddContractDialog
          employeeId={employee.id}
          onClose={() => setShowAddContract(false)}
          onSuccess={() => {
            setShowAddContract(false);
            loadEmployee(); // refresh chức vụ / bậc thợ / danh sách HĐ
          }}
        />
      )}
      {viewContract && employee && (
        <ViewContractDialog
          employeeId={employee.id}
          contractId={viewContract.id}
          contractNumber={viewContract.number}
          scanUrl={viewContract.fileUrl || null}
          onClose={() => setViewContract(null)}
        />
      )}
      {addendumTarget && employee && (
        <AddendumDialog
          employeeId={employee.id}
          contractId={addendumTarget.id}
          contractNumber={addendumTarget.number}
          onClose={() => setAddendumTarget(null)}
          onCreated={() => { setAddendumTarget(null); loadEmployee(); }}
        />
      )}
      {signAddendum && employee && (
        <SignAddendumDialog
          employeeId={employee.id}
          contractId={signAddendum.contractId}
          addendumId={signAddendum.id}
          addendumNumber={signAddendum.number}
          onClose={() => setSignAddendum(null)}
          onSigned={() => { setSignAddendum(null); loadEmployee(); }}
        />
      )}
      {viewAddendum && employee && (
        <ViewAddendumDialog
          employeeId={employee.id}
          contractId={viewAddendum.contractId}
          addendumId={viewAddendum.id}
          addendumNumber={viewAddendum.number}
          onClose={() => setViewAddendum(null)}
        />
      )}
      {showAddCertificate && employee && (
        <AddCertificateDialog
          employeeId={employee.id}
          onClose={() => setShowAddCertificate(false)}
          onSuccess={(cert) => {
            setEmployee((prev) =>
              prev ? { ...prev, certificates: [cert, ...prev.certificates] } : prev
            );
            setShowAddCertificate(false);
          }}
        />
      )}
      {showDependentForm && employee && (
        <DependentFormDialog
          employeeId={employee.id}
          mode={showDependentForm.mode}
          initial={showDependentForm.mode === "edit" ? showDependentForm.dep : null}
          onClose={() => setShowDependentForm(null)}
          onSaved={(dep, isEdit) => {
            setEmployee((prev) => {
              if (!prev) return prev;
              const list = isEdit
                ? prev.dependentsList.map((x) => (x.id === dep.id ? dep : x))
                : [...prev.dependentsList, dep];
              return { ...prev, dependentsList: list };
            });
            setShowDependentForm(null);
          }}
        />
      )}

      {/* Tab Content */}
      <div
        className="rounded-xl border p-6"
        style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}
      >
        {/* ── Tab: Thông tin cá nhân ── */}
        {activeTab === "info" && (
          <div className="grid grid-cols-2 gap-8">
            <div>
              <h4 className="text-[11px] uppercase tracking-wider font-semibold mb-3" style={{ color: "var(--ibs-text-dim)" }}>
                Thông tin cơ bản
              </h4>
              <InfoRow label="Họ tên đầy đủ" value={employee.fullName} icon={User} />
              <InfoRow label="Mã nhân viên" value={employee.code} icon={CreditCard} />
              <InfoRow label="Giới tính" value={employee.gender === "MALE" ? "Nam" : "Nữ"} />
              <InfoRow label="Ngày sinh" value={formatDate(new Date(employee.dateOfBirth))} icon={Calendar} />
              <InfoRow label="Số CCCD/CMND" value={employee.idNumber} icon={CreditCard} />
              <InfoRow label="Số điện thoại" value={employee.phone} icon={Phone} />
              <InfoRow label="Địa chỉ thường trú" value={employee.address} icon={MapPin} />
              {employee.currentAddress && (
                <InfoRow label="Địa chỉ hiện tại" value={employee.currentAddress} icon={MapPin} />
              )}
            </div>
            <div>
              <h4 className="text-[11px] uppercase tracking-wider font-semibold mb-3" style={{ color: "var(--ibs-text-dim)" }}>
                Thông tin công việc
              </h4>
              <InfoRow label="Phòng ban" value={employee.department.name} icon={Building2} />
              {employee.team && <InfoRow label="Tổ / Đội / Bộ phận" value={employee.team.name} />}
              <InfoRow label="Chức vụ" value={employee.jobRole || employee.position.name} icon={Briefcase} />
              {employee.jobPosition && <InfoRow label="Vị trí công việc" value={employee.jobPosition} />}
              {employee.jobRole === "Công nhân" && employee.skillLevel && (
                <InfoRow label="Cấp bậc" value={employee.skillLevel} />
              )}
              <InfoRow label="Ngày vào làm" value={formatDate(new Date(employee.startDate))} icon={Calendar} />
              {employee.salaryGrade && (
                <InfoRow label="Bậc lương" value={`Bậc ${employee.salaryGrade}`} />
              )}
              {employee.salaryCoefficient && (
                <InfoRow label="Hệ số lương" value={String(employee.salaryCoefficient)} />
              )}
              <InfoRow label="Email hệ thống" value={employee.user.email} icon={Mail} />

              <h4 className="text-[11px] uppercase tracking-wider font-semibold mb-3 mt-6" style={{ color: "var(--ibs-text-dim)" }}>
                Thông tin ngân hàng & BH
              </h4>
              <InfoRow label="Số tài khoản" value={employee.bankAccount} icon={CreditCard} />
              <InfoRow label="Ngân hàng" value={employee.bankName} />
              <InfoRow label="Mã số thuế" value={employee.taxCode} />
              <InfoRow label="Số BHXH" value={employee.insuranceNumber} />

              {/* Người phụ thuộc */}
              <h4 className="text-[11px] uppercase tracking-wider font-semibold mb-3 mt-6 flex items-center justify-between" style={{ color: "var(--ibs-text-dim)" }}>
                <span>Người phụ thuộc ({employee.dependentsList?.length || 0})</span>
                <button
                  onClick={() => setShowDependentForm({ mode: "create" })}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium text-white normal-case"
                  style={{ background: "var(--ibs-accent)" }}
                >
                  <Plus size={11} /> Thêm
                </button>
              </h4>
              {(!employee.dependentsList || employee.dependentsList.length === 0) ? (
                <div className="text-[12px] py-3 px-3 rounded-lg" style={{ background: "var(--ibs-bg)", color: "var(--ibs-text-dim)" }}>
                  Chưa có người phụ thuộc nào
                </div>
              ) : (
                <div className="space-y-2">
                  {employee.dependentsList.map((d) => (
                    <div key={d.id} className="flex items-center justify-between gap-2 p-2 rounded-lg border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)" }}>
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-medium">
                          {d.fullName}
                          <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded font-semibold" style={{ background: "rgba(0,180,216,0.12)", color: "var(--ibs-accent)" }}>{d.relationship}</span>
                        </div>
                        <div className="text-[11px] mt-0.5" style={{ color: "var(--ibs-text-dim)" }}>
                          {d.dateOfBirth && <>Sinh: {formatDate(new Date(d.dateOfBirth))}</>}
                          {d.taxCode && <> · MST: {d.taxCode}</>}
                        </div>
                      </div>
                      <button
                        onClick={() => setShowDependentForm({ mode: "edit", dep: d })}
                        className="p-1.5 rounded-md hover:bg-white/[0.05]"
                        title="Sửa"
                        style={{ color: "var(--ibs-text-dim)" }}
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={async () => {
                          if (!(await confirmDialog({ message: "Xoá người phụ thuộc này?", tone: "danger", confirmText: "Xoá" }))) return;
                          const res = await fetch(`/api/v1/employees/${employee.id}/dependents/${d.id}`, { method: "DELETE" });
                          if (res.ok) {
                            setEmployee((prev) => prev ? { ...prev, dependentsList: prev.dependentsList.filter((x) => x.id !== d.id) } : prev);
                          }
                        }}
                        className="p-1.5 rounded-md hover:bg-white/[0.05]"
                        title="Xoá"
                        style={{ color: "var(--ibs-danger)" }}
                      >
                        <X size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {(employee.emergencyContact || employee.emergencyPhone) && (
                <>
                  <h4 className="text-[11px] uppercase tracking-wider font-semibold mb-3 mt-6" style={{ color: "var(--ibs-text-dim)" }}>
                    Liên hệ khẩn cấp
                  </h4>
                  <InfoRow label="Người liên hệ" value={employee.emergencyContact} icon={User} />
                  <InfoRow label="Số điện thoại" value={employee.emergencyPhone} icon={Phone} />
                </>
              )}
            </div>
          </div>
        )}

        {/* ── Tab: Hợp đồng ── */}
        {activeTab === "contracts" && (
          <div>
            {(() => {
              const current = employee.contracts.find((c) => c.status === "ACTIVE") || null;
              const dLeft = current ? daysUntil(current.endDate) : null;
              // Cho ký HĐ mới khi: chưa có HĐ nào, hoặc không còn HĐ đang hiệu lực,
              // hoặc HĐ hiện tại còn ≤ 45 ngày là hết hạn. HĐ vô thời hạn (dLeft = null) → không gia hạn.
              const canAdd = employee.contracts.length === 0 || !current || (dLeft !== null && dLeft <= 45);
              const reason = !canAdd
                ? (current && dLeft === null
                    ? "HĐ không xác định thời hạn — dùng Ký phụ lục để điều chỉnh"
                    : `Chưa đến hạn ký mới — HĐ hiện tại còn ${dLeft} ngày (chỉ ký mới khi còn ≤ 45 ngày)`)
                : "";
              return (
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-[13px] font-semibold">
                    Danh sách hợp đồng ({employee.contracts.length})
                    {current && dLeft !== null && (
                      <span className="ml-2 font-normal" style={{ color: dLeft <= 45 ? "var(--ibs-warning)" : "var(--ibs-text-dim)" }}>
                        · HĐ hiện tại còn {dLeft} ngày
                      </span>
                    )}
                  </h4>
                  <button
                    onClick={() => canAdd && setShowAddContract(true)}
                    disabled={!canAdd}
                    title={reason}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ background: "var(--ibs-accent)" }}
                  >
                    <Plus size={13} /> Ký hợp đồng mới
                  </button>
                </div>
              );
            })()}
            {employee.contracts.length === 0 ? (
              <div className="text-center py-10 text-[13px]" style={{ color: "var(--ibs-text-dim)" }}>
                Chưa có hợp đồng nào
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      {["Số HĐ", "Loại HĐ", "Vị trí", "Ngày bắt đầu", "Ngày kết thúc", "Lương đóng BHXH", "Phụ cấp", "Tổng thu nhập", "Trạng thái"].map(
                        (h) => (
                          <th
                            key={h}
                            className="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.8px] font-semibold border-b"
                            style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-dim)" }}
                          >
                            {h}
                          </th>
                        )
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {employee.contracts.map((c) => (
                      <tr key={c.id} className="border-b" style={{ borderColor: "rgba(51,65,85,0.5)" }}>
                        <td className="px-4 py-3 text-[13px] font-medium">{c.contractNumber}</td>
                        <td className="px-4 py-3 text-[13px]">{CONTRACT_TYPE_LABELS[c.contractType] || c.contractType}</td>
                        <td className="px-4 py-3 text-[13px]">{employee.jobPosition || c.position || <span style={{ color: "var(--ibs-text-dim)" }}>—</span>}</td>
                        <td className="px-4 py-3 text-[13px]">{formatDate(new Date(c.startDate))}</td>
                        <td className="px-4 py-3 text-[13px]">
                          {c.endDate ? formatDate(new Date(c.endDate)) : <span style={{ color: "var(--ibs-text-dim)" }}>—</span>}
                        </td>
                        <td className="px-4 py-3 text-[13px] font-medium" style={{ color: c.insuranceSalary ? "var(--ibs-accent)" : "var(--ibs-text-dim)" }}>
                          {c.contractType === "PROBATION"
                            ? <span className="text-[11px] italic" style={{ color: "var(--ibs-text-dim)" }}>(Không đóng BHXH khi thử việc)</span>
                            : (c.insuranceSalary ? formatVND(c.insuranceSalary) : "—")}
                        </td>
                        <td className="px-4 py-3 text-[13px] font-medium" style={{ color: c.allowance ? "var(--ibs-warning)" : "var(--ibs-text-dim)" }}>
                          {c.allowance ? formatVND(c.allowance) : "—"}
                        </td>
                        <td className="px-4 py-3 text-[13px] font-semibold" style={{ color: "var(--ibs-success)" }}>
                          {(() => {
                            const tn = c.contractType === "PROBATION" ? c.baseSalary : (c.insuranceSalary ?? 0) + (c.allowance ?? 0);
                            return tn > 0 ? formatVND(tn) : <span style={{ color: "var(--ibs-text-dim)" }}>—</span>;
                          })()}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2 flex-wrap">
                            <StatusBadge status={c.status} />
                            <button onClick={() => setViewContract({ id: c.id, number: c.contractNumber, fileUrl: c.fileUrl })} className="text-[11px] font-medium underline" style={{ color: "var(--ibs-accent)" }}>Xem</button>
                            {c.fileUrl && <span title="HĐ này có bản scan đính kèm" style={{ color: "var(--ibs-success)" }}>📎</span>}
                            {c.status === "ACTIVE" && (
                              <button onClick={() => setAddendumTarget({ id: c.id, number: c.contractNumber })} className="text-[11px] font-medium underline" style={{ color: "#8b5cf6" }}>+ Phụ lục</button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Phụ lục hợp đồng — danh sách + actions */}
            {(() => {
              const all = employee.contracts.flatMap((c) => (c.addendums || []).map((a) => ({ ...a, contract: c })));
              if (all.length === 0) return null;
              return (
                <div className="mt-4 rounded-xl border" style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
                  <div className="px-4 py-3 border-b text-[13px] font-semibold" style={{ borderColor: "var(--ibs-border)" }}>
                    📎 Phụ lục hợp đồng ({all.length})
                  </div>
                  <div className="divide-y" style={{ borderColor: "var(--ibs-border)" }}>
                    {all.map((a) => {
                      const st = a.status;
                      const badge = st === "SIGNED" ? { c: "#10b981", bg: "rgba(16,185,129,0.1)", label: "Đã ký" }
                        : st === "APPROVED" ? { c: "var(--ibs-accent)", bg: "rgba(0,180,216,0.1)", label: "Đã duyệt — chờ ký" }
                        : st === "REJECTED" ? { c: "var(--ibs-danger)", bg: "rgba(220,38,38,0.1)", label: "Từ chối" }
                        : { c: "var(--ibs-warning)", bg: "rgba(234,179,8,0.1)", label: "Chờ duyệt" };
                      const changes: string[] = [];
                      if (a.newJobRole) changes.push(`Chức vụ → ${a.newJobRole}`);
                      if (a.newJobPosition) changes.push(`Vị trí → ${a.newJobPosition}`);
                      if (a.newBaseSalary) changes.push(`Lương CB → ${formatVND(a.newBaseSalary)}`);
                      if (a.newFarAllowance != null) changes.push(`PC nhà xa → ${formatVND(a.newFarAllowance)}`);
                      if (a.newKpi != null) changes.push(`PC KPI → ${formatVND(a.newKpi)}`);
                      if (a.newPositionAllowance != null) changes.push(`PC chức vụ → ${formatVND(a.newPositionAllowance)}`);
                      return (
                        <div key={a.id} className="px-4 py-3 flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-[13px] font-medium">
                              {a.addendumNumber}
                              <span className="ml-2 text-[11px] font-normal" style={{ color: "var(--ibs-text-dim)" }}>HĐ gốc: {a.contract.contractNumber} · Hiệu lực: {formatDate(new Date(a.effectiveDate))}</span>
                            </div>
                            <div className="text-[12px] mt-0.5" style={{ color: "var(--ibs-text-muted)" }}>{changes.join(" · ") || "—"}</div>
                            {a.rejectedReason && <div className="text-[11px] mt-0.5" style={{ color: "var(--ibs-danger)" }}>Lý do từ chối: {a.rejectedReason}</div>}
                            {a.fileUrl && <a href={a.fileUrl} target="_blank" rel="noreferrer" className="text-[11px] underline" style={{ color: "var(--ibs-accent)" }}>📎 Xem bản scan đã ký</a>}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded" style={{ color: badge.c, background: badge.bg }}>{badge.label}</span>
                            <button onClick={() => setViewAddendum({ id: a.id, number: a.addendumNumber, contractId: a.contract.id })} className="text-[11px] font-medium underline" style={{ color: "var(--ibs-accent)" }}>Xem</button>
                            {st === "PENDING_APPROVAL" && (
                              <>
                                <button onClick={async () => {
                                  const res = await fetch(`/api/v1/employees/${employee.id}/contracts/${a.contract.id}/addendums/${a.id}/approve`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "APPROVE" }) });
                                  if (res.ok) loadEmployee(); else { const d = await res.json(); await alertDialog("Lỗi: " + apiError(res.status, d.error)); }
                                }} className="text-[11px] px-2 py-0.5 rounded font-semibold text-white" style={{ background: "#10b981" }}>Duyệt</button>
                                <button onClick={async () => {
                                  if (!(await confirmDialog({ message: "Từ chối phụ lục này?", tone: "danger", confirmText: "Từ chối" }))) return;
                                  const res = await fetch(`/api/v1/employees/${employee.id}/contracts/${a.contract.id}/addendums/${a.id}/approve`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "REJECT" }) });
                                  if (res.ok) loadEmployee(); else { const d = await res.json(); await alertDialog("Lỗi: " + apiError(res.status, d.error)); }
                                }} className="text-[11px] px-2 py-0.5 rounded font-semibold" style={{ background: "rgba(220,38,38,0.1)", color: "var(--ibs-danger)" }}>Từ chối</button>
                              </>
                            )}
                            {st === "APPROVED" && (
                              <button onClick={() => setSignAddendum({ id: a.id, number: a.addendumNumber, contractId: a.contract.id })} className="text-[11px] px-2 py-0.5 rounded font-semibold text-white" style={{ background: "var(--ibs-accent)" }}>Xác nhận đã ký</button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* ── Tab: Chứng chỉ ── */}
        {activeTab === "certificates" && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-[13px] font-semibold">
                Danh sách chứng chỉ / bằng cấp ({employee.certificates.length})
              </h4>
              <button
                onClick={() => setShowAddCertificate(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium text-white transition-colors"
                style={{ background: "var(--ibs-accent)" }}
              >
                <Plus size={13} /> Thêm chứng chỉ
              </button>
            </div>
            {employee.certificates.length === 0 ? (
              <div className="text-center py-10 text-[13px]" style={{ color: "var(--ibs-text-dim)" }}>
                Chưa có chứng chỉ nào
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      {["Tên chứng chỉ", "Cơ quan cấp", "Ngày cấp", "Ngày hết hạn", "Trạng thái"].map((h) => (
                        <th
                          key={h}
                          className="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.8px] font-semibold border-b"
                          style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-dim)" }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {employee.certificates.map((cert) => (
                      <tr key={cert.id} className="border-b" style={{ borderColor: "rgba(51,65,85,0.5)" }}>
                        <td className="px-4 py-3 text-[13px] font-medium">{cert.name}</td>
                        <td className="px-4 py-3 text-[13px]" style={{ color: "var(--ibs-text-muted)" }}>{cert.issuer}</td>
                        <td className="px-4 py-3 text-[13px]">{formatDate(new Date(cert.issueDate))}</td>
                        <td className="px-4 py-3 text-[13px]">
                          {cert.expiryDate ? (
                            <span
                              style={{
                                color:
                                  cert.status === "EXPIRED"
                                    ? "var(--ibs-danger)"
                                    : cert.status === "EXPIRING_SOON"
                                    ? "var(--ibs-warning)"
                                    : undefined,
                              }}
                            >
                              {formatDate(new Date(cert.expiryDate))}
                            </span>
                          ) : (
                            <span style={{ color: "var(--ibs-text-dim)" }}>Vĩnh viễn</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={cert.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── Tab: Lịch sử công tác ── */}
        {activeTab === "history" && (
          <div className="relative">
            {employee.workHistory.length === 0 ? (
              <div className="text-center py-10 text-[13px]" style={{ color: "var(--ibs-text-dim)" }}>
                Chưa có lịch sử công tác
              </div>
            ) : (
              <div className="space-y-4">
                {employee.workHistory.map((h, i) => (
                  <div key={h.id} className="flex gap-4">
                    {/* Timeline dot */}
                    <div className="flex flex-col items-center">
                      <div
                        className="w-3 h-3 rounded-full mt-1 flex-shrink-0"
                        style={{ background: i === 0 ? "var(--ibs-accent)" : "var(--ibs-border)" }}
                      />
                      {i < employee.workHistory.length - 1 && (
                        <div className="w-px flex-1 mt-1" style={{ background: "var(--ibs-border)" }} />
                      )}
                    </div>
                    {/* Content */}
                    <div className="pb-4 flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span
                          className="text-[11px] font-semibold px-2 py-0.5 rounded"
                          style={{ background: "rgba(0,180,216,0.1)", color: "var(--ibs-accent)" }}
                        >
                          {WORK_EVENT_LABELS[h.eventType] || h.eventType}
                        </span>
                        <span className="text-[12px]" style={{ color: "var(--ibs-text-dim)" }}>
                          {formatDate(new Date(h.effectiveDate))}
                        </span>
                        {h.decisionNumber && (
                          <span className="text-[11px]" style={{ color: "var(--ibs-text-dim)" }}>
                            · QĐ: {h.decisionNumber}
                          </span>
                        )}
                      </div>
                      {(h.toDepartment || h.toPosition) && (
                        <div className="text-[13px] font-medium mb-0.5">
                          {h.toDepartment && <span>{h.toDepartment}</span>}
                          {h.toDepartment && h.toPosition && <span className="mx-1.5" style={{ color: "var(--ibs-text-dim)" }}>·</span>}
                          {h.toPosition && <span>{h.toPosition}</span>}
                        </div>
                      )}
                      {h.note && (
                        <div className="text-[12px]" style={{ color: "var(--ibs-text-muted)" }}>
                          {h.note}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ============== DEPENDENT FORM DIALOG ==============
const RELATIONSHIP_OPTIONS = ["Con", "Bố", "Mẹ", "Vợ", "Chồng", "Anh", "Chị", "Em", "Khác"];

function DependentFormDialog({
  employeeId,
  mode,
  initial,
  onClose,
  onSaved,
}: {
  employeeId: string;
  mode: "create" | "edit";
  initial: any;
  onClose: () => void;
  onSaved: (dep: any, isEdit: boolean) => void;
}) {
  const [form, setForm] = useState({
    fullName: initial?.fullName || "",
    relationship: initial?.relationship || "Con",
    dateOfBirth: initial?.dateOfBirth ? String(initial.dateOfBirth).slice(0, 10) : "",
    taxCode: initial?.taxCode || "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const body: any = {
        fullName: form.fullName.trim(),
        relationship: form.relationship,
      };
      if (form.dateOfBirth) body.dateOfBirth = new Date(form.dateOfBirth).toISOString();
      if (form.taxCode.trim()) body.taxCode = form.taxCode.trim();

      const url = mode === "edit"
        ? `/api/v1/employees/${employeeId}/dependents/${initial.id}`
        : `/api/v1/employees/${employeeId}/dependents`;
      const res = await fetch(url, {
        method: mode === "edit" ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(apiError(res.status, json?.error));
        return;
      }
      onSaved(json.data, mode === "edit");
    } catch {
      setError("Lỗi kết nối");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.7)" }}>
      <div className="w-full max-w-[460px] rounded-xl border shadow-2xl"
        style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "var(--ibs-border)" }}>
          <h3 className="text-[15px] font-semibold">
            {mode === "edit" ? "Sửa người phụ thuộc" : "Thêm người phụ thuộc"}
          </h3>
          <button onClick={onClose} style={{ color: "var(--ibs-text-dim)" }}><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="text-[13px] px-3 py-2 rounded-lg" style={{ background: "rgba(239,68,68,0.1)", color: "var(--ibs-danger)" }}>
              {error}
            </div>
          )}

          <div>
            <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--ibs-text-muted)" }}>Họ tên NPT *</label>
            <input
              required
              value={form.fullName}
              onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
              placeholder="VD: Nguyễn Văn A"
              className="w-full px-3 py-2 rounded-lg text-[13px] outline-none"
              style={{ background: "var(--ibs-bg)", border: "1px solid var(--ibs-border)", color: "var(--ibs-text)" }}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--ibs-text-muted)" }}>Quan hệ *</label>
              <select
                required
                value={form.relationship}
                onChange={(e) => setForm((f) => ({ ...f, relationship: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg text-[13px] outline-none"
                style={{ background: "var(--ibs-bg)", border: "1px solid var(--ibs-border)", color: "var(--ibs-text)" }}
              >
                {RELATIONSHIP_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--ibs-text-muted)" }}>Ngày sinh</label>
              <DateInput
                value={form.dateOfBirth}
                onChange={(e) => setForm((f) => ({ ...f, dateOfBirth: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg text-[13px] outline-none"
                style={{ background: "var(--ibs-bg)", border: "1px solid var(--ibs-border)", color: "var(--ibs-text)" }}
              />
            </div>
          </div>

          <div>
            <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--ibs-text-muted)" }}>MST người phụ thuộc</label>
            <input
              value={form.taxCode}
              onChange={(e) => setForm((f) => ({ ...f, taxCode: e.target.value }))}
              placeholder="VD: 8123456789"
              className="w-full px-3 py-2 rounded-lg text-[13px] outline-none"
              style={{ background: "var(--ibs-bg)", border: "1px solid var(--ibs-border)", color: "var(--ibs-text)" }}
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2 rounded-lg text-[13px] font-medium"
              style={{ border: "1px solid var(--ibs-border)", color: "var(--ibs-text-muted)" }}>
              Hủy
            </button>
            <button type="submit" disabled={saving} className="flex-1 py-2 rounded-lg text-[13px] font-medium text-white"
              style={{ background: "var(--ibs-accent)", opacity: saving ? 0.6 : 1 }}>
              {saving ? "Đang lưu..." : (mode === "edit" ? "Cập nhật" : "Thêm")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
