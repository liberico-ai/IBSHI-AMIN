"use client";

import { useState, useEffect } from "react";
import { RefreshCw, FileText, FileSpreadsheet, BarChart2, Wallet, Users, ClipboardList } from "lucide-react";
import { PageTitle } from "@/components/layout/page-title";
import { ExportButton } from "@/components/shared/export-button";
import { formatDate } from "@/lib/utils";
import type ExcelJS from "exceljs";
import { DateInput } from "@/components/shared/date-input";

// ── Types ──────────────────────────────────────────────────────────────────────
type OverviewData = {
  headcount: { total: number; active: number; probation: number; newHires: number; resigned: number };
  departments: { id: string; name: string; headcount: number; actual: number }[];
  pending: { leaves: number; ot: number };
  alerts: { expiredCerts: number; openIncidents: number; openRecruitment: number };
};

type SalaryMonth = {
  month: number; year: number; status: string;
  headcount: number; totalGross: number; totalNet: number; totalBHXH: number; totalTNCN: number;
};

function formatVND(n: number) { return n.toLocaleString("vi-VN") + " đ"; }

const MONTH_LABELS = ["", "T1", "T2", "T3", "T4", "T5", "T6", "T7", "T8", "T9", "T10", "T11", "T12"];

const LEAVE_TYPE_VI: Record<string, string> = {
  ANNUAL: "Phép năm", SICK: "Ốm đau", PERSONAL: "Cá nhân",
  WEDDING: "Cưới hỏi", FUNERAL: "Tang lễ", MATERNITY: "Thai sản",
  PATERNITY: "Nghỉ vợ sinh", UNPAID: "Không lương",
};

// ── Helper: get ISO week number ────────────────────────────────────────────────
function getISOWeek(date: Date): number {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
}

function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

// ── Shared sub-components ──────────────────────────────────────────────────────
function StatCard({ label, value, accent, dim }: { label: string; value: number | string; accent?: boolean; dim?: boolean }) {
  return (
    <div className="rounded-xl border p-5 flex flex-col gap-1.5 flex-1 min-w-0"
      style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
      <span className="text-[11px] font-semibold uppercase tracking-[0.7px]" style={{ color: "var(--ibs-text-dim)" }}>{label}</span>
      <span className="text-[28px] font-bold leading-tight"
        style={{ color: accent ? "var(--ibs-accent)" : dim ? "var(--ibs-danger)" : "var(--ibs-text)" }}>
        {value}
      </span>
    </div>
  );
}

function AlertCard({ label, value, color, note }: { label: string; value: number; color: string; note?: string }) {
  return (
    <div className="rounded-xl border p-5 flex-1 min-w-0"
      style={{ background: "var(--ibs-bg-card)", borderColor: color, borderLeftWidth: "4px" }}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.7px] mb-1.5" style={{ color: "var(--ibs-text-dim)" }}>{label}</div>
      <div className="text-[32px] font-bold leading-tight" style={{ color }}>{value}</div>
      {note && <div className="text-[12px] mt-1" style={{ color: "var(--ibs-text-dim)" }}>{note}</div>}
    </div>
  );
}

