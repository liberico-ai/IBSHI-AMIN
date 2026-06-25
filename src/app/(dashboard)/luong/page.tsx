"use client";

import { useState, useEffect, useCallback } from "react";
import { PageTitle } from "@/components/layout/page-title";
import { DataTable, Column } from "@/components/shared/data-table";
import { formatDate, apiError } from "@/lib/utils";
import { Plus, RefreshCw, X, Download } from "lucide-react";
import { usePermission } from "@/hooks/use-permission";
import { alertDialog } from "@/lib/confirm-dialog";

// ── Types ─────────────────────────────────────────────────────────────────────
type PayrollPeriod = {
  id: string;
  month: number;
  year: number;
  status: string;
  createdAt?: string;
  pieceRateImported?: boolean;
  records: { id: string; netSalary: number; employeeId: string }[];
};

type PayrollRecord = {
  id: string;
  employeeId: string;
  workDays: number;
  otHours: number;
  otConvertedHours: number;
  baseSalary: number;
  grossSalary: number;
  bhxh: number;
  bhyt: number;
  bhtn: number;
  bhxhEmployer: number;
  tncn: number;
  netSalary: number;
  notes?: string;
  detail?: PayslipDetail | null;
  employee: {
    code: string;
    fullName: string;
    department: { name: string };
  };
};

type PayslipDetail = {
  insuranceSalary: number; allowance: number; totalIncome: number; dependentsCount: number;
  responsibilityAllow: number; farAllowance: number; bonusTotal: number; bonusFull?: number;
  pieceRate: number; adjustment: number; adjustmentNote?: string;
  standardDays: number; workDays: number; leaveDays: number;
  otWeekday: number; otWeekdayNight: number; otSunday: number; otSundayNight: number;
  otHoliday: number; otHolidayNight: number; otHoursTotal: number; otConvertedHours: number;
  otFillHours: number; otPaidHours: number;
  salaryWorkActual: number; leavePay: number; fillPay: number; salaryOT: number; nightShiftPay?: number; nightWorkDays?: number; mealOT: number; grossSalary: number;
  bhxhEmployee: number; bhxh8: number; bhyt15: number; bhtn1: number; bhxhEmployer: number;
  otTaxExempt: number; taxableIncome: number; personalDeduction: number; taxableIncomeAfter: number;
  tncn: number; netSalary: number; companyTotalCost: number;
};

type PeriodDetail = Omit<PayrollPeriod, "records"> & { records: PayrollRecord[] };

// ── Helpers ───────────────────────────────────────────────────────────────────
const formatVND = (n: number) => n.toLocaleString("vi-VN") + " đ";

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Nháp",
  PROCESSING: "Đang tính",
  APPROVED: "Đã duyệt",
  PAID: "Đã trả lương",
};

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  DRAFT:      { bg: "rgba(107,114,128,0.15)", color: "#9ca3af" },
  PROCESSING: { bg: "rgba(245,158,11,0.15)",  color: "var(--ibs-warning)" },
  APPROVED:   { bg: "rgba(0,180,216,0.15)",   color: "var(--ibs-accent)" },
  PAID:       { bg: "rgba(16,185,129,0.15)",  color: "var(--ibs-success)" },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_COLORS[status] || STATUS_COLORS.DRAFT;
  return (
    <span
      className="inline-block px-2 py-0.5 rounded-xl text-[11px] font-semibold"
      style={{ background: s.bg, color: s.color }}
    >
      {STATUS_LABELS[status] || status}
    </span>
  );
}

// ── Stat Card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div
      className="flex-1 rounded-xl border p-4 flex flex-col gap-1 min-w-[160px]"
      style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}
    >
      <div className="text-[11px] font-medium" style={{ color: "var(--ibs-text-dim)" }}>{label}</div>
      <div className="text-[22px] font-extrabold leading-tight" style={{ color: color || "var(--ibs-text)" }}>{value}</div>
    </div>
  );
}

