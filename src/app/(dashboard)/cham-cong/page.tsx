"use client";

import { useState, useEffect, useMemo, Fragment, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { PageTitle } from "@/components/layout/page-title";
import { StatusBadge } from "@/components/shared/status-badge";
import { DataTable, Column } from "@/components/shared/data-table";
import { formatDate, apiError } from "@/lib/utils";
import { parseLeaveCode, isLeaveToken } from "@/lib/attendance-codes";
import { ChevronLeft, ChevronRight, Plus, Check, X, RefreshCw, CalendarDays, Clock, Download, Upload } from "lucide-react";
import { usePermission } from "@/hooks/use-permission";
import { DateInput, TimeInput } from "@/components/shared/date-input";

// Chọn ĐÚNG sheet chứa bảng công khi file có nhiều sheet (vd file Trực tiếp có sheet đầu "foxz" rỗng,
// dữ liệu thật ở sheet "TH công"). Tiêu chí: sheet có hàng header ≥20 cột ngày (1-31 hoặc Excel serial)
// VÀ nhiều dòng mã NV nhất. Tránh nhầm sheet "Khuôn mặt"/"Hàng ngày" (1 dòng/ngày, không có header cột ngày).
function pickAttendanceSheet(XLSX: any, wb: any, year: number, month: number): unknown[][] {
  const codeOfRow = (r: any[]): boolean => {
    const c0 = String(r?.[0] ?? "").trim(), c1 = String(r?.[1] ?? "").trim(), c2 = String(r?.[2] ?? "").trim();
    return (/^\d{4,}$/.test(c0) && !!c1) || (/^\d{1,3}$/.test(c0) && /^\d{4,}$/.test(c1) && !!c2) || (!c0 && /^\d{4,}$/.test(c1) && !!c2);
  };
  const hasDayHeader = (rows: any[][]): boolean => {
    for (let i = 0; i < Math.min(rows.length, 15); i++) {
      const r = rows[i] || []; let n = 0;
      for (const cell of r) {
        const v = Number(cell);
        if (Number.isFinite(v) && v >= 1 && v <= 31 && Number.isInteger(v)) n++;
        else if (Number.isFinite(v) && v >= 40000 && v <= 60000) {
          const dt = new Date(Math.round((v - 25569) * 86400 * 1000));
          if (dt.getUTCFullYear() === year && dt.getUTCMonth() === month - 1) n++;
        }
      }
      if (n >= 20) return true;
    }
    return false;
  };
  let bestRows: unknown[][] = [], bestScore = -1;
  for (const sn of wb.SheetNames as string[]) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: "" }) as any[][];
    if (!hasDayHeader(rows)) continue;
    const nv = rows.reduce((s, r) => s + (codeOfRow(r) ? 1 : 0), 0);
    if (nv > bestScore) { bestScore = nv; bestRows = rows; }
  }
  // Fallback: nếu không sheet nào có header cột ngày → dùng sheet đầu (giữ hành vi cũ)
  if (bestScore < 0) return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "" }) as unknown[][];
  return bestRows;
}

type LeaveRequest = {
  id: string; leaveType: string; startDate: string; endDate: string;
  totalDays: number; reason: string; status: string;
  employee: { code: string; fullName: string; department: { name: string } };
};
type OTRequest = {
  id: string; date: string; startTime: string; endTime: string;
  hours: number; reason: string; status: string; otRate: number;
  employee: { code: string; fullName: string; department: { name: string } };
};
type AttendanceSummary = { departmentId: string; departmentName: string; present: number; total: number; rate: number };
type AttendanceRecord = {
  id: string; date: string; status: string; checkIn?: string; checkOut?: string;
  workHours: number; otHours: number; note?: string;
  employee: { code: string; fullName: string; teamId: string | null; department: { name: string }; position: { level: string } | null };
};

const LEAVE_TYPE_LABELS: Record<string, string> = {
  ANNUAL: "Phép năm", SICK: "Nghỉ ốm", PERSONAL: "Việc cá nhân",
  WEDDING: "Cưới", FUNERAL: "Tang", MATERNITY: "Thai sản", PATERNITY: "Nghỉ bố", UNPAID: "Không lương",
};
const ATTENDANCE_SYMBOL: Record<string, { symbol: string; color: string }> = {
  PRESENT:           { symbol: "P",  color: "var(--ibs-success)" },
  ABSENT_APPROVED:   { symbol: "NP", color: "var(--ibs-accent)" },
  ABSENT_UNAPPROVED: { symbol: "NK", color: "var(--ibs-danger)" },
  LATE:              { symbol: "M",  color: "var(--ibs-warning)" },
  BUSINESS_TRIP:     { symbol: "CT", color: "var(--ibs-accent)" },
  HALF_DAY:          { symbol: "½",  color: "var(--ibs-warning)" },
};

type Tab = "attendance" | "grid" | "leave" | "ot";
type GridEmployee = { code: string; fullName: string; dept: string; teamId: string | null; positionLevel: string; days: Record<number, AttendanceRecord> };

const POSITION_ORDER: Record<string, number> = { C_LEVEL: 0, MANAGER: 1, TEAM_LEAD: 2, SPECIALIST: 3, WORKER: 4 };