function DeptBarChart({ departments }: { departments: { id: string; name: string; headcount: number; actual: number }[] }) {
  const maxVal = Math.max(...departments.map((d) => Math.max(d.headcount, d.actual)), 1);
  return (
    <div className="space-y-3">
      {departments.map((dept) => {
        const deficit = dept.actual < dept.headcount;
        const headPct = Math.round((dept.headcount / maxVal) * 100);
        const actualPct = Math.round((dept.actual / maxVal) * 100);
        return (
          <div key={dept.id}>
            <div className="flex justify-between items-center mb-1">
              <span className="text-[13px] font-medium">{dept.name}</span>
              <div className="flex items-center gap-3 text-[12px]" style={{ color: "var(--ibs-text-dim)" }}>
                <span>Kế hoạch: <strong style={{ color: "var(--ibs-text)" }}>{dept.headcount}</strong></span>
                <span style={{ color: deficit ? "var(--ibs-warning)" : "var(--ibs-success)", fontWeight: 600 }}>
                  Thực tế: {dept.actual}{deficit && ` (−${dept.headcount - dept.actual})`}
                </span>
              </div>
            </div>
            <div className="relative h-2.5 rounded-full mb-1 overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
              <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${headPct}%`, background: "rgba(0,180,216,0.3)" }} />
            </div>
            <div className="relative h-2.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
              <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${actualPct}%`, background: deficit ? "var(--ibs-warning)" : "var(--ibs-success)" }} />
            </div>
          </div>
        );
      })}
      <div className="flex items-center gap-4 mt-2">
        {[["rgba(0,180,216,0.3)", "Kế hoạch"], ["var(--ibs-success)", "Đủ"], ["var(--ibs-warning)", "Thiếu"]].map(([bg, label]) => (
          <div key={label} className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm" style={{ background: bg }} />
            <span className="text-[11px]" style={{ color: "var(--ibs-text-dim)" }}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Section({ title, children, action, icon: Icon }: { title: string; children: React.ReactNode; action?: React.ReactNode; icon?: any }) {
  return (
    <div className="rounded-xl border" style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
      <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "var(--ibs-border)" }}>
        <h3 className="text-[14px] font-semibold flex items-center gap-2">
          {Icon && <Icon size={15} style={{ color: "var(--ibs-accent)" }} />}
          {title}
        </h3>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function Skeleton({ className }: { className?: string }) {
  return <div className={`rounded animate-pulse ${className}`} style={{ background: "rgba(255,255,255,0.06)" }} />;
}

// ── Report Card ────────────────────────────────────────────────────────────────
function ReportCard({
  icon: Icon, iconBg, iconColor, title, description, children,
}: {
  icon: any; iconBg: string; iconColor: string;
  title: string; description: string; children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border p-5 flex flex-col gap-4" style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: iconBg }}>
          <Icon size={18} style={{ color: iconColor }} />
        </div>
        <div>
          <div className="text-[14px] font-semibold">{title}</div>
          <div className="text-[12px] mt-0.5" style={{ color: "var(--ibs-text-dim)" }}>{description}</div>
        </div>
      </div>
      {children}
    </div>
  );
}

// ── Excel generators ───────────────────────────────────────────────────────────
async function exportWeeklyHR(weekStart: string) {
  const res = await fetch(`/api/v1/reports?type=weekly-hr&weekStart=${weekStart}`);
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error?.message || "Lỗi lấy dữ liệu");
  const d = json.data;

  const from = new Date(d.period.from);
  const to   = new Date(d.period.to);
  const weekNo = getISOWeek(from);
  const label = `Tuần ${weekNo} (${formatDate(from)} - ${formatDate(to)})`;

  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "IBS ONE Platform";
  wb.created = new Date();

  // Sheet 1 — Tóm tắt
  const ws1 = wb.addWorksheet("Tóm tắt");
  ws1.mergeCells("A1:F1");
  ws1.getCell("A1").value = `BÁO CÁO TUẦN — IBS Heavy Industry JSC`;
  ws1.getCell("A1").font = { bold: true, size: 14 };
  ws1.mergeCells("A2:F2");
  ws1.getCell("A2").value = label;
  ws1.getCell("A2").font = { size: 11, italic: true };

  ws1.addRow([]);
  ws1.addRow(["CHỈ TIÊU NHÂN SỰ", ""]);
  ws1.getRow(ws1.rowCount).font = { bold: true };
  ws1.addRow(["Tổng nhân viên",           d.headcount.total]);
  ws1.addRow(["Đang làm việc",            d.headcount.active]);
  ws1.addRow(["Mới gia nhập trong tuần",  d.headcount.newHires]);
  ws1.addRow(["Nghỉ việc trong tuần",     d.headcount.resigned]);

  ws1.addRow([]);
  ws1.addRow(["NGHỈ PHÉP", ""]);
  ws1.getRow(ws1.rowCount).font = { bold: true };
  ws1.addRow(["Đơn được duyệt",  d.leave.approved]);
  ws1.addRow(["Đang chờ duyệt", d.leave.pending]);
  ws1.addRow(["Bị từ chối",     d.leave.rejected]);

  ws1.addRow([]);
  ws1.addRow(["TĂNG CA", ""]);
  ws1.getRow(ws1.rowCount).font = { bold: true };
  ws1.addRow(["Số đơn tăng ca được duyệt", d.ot.count]);
  ws1.addRow(["Tổng giờ OT",               d.ot.totalHours]);

  ws1.columns = [{ width: 32 }, { width: 18 }];

  // Sheet 2 — Chấm công
  const ws2 = wb.addWorksheet("Chấm công");
  ws2.addRow(["Mã NV", "Họ tên", "Phòng ban", "Có mặt", "Vắng", "Muộn", "Nửa ngày"]);
  ws2.getRow(1).font = { bold: true };
  ws2.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E293B" } };
  ws2.getRow(1).font = { bold: true, color: { argb: "FF94A3B8" } };
  for (const emp of d.attendance) {
    ws2.addRow([emp.code, emp.fullName, emp.department, emp.present, emp.absent, emp.late, emp.halfDay]);
  }
  ws2.columns = [{ width: 10 }, { width: 25 }, { width: 20 }, { width: 10 }, { width: 8 }, { width: 8 }, { width: 10 }];

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `bao-cao-tuan-${weekNo}-${from.getFullYear()}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

async function exportMonthlyHR(month: number, year: number) {
  const res = await fetch(`/api/v1/reports?type=monthly-hr&month=${month}&year=${year}`);
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error?.message || "Lỗi lấy dữ liệu");
  const d = json.data;

  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "IBS ONE Platform";
  wb.created = new Date();

  const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F172A" } };
  const HEADER_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: "FF00B4D8" } };

  // Sheet 1 — Nhân sự
  const ws1 = wb.addWorksheet("Nhân sự");
  ws1.mergeCells("A1:C1");
  ws1.getCell("A1").value = `BÁO CÁO THÁNG ${month}/${year} — IBS Heavy Industry JSC`;
  ws1.getCell("A1").font = { bold: true, size: 13 };
  ws1.addRow([]);
  ws1.addRow(["Tổng nhân viên", d.headcount.total]);
  ws1.addRow(["Đang làm việc",  d.headcount.active]);
  ws1.addRow(["Thử việc",       d.headcount.probation]);
  ws1.addRow(["Mới gia nhập",   d.headcount.newHires]);
  ws1.addRow(["Nghỉ việc",      d.headcount.resigned]);
  ws1.addRow([]);
  ws1.addRow(["Phòng ban", "Kế hoạch", "Thực tế"]);
  ws1.getRow(ws1.rowCount).font = HEADER_FONT;
  ws1.getRow(ws1.rowCount).fill = HEADER_FILL;
  for (const dept of d.departments) {
    ws1.addRow([dept.name, dept.planned, dept.actual]);
  }
  ws1.addRow([]);
  ws1.addRow(["Đào tạo", ""]);
  ws1.addRow(["Kế hoạch đào tạo",    d.training.total]);
  ws1.addRow(["Hoàn thành",          d.training.completed]);
  ws1.addRow(["Kỷ luật tháng này",   d.discipline.total]);
  ws1.columns = [{ width: 28 }, { width: 14 }, { width: 14 }];

  // Sheet 2 — Chấm công
  const ws2 = wb.addWorksheet("Chấm công");
  ws2.addRow(["Loại", "Số ngày/lượt"]);
  ws2.getRow(1).font = HEADER_FONT;
  ws2.getRow(1).fill = HEADER_FILL;
  ws2.addRow(["Có mặt",    d.attendance.present]);
  ws2.addRow(["Vắng",      d.attendance.absent]);
  ws2.addRow(["Muộn",      d.attendance.late]);
  ws2.addRow(["Nửa ngày",  d.attendance.halfDay]);

  // Sheet 3 — Nghỉ phép
  const ws3 = wb.addWorksheet("Nghỉ phép");
  ws3.addRow(["Loại nghỉ", "Số đơn", "Số ngày"]);
  ws3.getRow(1).font = HEADER_FONT;
  ws3.getRow(1).fill = HEADER_FILL;
  for (const [type, val] of Object.entries(d.leave as Record<string, { count: number; days: number }>)) {
    ws3.addRow([LEAVE_TYPE_VI[type] || type, val.count, val.days]);
  }
  ws3.columns = [{ width: 22 }, { width: 12 }, { width: 12 }];

  // Sheet 4 — Lương
  const ws4 = wb.addWorksheet("Lương");
  if (d.payroll) {
    ws4.addRow(["Tổng Gross", d.payroll.totalGross]);
    ws4.addRow(["Tổng Net",   d.payroll.totalNet]);
    ws4.addRow(["Tổng BHXH/BHYT/BHTN", d.payroll.totalBHXH]);
    ws4.addRow(["Tổng TNCN", d.payroll.totalTNCN]);
    ws4.addRow(["Số nhân viên", d.payroll.headcount]);
    ws4.addRow([]);
    ws4.addRow(["Mã NV", "Họ tên", "Phòng ban", "Gross", "Net", "BHXH", "BHYT", "BHTN", "TNCN"]);
    ws4.getRow(ws4.rowCount).font = HEADER_FONT;
    ws4.getRow(ws4.rowCount).fill = HEADER_FILL;
    for (const emp of d.payroll.byEmployee) {
      ws4.addRow([emp.code, emp.fullName, emp.department, emp.grossSalary, emp.netSalary, emp.bhxh, emp.bhyt, emp.bhtn, emp.tncn]);
    }
    ws4.columns = [{ width: 10 }, { width: 25 }, { width: 20 }, { width: 16 }, { width: 16 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 }];
  } else {
    ws4.addRow(["Chưa có dữ liệu lương cho tháng này"]);
  }

  // Sheet 5 — HSE
  const ws5 = wb.addWorksheet("HSE");
  ws5.addRow(["Loại", "Số lượng"]);
  ws5.getRow(1).font = HEADER_FONT;
  ws5.getRow(1).fill = HEADER_FILL;
  ws5.addRow(["Sự cố",         d.hse.incidents]);
  ws5.addRow(["Near Miss",     d.hse.nearMisses]);

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `bao-cao-t${month}-${year}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

async function exportFinanceSummary(month: number, year: number) {
  const res = await fetch(`/api/v1/reports?type=finance-summary&month=${month}&year=${year}`);
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error?.message || "Lỗi lấy dữ liệu");
  const d = json.data;

  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "IBS ONE Platform";

  const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F172A" } };
  const HEADER_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: "FF00B4D8" } };

  // Sheet 1 — Tổng hợp
  const ws1 = wb.addWorksheet("Chi phí tổng hợp");
  ws1.mergeCells("A1:B1");
  ws1.getCell("A1").value = `BÁO CÁO TÀI CHÍNH T${month}/${year} — IBS Heavy Industry JSC`;
  ws1.getCell("A1").font = { bold: true, size: 13 };
  ws1.addRow([]);
  ws1.addRow(["LƯƠNG", ""]);
  ws1.getRow(ws1.rowCount).font = { bold: true };
  ws1.addRow(["Tổng Gross",        d.payroll.totalGross]);
  ws1.addRow(["Tổng Net thực nhận",d.payroll.totalNet]);
  ws1.addRow(["Tổng BHXH/BHYT/BHTN NLĐ", d.payroll.totalBHXH]);
  ws1.addRow(["Tổng thuế TNCN",   d.payroll.totalTNCN]);
  ws1.addRow(["Số nhân viên",      d.payroll.headcount]);
  ws1.addRow([]);
  ws1.addRow(["PHƯƠNG TIỆN", ""]);
  ws1.getRow(ws1.rowCount).font = { bold: true };
  ws1.addRow(["Tổng chuyến đặt xe", d.vehicles.total]);
  ws1.addRow(["Đã duyệt",           d.vehicles.approved]);
  ws1.addRow(["Đã hoàn thành",      d.vehicles.completed]);
  ws1.addRow([]);
  ws1.addRow(["NHÀ ĂN", ""]);
  ws1.getRow(ws1.rowCount).font = { bold: true };
  ws1.addRow(["Bữa sáng",  d.meals.breakfast]);
  ws1.addRow(["Bữa trưa",  d.meals.lunch]);
  ws1.addRow(["Bữa tối",   d.meals.dinner]);
  ws1.addRow(["Tổng suất", d.meals.total]);
  ws1.columns = [{ width: 36 }, { width: 20 }];

  // Sheet 2 — Lương theo phòng ban
  const ws2 = wb.addWorksheet("Lương theo phòng ban");
  ws2.addRow(["Phòng ban", "Số NV", "Tổng Gross", "Tổng Net"]);
  ws2.getRow(1).font = HEADER_FONT;
  ws2.getRow(1).fill = HEADER_FILL;
  for (const dept of d.payroll.byDepartment) {
    ws2.addRow([dept.name, dept.count, dept.gross, dept.net]);
  }
  ws2.columns = [{ width: 28 }, { width: 10 }, { width: 18 }, { width: 18 }];

  // Sheet 3 — Chi tiết lương nhân viên
  const ws3 = wb.addWorksheet("Chi tiết lương NV");
  ws3.addRow(["Mã NV", "Họ tên", "Phòng ban", "Gross", "Net"]);
  ws3.getRow(1).font = HEADER_FONT;
  ws3.getRow(1).fill = HEADER_FILL;
  for (const emp of d.payroll.employees) {
    ws3.addRow([emp.code, emp.fullName, emp.department, emp.grossSalary, emp.netSalary]);
  }
  ws3.columns = [{ width: 10 }, { width: 25 }, { width: 20 }, { width: 16 }, { width: 16 }];

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `tai-chinh-t${month}-${year}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

async function exportSalaryYear(year: number, salaryData: SalaryMonth[]) {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(`Lương năm ${year}`);

  ws.mergeCells("A1:G1");
  ws.getCell("A1").value = `BÁO CÁO LƯƠNG NĂM ${year} — IBS Heavy Industry JSC`;
  ws.getCell("A1").font = { bold: true, size: 13 };

  ws.addRow([]);
  ws.addRow(["Tháng", "Trạng thái", "Số NV", "Tổng Gross", "Tổng Net", "Tổng BHXH", "Tổng TNCN"]);
  ws.getRow(ws.rowCount).font = { bold: true };

  for (const r of salaryData) {
    ws.addRow([`T${r.month}/${r.year}`, r.status, r.headcount, r.totalGross, r.totalNet, r.totalBHXH, r.totalTNCN]);
  }

  const ytdGross = salaryData.reduce((s, r) => s + r.totalGross, 0);
  const ytdNet   = salaryData.reduce((s, r) => s + r.totalNet, 0);
  ws.addRow([]);
  ws.addRow(["TỔNG NĂM", "", "", ytdGross, ytdNet]);
  ws.getRow(ws.rowCount).font = { bold: true };

  ws.columns = [{ width: 12 }, { width: 14 }, { width: 10 }, { width: 18 }, { width: 18 }, { width: 16 }, { width: 14 }];

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `luong-nam-${year}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function BaoCaoPage() {
  const [userRole, setUserRole] = useState<string>("EMPLOYEE");
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [salaryData, setSalaryData] = useState<SalaryMonth[]>([]);
  const [salaryYear, setSalaryYear] = useState(new Date().getFullYear());
  const [loadingOverview, setLoadingOverview] = useState(true);
  const [loadingSalary, setLoadingSalary] = useState(true);

  // Report params
  const today = new Date();
  const thisMonday = getMonday(today);
  const [weekStart, setWeekStart] = useState(thisMonday.toISOString().split("T")[0]);
  const [reportMonth, setReportMonth] = useState(today.getMonth() + 1);
  const [reportYear, setReportYear] = useState(today.getFullYear());
  const [financeMonth, setFinanceMonth] = useState(today.getMonth() + 1);
  const [financeYear, setFinanceYear] = useState(today.getFullYear());

  const currentYear = today.getFullYear();
  const yearOptions = Array.from({ length: 4 }, (_, i) => currentYear - i);
  const monthOptions = Array.from({ length: 12 }, (_, i) => i + 1);

  useEffect(() => {
    fetch("/api/v1/me").then((r) => r.json()).then((res) => { if (res.role) setUserRole(res.role); }).catch(() => {});
  }, []);

  function fetchOverview() {
    setLoadingOverview(true);
    fetch("/api/v1/reports?type=overview")
      .then((r) => r.json()).then((res) => setOverview(res.data || null)).catch(() => setOverview(null))
      .finally(() => setLoadingOverview(false));
  }
  function fetchSalary(year: number) {
    setLoadingSalary(true);
    fetch(`/api/v1/reports?type=salary&year=${year}`)
      .then((r) => r.json()).then((res) => setSalaryData(Array.isArray(res.data) ? res.data : []))
      .catch(() => setSalaryData([])).finally(() => setLoadingSalary(false));
  }

  useEffect(() => { fetchOverview(); }, []);
  useEffect(() => { fetchSalary(salaryYear); }, [salaryYear]);

  const canView = userRole === "HR_ADMIN" || userRole === "BOM";

  if (!canView) {
    return (
      <div>
        <PageTitle title="Báo cáo & Thống kê" description="Tổng hợp nhân sự, lương và chấm công" />
        <div className="rounded-xl border flex flex-col items-center justify-center py-24"
          style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
          <div className="w-14 h-14 rounded-full flex items-center justify-center mb-4" style={{ background: "rgba(239,68,68,0.1)" }}>
            <FileText size={24} style={{ color: "var(--ibs-danger)" }} />
          </div>
          <h3 className="text-[16px] font-bold mb-2">Truy cập bị từ chối</h3>
          <p className="text-[13px] text-center max-w-[400px]" style={{ color: "var(--ibs-text-dim)" }}>
            Trang này chỉ dành cho HR_ADMIN và Ban Giám đốc (BOM).
          </p>
        </div>
      </div>
    );
  }

  const ytdGross = salaryData.reduce((s, r) => s + (r.totalGross || 0), 0);
  const ytdNet   = salaryData.reduce((s, r) => s + (r.totalNet   || 0), 0);
  const ytdHead  = salaryData.reduce((s, r) => s + (r.headcount  || 0), 0);

  const inputCls = "px-2.5 py-1.5 rounded-lg text-[12px] outline-none border";
  const inputStyle = { background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageTitle title="Báo cáo & Thống kê" description={`Cập nhật ${formatDate(new Date())}`} />
        <button onClick={() => { fetchOverview(); fetchSalary(salaryYear); }}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[13px] border transition-colors"
          style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-dim)" }}>
          <RefreshCw size={13} className={loadingOverview ? "animate-spin" : ""} />
          Làm mới
        </button>
      </div>

      {/* ── Xuất báo cáo ── */}
      <Section title="Xuất báo cáo tự động" icon={FileSpreadsheet}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

          {/* Weekly HR */}
          <ReportCard
            icon={BarChart2} iconBg="rgba(0,180,216,0.12)" iconColor="var(--ibs-accent)"
            title="Báo cáo tuần"
            description="Nhân sự, chấm công, nghỉ phép, OT trong tuần. Thay thế Weekly PPTX."
          >
            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-medium mb-1.5" style={{ color: "var(--ibs-text-muted)" }}>
                  Chọn ngày thứ 2 đầu tuần
                </label>
                <DateInput value={weekStart} onChange={(e) => setWeekStart(e.target.value)}
                  className={`w-full ${inputCls}`} style={inputStyle} />
              </div>
              <ExportButton
                label="Xuất Excel báo cáo tuần"
                onExport={() => exportWeeklyHR(weekStart)}
                className="w-full justify-center"
              />
            </div>
          </ReportCard>

          {/* Monthly HR */}
          <ReportCard
            icon={ClipboardList} iconBg="rgba(16,185,129,0.12)" iconColor="var(--ibs-success)"
            title="Báo cáo tháng"
            description="Headcount, chấm công, nghỉ phép, lương, đào tạo, HSE. Thay thế Monthly Excel."
          >
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-medium mb-1.5" style={{ color: "var(--ibs-text-muted)" }}>Tháng</label>
                  <select value={reportMonth} onChange={(e) => setReportMonth(Number(e.target.value))}
                    className={`w-full ${inputCls}`} style={inputStyle}>
                    {monthOptions.map((m) => <option key={m} value={m}>Tháng {m}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-medium mb-1.5" style={{ color: "var(--ibs-text-muted)" }}>Năm</label>
                  <select value={reportYear} onChange={(e) => setReportYear(Number(e.target.value))}
                    className={`w-full ${inputCls}`} style={inputStyle}>
                    {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
              </div>
              <ExportButton
                label="Xuất Excel báo cáo tháng"
                onExport={() => exportMonthlyHR(reportMonth, reportYear)}
                className="w-full justify-center"
              />
            </div>
          </ReportCard>

          {/* Finance Summary */}
          <ReportCard
            icon={Wallet} iconBg="rgba(245,158,11,0.12)" iconColor="var(--ibs-warning)"
            title="Báo cáo tài chính"
            description="Chi phí lương + xe + nhà ăn theo tháng. Dùng cho kế toán."
          >
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-medium mb-1.5" style={{ color: "var(--ibs-text-muted)" }}>Tháng</label>
                  <select value={financeMonth} onChange={(e) => setFinanceMonth(Number(e.target.value))}
                    className={`w-full ${inputCls}`} style={inputStyle}>
                    {monthOptions.map((m) => <option key={m} value={m}>Tháng {m}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-medium mb-1.5" style={{ color: "var(--ibs-text-muted)" }}>Năm</label>
                  <select value={financeYear} onChange={(e) => setFinanceYear(Number(e.target.value))}
                    className={`w-full ${inputCls}`} style={inputStyle}>
                    {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
              </div>
              <ExportButton
                label="Xuất Excel tài chính"
                onExport={() => exportFinanceSummary(financeMonth, financeYear)}
                className="w-full justify-center"
              />
            </div>
          </ReportCard>

        </div>
      </Section>

      {/* ── Tổng quan nhân sự ── */}
      <Section title="Tổng quan nhân sự" icon={Users}>
        {loadingOverview ? (
          <div className="flex gap-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24 flex-1" />)}</div>
        ) : overview ? (
          <div className="flex gap-4 flex-wrap">
            <StatCard label="Tổng nhân viên"           value={overview.headcount.total}    accent />
            <StatCard label="Đang làm việc"             value={overview.headcount.active} />
            <StatCard label="Thử việc"                  value={overview.headcount.probation} />
            <StatCard label="Mới (tháng này)"           value={overview.headcount.newHires} />
            <StatCard label="Nghỉ việc (tháng này)"    value={overview.headcount.resigned} dim={overview.headcount.resigned > 0} />
          </div>
        ) : (
          <div className="py-8 text-center text-[13px]" style={{ color: "var(--ibs-text-dim)" }}>Không thể tải dữ liệu</div>
        )}
      </Section>

      {/* ── Cảnh báo ── */}
      <Section title="Cảnh báo & Việc cần làm">
        {loadingOverview ? (
          <div className="flex gap-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 flex-1" />)}</div>
        ) : overview ? (
          <div className="flex gap-4 flex-wrap">
            <AlertCard label="Phép chờ duyệt"         value={overview.pending.leaves}         color="var(--ibs-warning)" note="Yêu cầu xử lý" />
            <AlertCard label="OT chờ duyệt"           value={overview.pending.ot}             color="var(--ibs-accent)"  note="Yêu cầu xử lý" />
            <AlertCard label="Chứng chỉ sắp hết hạn" value={overview.alerts.expiredCerts}    color="var(--ibs-danger)"  note="Trong 30 ngày tới" />
            <AlertCard label="Tuyển dụng đang mở"    value={overview.alerts.openRecruitment} color="#8b5cf6"            note="Đang tiến hành" />
          </div>
        ) : null}
      </Section>

      {/* ── Biến động nhân sự theo phòng ban ── */}
      <Section title="Biến động nhân sự theo phòng ban">
        {loadingOverview ? (
          <div className="space-y-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
        ) : overview?.departments.length ? (
          <DeptBarChart departments={overview.departments} />
        ) : null}
      </Section>

      {/* ── Bảng lương theo tháng ── */}
      <Section
        title="Bảng lương theo tháng"
        action={
          <div className="flex items-center gap-2">
            <select value={salaryYear} onChange={(e) => setSalaryYear(Number(e.target.value))}
              className={inputCls} style={inputStyle}>
              {yearOptions.map((y) => <option key={y} value={y}>Năm {y}</option>)}
            </select>
            <ExportButton label="Xuất Excel" onExport={() => exportSalaryYear(salaryYear, salaryData)} />
          </div>
        }
      >
        {loadingSalary ? (
          <div className="space-y-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
        ) : salaryData.length === 0 ? (
          <div className="py-8 text-center text-[13px]" style={{ color: "var(--ibs-text-dim)" }}>Chưa có dữ liệu lương năm {salaryYear}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  {["Tháng", "Trạng thái", "Số NV", "Tổng Gross", "Tổng Net", "Tổng BHXH", "Tổng TNCN"].map((h) => (
                    <th key={h} className="text-left px-4 py-2.5 text-[11px] uppercase tracking-wider font-semibold border-b"
                      style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-dim)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {salaryData.map((r) => (
                  <tr key={`${r.month}-${r.year}`} className="border-b hover:bg-white/[0.02]"
                    style={{ borderColor: "rgba(51,65,85,0.4)" }}>
                    <td className="px-4 py-3 text-[13px] font-semibold">{MONTH_LABELS[r.month]}/{r.year}</td>
                    <td className="px-4 py-3">
                      <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold"
                        style={{ background: r.status === "PAID" ? "rgba(0,180,216,0.15)" : "rgba(245,158,11,0.15)", color: r.status === "PAID" ? "var(--ibs-accent)" : "var(--ibs-warning)" }}>
                        {r.status === "PAID" ? "Đã trả" : r.status === "APPROVED" ? "Đã duyệt" : r.status === "PENDING" ? "Chờ duyệt" : "Nháp"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[13px]" style={{ color: "var(--ibs-text-muted)" }}>{r.headcount}</td>
                    <td className="px-4 py-3 text-[13px] font-medium tabular-nums">{formatVND(r.totalGross)}</td>
                    <td className="px-4 py-3 text-[13px] font-semibold tabular-nums" style={{ color: "var(--ibs-success)" }}>{formatVND(r.totalNet)}</td>
                    <td className="px-4 py-3 text-[12px] tabular-nums" style={{ color: "var(--ibs-text-dim)" }}>{formatVND(r.totalBHXH)}</td>
                    <td className="px-4 py-3 text-[12px] tabular-nums" style={{ color: "var(--ibs-text-dim)" }}>{formatVND(r.totalTNCN)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* ── Tổng kết YTD ── */}
      <Section title={`Tổng kết lương năm ${salaryYear} (YTD)`}>
        {loadingSalary ? (
          <div className="flex gap-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 flex-1" />)}</div>
        ) : (
          <div className="flex gap-4 flex-wrap">
            {[
              { label: "Tổng Gross YTD",       value: formatVND(ytdGross), color: "var(--ibs-text)" },
              { label: "Tổng Net YTD",          value: formatVND(ytdNet),   color: "var(--ibs-success)" },
              { label: `Avg Net / NV (${salaryData.length} tháng)`, value: formatVND(ytdHead > 0 ? Math.round(ytdNet / ytdHead) : 0), color: "var(--ibs-accent)" },
            ].map((s) => (
              <div key={s.label} className="flex-1 min-w-0 rounded-xl border p-5"
                style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)" }}>
                <div className="text-[11px] font-semibold uppercase tracking-[0.7px] mb-1.5" style={{ color: "var(--ibs-text-dim)" }}>{s.label}</div>
                <div className="text-[22px] font-bold tabular-nums" style={{ color: s.color }}>{s.value}</div>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
