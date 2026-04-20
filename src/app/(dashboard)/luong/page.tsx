"use client";

import { useState, useEffect, useCallback } from "react";
import { PageTitle } from "@/components/layout/page-title";
import { DataTable, Column } from "@/components/shared/data-table";
import { formatDate } from "@/lib/utils";
import { Plus, RefreshCw, X, Download } from "lucide-react";
import { usePermission } from "@/hooks/use-permission";

// ── Types ─────────────────────────────────────────────────────────────────────
type PayrollPeriod = {
  id: string;
  month: number;
  year: number;
  status: string;
  createdAt?: string;
  records: { id: string; netSalary: number; employeeId: string }[];
};

type PayrollRecord = {
  id: string;
  employeeId: string;
  workDays: number;
  otHours: number;
  baseSalary: number;
  grossSalary: number;
  bhxh: number;
  bhyt: number;
  bhtn: number;
  tncn: number;
  netSalary: number;
  notes?: string;
  employee: {
    code: string;
    fullName: string;
    department: { name: string };
  };
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
      setError(data.error?.message || "Có lỗi xảy ra");
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

// ── Period Detail Modal ────────────────────────────────────────────────────────
function PeriodDetailModal({
  period,
  onClose,
}: {
  period: PeriodDetail;
  onClose: () => void;
}) {
  const totalGross = period.records.reduce((s, r) => s + r.grossSalary, 0);
  const totalNet = period.records.reduce((s, r) => s + r.netSalary, 0);
  const totalBH = period.records.reduce((s, r) => s + r.bhxh + r.bhyt + r.bhtn, 0);
  const totalTNCN = period.records.reduce((s, r) => s + r.tncn, 0);

  async function exportExcel() {
    const { default: ExcelJS } = await import("exceljs");
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(`Lương T${period.month}-${period.year}`);

    ws.columns = [
      { header: "Mã NV",      key: "code",      width: 10 },
      { header: "Họ tên",     key: "name",      width: 24 },
      { header: "Phòng ban",  key: "dept",      width: 20 },
      { header: "Ngày công",  key: "workDays",  width: 10 },
      { header: "OT (giờ)",   key: "otHours",   width: 10 },
      { header: "Lương CB",   key: "base",      width: 16 },
      { header: "Gross",      key: "gross",     width: 16 },
      { header: "BHXH",       key: "bhxh",      width: 14 },
      { header: "BHYT",       key: "bhyt",      width: 14 },
      { header: "BHTN",       key: "bhtn",      width: 14 },
      { header: "TNCN",       key: "tncn",      width: 14 },
      { header: "Lương Net",  key: "net",       width: 18 },
    ];

    ws.getRow(1).font = { bold: true };

    period.records.forEach((r) => {
      ws.addRow({
        code:     r.employee.code,
        name:     r.employee.fullName,
        dept:     r.employee.department?.name,
        workDays: r.workDays,
        otHours:  r.otHours,
        base:     r.baseSalary,
        gross:    r.grossSalary,
        bhxh:     r.bhxh,
        bhyt:     r.bhyt,
        bhtn:     r.bhtn,
        tncn:     r.tncn,
        net:      r.netSalary,
      });
    });

    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `luong-t${period.month}-${period.year}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
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
            <table className="w-full border-collapse text-[12px]">
              <thead>
                <tr>
                  {[
                    "Mã NV",
                    "Họ tên",
                    "Phòng ban",
                    "Ngày công",
                    "OT giờ",
                    "Lương CB",
                    "Gross",
                    "BHXH+BHYT+BHTN",
                    "TNCN",
                    "Lương Net",
                    "Phiếu lương",
                  ].map((h) => (
                    <th
                      key={h}
                      className="px-3 py-2 text-left font-semibold border-b whitespace-nowrap"
                      style={{
                        borderColor: "var(--ibs-border)",
                        color: "var(--ibs-text-dim)",
                        background: "var(--ibs-bg)",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {period.records.map((r, i) => {
                  const bhTotal = r.bhxh + r.bhyt + r.bhtn;
                  return (
                    <tr
                      key={r.id}
                      style={{
                        background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.02)",
                      }}
                    >
                      <td
                        className="px-3 py-2 border-b font-mono font-semibold"
                        style={{ borderColor: "rgba(51,65,85,0.3)", color: "var(--ibs-accent)" }}
                      >
                        {r.employee.code}
                      </td>
                      <td
                        className="px-3 py-2 border-b font-medium whitespace-nowrap"
                        style={{ borderColor: "rgba(51,65,85,0.3)" }}
                      >
                        {r.employee.fullName}
                      </td>
                      <td
                        className="px-3 py-2 border-b whitespace-nowrap"
                        style={{ borderColor: "rgba(51,65,85,0.3)", color: "var(--ibs-text-dim)" }}
                      >
                        {r.employee.department?.name}
                      </td>
                      <td
                        className="px-3 py-2 border-b text-center"
                        style={{ borderColor: "rgba(51,65,85,0.3)" }}
                      >
                        {r.workDays}
                      </td>
                      <td
                        className="px-3 py-2 border-b text-center"
                        style={{ borderColor: "rgba(51,65,85,0.3)" }}
                      >
                        {r.otHours.toFixed(1)}
                      </td>
                      <td
                        className="px-3 py-2 border-b text-right whitespace-nowrap"
                        style={{ borderColor: "rgba(51,65,85,0.3)" }}
                      >
                        {formatVND(r.baseSalary)}
                      </td>
                      <td
                        className="px-3 py-2 border-b text-right whitespace-nowrap"
                        style={{ borderColor: "rgba(51,65,85,0.3)" }}
                      >
                        {formatVND(r.grossSalary)}
                      </td>
                      <td
                        className="px-3 py-2 border-b text-right whitespace-nowrap"
                        style={{ borderColor: "rgba(51,65,85,0.3)", color: "var(--ibs-warning)" }}
                      >
                        {formatVND(bhTotal)}
                      </td>
                      <td
                        className="px-3 py-2 border-b text-right whitespace-nowrap"
                        style={{ borderColor: "rgba(51,65,85,0.3)", color: "var(--ibs-warning)" }}
                      >
                        {formatVND(r.tncn)}
                      </td>
                      <td
                        className="px-3 py-2 border-b text-right whitespace-nowrap font-bold"
                        style={{ borderColor: "rgba(51,65,85,0.3)", color: "var(--ibs-success)" }}
                      >
                        {formatVND(r.netSalary)}
                      </td>
                      <td className="px-3 py-2 border-b text-center" style={{ borderColor: "rgba(51,65,85,0.3)" }}>
                        <a
                          href={`/api/v1/payroll/${period.id}/slip/pdf?employeeId=${r.employeeId}`}
                          download
                          className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] border transition-colors hover:bg-white/5"
                          style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-accent)" }}
                        >
                          <Download size={11} /> PDF
                        </a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ background: "rgba(0,180,216,0.04)" }}>
                  <td
                    colSpan={6}
                    className="px-3 py-2.5 text-right font-bold text-[12px] border-t"
                    style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-dim)" }}
                  >
                    Tổng cộng ({period.records.length} NV)
                  </td>
                  <td
                    className="px-3 py-2.5 text-right font-bold text-[12px] whitespace-nowrap border-t"
                    style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }}
                  >
                    {formatVND(totalGross)}
                  </td>
                  <td
                    className="px-3 py-2.5 text-right font-bold text-[12px] whitespace-nowrap border-t"
                    style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-warning)" }}
                  >
                    {formatVND(totalBH)}
                  </td>
                  <td
                    className="px-3 py-2.5 text-right font-bold text-[12px] whitespace-nowrap border-t"
                    style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-warning)" }}
                  >
                    {formatVND(totalTNCN)}
                  </td>
                  <td
                    className="px-3 py-2.5 text-right font-bold text-[13px] whitespace-nowrap border-t"
                    style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-success)" }}
                  >
                    {formatVND(totalNet)}
                  </td>
                  <td className="border-t" style={{ borderColor: "var(--ibs-border)" }} />
                </tr>
              </tfoot>
            </table>
          )}
        </div>
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
    await fetch(`/api/v1/payroll/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "CALCULATE" }),
    });
    setCalculatingId(null);
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
      width: "290px",
      render: (row) => {
        const isCalc = calculatingId === row.id;
        const isActioning = actioningId === row.id;
        return (
          <div className="flex items-center gap-1 flex-wrap">
            {/* Calculate: HR_ADMIN or BOM, only DRAFT */}
            {canManage && row.status === "DRAFT" && (
              <button
                onClick={() => handleCalculate(row.id)}
                disabled={isCalc}
                className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold"
                style={{
                  background: "rgba(245,158,11,0.15)",
                  color: "var(--ibs-warning)",
                  opacity: isCalc ? 0.7 : 1,
                }}
              >
                {isCalc ? (
                  <RefreshCw size={11} className="animate-spin" />
                ) : (
                  <RefreshCw size={11} />
                )}
                {isCalc ? "Đang tính..." : "Tính lương"}
              </button>
            )}

            {/* View detail: always */}
            <button
              onClick={() => handleViewDetail(row.id)}
              disabled={loadingDetail}
              className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold"
              style={{
                background: "rgba(0,180,216,0.12)",
                color: "var(--ibs-accent)",
              }}
            >
              Xem chi tiết
            </button>

            {/* Approve: BOM only, PROCESSING */}
            {isBOM && row.status === "PROCESSING" && (
              <button
                onClick={() => handleApprove(row.id)}
                disabled={isActioning}
                className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold"
                style={{
                  background: "rgba(16,185,129,0.15)",
                  color: "var(--ibs-success)",
                  opacity: isActioning ? 0.7 : 1,
                }}
              >
                Duyệt
              </button>
            )}

            {/* Mark paid: HR_ADMIN only, APPROVED */}
            {isHRAdmin && row.status === "APPROVED" && (
              <button
                onClick={() => handleMarkPaid(row.id)}
                disabled={isActioning}
                className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold"
                style={{
                  background: "rgba(16,185,129,0.15)",
                  color: "var(--ibs-success)",
                  opacity: isActioning ? 0.7 : 1,
                }}
              >
                Đánh dấu đã trả
              </button>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div>
      <PageTitle
        title="M7 - Lương & Phúc lợi"
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
    </div>
  );
}