// ── Office Attendance Card (Khối Gián tiếp — hours-based, matches Excel template) ──
function OfficeAttendanceCard({
  employees, daysInMonth, month, year, onRefresh, canImport,
}: {
  employees: GridEmployee[];
  daysInMonth: number; month: number; year: number;
  onRefresh: () => void;
  canImport: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const days = useMemo(() => Array.from({ length: daysInMonth }, (_, i) => i + 1), [daysInMonth]);
  const dowOf = (d: number) => new Date(year, month - 1, d).getDay();
  const isSun = (d: number) => dowOf(d) === 0;
  const isSat = (d: number) => dowOf(d) === 6;

  function getSummary(emp: GridEmployee) {
    let regular = 0, ot = 0, sunday = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      const rec = emp.days[d];
      if (!rec) continue;
      const wh = rec.workHours || 0;
      const oh = rec.otHours || 0;
      if (isSun(d)) { sunday += wh + oh; }
      else { regular += wh; ot += oh; }
    }
    return { regular, ot, sunday, total: +(regular + ot + sunday).toFixed(1) };
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true); setImportMsg(null);
    try {
      const XLSX = await import("xlsx");
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data, { type: "array" });
      const rows: unknown[][] = pickAttendanceSheet(XLSX, wb, year, month);

      type Rec = { employeeCode: string; date: string; workHours: number; otHours: number; nightHours: number; otNightHours: number; paidLeaveDays?: number; leaveCode?: string | null };
      const records: Rec[] = [];

      // Step 1: Find the header row mapping day → column index.
      const dayColMap = new Map<number, number>(); // day (1-31) → column index
      // 1a) Row chứa số ngày 1-31 trực tiếp
      for (let i = 0; i < Math.min(rows.length, 15); i++) {
        const r = rows[i] as unknown[];
        const found = new Map<number, number>();
        for (let c = 0; c < r.length; c++) {
          const v = Number(r[c]);
          if (Number.isFinite(v) && v >= 1 && v <= 31 && Number.isInteger(v)) found.set(v, c);
        }
        if (found.size >= 20) { found.forEach((c, d) => dayColMap.set(d, c)); break; }
      }
      // 1b) Row chứa Excel date serial (vd 46113 = ngày trong tháng) → convert sang day
      if (dayColMap.size === 0) {
        for (let i = 0; i < Math.min(rows.length, 15); i++) {
          const r = rows[i] as unknown[];
          const found = new Map<number, number>();
          for (let c = 0; c < r.length; c++) {
            const v = Number(r[c]);
            if (Number.isFinite(v) && v >= 40000 && v <= 60000) {
              const dt = new Date(Math.round((v - 25569) * 86400 * 1000));
              if (dt.getUTCFullYear() === year && dt.getUTCMonth() === month - 1) {
                found.set(dt.getUTCDate(), c);
              }
            }
          }
          if (found.size >= 20) { found.forEach((c, d) => dayColMap.set(d, c)); break; }
        }
      }
      // 1c) Fallback: day d ở col[2+d] (code, name, dept, day1...)
      if (dayColMap.size === 0) for (let d = 1; d <= 31; d++) dayColMap.set(d, 2 + d);


      // Step 2: Each employee occupies a BLOCK of consecutive rows:
      //   - work row (first): cột ngày = giờ công hành chính
      //   - OT row (tuỳ chọn): cột ngày = giờ tăng ca
      //   - dòng trống đệm (tuỳ chọn): cột ngày để trống
      // Một dòng bắt đầu NV MỚI chỉ khi khớp pattern mã NV bên dưới; mọi dòng khác
      // được coi là dòng nối tiếp của NV hiện tại (gián tiếp có 3 dòng/NV, trực tiếp 2 dòng/NV).
      const codeOfRow = (r: unknown[] | undefined): string | null => {
        const c0 = String(r?.[0] ?? "").trim();
        const c1 = String(r?.[1] ?? "").trim();
        const c2 = String(r?.[2] ?? "").trim();
        if (/^\d{4,}$/.test(c0) && c1) return c0;                        // col0 = mã NV (trực tiếp)
        if (/^\d{1,3}$/.test(c0) && /^\d{4,}$/.test(c1) && c2) return c1; // col0 = STT, col1 = mã NV
        if (!c0 && /^\d{4,}$/.test(c1) && c2) return c1;                 // col0 trống, col1 = mã NV (gián tiếp VP)
        return null;
      };

      // Chuẩn hoá text 1 ô (bỏ dấu, đ→d, gộp khoảng trắng) để khớp nhãn dòng.
      const norm = (v: unknown) => String(v ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/\s+/g, " ").trim();
      // Nhãn dòng (file MỚI) → loại ca. HC N / HC Đ / Thêm giờ N / Thêm giờ Đ / Khác. null = không có nhãn mới.
      const shiftOf = (r: unknown[]): "dayWork" | "nightWork" | "otDay" | "otNight" | "leave" | null => {
        for (let c = 0; c < r.length; c++) {
          const s = norm(r[c]);
          if (!s) continue;
          if (/^hc ?n$/.test(s)) return "dayWork";
          if (/^hc ?d$/.test(s)) return "nightWork";
          if (/^khac$/.test(s)) return "leave";
          if (/them ?gi/.test(s)) return /d$|dem/.test(s) ? "otNight" : "otDay";
        }
        return null;
      };
      // Lấy SỐ thuần ở 1 ô (tránh "0.5AL"/"L" — mã nghỉ, không phải giờ).
      const numAt = (r: unknown[] | undefined, col: number) => {
        const s = String(r?.[col] ?? "").trim();
        return /^-?\d+(\.\d+)?$/.test(s) ? parseFloat(s) : 0;
      };

      for (let i = 0; i < rows.length; i++) {
        const code = codeOfRow(rows[i] as unknown[]);
        if (!code) continue;

        // Gom TOÀN BỘ block của NV (mọi dòng cùng mã, hoặc dòng nối tiếp không mã NHƯNG có nội dung).
        const block: unknown[][] = [rows[i] as unknown[]];
        let j = i + 1;
        for (; j < rows.length; j++) {
          const r = rows[j] as unknown[];
          const nextCode = codeOfRow(r);
          if (nextCode && nextCode !== code) break; // KHÁC NV → dừng.
          if (!nextCode) {
            // Dòng không mã: chỉ gom nếu CÓ nội dung (nhãn ca / số giờ / mã nghỉ). Dòng trống/footer → dừng.
            let hasContent = shiftOf(r) !== null;
            if (!hasContent) dayColMap.forEach((c) => { if (numAt(r, c) > 0 || isLeaveToken((r as any)?.[c])) hasContent = true; });
            if (!hasContent) break;
          }
          block.push(r);
        }
        i = j - 1; // bỏ qua cả block

        // Phân loại dòng theo NHÃN (file mới: 5 dòng).
        let dayRow: unknown[] | undefined, nightRow: unknown[] | undefined, otDayRow: unknown[] | undefined,
          otNightRow: unknown[] | undefined, leaveRow: unknown[] | undefined;
        let hasNewLabels = false;
        for (const r of block) {
          const t = shiftOf(r);
          if (!t) continue;
          hasNewLabels = true;
          if (t === "dayWork" && !dayRow) dayRow = r;
          else if (t === "nightWork" && !nightRow) nightRow = r;
          else if (t === "otDay" && !otDayRow) otDayRow = r;
          else if (t === "otNight" && !otNightRow) otNightRow = r;
          else if (t === "leave" && !leaveRow) leaveRow = r;
        }

        if (!hasNewLabels) {
          // FILE CŨ: dòng đầu = công ngày; OT = dòng có nhãn "Thêm giờ" (col 40) hoặc dòng đầu có số; nghỉ = dòng có mã.
          dayRow = block[0];
          for (const r of block.slice(1)) { if (norm(r[40]).includes("them gi")) { otDayRow = r; break; } }
          if (!otDayRow) for (const r of block.slice(1)) {
            let hasData = false; dayColMap.forEach((c) => { if (numAt(r, c) > 0) hasData = true; });
            if (hasData) { otDayRow = r; break; }
          }
          for (const r of block) {
            if (r === otDayRow) continue;
            let hasLeave = false; dayColMap.forEach((c) => { if (isLeaveToken((r as any)?.[c])) hasLeave = true; });
            if (hasLeave) { leaveRow = r; break; }
          }
        } else if (!leaveRow) {
          // File mới nhưng dòng "Khác" chưa bắt được qua nhãn → dò theo mã nghỉ.
          for (const r of block) {
            let hasLeave = false; dayColMap.forEach((c) => { if (isLeaveToken((r as any)?.[c])) hasLeave = true; });
            if (hasLeave) { leaveRow = r; break; }
          }
        }
        if (!dayRow) dayRow = block[0];

        dayColMap.forEach((colIdx, d) => {
          const wh = numAt(dayRow, colIdx);          // HC N
          const nh = numAt(nightRow, colIdx);        // HC Đ
          const oh = numAt(otDayRow, colIdx);        // Thêm giờ N
          const onh = numAt(otNightRow, colIdx);     // Thêm giờ Đ
          const lv = parseLeaveCode(leaveRow?.[colIdx]); // Khác
          if (wh === 0 && nh === 0 && oh === 0 && onh === 0 && lv.paidLeaveDays === 0 && !lv.code) return;
          const dt = new Date(year, month - 1, d);
          if (dt.getMonth() !== month - 1) return;
          records.push({ employeeCode: code, date: `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`, workHours: wh, otHours: oh, nightHours: nh, otNightHours: onh, paidLeaveDays: lv.paidLeaveDays, leaveCode: lv.code });
        });
      }

      if (records.length === 0) {
        setImportMsg({ ok: false, text: `Không tìm thấy dữ liệu hợp lệ. File có ${rows.length} dòng. Kiểm tra Console (F12) để xem cấu trúc.` });
        return;
      }

      // Defensive: chặn record có giờ làm bất thường (1 ngày max 24h).
      // Lỗi này thường do parse Excel nhầm cột (mã NV / Excel-date-serial → workHours).
      const badRecords = records.filter((r) => [r.workHours, r.otHours, r.nightHours, r.otNightHours].some((v) => v < 0 || v > 24));
      if (badRecords.length > 0) {
        const sample = badRecords.slice(0, 3).map((r) => `${r.employeeCode} ${r.date} (work=${r.workHours}, ot=${r.otHours})`).join("; ");
        setImportMsg({ ok: false, text: `Phát hiện ${badRecords.length}/${records.length} dòng có giờ làm bất thường (>24h). File có thể bị nhầm cột. Mẫu: ${sample}` });
        return;
      }

      const res = await fetch("/api/v1/attendance/import-office", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month, year, records }),
      });
      const result = await res.json();
      if (res.ok) {
        setImportMsg({ ok: true, text: `✓ Đã import ${result.created} bản ghi${result.skipped ? `. Bỏ qua ${result.skipped} bản ghi (${result.missingCodes?.length ?? 0} mã NV không tìm thấy).` : "."}` });
        // Delay refresh so user sees the message
        setTimeout(() => onRefresh(), 1500);
      } else {
        setImportMsg({ ok: false, text: apiError(res.status, result.error) });
      }
    } catch (err) {
      setImportMsg({ ok: false, text: "Lỗi đọc file: " + String(err) });
    } finally { setImporting(false); e.target.value = ""; }
  }

  async function handleExport() {
    const { default: ExcelJS } = await import("exceljs");
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(`T${String(month).padStart(2,"0")}-${year}-GIÁN TIẾP VP`);
    const DOW_LABELS = ["CN","T2","T3","T4","T5","T6","T7"];
    const hdr1 = ["Mã số","Họ Và Tên","Tên tổ", ...days.map(d => DOW_LABELS[dowOf(d)]), "Công thường","Công làm thêm ngày thường","Công làm chủ nhật","Tổng công"];
    const hdr2 = ["","","", ...days.map(d => String(d).padStart(2,"0")), "","","",""];
    ws.addRow(hdr1); ws.addRow(hdr2); ws.getRow(1).font = { bold: true };
    employees.forEach(emp => {
      const s = getSummary(emp);
      const r1: (string|number)[] = [emp.code, emp.fullName, emp.dept || ""];
      const r2: (string|number)[] = ["","","Thêm giờ"];
      days.forEach(d => {
        const rec = emp.days[d];
        r1.push(rec?.workHours && rec.workHours > 0 ? rec.workHours : "");
        r2.push(rec?.otHours && rec.otHours > 0 ? rec.otHours : "");
      });
      r1.push(s.regular, s.ot, s.sunday, s.total);
      r2.push("", s.ot, "", "");
      ws.addRow(r1); ws.addRow(r2); ws.addRow([]);
    });
    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `bang-cong-T${month}-${year}-gian-tiep.xlsx`;
    a.click(); URL.revokeObjectURL(url);
  }

  const BD = "rgba(51,65,85,0.4)";
  const thS = { borderColor: "var(--ibs-border)", color: "var(--ibs-text-dim)" };

  return (
    <div className="rounded-xl border" style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
      <div className="px-5 py-4 flex justify-between items-center" style={{ borderBottom: open ? `1px solid var(--ibs-border)` : undefined }}>
        <button className="flex items-center gap-2 flex-1 text-left" onClick={() => setOpen(o => !o)}>
          <span className="text-lg">🏢</span>
          <div>
            <h3 className="text-sm font-semibold">Khối Gián tiếp</h3>
            <p className="text-[11px]" style={{ color: "var(--ibs-text-dim)" }}>Văn phòng</p>
          </div>
          <span className="ml-2 px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ background: "rgba(0,180,216,0.12)", color: "var(--ibs-accent)" }}>
            {employees.length} người
          </span>
          <ChevronRight size={14} className="ml-1 transition-transform" style={{ color: "var(--ibs-text-dim)", transform: open ? "rotate(90deg)" : "rotate(0deg)" }} />
        </button>
        <div className="flex gap-2 ml-4">
          {canImport && (
            <label className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] border cursor-pointer${importing ? " opacity-50 pointer-events-none" : ""}`}
              style={{ borderColor: "var(--ibs-accent)", color: "var(--ibs-accent)" }}>
              <Upload size={12} /> {importing ? "Đang xử lý..." : "Import Excel"}
              <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImport} disabled={importing} />
            </label>
          )}
          <button onClick={handleExport} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] border"
            style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-muted)" }}>
            <Download size={12} /> Export Excel
          </button>
        </div>
      </div>

      {importMsg && (
        <div className="mx-4 mt-3 px-3 py-2 rounded-lg text-[12px] flex items-center justify-between"
          style={{ background: importMsg.ok ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)", color: importMsg.ok ? "var(--ibs-success)" : "var(--ibs-danger)" }}>
          {importMsg.text}
          <button onClick={() => setImportMsg(null)} className="ml-3 opacity-60 hover:opacity-100">✕</button>
        </div>
      )}

      {open && <div className="p-4 overflow-x-auto">
          <table className="border-collapse text-[11px]">
            <thead>
              <tr>
                <th className="px-1 py-2 text-center font-semibold border-r border-b" style={{ ...thS, minWidth: "28px" }}>STT</th>
                <th className="px-2 py-2 text-left font-semibold border-r border-b whitespace-nowrap" style={{ ...thS, minWidth: "60px" }}>Mã NV</th>
                <th className="sticky left-0 px-3 py-2 text-left font-semibold border-r border-b whitespace-nowrap" style={{ ...thS, background: "var(--ibs-bg-card)", minWidth: "130px" }}>Họ tên</th>
                <th className="px-2 py-2 font-semibold border-r border-b whitespace-nowrap" style={thS}>Bộ phận</th>
                {days.map(d => (
                  <th key={d} className="w-7 py-2 font-semibold border-r border-b text-center"
                    style={{ borderColor: "var(--ibs-border)", color: isSun(d) ? "var(--ibs-danger)" : isSat(d) ? "var(--ibs-warning)" : "var(--ibs-text-dim)" }}>
                    {d}
                  </th>
                ))}
                <th className="px-2 py-2 font-semibold border-r border-b whitespace-nowrap text-center" style={{ ...thS, color: "var(--ibs-success)" }}>Công TH</th>
                <th className="px-2 py-2 font-semibold border-r border-b whitespace-nowrap text-center" style={{ ...thS, color: "var(--ibs-warning)" }}>Thêm giờ</th>
                <th className="px-2 py-2 font-semibold border-r border-b whitespace-nowrap text-center" style={{ ...thS, color: "var(--ibs-danger)" }}>Công CN</th>
                <th className="px-2 py-2 font-semibold border-b whitespace-nowrap text-center" style={{ ...thS, color: "var(--ibs-accent)" }}>Tổng</th>
              </tr>
            </thead>
            <tbody>
              {employees.length === 0 ? (
                <tr>
                  <td colSpan={4 + daysInMonth + 4} className="py-10 text-center border-b" style={{ borderColor: BD, color: "var(--ibs-text-dim)" }}>
                    <p className="text-[13px]">Chưa có dữ liệu — Import Excel để bắt đầu nhập liệu</p>
                  </td>
                </tr>
              ) : null}
              {employees.map((emp, i) => {
                const s = getSummary(emp);
                return (
                  <Fragment key={emp.code}>
                    <tr>
                      <td className="px-1 py-1.5 border-r border-b text-center" style={{ borderColor: BD, color: "var(--ibs-text-dim)" }}>{i + 1}</td>
                      <td className="px-2 py-1.5 border-r border-b font-mono" style={{ borderColor: BD, color: "var(--ibs-text-muted)", fontSize: "10px" }}>{emp.code}</td>
                      <td className="sticky left-0 px-3 py-1.5 border-r border-b whitespace-nowrap font-medium" style={{ background: "var(--ibs-bg-card)", borderColor: BD }}>{emp.fullName}</td>
                      <td className="px-2 py-1.5 border-r border-b whitespace-nowrap text-center" style={{ borderColor: BD, color: "var(--ibs-text-dim)" }}>{emp.dept}</td>
                      {days.map(d => {
                        const rec = emp.days[d];
                        const wh = rec?.workHours;
                        const sun = isSun(d); const sat = isSat(d);
                        return (
                          <td key={d} className="w-7 py-1.5 border-r border-b text-center"
                            style={{ borderColor: BD, background: sun ? "rgba(239,68,68,0.05)" : sat ? "rgba(245,158,11,0.04)" : undefined }}>
                            {wh && wh > 0
                              ? <span className="font-semibold" style={{ color: sun ? "var(--ibs-danger)" : "var(--ibs-success)", fontSize: "10px" }}>{wh}</span>
                              : <span style={{ color: "rgba(51,65,85,0.25)", fontSize: "9px" }}>·</span>}
                          </td>
                        );
                      })}
                      <td className="px-2 py-1.5 border-r border-b text-center font-semibold" style={{ borderColor: BD, color: "var(--ibs-success)" }}>{s.regular || "—"}</td>
                      <td className="px-2 py-1.5 border-r border-b text-center" style={{ borderColor: BD, color: "var(--ibs-warning)" }}>{s.ot || "—"}</td>
                      <td className="px-2 py-1.5 border-r border-b text-center" style={{ borderColor: BD, color: "var(--ibs-danger)" }}>{s.sunday || "—"}</td>
                      <td className="px-2 py-1.5 border-b text-center font-bold" style={{ borderColor: BD, color: "var(--ibs-accent)" }}>{s.total || "—"}</td>
                    </tr>
                    <tr style={{ opacity: 0.65 }}>
                      <td className="border-r border-b" style={{ borderColor: BD }}></td>
                      <td className="border-r border-b" style={{ borderColor: BD }}></td>
                      <td className="sticky left-0 px-3 py-0.5 border-r border-b" style={{ background: "var(--ibs-bg-card)", borderColor: BD }}>
                        <span className="text-[10px] italic" style={{ color: "var(--ibs-text-dim)" }}>Thêm giờ</span>
                      </td>
                      <td className="border-r border-b" style={{ borderColor: BD }}></td>
                      {days.map(d => {
                        const oh = emp.days[d]?.otHours;
                        return (
                          <td key={d} className="w-7 py-0.5 border-r border-b text-center" style={{ borderColor: BD }}>
                            {oh && oh > 0 ? <span className="font-semibold" style={{ color: "var(--ibs-warning)", fontSize: "10px" }}>{oh}</span> : null}
                          </td>
                        );
                      })}
                      <td className="border-r border-b" style={{ borderColor: BD }}></td>
                      <td className="px-2 py-0.5 border-r border-b text-center" style={{ borderColor: BD, color: "var(--ibs-warning)", fontSize: "10px" }}>{s.ot > 0 ? s.ot : ""}</td>
                      <td className="border-r border-b" style={{ borderColor: BD }}></td>
                      <td className="border-b" style={{ borderColor: BD }}></td>
                    </tr>
                  </Fragment>
                );
              })}
            </tbody>
          </table>
      </div>}
    </div>
  );
}

function AttendanceGridCard({
  title, subtitle, icon, employees, daysInMonth, month, year, onExport, onRefresh, canImport,
}: {
  title: string; subtitle: string; icon: string;
  employees: GridEmployee[];
  daysInMonth: number; month: number; year: number;
  onExport: () => void;
  onRefresh: () => void;
  canImport: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const dowOf = (d: number) => new Date(year, month - 1, d).getDay();
  const isSun = (d: number) => dowOf(d) === 0;
  const isSat = (d: number) => dowOf(d) === 6;

  function getSummary(emp: GridEmployee) {
    let regular = 0, ot = 0, sunday = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      const rec = emp.days[d];
      if (!rec) continue;
      const wh = rec.workHours || 0;
      const oh = rec.otHours || 0;
      if (isSun(d)) { sunday += wh + oh; }
      else { regular += wh; ot += oh; }
    }
    return { regular, ot, sunday, total: +(regular + ot + sunday).toFixed(1) };
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true); setImportMsg(null);
    try {
      const XLSX = await import("xlsx");
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data, { type: "array" });
      const rows: unknown[][] = pickAttendanceSheet(XLSX, wb, year, month);

      type Rec = { employeeCode: string; date: string; workHours: number; otHours: number; nightHours: number; otNightHours: number; status?: string; paidLeaveDays?: number; leaveCode?: string | null };
      const records: Rec[] = [];

      // Step 1: Find day header row → map day number to column index
      const dayColMap = new Map<number, number>();
      // 1a) Row chứa số ngày 1-31
      for (let i = 0; i < Math.min(rows.length, 15); i++) {
        const r = rows[i] as unknown[];
        const found = new Map<number, number>();
        for (let c = 0; c < r.length; c++) {
          const v = Number(r[c]);
          if (Number.isFinite(v) && v >= 1 && v <= 31 && Number.isInteger(v)) found.set(v, c);
        }
        if (found.size >= 20) { found.forEach((c, d) => dayColMap.set(d, c)); break; }
      }
      // 1b) Row chứa Excel date serial → convert sang day
      if (dayColMap.size === 0) {
        for (let i = 0; i < Math.min(rows.length, 15); i++) {
          const r = rows[i] as unknown[];
          const found = new Map<number, number>();
          for (let c = 0; c < r.length; c++) {
            const v = Number(r[c]);
            if (Number.isFinite(v) && v >= 40000 && v <= 60000) {
              const dt = new Date(Math.round((v - 25569) * 86400 * 1000));
              if (dt.getUTCFullYear() === year && dt.getUTCMonth() === month - 1) {
                found.set(dt.getUTCDate(), c);
              }
            }
          }
          if (found.size >= 20) { found.forEach((c, d) => dayColMap.set(d, c)); break; }
        }
      }
      // 1c) Fallback
      if (dayColMap.size === 0) for (let d = 1; d <= 31; d++) dayColMap.set(d, 2 + d);


      // Parse a cell that may be numeric hours OR a text attendance symbol (P, CT, NP, NK, ½ …)
      const parseGridCell = (raw: unknown): { wh: number; status?: string } => {
        const s = String(raw ?? "").trim().toUpperCase();
        if (!s || s === "-" || s === "--") return { wh: 0 };
        const SYMBOLS: Record<string, { wh: number; status: string }> = {
          "P":    { wh: 8,   status: "PRESENT" },
          "X":    { wh: 8,   status: "PRESENT" },
          "M":    { wh: 8,   status: "LATE" },
          "CT":   { wh: 8,   status: "BUSINESS_TRIP" },
          "P/2":  { wh: 4,   status: "HALF_DAY" },
          "½":    { wh: 4,   status: "HALF_DAY" },
          "1/2":  { wh: 4,   status: "HALF_DAY" },
          "NP":   { wh: 0,   status: "ABSENT_APPROVED" },
          "NK":   { wh: 0,   status: "ABSENT_UNAPPROVED" },
          "AL":   { wh: 0,   status: "ABSENT_APPROVED" },
        };
        if (SYMBOLS[s]) return SYMBOLS[s];
        const num = parseFloat(s);
        if (!isNaN(num) && num > 0) return { wh: num };
        return { wh: 0 };
      };

      // Step 2: Mỗi NV chiếm một BLOCK nhiều dòng (dòng công + dòng OT + dòng trống đệm).
      // Một dòng bắt đầu NV MỚI chỉ khi khớp pattern mã NV; mọi dòng khác là dòng nối tiếp.
      const codeOfRow = (r: unknown[] | undefined): string | null => {
        const c0 = String(r?.[0] ?? "").trim();
        const c1 = String(r?.[1] ?? "").trim();
        const c2 = String(r?.[2] ?? "").trim();
        if (/^\d{4,}$/.test(c0) && c1) return c0;                        // col0 = mã NV (trực tiếp)
        if (/^\d{1,3}$/.test(c0) && /^\d{4,}$/.test(c1) && c2) return c1; // col0 = STT, col1 = mã NV
        if (!c0 && /^\d{4,}$/.test(c1) && c2) return c1;                 // col0 trống, col1 = mã NV (gián tiếp VP)
        return null;
      };
      // Nhãn dòng (file MỚI 5 dòng): HC N / HC Đ / Thêm giờ N / Thêm giờ Đ / Khác.
      const norm = (v: unknown) => String(v ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/\s+/g, " ").trim();
      const shiftOf = (r: unknown[]): "dayWork" | "nightWork" | "otDay" | "otNight" | "leave" | null => {
        for (let c = 0; c < r.length; c++) {
          const s = norm(r[c]); if (!s) continue;
          if (/^hc ?n$/.test(s)) return "dayWork";
          if (/^hc ?d$/.test(s)) return "nightWork";
          if (/^khac$/.test(s)) return "leave";
          if (/them ?gi/.test(s)) return /d$|dem/.test(s) ? "otNight" : "otDay";
        }
        return null;
      };
      const numAt = (r: unknown[] | undefined, c: number) => { const s = String(r?.[c] ?? "").trim(); return /^-?\d+(\.\d+)?$/.test(s) ? parseFloat(s) : 0; };

      for (let i = 0; i < rows.length; i++) {
        const code = codeOfRow(rows[i] as unknown[]);
        if (!code) continue;
        const workRow = rows[i] as unknown[];

        // Gom các dòng nối tiếp (OT ngày/đêm, ca đêm, nghỉ, trống) cho tới dòng NV kế tiếp.
        let nightRow: unknown[] | undefined, otRow: unknown[] | undefined, otNightRow: unknown[] | undefined, leaveRow: unknown[] | undefined;
        let j = i + 1;
        for (; j < rows.length; j++) {
          const nextCode = codeOfRow(rows[j] as unknown[]);
          if (nextCode && nextCode !== code) break; // KHÁC NV → dừng. Cùng mã hoặc không có mã → dòng nối tiếp.
          const cand = rows[j] as unknown[];
          const t = shiftOf(cand);
          if (t === "nightWork" && !nightRow) { nightRow = cand; continue; }   // HC Đ — ca đêm
          if (t === "otNight" && !otNightRow) { otNightRow = cand; continue; } // Thêm giờ Đ — OT đêm
          if (t === "otDay" && !otRow) { otRow = cand; continue; }             // Thêm giờ N — OT ngày (theo nhãn)
          if (t === "leave" && !leaveRow) { leaveRow = cand; continue; }       // Khác — mã nghỉ
          if (t) continue; // dòng có nhãn khác (vd HC N lặp) → bỏ qua, đã có workRow
          // FILE CŨ (không nhãn): dò dòng nghỉ + dòng OT theo dữ liệu.
          if (!leaveRow) { let hasLeave = false; dayColMap.forEach((colIdx) => { if (isLeaveToken(cand?.[colIdx])) hasLeave = true; }); if (hasLeave) leaveRow = cand; }
          if (!otRow) {
            let hasData = false;
            dayColMap.forEach((colIdx) => { const s = String(cand?.[colIdx] ?? "").trim(); if (/^-?\d+(\.\d+)?$/.test(s) && parseFloat(s) > 0) hasData = true; });
            if (hasData && cand !== leaveRow) otRow = cand;
          }
        }
        i = j - 1; // bỏ qua cả block

        dayColMap.forEach((colIdx, d) => {
          const { wh, status } = parseGridCell(workRow?.[colIdx]);
          const oh = numAt(otRow, colIdx);          // Thêm giờ N
          const nh = numAt(nightRow, colIdx);        // HC Đ — ca đêm
          const onh = numAt(otNightRow, colIdx);     // Thêm giờ Đ — OT đêm
          const lv = parseLeaveCode(leaveRow?.[colIdx]);
          if (wh === 0 && oh === 0 && nh === 0 && onh === 0 && !status && lv.paidLeaveDays === 0 && !lv.code) return;
          const dt = new Date(year, month - 1, d);
          if (dt.getMonth() !== month - 1) return;
          records.push({ employeeCode: code, date: `${year}-${String(month).padStart(2,"0")}-${String(d).padStart(2,"0")}`, workHours: wh, otHours: oh, nightHours: nh, otNightHours: onh, status, paidLeaveDays: lv.paidLeaveDays, leaveCode: lv.code });
        });
      }

      if (records.length === 0) {
        setImportMsg({ ok: false, text: `Không tìm thấy dữ liệu hợp lệ. File có ${rows.length} dòng. Mở Console (F12) để xem cấu trúc.` });
        return;
      }

      // Defensive: chặn record có giờ làm bất thường (1 ngày max 24h)
      const badRecords = records.filter((r) => [r.workHours, r.otHours, r.nightHours, r.otNightHours].some((v) => v < 0 || v > 24));
      if (badRecords.length > 0) {
        const sample = badRecords.slice(0, 3).map((r) => `${r.employeeCode} ${r.date} (work=${r.workHours}, ot=${r.otHours})`).join("; ");
        setImportMsg({ ok: false, text: `Phát hiện ${badRecords.length}/${records.length} dòng có giờ làm bất thường (>24h). File có thể bị nhầm cột. Mẫu: ${sample}` });
        return;
      }

      const res = await fetch("/api/v1/attendance/import-office", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month, year, records }),
      });
      const result = await res.json();
      if (res.ok) {
        setImportMsg({ ok: true, text: `✓ Đã import ${result.created} bản ghi${result.skipped ? `. Bỏ qua ${result.skipped} bản ghi (${result.missingCodes?.length ?? 0} mã NV không tìm thấy).` : "."}` });
        setTimeout(() => onRefresh(), 1500);
      } else {
        setImportMsg({ ok: false, text: apiError(res.status, result.error) });
      }
    } catch (err) {
      setImportMsg({ ok: false, text: "Lỗi đọc file: " + String(err) });
    } finally { setImporting(false); e.target.value = ""; }
  }

  return (
    <div className="rounded-xl border"
      style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
      <div className="px-5 py-4 flex justify-between items-center"
        style={{ borderBottom: open ? "1px solid var(--ibs-border)" : undefined }}>
        <button className="flex items-center gap-2 flex-1 text-left" onClick={() => setOpen(o => !o)}>
          <span className="text-lg">{icon}</span>
          <div>
            <h3 className="text-sm font-semibold">{title}</h3>
            <p className="text-[11px]" style={{ color: "var(--ibs-text-dim)" }}>{subtitle}</p>
          </div>
          <span className="ml-2 px-2 py-0.5 rounded-full text-[11px] font-semibold"
            style={{ background: "rgba(0,180,216,0.12)", color: "var(--ibs-accent)" }}>
            {employees.length} người
          </span>
          <ChevronRight size={14} className="ml-1 transition-transform" style={{ color: "var(--ibs-text-dim)", transform: open ? "rotate(90deg)" : "rotate(0deg)" }} />
        </button>
        <div className="flex gap-2 ml-4">
          {canImport && (
            <label className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] border cursor-pointer${importing ? " opacity-50 pointer-events-none" : ""}`}
              style={{ borderColor: "var(--ibs-accent)", color: "var(--ibs-accent)" }}>
              <Upload size={12} /> {importing ? "Đang xử lý..." : "Import Excel"}
              <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImport} disabled={importing} />
            </label>
          )}
          <button onClick={onExport}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] border"
            style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-muted)" }}>
            <Download size={12} /> Export Excel
          </button>
        </div>
      </div>
      {importMsg && (
        <div className="mx-4 mt-3 px-3 py-2 rounded-lg text-[12px] flex items-center justify-between"
          style={{ background: importMsg.ok ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)", color: importMsg.ok ? "var(--ibs-success)" : "var(--ibs-danger)" }}>
          {importMsg.text}
          <button onClick={() => setImportMsg(null)} className="ml-3 opacity-60 hover:opacity-100">✕</button>
        </div>
      )}
      {open && <div className="p-4 overflow-x-auto">
          <table className="border-collapse text-[11px]">
            <thead>
              <tr>
                <th className="sticky left-0 px-3 py-2 text-left font-semibold border-r border-b whitespace-nowrap"
                  style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)", color: "var(--ibs-text-dim)", minWidth: "140px" }}>Họ tên</th>
                <th className="px-2 py-2 font-semibold border-r border-b whitespace-nowrap"
                  style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-dim)" }}>PB</th>
                {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => {
                  const sun = isSun(d), sat = isSat(d);
                  return (
                    <th key={d} className="w-7 py-2 font-semibold border-r border-b text-center"
                      style={{ borderColor: "var(--ibs-border)", color: sun ? "var(--ibs-danger)" : sat ? "var(--ibs-warning)" : "var(--ibs-text-dim)" }}>
                      {d}
                    </th>
                  );
                })}
                <th className="px-2 py-2 font-semibold border-r border-b whitespace-nowrap text-center"
                  style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-success)" }}>Công TH</th>
                <th className="px-2 py-2 font-semibold border-r border-b whitespace-nowrap text-center"
                  style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-warning)" }}>Thêm giờ</th>
                <th className="px-2 py-2 font-semibold border-r border-b whitespace-nowrap text-center"
                  style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-danger)" }}>Công CN</th>
                <th className="px-2 py-2 font-semibold border-b whitespace-nowrap text-center"
                  style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-accent)" }}>Tổng</th>
              </tr>
            </thead>
            <tbody>
              {employees.length === 0 && (
                <tr>
                  <td colSpan={2 + daysInMonth + 4} className="py-10 text-center border-b"
                    style={{ borderColor: "rgba(51,65,85,0.4)", color: "var(--ibs-text-dim)" }}>
                    Chưa có dữ liệu — nhập dữ liệu để hiển thị
                  </td>
                </tr>
              )}
              {employees.map((emp) => {
                const s = getSummary(emp);
                const BD = "rgba(51,65,85,0.4)";
                return (
                  <Fragment key={emp.code}>
                    {/* Main row: status / workHours */}
                    <tr>
                      <td className="sticky left-0 px-3 py-1.5 border-r border-b whitespace-nowrap"
                        style={{ background: "var(--ibs-bg-card)", borderColor: BD }}>
                        <span className="font-medium">{emp.fullName}</span>
                        <span className="ml-1 text-[10px]" style={{ color: "var(--ibs-text-dim)" }}>({emp.code})</span>
                      </td>
                      <td className="px-2 py-1.5 border-r border-b text-center"
                        style={{ borderColor: BD, color: "var(--ibs-text-dim)" }}>
                        {emp.dept?.replace("P. ", "")}
                      </td>
                      {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => {
                        const rec = emp.days[d];
                        const sym = rec ? ATTENDANCE_SYMBOL[rec.status] : null;
                        const wh = rec?.workHours;
                        const sun = isSun(d), sat = isSat(d);
                        return (
                          <td key={d} className="w-7 py-1.5 border-r border-b text-center font-semibold"
                            style={{ borderColor: BD, background: sun ? "rgba(239,68,68,0.05)" : sat ? "rgba(245,158,11,0.04)" : undefined }}>
                            {sym ? (
                              <span style={{ color: sym.color, fontSize: "10px" }}>{sym.symbol}</span>
                            ) : wh && wh > 0 ? (
                              <span className="font-semibold" style={{ color: sun ? "var(--ibs-danger)" : "var(--ibs-success)", fontSize: "10px" }}>{wh}</span>
                            ) : (
                              <span style={{ color: "rgba(51,65,85,0.5)", fontSize: "9px" }}>·</span>
                            )}
                          </td>
                        );
                      })}
                      <td className="px-2 py-1.5 border-r border-b text-center font-semibold" style={{ borderColor: BD, color: "var(--ibs-success)" }}>{s.regular || "—"}</td>
                      <td className="px-2 py-1.5 border-r border-b text-center" style={{ borderColor: BD, color: "var(--ibs-warning)" }}>{s.ot || "—"}</td>
                      <td className="px-2 py-1.5 border-r border-b text-center" style={{ borderColor: BD, color: "var(--ibs-danger)" }}>{s.sunday || "—"}</td>
                      <td className="px-2 py-1.5 border-b text-center font-bold" style={{ borderColor: BD, color: "var(--ibs-accent)" }}>{s.total || "—"}</td>
                    </tr>
                    {/* Sub row: Thêm giờ */}
                    <tr style={{ opacity: 0.65 }}>
                      <td className="sticky left-0 px-3 py-0.5 border-r border-b" style={{ background: "var(--ibs-bg-card)", borderColor: BD }}>
                        <span className="text-[10px] italic" style={{ color: "var(--ibs-text-dim)" }}>Thêm giờ</span>
                      </td>
                      <td className="border-r border-b" style={{ borderColor: BD }}></td>
                      {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => {
                        const oh = emp.days[d]?.otHours;
                        return (
                          <td key={d} className="w-7 py-0.5 border-r border-b text-center" style={{ borderColor: BD }}>
                            {oh && oh > 0 ? <span className="font-semibold" style={{ color: "var(--ibs-warning)", fontSize: "10px" }}>{oh}</span> : null}
                          </td>
                        );
                      })}
                      <td className="border-r border-b" style={{ borderColor: BD }}></td>
                      <td className="px-2 py-0.5 border-r border-b text-center" style={{ borderColor: BD, color: "var(--ibs-warning)", fontSize: "10px" }}>{s.ot > 0 ? s.ot : ""}</td>
                      <td className="border-r border-b" style={{ borderColor: BD }}></td>
                      <td className="border-b" style={{ borderColor: BD }}></td>
                    </tr>
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        <div className="flex gap-4 mt-3 flex-wrap">
          {Object.entries(ATTENDANCE_SYMBOL).map(([k, v]) => (
            <span key={k} className="flex items-center gap-1 text-[11px]" style={{ color: "var(--ibs-text-muted)" }}>
              <span className="font-semibold" style={{ color: v.color }}>{v.symbol}</span>
              {k === "PRESENT" ? "Có mặt" : k === "ABSENT_APPROVED" ? "Nghỉ phép" : k === "ABSENT_UNAPPROVED" ? "Nghỉ KP" : k === "LATE" ? "Đi muộn" : k === "BUSINESS_TRIP" ? "Công tác" : "Nửa ngày"}
            </span>
          ))}
        </div>
      </div>}
    </div>
  );
}