// ── Create Period Modal ────────────────────────────────────────────────────────
function CreatePeriodModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const now = new Date();
  const [form, setForm] = useState({
    month: String(now.getMonth() + 1),
    year: String(now.getFullYear()),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const months = Array.from({ length: 12 }, (_, i) => i + 1);
  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    const res = await fetch("/api/v1/payroll", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ month: Number(form.month), year: Number(form.year) }),
    });
    setSaving(false);
    if (res.ok) {
      onSuccess();
    } else {
      const data = await res.json();
      setError(apiError(res.status, data.error));
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div
        className="rounded-2xl w-full max-w-sm mx-4 p-6"
        style={{ background: "var(--ibs-bg-card)", border: "1px solid var(--ibs-border)" }}
      >
        <div className="flex items-center justify-between mb-5">
          <div className="text-[16px] font-bold">Tạo kỳ lương mới</div>
          <button onClick={onClose} style={{ color: "var(--ibs-text-dim)" }}>
            <X size={18} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                className="text-[12px] font-medium mb-1 block"
                style={{ color: "var(--ibs-text-dim)" }}
              >
                Tháng *
              </label>
              <select
                required
                value={form.month}
                onChange={(e) => setForm({ ...form, month: e.target.value })}
                className="w-full rounded-lg px-3 py-2 text-[13px] border"
                style={{
                  background: "var(--ibs-bg)",
                  borderColor: "var(--ibs-border)",
                  color: "var(--ibs-text)",
                }}
              >
                {months.map((m) => (
                  <option key={m} value={m}>
                    Tháng {m}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                className="text-[12px] font-medium mb-1 block"
                style={{ color: "var(--ibs-text-dim)" }}
              >
                Năm *
              </label>
              <select
                required
                value={form.year}
                onChange={(e) => setForm({ ...form, year: e.target.value })}
                className="w-full rounded-lg px-3 py-2 text-[13px] border"
                style={{
                  background: "var(--ibs-bg)",
                  borderColor: "var(--ibs-border)",
                  color: "var(--ibs-text)",
                }}
              >
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {error && <div className="text-[12px] text-red-500">{error}</div>}
          <div className="flex gap-2 justify-end mt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-[13px] border"
              style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-dim)" }}
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-lg text-[13px] font-semibold"
              style={{ background: "var(--ibs-accent)", color: "#fff", opacity: saving ? 0.7 : 1 }}
            >
              {saving ? "Đang tạo..." : "Tạo kỳ lương"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Employee Payslip Modal ──────────────────────────────────────────────────────
function PayslipModal({
  periodId,
  record,
  month,
  year,
  onClose,
}: {
  periodId: string;
  record: PayrollRecord;
  month: number;
  year: number;
  onClose: () => void;
}) {
  const d = record.detail;
  const num = (n: number) => (n || 0).toLocaleString("vi-VN", { maximumFractionDigits: 4 }); // công/giờ giữ số thật, không làm tròn 2 số
  const convDays = d ? (d.otConvertedHours || 0) / 8 : 0;
  const totalWorkDays = d ? (d.workDays || 0) + convDays : 0;

  function Row({ label, value, bold, color, indent, note }: { label: string; value: string; bold?: boolean; color?: string; indent?: boolean; note?: boolean }) {
    return (
      <div className="flex items-center justify-between py-1.5 border-b" style={{ borderColor: "rgba(51,65,85,0.15)" }}>
        <span className={`text-[12.5px] ${indent ? "pl-4" : ""}`} style={{ color: note ? "var(--ibs-text-dim)" : indent ? "var(--ibs-text-dim)" : "var(--ibs-text)", fontWeight: bold ? 700 : 400 }}>{label}</span>
        <span className="text-[12.5px] text-right whitespace-nowrap" style={{ color: color || "var(--ibs-text)", fontWeight: bold ? 700 : 500 }}>{value}</span>
      </div>
    );
  }
  function SectionTitle({ children }: { children: React.ReactNode }) {
    return <div className="text-[12px] font-bold mt-4 mb-1.5 uppercase tracking-wide" style={{ color: "var(--ibs-accent)" }}>{children}</div>;
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="rounded-2xl w-full max-w-lg flex flex-col"
        style={{ background: "var(--ibs-bg-card)", border: "1px solid var(--ibs-border)", maxHeight: "92vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b flex-shrink-0" style={{ borderColor: "var(--ibs-border)" }}>
          <div>
            <div className="text-[15px] font-bold">Phiếu lương — {record.employee.fullName}</div>
            <div className="text-[12px]" style={{ color: "var(--ibs-text-dim)" }}>
              {record.employee.code} · {record.employee.department?.name} · Tháng {month}/{year}
            </div>
          </div>
          <button onClick={onClose} style={{ color: "var(--ibs-text-dim)" }}><X size={18} /></button>
        </div>

        <div className="overflow-auto flex-1 px-5 py-3">
          {!d ? (
            <div className="text-center py-10 text-[13px]" style={{ color: "var(--ibs-text-dim)" }}>
              Chưa có dữ liệu chi tiết cho phiếu lương này. Vui lòng chạy lại <b>Tính lương</b> cho kỳ này.
            </div>
          ) : (
            <>
              <SectionTitle>A. Ngày công &amp; giờ tăng ca</SectionTitle>
              <Row label="Công chuẩn trong tháng" value={`${num(d.standardDays)} ngày`} />
              <Row label="Ngày công đi làm" value={`${num(d.workDays)} ngày`} />
              <Row label="Ngày nghỉ phép/lễ (hưởng lương)" value={`${num(d.leaveDays)} ngày`} />
              {d.otWeekday > 0 && <Row label="Giờ OT ngày thường (×1,5)" value={`${num(d.otWeekday)} giờ`} />}
              {d.otWeekdayNight > 0 && <Row label="Giờ OT đêm ngày thường (×2,0)" value={`${num(d.otWeekdayNight)} giờ`} />}
              {d.otSunday > 0 && <Row label="Giờ OT Chủ nhật (×2,0)" value={`${num(d.otSunday)} giờ`} />}
              {d.otSundayNight > 0 && <Row label="Giờ OT đêm Chủ nhật (×2,7)" value={`${num(d.otSundayNight)} giờ`} />}
              {d.otHoliday > 0 && <Row label="Giờ OT ngày lễ (×3,0)" value={`${num(d.otHoliday)} giờ`} />}
              {d.otHolidayNight > 0 && <Row label="Giờ OT đêm ngày lễ (×3,9)" value={`${num(d.otHolidayNight)} giờ`} />}
              <Row label="Tổng giờ OT quy đổi" value={`${num(d.otConvertedHours)} giờ`} />
              <Row label="Ngày OT quy đổi (÷8)" value={`${num(convDays)} ngày`} />
              <Row label="Tổng ngày công" value={`${num(totalWorkDays)} ngày`} bold color="var(--ibs-accent)" />

              <SectionTitle>B. Thu nhập</SectionTitle>
              <Row label="Lương ngày công đi làm" value={formatVND(d.salaryWorkActual)} />
              {d.leavePay > 0 && <Row label="Lương phép/lễ" value={formatVND(d.leavePay)} />}
              {d.fillPay > 0 && <Row label="Lương giờ OT bù công (1×)" value={formatVND(d.fillPay)} />}
              {d.salaryOT > 0 && <Row label="Lương tăng ca (đã nhân hệ số)" value={formatVND(d.salaryOT)} />}
              {(d.nightShiftPay || 0) > 0 && <Row label="Lương ca đêm (HC Đ ×1.3/2.7/3.9)" value={formatVND(d.nightShiftPay || 0)} />}
              {(d.pieceRate || 0) !== 0 && <Row label="Lương sản phẩm/khoán" value={formatVND(d.pieceRate)} />}
              {(d.responsibilityAllow || 0) > 0 && <Row label="Phụ cấp trách nhiệm" value={formatVND(d.responsibilityAllow)} />}
              {(d.farAllowance || 0) > 0 && <Row label="Phụ cấp nhà xa (≥20km)" value={formatVND(d.farAllowance)} />}
              {(d.adjustment || 0) !== 0 && <Row label={`Điều chỉnh/bổ sung${d.adjustmentNote ? ` (${d.adjustmentNote})` : ""}`} value={formatVND(d.adjustment)} />}
              {(d.mealOT || 0) > 0 && <Row label="Tiền ăn tăng giờ (OT)" value={formatVND(d.mealOT)} />}
              <Row label="TỔNG THU NHẬP (GROSS)" value={formatVND(d.grossSalary)} bold color="var(--ibs-accent)" />

              <SectionTitle>C. Khấu trừ &amp; thuế</SectionTitle>
              {d.bhxh8 > 0 && <Row label="BHXH người lao động (8%)" value={formatVND(d.bhxh8)} color="var(--ibs-warning)" indent />}
              {d.bhyt15 > 0 && <Row label="BHYT (1,5%)" value={formatVND(d.bhyt15)} color="var(--ibs-warning)" indent />}
              {d.bhtn1 > 0 && <Row label="BHTN (1%)" value={formatVND(d.bhtn1)} color="var(--ibs-warning)" indent />}
              <Row label="Thuế TNCN" value={formatVND(d.tncn)} color="var(--ibs-warning)" indent />
              <div className="text-[11px] py-1 pl-4" style={{ color: "var(--ibs-text-dim)" }}>
                TN chịu thuế {formatVND(d.taxableIncome)} − Giảm trừ gia cảnh {formatVND(d.personalDeduction)}
                {(d.bhxhEmployee || 0) > 0 ? ` − BHXH ${formatVND(d.bhxhEmployee)}` : ""}
                {d.otTaxExempt > 0 ? ` · OT miễn thuế ${formatVND(d.otTaxExempt)}` : ""}
              </div>
              <Row label="LƯƠNG THỰC NHẬN (NET)" value={formatVND(d.netSalary)} bold color="var(--ibs-success)" />

              <SectionTitle>D. Phần công ty đóng (tham khảo)</SectionTitle>
              <Row label="BHXH công ty đóng (21,5%)" value={formatVND(d.bhxhEmployer)} color="var(--ibs-text-dim)" note />
            </>
          )}
        </div>

        <div className="px-5 py-3 border-t flex justify-end gap-2 flex-shrink-0" style={{ borderColor: "var(--ibs-border)" }}>
          <a
            href={`/api/v1/payroll/${periodId}/slip/pdf?employeeId=${record.employeeId}`}
            download
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold"
            style={{ background: "var(--ibs-accent)", color: "#fff" }}
          >
            <Download size={13} /> Tải PDF gửi NV
          </a>
        </div>
      </div>
    </div>
  );
}

// ── Period Detail Modal ────────────────────────────────────────────────────────
function PeriodDetailModal({
  period,
  onClose,
}: {
  period: PeriodDetail;
  onClose: () => void;
}) {
  const [slipRecord, setSlipRecord] = useState<PayrollRecord | null>(null);
  const totalGross = period.records.reduce((s, r) => s + r.grossSalary, 0);
  const totalNet = period.records.reduce((s, r) => s + r.netSalary, 0);

  // 28 cột bảng lương để ký (chốt 2026-06-22, khớp mẫu HR). t: text|name|num|money|pdf.
  const COLS: { k: string; h: string; t: "text" | "name" | "num" | "money" | "pdf" }[] = [
    { k: "code", h: "Mã NV", t: "text" },
    { k: "name", h: "Họ tên", t: "name" },
    { k: "dept", h: "Phòng ban", t: "text" },
    { k: "luongCB", h: "Lương CB", t: "money" },
    { k: "kpi", h: "KPI", t: "money" },
    { k: "tongTNhd", h: "Tổng thu nhập", t: "money" },
    { k: "ngayCaNgay", h: "Ngày công ca ngày", t: "num" },
    { k: "ngayCaDem", h: "Ngày công ca đêm", t: "num" },
    { k: "ngayOT", h: "Ngày OT quy đổi", t: "num" },
    { k: "ngayNghi", h: "Ngày công nghỉ hưởng lương", t: "num" },
    { k: "luongCaNgay", h: "Lương ca ngày", t: "money" },
    { k: "luongCaDem", h: "Lương ca đêm", t: "money" },
    { k: "luongKPI", h: "Lương KPI", t: "money" },
    { k: "luongOT", h: "Lương OT", t: "money" },
    { k: "luongCheDo", h: "Lương chế độ", t: "money" },
    { k: "luongTrachNhiem", h: "Lương trách nhiệm + phụ cấp", t: "money" },
    { k: "luongNangSuat", h: "Lương năng suất (khoán)", t: "money" },
    { k: "boSung", h: "Bổ sung khác", t: "money" },
    { k: "anCa", h: "Tiền ăn ca thêm giờ", t: "money" },
    { k: "grossTT", h: "Tổng thu nhập", t: "money" },
    { k: "bhNLD", h: "BHXH NLĐ (10.5%)", t: "money" },
    { k: "bhCty", h: "BHXH Công ty (21.5%)", t: "money" },
    { k: "tncn", h: "Thuế TNCN", t: "money" },
    { k: "thucNhan", h: "Tổng thực nhận", t: "money" },
    { k: "tt1", h: "Thanh toán lần 1", t: "money" },
    { k: "conLai", h: "Còn phải TT lần 2", t: "money" },
    { k: "atm1", h: "ATM lần 1", t: "money" },
    { k: "atm2", h: "ATM lần 2", t: "money" },
    { k: "pdf", h: "Phiếu lương", t: "pdf" },
  ];

  const rowVals = (r: PayrollRecord): Record<string, any> => {
    const d = r.detail;
    const cc = d?.standardDays || 26;                       // mẫu số = công chuẩn tháng (ngày − CN)
    const luongCB = d?.insuranceSalary ?? r.baseSalary ?? 0;
    const trachNhiem = d?.bonusTotal ?? 0;                   // thực trả: vào cột "Lương trách nhiệm + phụ cấp"
    // KPI trừ phụ cấp ĐẦY ĐỦ (resp + nhà xa full) → 200k nhà xa KHÔNG nằm trong KPI (kể cả khi công≤14 bị cắt).
    const kpi = (d?.allowance ?? 0) - (d?.bonusFull ?? trachNhiem);
    const workDays = r.workDays || 0;                       // TỔNG công (ca ngày + ca đêm)
    const nightDays = (d as any)?.nightWorkDays ?? 0;        // công ca đêm
    const dayDays = workDays - nightDays;                    // công ca ngày (tách để tính cột Lương ca ngày/KPI)
    const thucNhan = r.netSalary;
    const tt1 = 0;                                           // thanh toán lần 1 — tính năng thanh toán từng đợt (làm sau)
    return {
      code: r.employee.code, name: r.employee.fullName, dept: r.employee.department?.name || "",
      luongCB, kpi, tongTNhd: luongCB + kpi,
      ngayCaNgay: dayDays, ngayCaDem: nightDays, ngayOT: (r.otConvertedHours || 0) / 8, ngayNghi: (d?.leaveDays ?? 0) + ((d as any)?.bhxhLeaveDays ?? 0),
      luongCaNgay: cc > 0 ? (dayDays * luongCB) / cc : 0, luongCaDem: (d as any)?.nightShiftPay ?? 0, luongKPI: cc > 0 ? (dayDays * kpi) / cc : 0,
      luongOT: d?.salaryOT ?? 0, luongCheDo: d?.leavePay ?? 0, luongTrachNhiem: trachNhiem,
      luongNangSuat: d?.pieceRate ?? 0, boSung: d?.adjustment ?? 0, anCa: d?.mealOT ?? 0,
      grossTT: r.grossSalary, bhNLD: r.bhxh + r.bhyt + r.bhtn, bhCty: r.bhxhEmployer || 0, tncn: r.tncn,
      thucNhan, tt1, conLai: thucNhan - tt1, atm1: tt1, atm2: thucNhan - tt1,
    };
  };

  const allVals = period.records.map((r) => ({ r, v: rowVals(r) }));
  const totals: Record<string, number> = {};
  for (const c of COLS) if (c.t === "money") totals[c.k] = allVals.reduce((s, x) => s + (x.v[c.k] || 0), 0);

  async function exportExcel() {
    const { default: ExcelJS } = await import("exceljs");
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(`Lương T${period.month}-${period.year}`);
    ws.columns = COLS.filter((c) => c.t !== "pdf").map((c) => ({ header: c.h, key: c.k, width: c.t === "name" ? 24 : c.t === "text" ? 14 : 16 }));
    ws.getRow(1).font = { bold: true };
    for (const { v } of allVals) {
      const row: Record<string, any> = {};
      // Công/OT (num) GIỮ SỐ THẬT — chỉ tiền (money) mới làm tròn (chốt: chỉ làm tròn lương & thuế).
      for (const c of COLS) if (c.t !== "pdf") row[c.k] = c.t === "num" ? (v[c.k] || 0) : v[c.k];
      ws.addRow(row);
    }
    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `luong-t${period.month}-${period.year}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div
        className="rounded-2xl w-full max-w-7xl mx-4 flex flex-col"
        style={{
          background: "var(--ibs-bg-card)",
          border: "1px solid var(--ibs-border)",
          maxHeight: "90vh",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0"
          style={{ borderColor: "var(--ibs-border)" }}
        >
          <div className="flex items-center gap-3">
            <div className="text-[17px] font-bold">
              Kỳ lương Tháng {period.month}/{period.year}
            </div>
            <StatusBadge status={period.status} />
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-6 mr-2">
              <div className="text-center">
                <div className="text-[11px] font-medium" style={{ color: "var(--ibs-text-dim)" }}>
                  Số nhân viên
                </div>
                <div className="text-[20px] font-extrabold" style={{ color: "var(--ibs-accent)" }}>
                  {period.records.length}
                </div>
              </div>
              <div className="text-center">
                <div className="text-[11px] font-medium" style={{ color: "var(--ibs-text-dim)" }}>
                  Tổng Gross
                </div>
                <div className="text-[14px] font-bold" style={{ color: "var(--ibs-text)" }}>
                  {formatVND(totalGross)}
                </div>
              </div>
              <div className="text-center">
                <div className="text-[11px] font-medium" style={{ color: "var(--ibs-text-dim)" }}>
                  Tổng Net
                </div>
                <div className="text-[14px] font-bold" style={{ color: "var(--ibs-success)" }}>
                  {formatVND(totalNet)}
                </div>
              </div>
            </div>
            <button
              onClick={exportExcel}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] border"
              style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-dim)" }}
            >
              <Download size={12} /> Export Excel
            </button>
            <button onClick={onClose} style={{ color: "var(--ibs-text-dim)" }}>
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-auto flex-1 p-4">
          {period.records.length === 0 ? (
            <div className="text-center py-16">
              <div className="text-4xl mb-3">📄</div>
              <p className="text-[13px]" style={{ color: "var(--ibs-text-dim)" }}>
                Chưa có dữ liệu lương. Hãy chạy tính lương để tạo bảng lương.
              </p>
            </div>
          ) : (
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr>
                  {COLS.map((c) => (
                    <th key={c.k} className="px-2 py-2 font-semibold border-b whitespace-nowrap" style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-dim)", background: "var(--ibs-bg)", textAlign: c.t === "money" ? "right" : c.t === "num" ? "center" : "left" }}>{c.h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allVals.map(({ r, v }, i) => (
                  <tr key={r.id} style={{ background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.02)" }}>
                    {COLS.map((c) => {
                      const val = v[c.k];
                      const bc = "rgba(51,65,85,0.3)";
                      if (c.t === "name") return <td key={c.k} className="px-2 py-1.5 border-b whitespace-nowrap" style={{ borderColor: bc }}><button onClick={() => setSlipRecord(r)} className="hover:underline text-left" style={{ color: "var(--ibs-accent)", fontWeight: 600 }} title="Xem phiếu lương">{val}</button></td>;
                      if (c.t === "pdf") return <td key={c.k} className="px-2 py-1.5 border-b text-center" style={{ borderColor: bc }}><a href={`/api/v1/payroll/${period.id}/slip/pdf?employeeId=${r.employeeId}`} download className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] border" style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-accent)" }}><Download size={10} /> PDF</a></td>;
                      if (c.t === "text") return <td key={c.k} className="px-2 py-1.5 border-b whitespace-nowrap" style={{ borderColor: bc, color: c.k === "code" ? "var(--ibs-accent)" : "var(--ibs-text-dim)", fontFamily: c.k === "code" ? "monospace" : undefined, fontWeight: c.k === "code" ? 600 : undefined }}>{val}</td>;
                      if (c.t === "num") return <td key={c.k} className="px-2 py-1.5 border-b text-center" style={{ borderColor: bc }}>{(val || 0).toLocaleString("vi-VN", { maximumFractionDigits: 4 })}</td>;
                      return <td key={c.k} className="px-2 py-1.5 border-b text-right whitespace-nowrap" style={{ borderColor: bc, color: c.k === "thucNhan" ? "var(--ibs-success)" : (c.k === "bhNLD" || c.k === "tncn") ? "var(--ibs-warning)" : undefined, fontWeight: c.k === "thucNhan" || c.k === "grossTT" ? 600 : undefined }}>{formatVND(val || 0)}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: "rgba(0,180,216,0.04)" }}>
                  <td colSpan={3} className="px-2 py-2 text-right font-bold border-t" style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-dim)" }}>Tổng cộng ({period.records.length} NV)</td>
                  {COLS.slice(3).map((c) => (
                    c.t === "money"
                      ? <td key={c.k} className="px-2 py-2 text-right font-bold whitespace-nowrap border-t" style={{ borderColor: "var(--ibs-border)", color: c.k === "thucNhan" ? "var(--ibs-success)" : "var(--ibs-text)" }}>{formatVND(totals[c.k] || 0)}</td>
                      : <td key={c.k} className="border-t" style={{ borderColor: "var(--ibs-border)" }} />
                  ))}
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>
    </div>
    {slipRecord && (
      <PayslipModal
        periodId={period.id}
        record={slipRecord}
        month={period.month}
        year={period.year}
        onClose={() => setSlipRecord(null)}
      />
    )}
    </>
  );
}

// ── Import Lương sản phẩm Modal ──────────────────────────────────────────────────
function ImportPieceRateModal({
  period,
  onClose,
  onSuccess,
}: {
  period: PayrollPeriod;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ imported: number; notFound: number; notFoundNames: string[] } | null>(null);

  async function handleUpload() {
    if (!file) { setError("Vui lòng chọn file Excel"); return; }
    setUploading(true); setError("");
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`/api/v1/payroll/${period.id}/piece-rate`, { method: "POST", body: fd });
    setUploading(false);
    const data = await res.json();
    if (res.ok) setResult(data.data);
    else setError(apiError(res.status, data.error));
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
      <div className="rounded-2xl w-full max-w-md p-6" style={{ background: "var(--ibs-bg-card)", border: "1px solid var(--ibs-border)" }}>
        <div className="flex items-center justify-between mb-4">
          <div className="text-[16px] font-bold">Import Lương khoán theo Tổ — T{period.month}/{period.year}</div>
          <button onClick={onClose} style={{ color: "var(--ibs-text-dim)" }}><X size={18} /></button>
        </div>

        {!result ? (
          <div className="flex flex-col gap-4">
            <p className="text-[12.5px]" style={{ color: "var(--ibs-text-dim)" }}>
              File Excel cần có cột <b>Tổ</b> và <b>Lương khoán</b> (tiền khoán cả tổ). Khi bấm <b>"Tính lại"</b>, hệ thống tự chia cho từng NV theo công thức: (khoán tổ − lương thời gian tổ) ÷ tổng công tổ × công cá nhân. Tải template có sẵn danh sách tổ:
            </p>
            <a
              href={`/api/v1/payroll/${period.id}/piece-rate`}
              download
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-semibold w-fit border"
              style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-accent)" }}
            >
              <Download size={13} /> Tải template Excel
            </a>
            <div>
              <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Chọn file đã điền *</label>
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="block w-full text-[12px] file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:text-[12px] file:font-semibold"
                style={{ color: "var(--ibs-text)" }}
              />
            </div>
            {error && <div className="text-[12px] text-red-500">{error}</div>}
            <div className="flex gap-2 justify-end">
              <button onClick={onClose} className="px-4 py-2 rounded-lg text-[13px] border" style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-dim)" }}>Hủy</button>
              <button onClick={handleUpload} disabled={uploading} className="px-4 py-2 rounded-lg text-[13px] font-semibold" style={{ background: "var(--ibs-accent)", color: "#fff", opacity: uploading ? 0.7 : 1 }}>
                {uploading ? "Đang import..." : "Import"}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="text-[13px]">✅ Đã import khoán cho <b>{result.imported}</b> tổ.</div>
            {result.notFound > 0 && (
              <div className="text-[12px]" style={{ color: "var(--ibs-warning)" }}>
                ⚠️ {result.notFound} tên Tổ không khớp hệ thống (bỏ qua){result.notFoundNames.length ? `: ${result.notFoundNames.join(", ")}` : ""}
              </div>
            )}
            <div className="text-[12px]" style={{ color: "var(--ibs-text-dim)" }}>Giờ bấm <b>"Tính lại"</b> để hệ thống chia khoán ra lương SP từng NV.</div>
            <div className="flex justify-end">
              <button onClick={onSuccess} className="px-4 py-2 rounded-lg text-[13px] font-semibold" style={{ background: "var(--ibs-accent)", color: "#fff" }}>Xong</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Import Bổ sung lương (Bổ sung khác / điều chỉnh tay) Modal ───────────────
function ImportAdjustmentModal({
  period,
  onClose,
  onSuccess,
}: {
  period: PayrollPeriod;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ imported: number; notFound: number; notFoundCodes: string[] } | null>(null);

  async function handleUpload() {
    if (!file) { setError("Vui lòng chọn file Excel"); return; }
    setUploading(true); setError("");
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`/api/v1/payroll/${period.id}/adjustment`, { method: "POST", body: fd });
    setUploading(false);
    const data = await res.json();
    if (res.ok) setResult(data.data); else setError(apiError(res.status, data.error));
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
      <div className="rounded-2xl w-full max-w-md p-6" style={{ background: "var(--ibs-bg-card)", border: "1px solid var(--ibs-border)" }}>
        <div className="flex items-center justify-between mb-4">
          <div className="text-[16px] font-bold">Import Bổ sung lương — T{period.month}/{period.year}</div>
          <button onClick={onClose} style={{ color: "var(--ibs-text-dim)" }}><X size={18} /></button>
        </div>
        {!result ? (
          <div className="flex flex-col gap-4">
            <p className="text-[12.5px]" style={{ color: "var(--ibs-text-dim)" }}>
              File Excel cần cột <b>Mã NV</b> và <b>Bổ sung khác</b> (số tiền). Nhập <b>số âm</b> để truy thu, dương để bổ sung. Có thể thêm cột <b>Lý do</b> — sẽ hiện ở phiếu lương chi tiết của NV (không hiện ở bảng tổng). Tải template có sẵn danh sách NV của kỳ:
            </p>
            <a href={`/api/v1/payroll/${period.id}/adjustment`} download className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-semibold w-fit border" style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-accent)" }}>
              <Download size={13} /> Tải template Excel
            </a>
            <div>
              <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Chọn file đã điền *</label>
              <input type="file" accept=".xlsx,.xls" onChange={(e) => setFile(e.target.files?.[0] || null)} className="block w-full text-[12px] file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:text-[12px] file:font-semibold" style={{ color: "var(--ibs-text)" }} />
            </div>
            {error && <div className="text-[12px] text-red-500">{error}</div>}
            <div className="flex gap-2 justify-end">
              <button onClick={onClose} className="px-4 py-2 rounded-lg text-[13px] border" style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-dim)" }}>Hủy</button>
              <button onClick={handleUpload} disabled={uploading} className="px-4 py-2 rounded-lg text-[13px] font-semibold" style={{ background: "var(--ibs-accent)", color: "#fff", opacity: uploading ? 0.7 : 1 }}>
                {uploading ? "Đang import..." : "Import"}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="text-[13px]">✅ Đã import bổ sung cho <b>{result.imported}</b> NV.</div>
            {result.notFound > 0 && (
              <div className="text-[12px]" style={{ color: "var(--ibs-warning)" }}>
                ⚠️ {result.notFound} mã NV không có trong hệ thống (bỏ qua){result.notFoundCodes.length ? `: ${result.notFoundCodes.join(", ")}` : ""}
              </div>
            )}
            <div className="text-[12px]" style={{ color: "var(--ibs-text-dim)" }}>Giờ bấm <b>"Tính lại"</b> để áp vào lương.</div>
            <div className="flex justify-end">
              <button onClick={onSuccess} className="px-4 py-2 rounded-lg text-[13px] font-semibold" style={{ background: "var(--ibs-accent)", color: "#fff" }}>Xong</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Import Bổ sung tiền ăn (cộng/trừ cột Tiền ăn ca thêm giờ) Modal ──────────
function ImportMealBonusModal({
  period,
  onClose,
  onSuccess,
}: {
  period: PayrollPeriod;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ imported: number; notFound: number; notFoundCodes: string[] } | null>(null);

  async function handleUpload() {
    if (!file) { setError("Vui lòng chọn file Excel"); return; }
    setUploading(true); setError("");
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`/api/v1/payroll/${period.id}/meal-bonus`, { method: "POST", body: fd });
    setUploading(false);
    const data = await res.json();
    if (res.ok) setResult(data.data); else setError(apiError(res.status, data.error));
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
      <div className="rounded-2xl w-full max-w-md p-6" style={{ background: "var(--ibs-bg-card)", border: "1px solid var(--ibs-border)" }}>
        <div className="flex items-center justify-between mb-4">
          <div className="text-[16px] font-bold">Import Bổ sung tiền ăn — T{period.month}/{period.year}</div>
          <button onClick={onClose} style={{ color: "var(--ibs-text-dim)" }}><X size={18} /></button>
        </div>
        {!result ? (
          <div className="flex flex-col gap-4">
            <p className="text-[12.5px]" style={{ color: "var(--ibs-text-dim)" }}>
              File Excel cần cột <b>Mã NV</b> và <b>Bổ sung tiền ăn</b> (số tiền). Số này <b>cộng/trừ</b> vào cột <b>Tiền ăn ca thêm giờ</b> (số âm để trừ bớt). Chịu thuế nên hệ thống tính lại thuế + thực lĩnh. Tải template có sẵn danh sách NV của kỳ:
            </p>
            <a href={`/api/v1/payroll/${period.id}/meal-bonus`} download className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-semibold w-fit border" style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-accent)" }}>
              <Download size={13} /> Tải template Excel
            </a>
            <div>
              <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Chọn file đã điền *</label>
              <input type="file" accept=".xlsx,.xls" onChange={(e) => setFile(e.target.files?.[0] || null)} className="block w-full text-[12px] file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:text-[12px] file:font-semibold" style={{ color: "var(--ibs-text)" }} />
            </div>
            {error && <div className="text-[12px] text-red-500">{error}</div>}
            <div className="flex gap-2 justify-end">
              <button onClick={onClose} className="px-4 py-2 rounded-lg text-[13px] border" style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-dim)" }}>Hủy</button>
              <button onClick={handleUpload} disabled={uploading} className="px-4 py-2 rounded-lg text-[13px] font-semibold" style={{ background: "var(--ibs-accent)", color: "#fff", opacity: uploading ? 0.7 : 1 }}>
                {uploading ? "Đang import..." : "Import"}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="text-[13px]">✅ Đã import bổ sung tiền ăn cho <b>{result.imported}</b> NV.</div>
            {result.notFound > 0 && (
              <div className="text-[12px]" style={{ color: "var(--ibs-warning)" }}>
                ⚠️ {result.notFound} mã NV không có trong hệ thống (bỏ qua){result.notFoundCodes.length ? `: ${result.notFoundCodes.join(", ")}` : ""}
              </div>
            )}
            <div className="text-[12px]" style={{ color: "var(--ibs-text-dim)" }}>Giờ bấm <b>"Tính lại"</b> để áp vào lương.</div>
            <div className="flex justify-end">
              <button onClick={onSuccess} className="px-4 py-2 rounded-lg text-[13px] font-semibold" style={{ background: "var(--ibs-accent)", color: "#fff" }}>Xong</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Import file BHXH Modal (preview → confirm) ──────────────────────────────
function ImportBhxhModal({
  period,
  onClose,
  onSuccess,
}: {
  period: PayrollPeriod;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<any | null>(null);
  const [confirmed, setConfirmed] = useState<any | null>(null);

  async function doRequest(mode: "preview" | "confirm") {
    if (!file) { setError("Chọn file Excel trước"); return; }
    setLoading(true); setError("");
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`/api/v1/payroll/${period.id}/upload-bhxh?mode=${mode}`, { method: "POST", body: fd });
    setLoading(false);
    const data = await res.json();
    if (!res.ok) { setError(apiError(res.status, data.error)); return; }
    if (mode === "preview") setPreview(data.data);
    else setConfirmed(data.data);
  }

  async function downloadTemplate() {
    const { default: ExcelJS } = await import("exceljs");
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("BHXH");
    const hr = ws.addRow(["Mã NV", "Họ tên", "BHXH (8%)", "BHYT (1.5%)", "BHTN (1%)", "BHXH Công ty (21.5%)"]);
    hr.font = { bold: true };
    ws.addRow(["190839", "Vũ Phương Anh (ví dụ — xoá dòng này)", 454560, 85230, 56820, 1221630]);
    [12, 28, 14, 14, 14, 20].forEach((w, i) => (ws.getColumn(i + 1).width = w));
    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `mau-bhxh-T${period.month}-${period.year}.xlsx`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
      <div className="rounded-2xl w-full max-w-3xl p-6 max-h-[90vh] overflow-y-auto" style={{ background: "var(--ibs-bg-card)", border: "1px solid var(--ibs-border)" }}>
        <div className="flex items-center justify-between mb-4">
          <div className="text-[16px] font-bold">Import file BHXH — T{period.month}/{period.year}</div>
          <button onClick={onClose} style={{ color: "var(--ibs-text-dim)" }}><X size={18} /></button>
        </div>

        {!preview && !confirmed && (
          <div className="flex flex-col gap-3">
            <p className="text-[12.5px]" style={{ color: "var(--ibs-text-dim)" }}>
              Upload file Excel BHXH do HCNS tính ngoài — hỗ trợ <b>thẳng file BHXH chuẩn</b> (có nhóm "10.5% Người lao động" / "21.5% Công ty đóng", cột Cộng NLĐ + Cộng Cty) hoặc file theo mẫu.
              Hệ thống lấy: Mã NV, BHXH 8% / BHYT 1.5% / BHTN 1% (NLĐ — <b>trừ</b> vào lương) và Cộng Cty 21.5% (<b>chỉ báo cáo, KHÔNG trừ</b>).
            </p>
            <div>
              <button onClick={downloadTemplate} className="text-[12px] underline" style={{ color: "var(--ibs-accent)" }}>⬇ Tải file mẫu</button>
            </div>
            <div>
              <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Chọn file Excel *</label>
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="block w-full text-[12px] file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:text-[12px] file:font-semibold"
              />
            </div>
            {error && <div className="text-[12px] text-red-500">{error}</div>}
            <div className="flex gap-2 justify-end">
              <button onClick={onClose} className="px-4 py-2 rounded-lg text-[13px] border" style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-dim)" }}>Hủy</button>
              <button onClick={() => doRequest("preview")} disabled={loading} className="px-4 py-2 rounded-lg text-[13px] font-semibold" style={{ background: "var(--ibs-accent)", color: "#fff", opacity: loading ? 0.7 : 1 }}>
                {loading ? "Đang xử lý..." : "Xem preview"}
              </button>
            </div>
          </div>
        )}

        {preview && !confirmed && (
          <div className="flex flex-col gap-3">
            <div className="text-[13px] font-semibold">Preview — sẽ KHÔNG ghi cho đến khi anh bấm Xác nhận:</div>
            <div className="grid grid-cols-2 gap-2 text-[12.5px]">
              <div>Tổng dòng trong file: <b>{preview.summary.totalRows}</b></div>
              <div>NV khớp với DB: <b style={{ color: "var(--ibs-accent)" }}>{preview.summary.matched}</b></div>
              <div>NV không tìm thấy: <b style={{ color: preview.summary.notFound > 0 ? "var(--ibs-warning)" : "inherit" }}>{preview.summary.notFound}</b></div>
              <div>Σ BHXH NLĐ (8+1.5+1%): <b>{formatVND(preview.summary.totalEmployee)}</b></div>
              <div>Σ BHXH Công ty (21.5%): <b>{formatVND(preview.summary.totalEmployer)}</b></div>
            </div>

            {preview.notFound.length > 0 && (
              <div className="rounded-lg p-2 text-[11.5px]" style={{ background: "rgba(245,158,11,0.08)", color: "var(--ibs-warning)" }}>
                ⚠️ {preview.notFound.length} mã NV trong Excel không có trong DB (bỏ qua):<br />
                {preview.notFound.slice(0, 10).map((n: any) => `${n.code}`).join(", ")}{preview.notFound.length > 10 ? "..." : ""}
              </div>
            )}

            <div className="text-[12px] mt-1 font-semibold">Mẫu 50 NV đầu khớp DB:</div>
            <div className="overflow-y-auto max-h-[280px] border rounded" style={{ borderColor: "var(--ibs-border)" }}>
              <table className="w-full text-[11px]">
                <thead style={{ background: "var(--ibs-bg)" }}>
                  <tr>
                    <th className="px-2 py-1 text-left">Mã</th>
                    <th className="px-2 py-1 text-left">Họ tên</th>
                    <th className="px-2 py-1 text-right">BHXH 8%</th>
                    <th className="px-2 py-1 text-right">BHYT 1.5%</th>
                    <th className="px-2 py-1 text-right">BHTN 1%</th>
                    <th className="px-2 py-1 text-right">Σ NLĐ</th>
                    <th className="px-2 py-1 text-right">Công ty 21.5%</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.matched.map((m: any) => (
                    <tr key={m.code} className="border-t" style={{ borderColor: "var(--ibs-border)" }}>
                      <td className="px-2 py-1 font-mono">{m.code}</td>
                      <td className="px-2 py-1">{m.fullName}</td>
                      <td className="px-2 py-1 text-right">{m.bhxh8 ? formatVND(m.bhxh8) : "—"}</td>
                      <td className="px-2 py-1 text-right">{m.bhyt15 ? formatVND(m.bhyt15) : "—"}</td>
                      <td className="px-2 py-1 text-right">{m.bhtn1 ? formatVND(m.bhtn1) : "—"}</td>
                      <td className="px-2 py-1 text-right font-semibold">{formatVND(m.employeeTotal)}</td>
                      <td className="px-2 py-1 text-right">{m.bhxhEmployer ? formatVND(m.bhxhEmployer) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="text-[11.5px] italic" style={{ color: "var(--ibs-text-dim)" }}>
              ⚠️ Bấm "Xác nhận import" sẽ XOÁ hết BHXH đã import của kỳ này rồi ghi mới (idempotent).
              Sau khi import xong, hãy bấm "Tính lại" lương để áp BHXH vào kết quả.
            </div>
            {error && <div className="text-[12px] text-red-500">{error}</div>}
            <div className="flex gap-2 justify-end">
              <button onClick={() => { setPreview(null); setFile(null); }} className="px-4 py-2 rounded-lg text-[13px] border" style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-dim)" }}>Quay lại chọn file</button>
              <button onClick={() => doRequest("confirm")} disabled={loading} className="px-4 py-2 rounded-lg text-[13px] font-semibold text-white" style={{ background: "#22c55e", opacity: loading ? 0.7 : 1 }}>
                {loading ? "Đang ghi..." : `Xác nhận import (${preview.summary.matched} NV)`}
              </button>
            </div>
          </div>
        )}

        {confirmed && (
          <div className="flex flex-col gap-3">
            <div className="text-[14px] font-semibold" style={{ color: "var(--ibs-success)" }}>✅ Import BHXH thành công!</div>
            <div className="grid grid-cols-2 gap-2 text-[12.5px]">
              <div>Số NV đã ghi: <b>{confirmed.imported}</b></div>
              <div>Không khớp (bỏ qua): <b>{confirmed.notFound}</b></div>
            </div>
            <div className="text-[12px]" style={{ color: "var(--ibs-text-dim)" }}>
              Bấm <b>Xong</b> để đóng. Sau đó nhớ bấm <b>"Tính lại"</b> lương để áp BHXH vào kết quả kỳ này.
            </div>
            <div className="flex justify-end">
              <button onClick={onSuccess} className="px-4 py-2 rounded-lg text-[13px] font-semibold" style={{ background: "var(--ibs-accent)", color: "#fff" }}>Xong</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function LuongPage() {
  const [periods, setPeriods] = useState<PayrollPeriod[]>([]);
  const [loading, setLoading] = useState(true);
  const { canDo, hasRole } = usePermission();
  const [showCreate, setShowCreate] = useState(false);
  const [detailPeriod, setDetailPeriod] = useState<PeriodDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [calculatingId, setCalculatingId] = useState<string | null>(null);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [importPeriod, setImportPeriod] = useState<PayrollPeriod | null>(null);
  const [importBhxhPeriod, setImportBhxhPeriod] = useState<PayrollPeriod | null>(null);
  const [importAdjPeriod, setImportAdjPeriod] = useState<PayrollPeriod | null>(null);
  const [importMealPeriod, setImportMealPeriod] = useState<PayrollPeriod | null>(null);
  const [actionMenu, setActionMenu] = useState<{ row: PayrollPeriod; x: number; y: number } | null>(null);

  useEffect(() => {
    fetch("/api/v1/me").then((r) => r.json()).then((res) => setAllowed(!!res.canViewPayroll)).catch(() => setAllowed(false));
  }, []);

  const canManage = canDo("payroll", "calculate");
  const isBOM = hasRole("BOM");
  const isHRAdmin = hasRole("HR_ADMIN");

  const fetchPeriods = useCallback(() => {
    setLoading(true);
    fetch("/api/v1/payroll")
      .then((r) => r.json())
      .then((res) => setPeriods(res.data || []))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchPeriods();
  }, [fetchPeriods]);

  async function handleCalculate(id: string) {
    setCalculatingId(id);
    const res = await fetch(`/api/v1/payroll/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "CALCULATE" }),
    });
    setCalculatingId(null);
    if (!res.ok) {
      const json = await res.json().catch(() => null);
      await alertDialog(apiError(res.status, json?.error) || "Tính lương thất bại");
      return;
    }
    fetchPeriods();
  }

  async function handleApprove(id: string) {
    setActioningId(id);
    await fetch(`/api/v1/payroll/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "APPROVE" }),
    });
    setActioningId(null);
    fetchPeriods();
  }

  async function handleMarkPaid(id: string) {
    setActioningId(id);
    await fetch(`/api/v1/payroll/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "PAID" }),
    });
    setActioningId(null);
    fetchPeriods();
  }

  async function handleViewDetail(id: string) {
    setLoadingDetail(true);
    const res = await fetch(`/api/v1/payroll/${id}`);
    const data = await res.json();
    setDetailPeriod(data.data || null);
    setLoadingDetail(false);
  }

  // ── Summary stats ────────────────────────────────────────────────────────
  const totalPeriods = periods.length;
  const pendingApprovalCount = periods.filter(
    (p) => p.status === "PROCESSING" || p.status === "DRAFT"
  ).length;
  const paidCount = periods.filter((p) => p.status === "PAID").length;

  const lastMonthPaid = [...periods]
    .filter((p) => p.status === "PAID")
    .sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      return b.month - a.month;
    })[0];

  const lastMonthTotal = lastMonthPaid
    ? lastMonthPaid.records.reduce((s, r) => s + r.netSalary, 0)
    : 0;

  // ── Columns ──────────────────────────────────────────────────────────────
  const columns: Column<PayrollPeriod>[] = [
    {
      key: "period",
      header: "Kỳ lương",
      render: (row) => (
        <span className="font-semibold">
          Tháng {row.month}/{row.year}
        </span>
      ),
    },
    {
      key: "status",
      header: "Trạng thái",
      width: "130px",
      render: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: "headcount",
      header: "Số NV",
      width: "80px",
      render: (row) => (
        <span className="font-semibold" style={{ color: "var(--ibs-accent)" }}>
          {row.records.length}
        </span>
      ),
    },
    {
      key: "totalNet",
      header: "Tổng lương net",
      render: (row) => {
        const total = row.records.reduce((s, r) => s + r.netSalary, 0);
        return total > 0 ? (
          <span className="font-semibold" style={{ color: "var(--ibs-success)" }}>
            {formatVND(total)}
          </span>
        ) : (
          <span style={{ color: "var(--ibs-text-dim)" }}>—</span>
        );
      },
    },
    {
      key: "createdAt",
      header: "Ngày tạo",
      width: "120px",
      render: (row) => (
        <span style={{ color: "var(--ibs-text-dim)" }}>
          {row.createdAt ? formatDate(new Date(row.createdAt)) : "—"}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      width: "200px",
      render: (row) => (
        <div className="flex items-center gap-1">
          {canManage && (row.status === "DRAFT" || row.status === "PROCESSING") && (
            <button
              onClick={() => handleCalculate(row.id)}
              disabled={calculatingId === row.id}
              className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold"
              style={{ background: "rgba(245,158,11,0.15)", color: "var(--ibs-warning)", opacity: calculatingId === row.id ? 0.7 : 1 }}
            >
              <RefreshCw size={11} className={calculatingId === row.id ? "animate-spin" : ""} />
              {calculatingId === row.id ? "Đang tính..." : row.status === "DRAFT" ? "Tính lương" : "Tính lại"}
            </button>
          )}
          <button
            onClick={() => handleViewDetail(row.id)}
            disabled={loadingDetail}
            className="flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-semibold"
            style={{ background: "rgba(0,180,216,0.12)", color: "var(--ibs-accent)" }}
          >
            Xem chi tiết
          </button>
          {(canManage || isBOM || isHRAdmin) && (
            <button
              onClick={(e) => { const b = e.currentTarget.getBoundingClientRect(); setActionMenu({ row, x: b.right, y: b.bottom }); }}
              className="flex items-center gap-0.5 px-2 py-1 rounded text-[11px] font-semibold"
              style={{ background: "rgba(148,163,184,0.15)", color: "var(--ibs-text-dim)" }}
              title="Thao tác khác (import, duyệt...)"
            >
              Thao tác ▾
            </button>
          )}
        </div>
      ),
    },
  ];

  if (allowed === false) {
    return (
      <div>
        <PageTitle title="M7 - Lương & BHXH" description="Quản lý lương, BHXH" />
        <div className="rounded-xl border p-10 text-center text-[14px]"
          style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)", color: "var(--ibs-text-muted)" }}>
          🔒 Bạn không có quyền truy cập mục Lương &amp; BHXH. Vui lòng liên hệ quản trị nếu cần.
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageTitle
        title="M7 - Lương & BHXH"
        description="Quản lý kỳ lương, tính lương tự động từ chấm công, phê duyệt và chi trả"
      />

      {/* Summary stats */}
      <div className="flex gap-4 mb-5 flex-wrap">
        <StatCard
          label="Tổng kỳ lương"
          value={totalPeriods}
          color="var(--ibs-accent)"
        />
        <StatCard
          label="Chờ duyệt / Nháp"
          value={pendingApprovalCount}
          color={pendingApprovalCount > 0 ? "var(--ibs-warning)" : "var(--ibs-text-dim)"}
        />
        <StatCard
          label="Đã trả lương"
          value={paidCount}
          color="var(--ibs-success)"
        />
        <StatCard
          label={
            lastMonthPaid
              ? `Net kỳ T${lastMonthPaid.month}/${lastMonthPaid.year}`
              : "Net kỳ gần nhất"
          }
          value={lastMonthTotal > 0 ? formatVND(lastMonthTotal) : "—"}
          color="var(--ibs-success)"
        />
      </div>

      {/* Period list */}
      <div
        className="rounded-xl border overflow-hidden"
        style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}
      >
        <div
          className="px-5 py-4 border-b flex items-center justify-between"
          style={{ borderColor: "var(--ibs-border)" }}
        >
          <h3 className="text-sm font-semibold">Danh sách kỳ lương</h3>
          {canManage && (
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold"
              style={{ background: "var(--ibs-accent)", color: "#fff" }}
            >
              <Plus size={13} /> Tạo kỳ lương
            </button>
          )}
        </div>

        {loading ? (
          <div
            className="flex items-center justify-center py-16 text-[13px]"
            style={{ color: "var(--ibs-text-dim)" }}
          >
            <RefreshCw size={16} className="animate-spin mr-2" /> Đang tải...
          </div>
        ) : periods.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-4xl mb-3">💰</div>
            <p className="text-[13px]" style={{ color: "var(--ibs-text-dim)" }}>
              Chưa có kỳ lương nào.{" "}
              {canManage && (
                <button
                  onClick={() => setShowCreate(true)}
                  className="underline"
                  style={{ color: "var(--ibs-accent)" }}
                >
                  Tạo kỳ lương đầu tiên
                </button>
              )}
            </p>
          </div>
        ) : (
          <DataTable
            data={periods as unknown as Record<string, unknown>[]}
            columns={columns as unknown as Column<Record<string, unknown>>[]}
          />
        )}
      </div>

      {/* Create modal */}
      {showCreate && (
        <CreatePeriodModal
          onClose={() => setShowCreate(false)}
          onSuccess={() => {
            setShowCreate(false);
            fetchPeriods();
          }}
        />
      )}

      {/* Menu "Thao tác" theo từng kỳ (vị trí fixed — không bị bảng che) */}
      {actionMenu && (() => {
        const row = actionMenu.row;
        const draft = row.status === "DRAFT" || row.status === "PROCESSING";
        const item = (label: string, onClick: () => void, color?: string) => (
          <button onClick={() => { onClick(); setActionMenu(null); }} className="w-full text-left px-3 py-2 text-[12.5px] font-medium" style={{ color: color || "var(--ibs-text)" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")} onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
            {label}
          </button>
        );
        const hasAny = (canManage && draft) || (isBOM && row.status === "PROCESSING") || (isHRAdmin && row.status === "APPROVED");
        return (
          <>
            <div className="fixed inset-0 z-[58]" onClick={() => setActionMenu(null)} />
            <div className="fixed z-[59] rounded-lg border shadow-xl py-1 flex flex-col"
              style={{ top: actionMenu.y + 4, left: Math.max(8, actionMenu.x - 210), width: 210, background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
              <div className="px-3 py-1.5 text-[11px] font-semibold border-b" style={{ color: "var(--ibs-text-dim)", borderColor: "var(--ibs-border)" }}>
                Tháng {row.month}/{row.year}
              </div>
              {canManage && draft && (
                <>
                  {item(`⬇ ${row.pieceRateImported ? "Import lại khoán (tổ)" : "Import khoán (tổ)"}`, () => setImportPeriod(row), "#818cf8")}
                  {item("⬇ Import bổ sung lương", () => setImportAdjPeriod(row), "var(--ibs-warning)")}
                  {item("⬇ Import bổ sung tiền ăn", () => setImportMealPeriod(row), "#f59e0b")}
                  {item("⬇ Import file BHXH", () => setImportBhxhPeriod(row), "#22c55e")}
                </>
              )}
              {isBOM && row.status === "PROCESSING" && item("✓ Duyệt kỳ lương", () => handleApprove(row.id), "var(--ibs-success)")}
              {isHRAdmin && row.status === "APPROVED" && item("✓ Đánh dấu đã trả", () => handleMarkPaid(row.id), "var(--ibs-success)")}
              {!hasAny && <div className="px-3 py-2 text-[12px]" style={{ color: "var(--ibs-text-dim)" }}>Không có thao tác</div>}
            </div>
          </>
        );
      })()}

      {/* Loading detail overlay */}
      {loadingDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div
            className="rounded-2xl px-10 py-8 flex flex-col items-center gap-3"
            style={{ background: "var(--ibs-bg-card)", border: "1px solid var(--ibs-border)" }}
          >
            <RefreshCw size={28} className="animate-spin" style={{ color: "var(--ibs-accent)" }} />
            <div className="text-[13px]" style={{ color: "var(--ibs-text-dim)" }}>
              Đang tải chi tiết kỳ lương...
            </div>
          </div>
        </div>
      )}

      {/* Detail modal */}
      {detailPeriod && !loadingDetail && (
        <PeriodDetailModal
          period={detailPeriod}
          onClose={() => setDetailPeriod(null)}
        />
      )}

      {/* Import lương sản phẩm modal */}
      {importPeriod && (
        <ImportPieceRateModal
          period={importPeriod}
          onClose={() => setImportPeriod(null)}
          onSuccess={() => {
            setImportPeriod(null);
            fetchPeriods();
          }}
        />
      )}

      {/* Import bổ sung lương modal */}
      {importAdjPeriod && (
        <ImportAdjustmentModal
          period={importAdjPeriod}
          onClose={() => setImportAdjPeriod(null)}
          onSuccess={() => {
            setImportAdjPeriod(null);
            fetchPeriods();
          }}
        />
      )}

      {/* Import bổ sung tiền ăn modal */}
      {importMealPeriod && (
        <ImportMealBonusModal
          period={importMealPeriod}
          onClose={() => setImportMealPeriod(null)}
          onSuccess={() => {
            setImportMealPeriod(null);
            fetchPeriods();
          }}
        />
      )}

      {/* Import file BHXH modal */}
      {importBhxhPeriod && (
        <ImportBhxhModal
          period={importBhxhPeriod}
          onClose={() => setImportBhxhPeriod(null)}
          onSuccess={() => {
            setImportBhxhPeriod(null);
            fetchPeriods();
          }}
        />
      )}

    </div>
  );
}