// ── Card: So sánh đi làm vs số chuẩn theo ngày ───────────────────────────────
function AttendanceByDayCard() {
  const vnToday = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
  const [date, setDate] = useState(vnToday);
  const [rows, setRows] = useState<AttendanceSummary[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/v1/attendance?summary=true&date=${date}`)
      .then((r) => r.json()).then((res) => setRows(res.data || []))
      .finally(() => setLoading(false));
  }, [date]);

  const tStd = rows.reduce((s, d) => s + d.total, 0);
  const tPresent = rows.reduce((s, d) => s + d.present, 0);
  const tAbsent = Math.max(0, tStd - tPresent);

  return (
    <div className="rounded-xl border overflow-hidden" style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
      <div className="px-5 py-4 border-b flex flex-wrap gap-3 justify-between items-center" style={{ borderColor: "var(--ibs-border)" }}>
        <h3 className="text-sm font-semibold">📊 So sánh đi làm vs số chuẩn theo ngày</h3>
        <div className="flex items-center gap-2">
          <span className="text-[12px]" style={{ color: "var(--ibs-text-muted)" }}>Chọn ngày:</span>
          <DateInput value={date} max={vnToday} onChange={(e) => setDate(e.target.value)}
            className="px-3 py-1.5 rounded-lg text-[13px] outline-none"
            style={{ background: "var(--ibs-bg)", border: "1px solid var(--ibs-border)", color: "var(--ibs-text)" }} />
        </div>
      </div>
      <div className="p-5">
        {loading ? (
          <div className="flex items-center justify-center py-10 text-[13px]" style={{ color: "var(--ibs-text-dim)" }}>
            <RefreshCw size={16} className="animate-spin mr-2" /> Đang tải...
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-[11px] uppercase" style={{ color: "var(--ibs-text-dim)" }}>
                  <th className="text-left px-3 py-2 font-medium">Phòng ban</th>
                  <th className="text-center px-3 py-2 font-medium">Số chuẩn</th>
                  <th className="text-center px-3 py-2 font-medium">Đi làm</th>
                  <th className="text-center px-3 py-2 font-medium">Vắng</th>
                  <th className="text-right px-3 py-2 font-medium">Tỷ lệ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((d) => {
                  const absent = Math.max(0, d.total - d.present);
                  const color = d.rate >= 100 ? "var(--ibs-success)" : d.rate >= 90 ? "var(--ibs-accent)" : "var(--ibs-warning)";
                  return (
                    <tr key={d.departmentId} className="border-t" style={{ borderColor: "rgba(51,65,85,0.3)" }}>
                      <td className="px-3 py-2 font-medium">{d.departmentName}</td>
                      <td className="px-3 py-2 text-center" style={{ color: "var(--ibs-text-muted)" }}>{d.total}</td>
                      <td className="px-3 py-2 text-center font-semibold" style={{ color: "var(--ibs-accent)" }}>{d.present}</td>
                      <td className="px-3 py-2 text-center font-semibold" style={{ color: absent > 0 ? "var(--ibs-warning)" : "var(--ibs-text-dim)" }}>{absent}</td>
                      <td className="px-3 py-2 text-right font-semibold" style={{ color }}>{d.rate}%</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 font-semibold" style={{ borderColor: "var(--ibs-border)" }}>
                  <td className="px-3 py-2">Tổng</td>
                  <td className="px-3 py-2 text-center">{tStd}</td>
                  <td className="px-3 py-2 text-center" style={{ color: "var(--ibs-accent)" }}>{tPresent}</td>
                  <td className="px-3 py-2 text-center" style={{ color: "var(--ibs-warning)" }}>{tAbsent}</td>
                  <td className="px-3 py-2 text-right">{tStd > 0 ? Math.round((tPresent / tStd) * 100) : 0}%</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AttendancePage() {
  return (
    <Suspense fallback={<div />}>
      <AttendancePageInner />
    </Suspense>
  );
}

function AttendancePageInner() {
  const { canDo } = usePermission();
  const searchParams = useSearchParams();
  const activeTab = (searchParams.get("tab") === "grid" ? "grid" : "attendance") as Tab;
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [summary, setSummary] = useState<AttendanceSummary[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [otRequests, setOTRequests] = useState<OTRequest[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [loadingLeave, setLoadingLeave] = useState(true);
  const [loadingOT, setLoadingOT] = useState(true);
  const [loadingGrid, setLoadingGrid] = useState(false);
  const [showLeaveForm, setShowLeaveForm] = useState(false);
  const [showOTForm, setShowOTForm] = useState(false);
  const [userLeaveBalance, setUserLeaveBalance] = useState<number | null>(null);
  const [gridRefreshKey, setGridRefreshKey] = useState(0);

  useEffect(() => {
    // Summary endpoint always returns "today" regardless of month/year — don't depend on them.
    setLoadingSummary(true);
    fetch("/api/v1/attendance?summary=true")
      .then((r) => r.json()).then((res) => setSummary(res.data || []))
      .finally(() => setLoadingSummary(false));
  }, []);

  useEffect(() => {
    setLoadingLeave(true);
    fetch("/api/v1/leave-requests")
      .then((r) => r.json()).then((res) => setLeaveRequests(res.data || []))
      .finally(() => setLoadingLeave(false));
  }, []);

  useEffect(() => {
    setLoadingOT(true);
    fetch("/api/v1/ot-requests")
      .then((r) => r.json()).then((res) => setOTRequests(res.data || []))
      .finally(() => setLoadingOT(false));
  }, []);

  useEffect(() => {
    if (activeTab !== "grid") return;
    setLoadingGrid(true);
    fetch(`/api/v1/attendance?month=${month}&year=${year}`)
      .then((r) => r.json()).then((res) => setAttendanceRecords(res.data || []))
      .finally(() => setLoadingGrid(false));
  }, [activeTab, month, year, gridRefreshKey]);

  function prevMonth() { if (month === 1) { setMonth(12); setYear((y) => y - 1); } else setMonth((m) => m - 1); }
  function nextMonth() { if (month === 12) { setMonth(1); setYear((y) => y + 1); } else setMonth((m) => m + 1); }

  const totalPresent = summary.reduce((s, d) => s + d.present, 0);
  const totalHeadcount = summary.reduce((s, d) => s + d.total, 0);
  const pendingLeaveCount = useMemo(() => leaveRequests.filter((lr) => lr.status === "PENDING").length, [leaveRequests]);
  const pendingOTCount = useMemo(() => otRequests.filter((o) => o.status === "PENDING").length, [otRequests]);

  // Build monthly grid data
  const daysInMonth = new Date(year, month, 0).getDate();
  const gridEmployees = useMemo(() => {
    const map = new Map<string, GridEmployee>();
    attendanceRecords.forEach((r) => {
      const day = new Date(r.date).getDate();
      if (!map.has(r.employee.code)) {
        map.set(r.employee.code, {
          code: r.employee.code, fullName: r.employee.fullName,
          dept: r.employee.department?.name, teamId: r.employee.teamId ?? null,
          positionLevel: r.employee.position?.level ?? "WORKER", days: {},
        });
      }
      map.get(r.employee.code)!.days[day] = r;
    });
    return Array.from(map.values()).sort((a, b) => {
      const la = POSITION_ORDER[a.positionLevel] ?? 99;
      const lb = POSITION_ORDER[b.positionLevel] ?? 99;
      return la !== lb ? la - lb : a.code.localeCompare(b.code);
    });
  }, [attendanceRecords]);

  const officeEmployees = useMemo(() => gridEmployees.filter((e) => !e.teamId), [gridEmployees]);
  const productionEmployees = useMemo(() => gridEmployees.filter((e) => !!e.teamId), [gridEmployees]);

  async function handleLeaveAction(id: string, action: "APPROVE" | "REJECT") {
    const res = await fetch(`/api/v1/leave-requests/${id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (res.ok) {
      setLeaveRequests((prev) => prev.map((lr) =>
        lr.id === id ? { ...lr, status: action === "APPROVE" ? "APPROVED" : "REJECTED" } : lr
      ));
    }
  }

  async function handleOTAction(id: string, action: "APPROVE" | "REJECT") {
    const res = await fetch(`/api/v1/ot-requests/${id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (res.ok) {
      setOTRequests((prev) => prev.map((o) =>
        o.id === id ? { ...o, status: action === "APPROVE" ? "APPROVED" : "REJECTED" } : o
      ));
    }
  }

  async function exportGrid(employees: typeof gridEmployees, label: string) {
    const { default: ExcelJS } = await import("exceljs");
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(`${label} T${month}/${year}`);
    const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
    ws.columns = [
      { header: "Mã NV", key: "code", width: 8 },
      { header: "Họ tên", key: "name", width: 20 },
      ...days.map((d) => ({ header: String(d), key: `d${d}`, width: 4 })),
      { header: "Tổng công", key: "total", width: 9 },
    ];
    ws.getRow(1).font = { bold: true };
    employees.forEach((emp) => {
      const row: Record<string, unknown> = { code: emp.code, name: emp.fullName };
      let total = 0;
      days.forEach((d) => {
        const r = emp.days[d];
        const sym = r ? (ATTENDANCE_SYMBOL[r.status]?.symbol || r.status) : "";
        row[`d${d}`] = sym;
        if (r?.status === "PRESENT" || r?.status === "LATE") total++;
        if (r?.status === "HALF_DAY") total += 0.5;
      });
      row.total = total;
      ws.addRow(row);
    });
    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `bang-cong-${label.toLowerCase().replace(/\s+/g, "-")}-t${month}-${year}.xlsx`;
    a.click(); URL.revokeObjectURL(url);
  }

  const leaveColumns: Column<Record<string, unknown>>[] = [
    { key: "code", header: "Mã NV", width: "90px", render: (r) => <span className="font-mono text-[12px]">{(r as unknown as LeaveRequest).employee?.code}</span> },
    { key: "name", header: "Họ tên", render: (r) => <span className="font-medium">{(r as unknown as LeaveRequest).employee?.fullName}</span> },
    { key: "dept", header: "Phòng ban", render: (r) => <span style={{ color: "var(--ibs-text-muted)" }}>{(r as unknown as LeaveRequest).employee?.department?.name}</span> },
    { key: "leaveType", header: "Loại nghỉ", render: (r) => <span>{LEAVE_TYPE_LABELS[(r as unknown as LeaveRequest).leaveType] || (r as unknown as LeaveRequest).leaveType}</span> },
    { key: "startDate", header: "Từ ngày", render: (r) => <span>{formatDate(new Date((r as unknown as LeaveRequest).startDate))}</span> },
    { key: "endDate", header: "Đến ngày", render: (r) => <span>{formatDate(new Date((r as unknown as LeaveRequest).endDate))}</span> },
    { key: "totalDays", header: "Số ngày", width: "80px", render: (r) => <span className="font-semibold" style={{ color: "var(--ibs-accent)" }}>{(r as unknown as LeaveRequest).totalDays}</span> },
    { key: "status", header: "Trạng thái", render: (r) => <StatusBadge status={(r as unknown as LeaveRequest).status} /> },
    {
      key: "actions", header: "", width: "120px",
      render: (r) => {
        const lr = r as unknown as LeaveRequest;
        if (lr.status !== "PENDING") return null;
        return (
          <div className="flex gap-1">
            <button onClick={() => handleLeaveAction(lr.id, "APPROVE")}
              className="flex items-center gap-0.5 px-2 py-1 rounded text-[11px] font-semibold"
              style={{ background: "rgba(16,185,129,0.15)", color: "var(--ibs-success)" }}>
              <Check size={11} /> Duyệt
            </button>
            <button onClick={() => handleLeaveAction(lr.id, "REJECT")}
              className="flex items-center gap-0.5 px-2 py-1 rounded text-[11px] font-semibold"
              style={{ background: "rgba(239,68,68,0.15)", color: "var(--ibs-danger)" }}>
              <X size={11} /> Từ chối
            </button>
          </div>
        );
      },
    },
  ];

  const otColumns: Column<Record<string, unknown>>[] = [
    { key: "code", header: "Mã NV", width: "90px", render: (r) => <span className="font-mono text-[12px]">{(r as unknown as OTRequest).employee?.code}</span> },
    { key: "name", header: "Họ tên", render: (r) => <span className="font-medium">{(r as unknown as OTRequest).employee?.fullName}</span> },
    { key: "dept", header: "Phòng ban", render: (r) => <span style={{ color: "var(--ibs-text-muted)" }}>{(r as unknown as OTRequest).employee?.department?.name}</span> },
    { key: "date", header: "Ngày OT", render: (r) => <span>{formatDate(new Date((r as unknown as OTRequest).date))}</span> },
    { key: "time", header: "Giờ", render: (r) => { const o = r as unknown as OTRequest; return <span>{o.startTime} – {o.endTime}</span>; } },
    { key: "hours", header: "Số giờ", width: "70px", render: (r) => <span className="font-semibold" style={{ color: "var(--ibs-accent)" }}>{(r as unknown as OTRequest).hours.toLocaleString("vi-VN", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}h</span> },
    { key: "otRate", header: "Hệ số", width: "70px", render: (r) => <span>×{(r as unknown as OTRequest).otRate}</span> },
    { key: "status", header: "Trạng thái", render: (r) => <StatusBadge status={(r as unknown as OTRequest).status} /> },
    {
      key: "actions", header: "", width: "120px",
      render: (r) => {
        const o = r as unknown as OTRequest;
        if (o.status !== "PENDING") return null;
        return (
          <div className="flex gap-1">
            <button onClick={() => handleOTAction(o.id, "APPROVE")}
              className="flex items-center gap-0.5 px-2 py-1 rounded text-[11px] font-semibold"
              style={{ background: "rgba(16,185,129,0.15)", color: "var(--ibs-success)" }}>
              <Check size={11} /> Duyệt
            </button>
            <button onClick={() => handleOTAction(o.id, "REJECT")}
              className="flex items-center gap-0.5 px-2 py-1 rounded text-[11px] font-semibold"
              style={{ background: "rgba(239,68,68,0.15)", color: "var(--ibs-danger)" }}>
              <X size={11} /> Từ chối
            </button>
          </div>
        );
      },
    },
  ];

  return (
    <div>
      <PageTitle title="M3 - Chấm công & Nghỉ phép" description="Theo dõi chấm công, đơn nghỉ phép và tăng ca" />

      {/* Month selector + stats */}
      <div className="flex items-center gap-4 mb-5 p-3 rounded-xl border"
        style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
        <button onClick={prevMonth}
          className="w-8 h-8 rounded-lg border flex items-center justify-center"
          style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-muted)" }}>
          <ChevronLeft size={14} />
        </button>
        <span className="text-[15px] font-bold min-w-[140px] text-center">
          Tháng {month}/{year}
        </span>
        <button onClick={nextMonth}
          className="w-8 h-8 rounded-lg border flex items-center justify-center"
          style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-muted)" }}>
          <ChevronRight size={14} />
        </button>
        <div className="ml-auto flex items-center gap-6">
          {[
            { value: `${totalPresent}/${totalHeadcount}`, label: "Có mặt hôm nay", color: "var(--ibs-accent)" },
            { value: pendingLeaveCount, label: "Đơn chờ duyệt", color: "var(--ibs-warning)" },
            { value: pendingOTCount, label: "OT chờ duyệt", color: "var(--ibs-text-muted)" },
          ].map((s) => (
            <div key={s.label} className="text-center">
              <div className="text-[22px] font-extrabold" style={{ color: s.color }}>{s.value}</div>
              <div className="text-[10px]" style={{ color: "var(--ibs-text-dim)" }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Tab: Tổng hợp ── */}
      {activeTab === "attendance" && (
        <div className="space-y-5">
        <div className="rounded-xl border overflow-hidden"
          style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
          <div className="px-5 py-4 border-b flex justify-between items-center"
            style={{ borderColor: "var(--ibs-border)" }}>
            <h3 className="text-sm font-semibold">📅 Tổng hợp có mặt hôm nay</h3>
            <span className="text-[11px] font-semibold px-2.5 py-[3px] rounded-xl"
              style={{ background: "rgba(16,185,129,0.15)", color: "var(--ibs-success)" }}>● Live</span>
          </div>
          <div className="p-5">
            {loadingSummary ? (
              <div className="flex items-center justify-center py-12 text-[13px]" style={{ color: "var(--ibs-text-dim)" }}>
                <RefreshCw size={16} className="animate-spin mr-2" /> Đang tải...
              </div>
            ) : (
              <div className="space-y-3">
                {summary.map((dept) => {
                  const color = dept.rate === 100 ? "var(--ibs-accent)" : dept.rate >= 90 ? "var(--ibs-success)" : "var(--ibs-warning)";
                  return (
                    <div key={dept.departmentId} className="flex items-center gap-3">
                      <div className="w-[130px] text-[12px] text-right flex-shrink-0" style={{ color: "var(--ibs-text-muted)" }}>{dept.departmentName}</div>
                      <div className="flex-1 h-7 rounded overflow-hidden" style={{ background: "var(--ibs-bg)" }}>
                        <div className="h-full rounded flex items-center pl-3 text-[12px] font-semibold text-white"
                          style={{ width: `${dept.rate}%`, background: color, minWidth: "40px" }}>
                          {dept.rate}%
                        </div>
                      </div>
                      <div className="w-[60px] text-[12px] font-semibold text-right flex-shrink-0" style={{ color }}>
                        {dept.present}/{dept.total}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
        <AttendanceByDayCard />
        </div>
      )}

      {/* ── Tab: Bảng công tháng ── */}
      {activeTab === "grid" && (
        <div className="space-y-5">
          {loadingGrid ? (
            <div className="flex items-center justify-center py-16 text-[13px]" style={{ color: "var(--ibs-text-dim)" }}>
              <RefreshCw size={16} className="animate-spin mr-2" /> Đang tải...
            </div>
          ) : (
            <>
              {/* Card: Khối Gián tiếp */}
              <OfficeAttendanceCard
                employees={officeEmployees}
                daysInMonth={daysInMonth}
                month={month}
                year={year}
                onRefresh={() => setGridRefreshKey(k => k + 1)}
                canImport={canDo("attendance", "bulkUpsert")}
              />
              {/* Card: Khối Trực tiếp */}
              <AttendanceGridCard
                title="Khối Trực tiếp"
                subtitle="Công nhân sản xuất"
                icon="🏭"
                employees={productionEmployees}
                daysInMonth={daysInMonth}
                month={month}
                year={year}
                onExport={() => exportGrid(productionEmployees, "Truc-tiep")}
                onRefresh={() => setGridRefreshKey(k => k + 1)}
                canImport={canDo("attendance", "bulkUpsert")}
              />
            </>
          )}
        </div>
      )}

      {/* ── Tab: Đơn nghỉ phép ── */}
      {activeTab === "leave" && (
        <div className="rounded-xl border overflow-hidden"
          style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
          <div className="px-5 py-4 border-b flex justify-between items-center"
            style={{ borderColor: "var(--ibs-border)" }}>
            <h3 className="text-sm font-semibold">📋 Xin Nghỉ</h3>
            <button onClick={() => setShowLeaveForm(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold text-white"
              style={{ background: "var(--ibs-accent)" }}>
              <Plus size={13} /> Nộp đơn nghỉ
            </button>
          </div>
          <div className="p-5">
            {loadingLeave ? (
              <div className="flex items-center justify-center py-12 text-[13px]" style={{ color: "var(--ibs-text-dim)" }}>
                <RefreshCw size={16} className="animate-spin mr-2" /> Đang tải...
              </div>
            ) : (
              <DataTable columns={leaveColumns} data={leaveRequests as unknown as Record<string, unknown>[]}
                searchPlaceholder="Tìm tên, phòng ban..." searchKeys={["name", "dept"]} pageSize={15} />
            )}
          </div>
        </div>
      )}

      {/* ── Tab: Đề xuất OT ── */}
      {activeTab === "ot" && (
        <div className="rounded-xl border overflow-hidden"
          style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
          <div className="px-5 py-4 border-b flex justify-between items-center"
            style={{ borderColor: "var(--ibs-border)" }}>
            <h3 className="text-sm font-semibold">⏱ Đề xuất tăng ca (OT)</h3>
            <button onClick={() => setShowOTForm(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold text-white"
              style={{ background: "var(--ibs-accent)" }}>
              <Plus size={13} /> Đề xuất OT
            </button>
          </div>
          <div className="p-5">
            {loadingOT ? (
              <div className="flex items-center justify-center py-12 text-[13px]" style={{ color: "var(--ibs-text-dim)" }}>
                <RefreshCw size={16} className="animate-spin mr-2" /> Đang tải...
              </div>
            ) : (
              <DataTable columns={otColumns} data={otRequests as unknown as Record<string, unknown>[]}
                searchPlaceholder="Tìm tên, phòng ban..." searchKeys={["name", "dept"]} pageSize={15} />
            )}
          </div>
        </div>
      )}

      {showLeaveForm && (
        <LeaveRequestForm
          onClose={() => setShowLeaveForm(false)}
          onSuccess={(lr) => { setLeaveRequests((p) => [lr, ...p]); setShowLeaveForm(false); }}
        />
      )}
      {showOTForm && (
        <OTRequestForm
          onClose={() => setShowOTForm(false)}
          onSuccess={(o) => { setOTRequests((p) => [o, ...p]); setShowOTForm(false); }}
        />
      )}
    </div>
  );
}

// ── Leave Request Form ──
function LeaveRequestForm({ onClose, onSuccess }: { onClose: () => void; onSuccess: (lr: LeaveRequest) => void }) {
  const [form, setForm] = useState({ leaveType: "ANNUAL", startDate: "", endDate: "", reason: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/v1/leave-requests")
      .then((r) => r.json()).then((res) => {
        // Try to infer balance from API — placeholder: show from notifications or employee detail
      });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setError(""); setSubmitting(true);
    try {
      const res = await fetch("/api/v1/leave-requests", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) { setError(apiError(res.status, data.error)); return; }
      onSuccess(data.data);
    } finally { setSubmitting(false); }
  }

  const inputStyle = { background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" };
  const inputClass = "w-full px-3 py-2 rounded-lg text-[13px] outline-none border";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.6)" }}>
      <div className="rounded-2xl border w-full max-w-[460px] p-6"
        style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
        <div className="flex justify-between items-center mb-5">
          <h3 className="text-[16px] font-bold">Nộp đơn nghỉ phép</h3>
          <button onClick={onClose}><X size={16} style={{ color: "var(--ibs-text-dim)" }} /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--ibs-text-muted)" }}>Loại nghỉ</label>
            <select value={form.leaveType} onChange={(e) => setForm((f) => ({ ...f, leaveType: e.target.value }))}
              className={inputClass} style={inputStyle}>
              {Object.entries(LEAVE_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--ibs-text-muted)" }}>Từ ngày</label>
              <DateInput required value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                className={inputClass} style={inputStyle} />
            </div>
            <div>
              <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--ibs-text-muted)" }}>Đến ngày</label>
              <DateInput required value={form.endDate} onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
                className={inputClass} style={inputStyle} />
            </div>
          </div>
          <div>
            <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--ibs-text-muted)" }}>Lý do</label>
            <textarea required rows={3} value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
              placeholder="Nêu lý do nghỉ phép..." className={`${inputClass} resize-none`} style={inputStyle} />
          </div>
          <div className="px-3 py-2 rounded-lg text-[12px]"
            style={{ background: "rgba(0,180,216,0.08)", color: "var(--ibs-text-muted)", border: "1px solid rgba(0,180,216,0.2)" }}>
            ℹ️ Workflow: Bạn → Trưởng phòng duyệt → HCNS xác nhận
          </div>
          {error && <div className="text-[12px] px-3 py-2 rounded-lg" style={{ background: "rgba(239,68,68,0.1)", color: "var(--ibs-danger)" }}>{error}</div>}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2 rounded-lg text-[13px] border"
              style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-muted)" }}>Hủy</button>
            <button type="submit" disabled={submitting} className="flex-1 py-2 rounded-lg text-[13px] font-semibold text-white disabled:opacity-60"
              style={{ background: "var(--ibs-accent)" }}>{submitting ? "Đang gửi..." : "Gửi đơn"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── OT Request Form ──
function OTRequestForm({ onClose, onSuccess }: { onClose: () => void; onSuccess: (o: OTRequest) => void }) {
  const [form, setForm] = useState({ date: "", startTime: "17:30", endTime: "20:00", reason: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setError(""); setSubmitting(true);
    try {
      const res = await fetch("/api/v1/ot-requests", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) { setError(apiError(res.status, data.error)); return; }
      onSuccess(data.data);
    } finally { setSubmitting(false); }
  }

  const inputStyle = { background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" };
  const inputClass = "w-full px-3 py-2 rounded-lg text-[13px] outline-none border";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.6)" }}>
      <div className="rounded-2xl border w-full max-w-[420px] p-6"
        style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
        <div className="flex justify-between items-center mb-5">
          <h3 className="text-[16px] font-bold">Đề xuất tăng ca (OT)</h3>
          <button onClick={onClose}><X size={16} style={{ color: "var(--ibs-text-dim)" }} /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--ibs-text-muted)" }}>Ngày OT</label>
            <DateInput required value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              className={inputClass} style={inputStyle} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--ibs-text-muted)" }}>Giờ bắt đầu</label>
              <TimeInput required value={form.startTime} onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}
                className={inputClass} style={inputStyle} />
            </div>
            <div>
              <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--ibs-text-muted)" }}>Giờ kết thúc</label>
              <TimeInput required value={form.endTime} onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))}
                className={inputClass} style={inputStyle} />
            </div>
          </div>
          <div>
            <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--ibs-text-muted)" }}>Lý do OT</label>
            <textarea required rows={3} value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
              placeholder="Nêu lý do tăng ca..." className={`${inputClass} resize-none`} style={inputStyle} />
          </div>
          {error && <div className="text-[12px] px-3 py-2 rounded-lg" style={{ background: "rgba(239,68,68,0.1)", color: "var(--ibs-danger)" }}>{error}</div>}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2 rounded-lg text-[13px] border"
              style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-muted)" }}>Hủy</button>
            <button type="submit" disabled={submitting} className="flex-1 py-2 rounded-lg text-[13px] font-semibold text-white disabled:opacity-60"
              style={{ background: "var(--ibs-accent)" }}>{submitting ? "Đang gửi..." : "Gửi đề xuất"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
