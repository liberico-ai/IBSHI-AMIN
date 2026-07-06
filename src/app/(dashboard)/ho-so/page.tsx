"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { PageTitle } from "@/components/layout/page-title";
import { DataTable, Column } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { getInitials, apiError } from "@/lib/utils";
import { viewUrl } from "@/lib/use-presigned-url";
import { UserPlus, Eye, RefreshCw, X, Download, SlidersHorizontal } from "lucide-react";
import { usePermission } from "@/hooks/use-permission";
import { DateInput } from "@/components/shared/date-input";
import { BankAccountsEditor, type BankAccount } from "@/components/shared/bank-accounts-editor";

type Employee = {
  id: string; code: string; fullName: string; photo?: string | null; gender: string; status: string;
  startDate: string;
  idNumber?: string | null; taxCode?: string | null; address?: string | null;
  insuranceNumber?: string | null; dateOfBirth?: string | null;
  dependents?: number; // số NPT đang hiệu lực
  children?: { dateOfBirth?: string | null }[];
  department: { id: string; name: string; isActive?: boolean };
  position: { name: string };
  jobRole?: string | null;
  salaryGrade?: number | null;
  team?: { id: string; name: string } | null;
  contracts: { contractType: string; status: string; baseSalary: number; insuranceSalary?: number | null; allowance?: number | null; endDate?: string | null }[];
};

// HĐ đang hiệu lực (hoặc mới nhất) + số ngày còn lại tới hạn.
function activeContract(e: Employee) { return e.contracts?.find((c) => c.status === "ACTIVE") || e.contracts?.[0] || null; }
// Tổng thu nhập = Lương đóng BHXH (hoặc lương chính) + Phụ cấp (theo HĐ đang hiệu lực).
function totalIncome(e: Employee): number {
  const c = activeContract(e);
  if (!c) return 0;
  return (c.insuranceSalary ?? c.baseSalary ?? 0) + (c.allowance ?? 0);
}
function contractDaysLeft(e: Employee): number | null {
  const c = activeContract(e);
  if (!c?.endDate) return null; // vô thời hạn / chưa có HĐ
  return Math.ceil((new Date(c.endDate).getTime() - Date.now()) / 86400000);
}
function isExpiringSoon(e: Employee): boolean {
  if (!["ACTIVE", "PROBATION"].includes(e.status)) return false;
  const d = contractDaysLeft(e);
  return d !== null && d <= 45; // còn ≤ 45 ngày (gồm cả đã quá hạn)
}

// Các trường hồ sơ cơ bản còn THIẾU (NV mới tạo có giá trị placeholder). Trả về danh sách nhãn thiếu.
function missingFields(e: Employee): string[] {
  const m: string[] = [];
  const id = (e.idNumber || "").trim();
  if (!id || /^0+$/.test(id)) m.push("CCCD");
  if (!(e.taxCode || "").trim()) m.push("MST");
  const addr = (e.address || "").trim();
  if (!addr || /chưa cập nhật/i.test(addr)) m.push("Địa chỉ");
  if (!(e.insuranceNumber || "").trim()) m.push("Số BHXH");
  return m;
}
type Dept = { id: string; code: string; name: string };
type Position = { id: string; name: string; level: string; departmentId: string | null };

const CONTRACT_TYPE_LABELS: Record<string, string> = {
  DEFINITE_12M: "12 tháng", DEFINITE_24M: "24 tháng", DEFINITE_36M: "36 tháng",
  INDEFINITE: "Không XĐ", PROBATION: "Thử việc",
};

// Nhãn trạng thái NV tiếng Việt — dùng khi export (thay vì enum thô ACTIVE/RESIGNED...).
const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Đang làm việc", PROBATION: "Thử việc", ON_LEAVE: "Tạm nghỉ",
  RESIGNED: "Đã nghỉ việc", TERMINATED: "Đã chấm dứt HĐ",
};
const statusLabel = (s: string) => STATUS_LABELS[s] || s;

// Khoảng độ tuổi con cái cho dropdown lọc export.
const CHILD_AGE_RANGES: { value: string; label: string; min?: number; max?: number }[] = [
  { value: "", label: "Con: mọi độ tuổi" },
  { value: "u3", label: "Con dưới 3 tuổi", max: 2 },
  { value: "u6", label: "Con dưới 6 tuổi", max: 5 },
  { value: "u15", label: "Con dưới 15 tuổi", max: 14 },
  { value: "u18", label: "Con dưới 18 tuổi", max: 17 },
  { value: "o18", label: "Con từ 18 tuổi trở lên", min: 18 },
];

// Tuổi tính đến hôm nay từ chuỗi ngày sinh.
function ageFromDob(dob?: string | null): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (isNaN(d.getTime())) return null;
  const n = new Date();
  let a = n.getFullYear() - d.getFullYear();
  const m = n.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && n.getDate() < d.getDate())) a--;
  return a;
}

export default function EmployeesPage() {
  const router = useRouter();
  const { canDo } = usePermission();
  const [allEmployees, setAllEmployees] = useState<Employee[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [deptFilter, setDeptFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [nptFilter, setNptFilter] = useState(""); // "" | "yes" | "no"
  const [childAgeRange, setChildAgeRange] = useState(""); // key trong CHILD_AGE_RANGES
  const [tableSearch, setTableSearch] = useState(""); // từ khoá ô tìm kiếm trong bảng
  // Bộ lọc nâng cao
  const [showFilters, setShowFilters] = useState(false);
  const [joinFrom, setJoinFrom] = useState("");
  const [joinTo, setJoinTo] = useState("");
  const [gradeFilter, setGradeFilter] = useState("");
  const [jobRoleFilter, setJobRoleFilter] = useState("");
  const [positionFilter, setPositionFilter] = useState("");
  const [teamFilter, setTeamFilter] = useState("");
  const [contractFilter, setContractFilter] = useState("");
  const [genderFilter, setGenderFilter] = useState("");
  const [ageMin, setAgeMin] = useState("");
  const [ageMax, setAgeMax] = useState("");
  const [salaryMin, setSalaryMin] = useState("");
  const [salaryMax, setSalaryMax] = useState("");
  const [birthMonthFilter, setBirthMonthFilter] = useState("");
  const [canViewSalary, setCanViewSalary] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [view, setView] = useState<"all" | "incomplete" | "expiring">("all");
  const incompleteOnly = view === "incomplete";

  function fetchEmployees() {
    setLoading(true);
    fetch("/api/v1/employees?limit=1000")
      .then((r) => r.json())
      .then((res) => { setAllEmployees(res.data || []); setTotal(res.total || 0); setCanViewSalary(!!res.canViewPayroll); })
      .finally(() => setLoading(false));
  }

  useEffect(() => { fetchEmployees(); }, []);

  // Tùy chọn filter chỉ lấy từ NV ĐANG LÀM → bỏ phòng ban/tổ đã ẩn (P. Sản xuất, 12 tổ cũ) mà chỉ NV nghỉ việc còn trỏ tới.
  const activeEmps = useMemo(() => allEmployees.filter((e) => ["ACTIVE", "PROBATION", "ON_LEAVE"].includes(e.status)), [allEmployees]);
  // Chỉ liệt kê phòng ban ĐANG HOẠT ĐỘNG → bỏ ngách ẩn (Quản trị hệ thống, Site Manager) + phòng đã sáp nhập.
  const deptOptions = useMemo(
    () => Array.from(new Set(activeEmps.filter((e) => e.department?.isActive !== false).map((e) => e.department?.name).filter(Boolean))) as string[],
    [activeEmps]
  );
  const uniq = (vals: (string | null | undefined)[]) => Array.from(new Set(vals.filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b, "vi"));
  const jobRoleOptions = useMemo(() => uniq(activeEmps.map((e) => e.jobRole)), [activeEmps]);
  const positionOptions = useMemo(() => uniq(activeEmps.map((e) => e.position?.name)), [activeEmps]);
  const teamOptions = useMemo(() => uniq(activeEmps.map((e) => e.team?.name)), [activeEmps]);
  const gradeOptions = useMemo(() => Array.from(new Set(allEmployees.map((e) => e.salaryGrade).filter((g): g is number => typeof g === "number"))).sort((a, b) => a - b), [allEmployees]);

  // Đếm NV chưa cập nhật thông tin cơ bản (chỉ tính NV đang làm/thử việc)
  const incompleteCount = useMemo(
    () => allEmployees.filter((e) => ["ACTIVE", "PROBATION"].includes(e.status) && missingFields(e).length > 0).length,
    [allEmployees]
  );

  // Đếm NV sắp hết hạn HĐ (HĐ đang hiệu lực còn ≤ 45 ngày)
  const expiringCount = useMemo(
    () => allEmployees.filter((e) => isExpiringSoon(e)).length,
    [allEmployees]
  );

  // NV đã nghỉ (Đã nghỉ / Sa thải) luôn xếp xuống dưới cùng; NV đang làm lên trên.
  // sort ổn định nên trong từng nhóm vẫn giữ thứ tự mã (code) như API trả về.
  const LEFT_STATUSES = ["RESIGNED", "TERMINATED"];
  const filtered = useMemo(() => allEmployees.filter((emp) => {
    if (deptFilter && emp.department?.name !== deptFilter) return false;
    if (statusFilter && emp.status !== statusFilter) return false;
    if (nptFilter === "yes" && !((emp.dependents || 0) > 0)) return false;
    if (nptFilter === "no" && (emp.dependents || 0) > 0) return false;
    if (childAgeRange) {
      const r = CHILD_AGE_RANGES.find((x) => x.value === childAgeRange);
      const min = r?.min ?? null, max = r?.max ?? null;
      const ok = (emp.children || []).some((c) => {
        const a = ageFromDob(c.dateOfBirth);
        if (a === null) return false;
        if (min !== null && a < min) return false;
        if (max !== null && a > max) return false;
        return true;
      });
      if (!ok) return false;
    }
    // Ngày vào làm trong khoảng
    if (joinFrom && (!emp.startDate || emp.startDate.slice(0, 10) < joinFrom)) return false;
    if (joinTo && (!emp.startDate || emp.startDate.slice(0, 10) > joinTo)) return false;
    // Cấp bậc thợ (bậc lương), vị trí, chức vụ, tổ đội
    if (gradeFilter && String(emp.salaryGrade ?? "") !== gradeFilter) return false;
    if (jobRoleFilter && (emp.jobRole || "") !== jobRoleFilter) return false;
    if (positionFilter && (emp.position?.name || "") !== positionFilter) return false;
    if (teamFilter && (emp.team?.name || "") !== teamFilter) return false;
    // Loại hợp đồng (HĐ mới nhất)
    if (contractFilter && (emp.contracts?.[0]?.contractType || "") !== contractFilter) return false;
    if (genderFilter && emp.gender !== genderFilter) return false;
    // Độ tuổi nhân sự
    if (ageMin || ageMax) {
      const a = ageFromDob(emp.dateOfBirth);
      if (a === null) return false;
      if (ageMin && a < Number(ageMin)) return false;
      if (ageMax && a > Number(ageMax)) return false;
    }
    // Tháng sinh
    if (birthMonthFilter) {
      if (!emp.dateOfBirth || Number(emp.dateOfBirth.slice(5, 7)) !== Number(birthMonthFilter)) return false;
    }
    // Khoảng lương (Tổng thu nhập) — chỉ áp dụng khi có quyền xem lương
    if (canViewSalary && (salaryMin || salaryMax)) {
      const ti = totalIncome(emp);
      if (salaryMin && ti < Number(salaryMin)) return false;
      if (salaryMax && ti > Number(salaryMax)) return false;
    }
    if (view === "incomplete" && !(["ACTIVE", "PROBATION"].includes(emp.status) && missingFields(emp).length > 0)) return false;
    if (view === "expiring" && !isExpiringSoon(emp)) return false;
    return true;
  }).sort((a, b) => (LEFT_STATUSES.includes(a.status) ? 1 : 0) - (LEFT_STATUSES.includes(b.status) ? 1 : 0)),
  [allEmployees, deptFilter, statusFilter, nptFilter, childAgeRange, view, joinFrom, joinTo, gradeFilter, jobRoleFilter, positionFilter, teamFilter, contractFilter, genderFilter, ageMin, ageMax, salaryMin, salaryMax, canViewSalary, birthMonthFilter]);

  // Đếm số filter đang bật (cho badge) + reset.
  const activeFilterCount = [deptFilter, statusFilter, nptFilter, childAgeRange, joinFrom, joinTo, gradeFilter, jobRoleFilter, positionFilter, teamFilter, contractFilter, genderFilter, ageMin, ageMax, salaryMin, salaryMax, birthMonthFilter].filter(Boolean).length;
  function clearAllFilters() {
    setDeptFilter(""); setStatusFilter(""); setNptFilter(""); setChildAgeRange("");
    setJoinFrom(""); setJoinTo(""); setGradeFilter(""); setJobRoleFilter(""); setPositionFilter("");
    setTeamFilter(""); setContractFilter(""); setGenderFilter(""); setAgeMin(""); setAgeMax("");
    setSalaryMin(""); setSalaryMax(""); setBirthMonthFilter("");
  }

  async function handleExport() {
    const { default: ExcelJS } = await import("exceljs");
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Danh sách CBNV");
    ws.columns = [
      { header: "Mã NV", key: "code", width: 10 },
      { header: "Họ tên", key: "fullName", width: 25 },
      { header: "Phòng ban", key: "dept", width: 18 },
      { header: "Chức vụ", key: "pos", width: 20 },
      { header: "Loại HĐ", key: "contract", width: 14 },
      { header: "Trạng thái", key: "status", width: 12 },
      { header: "Ngày vào", key: "startDate", width: 12 },
    ];
    ws.getRow(1).font = { bold: true };
    // Xuất ĐÚNG danh sách đang lọc, kể cả từ khoá ô tìm kiếm trong bảng.
    const sLower = tableSearch.trim().toLowerCase();
    const exportList = sLower
      ? filtered.filter((e) => e.code.toLowerCase().includes(sLower) || e.fullName.toLowerCase().includes(sLower))
      : filtered;
    exportList.forEach((emp) => {
      ws.addRow({
        code: emp.code,
        fullName: emp.fullName,
        dept: emp.department?.name || "",
        pos: emp.jobRole || emp.position?.name || "",
        contract: CONTRACT_TYPE_LABELS[emp.contracts?.[0]?.contractType || ""] || "",
        status: statusLabel(emp.status),
        startDate: emp.startDate ? new Date(emp.startDate).toLocaleDateString("vi-VN") : "",
      });
    });
    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `danh-sach-cbnv-${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click(); URL.revokeObjectURL(url);
  }

  // Export THÔNG TIN LƯƠNG (Tổng thu nhập) — đúng danh sách đang lọc. Chỉ khi có quyền xem lương.
  async function handleExportSalary() {
    const { default: ExcelJS } = await import("exceljs");
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Thông tin lương");
    ws.columns = [
      { header: "Mã NV", key: "code", width: 10 },
      { header: "Họ tên", key: "fullName", width: 25 },
      { header: "Tổ / Đội / Bộ phận", key: "team", width: 20 },
      { header: "Chức vụ", key: "jobRole", width: 16 },
      { header: "Vị trí làm việc", key: "position", width: 22 },
      { header: "Cấp bậc thợ", key: "grade", width: 12 },
      { header: "Mức lương (Tổng thu nhập)", key: "salary", width: 20 },
    ];
    ws.getRow(1).font = { bold: true };
    const sLower = tableSearch.trim().toLowerCase();
    const exportList = (sLower
      ? filtered.filter((e) => e.code.toLowerCase().includes(sLower) || e.fullName.toLowerCase().includes(sLower))
      : filtered);
    exportList.forEach((emp) => {
      ws.addRow({
        code: emp.code,
        fullName: emp.fullName,
        team: emp.team?.name || emp.department?.name || "",
        jobRole: emp.jobRole || "",
        position: emp.position?.name || "",
        grade: emp.salaryGrade ?? "",
        salary: totalIncome(emp),
      });
    });
    ws.getColumn("salary").numFmt = "#,##0";
    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `thong-tin-luong-${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click(); URL.revokeObjectURL(url);
  }

  // Export danh sách NGƯỜI PHỤ THUỘC của tất cả nhân sự (mỗi NPT 1 dòng).
  async function handleExportDependents() {
    const res = await fetch("/api/v1/employees/dependents-export").then((r) => r.json()).catch(() => null);
    const rows: any[] = res?.data || [];
    const { default: ExcelJS } = await import("exceljs");
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Người phụ thuộc");
    ws.columns = [
      { header: "Mã NV", key: "code", width: 10 },
      { header: "Tên nhân sự", key: "fullName", width: 24 },
      { header: "Phòng ban", key: "department", width: 18 },
      { header: "Số NPT", key: "depCount", width: 8 },
      { header: "Tên NPT", key: "depName", width: 24 },
      { header: "Quan hệ", key: "relationship", width: 10 },
      { header: "Ngày sinh", key: "dateOfBirth", width: 12 },
      { header: "MST NPT", key: "taxCode", width: 14 },
      { header: "Trạng thái", key: "status", width: 14 },
      { header: "Ngày đăng ký", key: "registeredAt", width: 12 },
      { header: "Ngày dừng", key: "stoppedAt", width: 12 },
      { header: "Khai báo (NPT >18 tuổi)", key: "declaration", width: 32 },
    ];
    ws.getRow(1).font = { bold: true };
    const fmt = (s: string) => s ? new Date(s).toLocaleDateString("vi-VN") : "";
    rows.forEach((r) => ws.addRow({ ...r, dateOfBirth: fmt(r.dateOfBirth), registeredAt: fmt(r.registeredAt), stoppedAt: fmt(r.stoppedAt) }));
    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `nguoi-phu-thuoc-${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click(); URL.revokeObjectURL(url);
  }

  // Export danh sách CON CÁI của tất cả nhân sự (mỗi con 1 dòng).
  async function handleExportChildren() {
    const res = await fetch("/api/v1/employees/children-export").then((r) => r.json()).catch(() => null);
    const rows: any[] = res?.data || [];
    const { default: ExcelJS } = await import("exceljs");
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Con cái");
    ws.columns = [
      { header: "Mã NV", key: "code", width: 10 },
      { header: "Tên nhân sự", key: "fullName", width: 24 },
      { header: "Phòng ban", key: "department", width: 18 },
      { header: "Số con", key: "childCount", width: 8 },
      { header: "Tên con", key: "childName", width: 24 },
      { header: "Ngày sinh", key: "dateOfBirth", width: 12 },
      { header: "Tuổi", key: "age", width: 6 },
      { header: "MST", key: "taxCode", width: 14 },
      { header: "CCCD", key: "idNumber", width: 16 },
      { header: "Giấy tờ", key: "hasDocs", width: 8 },
    ];
    ws.getRow(1).font = { bold: true };
    const fmt = (s: string) => s ? new Date(s).toLocaleDateString("vi-VN") : "";
    const ageOf = (s: string) => {
      if (!s) return "";
      const d = new Date(s), n = new Date();
      let a = n.getFullYear() - d.getFullYear();
      const m = n.getMonth() - d.getMonth();
      if (m < 0 || (m === 0 && n.getDate() < d.getDate())) a--;
      return a;
    };
    const range = CHILD_AGE_RANGES.find((r) => r.value === childAgeRange);
    const minA = range?.min ?? null;
    const maxA = range?.max ?? null;
    rows.forEach((r) => {
      const a = ageOf(r.dateOfBirth);
      if (typeof a === "number") {
        if (minA !== null && a < minA) return;
        if (maxA !== null && a > maxA) return;
      } else if (minA !== null || maxA !== null) {
        return; // đang lọc tuổi mà con chưa có ngày sinh → bỏ qua
      }
      ws.addRow({ ...r, age: a, dateOfBirth: fmt(r.dateOfBirth) });
    });
    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `con-cai-nhan-su-${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click(); URL.revokeObjectURL(url);
  }

  const columns: Column<Record<string, unknown>>[] = [
    { key: "code", header: "Mã NV", sortable: true, width: "90px" },
    {
      key: "fullName", header: "Họ tên", sortable: true,
      render: (row) => {
        const emp = row as unknown as Employee;
        return (
          <div className="flex items-center gap-2.5">
            {emp.photo ? (
              <img src={viewUrl(emp.photo)} alt={emp.fullName}
                className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                onError={(e) => { const t = e.currentTarget; t.onerror = null; t.style.display = "none"; }} />
            ) : (
              <div className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-[11px] font-bold text-white"
                style={{ background: "var(--ibs-accent)" }}>
                {getInitials(emp.fullName)}
              </div>
            )}
            <span className="font-medium">{emp.fullName}</span>
          </div>
        );
      },
    },
    {
      key: "departmentName", header: "Phòng ban",
      render: (row) => <span>{(row as unknown as Employee).department?.name || "—"}</span>,
    },
    {
      key: "positionName", header: "Chức vụ",
      render: (row) => { const e = row as unknown as Employee; return <span style={{ color: "var(--ibs-text-muted)" }}>{e.jobRole || e.position?.name || "—"}</span>; },
    },
    {
      key: "contractType", header: "Loại HĐ",
      render: (row) => {
        const emp = row as unknown as Employee;
        const ct = activeContract(emp);
        if (!ct) return <span style={{ color: "var(--ibs-text-dim)" }}>—</span>;
        const d = contractDaysLeft(emp);
        const expiring = ["ACTIVE", "PROBATION"].includes(emp.status) && d !== null && d <= 45;
        return (
          <div>
            <span>{CONTRACT_TYPE_LABELS[ct.contractType] || ct.contractType}</span>
            {expiring && (
              <span className="block text-[11px] font-semibold" style={{ color: "var(--ibs-danger)" }}>
                {d! < 0 ? `Quá hạn ${-d!} ngày` : `Còn ${d} ngày`}
              </span>
            )}
          </div>
        );
      },
    },
    {
      key: "status", header: "Trạng thái",
      render: (row) => <StatusBadge status={(row as unknown as Employee).status} />,
    },
    ...(canViewSalary ? ([{
      key: "salary", header: "Mức lương",
      render: (row) => {
        const ti = totalIncome(row as unknown as Employee);
        return <span style={{ color: "var(--ibs-text)" }}>{ti ? ti.toLocaleString("vi-VN") : "—"}</span>;
      },
    }] as Column<Record<string, unknown>>[]) : []),
    {
      key: "missing", header: "Thiếu TT",
      render: (row) => {
        const emp = row as unknown as Employee;
        if (!["ACTIVE", "PROBATION"].includes(emp.status)) return <span style={{ color: "var(--ibs-text-dim)" }}>—</span>;
        const miss = missingFields(emp);
        if (miss.length === 0) return <span title="Đã đủ thông tin cơ bản" style={{ color: "var(--ibs-success)" }}>✓</span>;
        return (
          <div className="flex flex-wrap gap-1">
            {miss.map((m) => (
              <span key={m} className="text-[10px] px-1.5 py-0.5 rounded font-semibold whitespace-nowrap"
                style={{ background: "rgba(245,158,11,0.15)", color: "var(--ibs-warning)" }}>{m}</span>
            ))}
          </div>
        );
      },
    },
    {
      key: "id", header: "", width: "70px",
      render: (row) => {
        const emp = row as unknown as Employee;
        return (
          <button
            onClick={(e) => { e.stopPropagation(); router.push(`/ho-so/${emp.id}`); }}
            className="flex items-center gap-1 text-[12px] px-2.5 py-1.5 rounded-lg border transition-colors"
            style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-muted)" }}
            onMouseEnter={(e) => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = "var(--ibs-accent)"; b.style.color = "var(--ibs-accent)"; }}
            onMouseLeave={(e) => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = "var(--ibs-border)"; b.style.color = "var(--ibs-text-muted)"; }}
          >
            <Eye size={11} /> Xem
          </button>
        );
      },
    },
  ];

  return (
    <div>
      <PageTitle title="M1 - Hồ sơ nhân sự" description="Quản lý hồ sơ CBNV — IBS Heavy Industry JSC" />

      {/* Tab: Tất cả / Chưa cập nhật thông tin / Sắp hết hạn HĐ */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <button onClick={() => setView("all")}
          className="px-4 py-2 rounded-lg text-[13px] font-semibold border transition-colors"
          style={{ background: view === "all" ? "var(--ibs-accent)" : "var(--ibs-bg-card)", color: view === "all" ? "#fff" : "var(--ibs-text-muted)", borderColor: "var(--ibs-border)" }}>
          Tất cả nhân sự
        </button>
        <button onClick={() => setView("incomplete")}
          className="px-4 py-2 rounded-lg text-[13px] font-semibold border transition-colors flex items-center gap-1.5"
          style={{ background: view === "incomplete" ? "var(--ibs-warning)" : "var(--ibs-bg-card)", color: view === "incomplete" ? "#fff" : (incompleteCount > 0 ? "var(--ibs-warning)" : "var(--ibs-text-muted)"), borderColor: incompleteCount > 0 ? "var(--ibs-warning)" : "var(--ibs-border)" }}>
          ⚠ Chưa cập nhật thông tin
          {incompleteCount > 0 && (
            <span className="inline-flex items-center justify-center min-w-[20px] h-[20px] px-1.5 rounded-full text-[11px] font-bold"
              style={{ background: view === "incomplete" ? "rgba(255,255,255,0.25)" : "var(--ibs-warning)", color: "#fff" }}>
              {incompleteCount}
            </span>
          )}
        </button>
        <button onClick={() => setView("expiring")}
          className="px-4 py-2 rounded-lg text-[13px] font-semibold border transition-colors flex items-center gap-1.5"
          style={{ background: view === "expiring" ? "var(--ibs-danger)" : "var(--ibs-bg-card)", color: view === "expiring" ? "#fff" : (expiringCount > 0 ? "var(--ibs-danger)" : "var(--ibs-text-muted)"), borderColor: expiringCount > 0 ? "var(--ibs-danger)" : "var(--ibs-border)" }}>
          ⏳ Sắp hết hạn HĐ
          {expiringCount > 0 && (
            <span className="inline-flex items-center justify-center min-w-[20px] h-[20px] px-1.5 rounded-full text-[11px] font-bold"
              style={{ background: view === "expiring" ? "rgba(255,255,255,0.25)" : "var(--ibs-danger)", color: "#fff" }}>
              {expiringCount}
            </span>
          )}
        </button>
      </div>

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <button onClick={() => setShowFilters((v) => !v)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[13px] border font-medium"
          style={{ background: showFilters ? "rgba(0,180,216,0.1)" : "var(--ibs-bg-card)", borderColor: showFilters ? "var(--ibs-accent)" : "var(--ibs-border)", color: showFilters ? "var(--ibs-accent)" : "var(--ibs-text-muted)" }}>
          <SlidersHorizontal size={14} /> Bộ lọc
          {activeFilterCount > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold text-white" style={{ background: "var(--ibs-accent)" }}>{activeFilterCount}</span>}
        </button>
        {activeFilterCount > 0 && (
          <button onClick={clearAllFilters} className="flex items-center gap-1 px-2.5 py-2 rounded-lg text-[13px] border"
            style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-muted)" }}>
            <X size={13} /> Xóa lọc
          </button>
        )}
        <button onClick={fetchEmployees}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[13px] border"
          style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-muted)" }}>
          <RefreshCw size={13} /> Làm mới
        </button>
        <div className="ml-auto flex gap-2">
          {canDo("employees", "readAll") && (
            <button onClick={handleExport}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[13px] border transition-colors"
              style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-muted)" }}>
              <Download size={13} /> Export Excel
            </button>
          )}
          {canDo("employees", "readAll") && (
            <button onClick={handleExportDependents}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[13px] border transition-colors"
              style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-muted)" }}>
              <Download size={13} /> Export NPT
            </button>
          )}
          {canDo("employees", "readAll") && (
            <button onClick={handleExportChildren}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[13px] border transition-colors"
              style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-muted)" }}>
              <Download size={13} /> Export Con cái
            </button>
          )}
          {canViewSalary && (
            <button onClick={handleExportSalary}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[13px] border transition-colors"
              style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-muted)" }}>
              <Download size={13} /> Export lương
            </button>
          )}
          {canDo("employees", "create") && (
            <button onClick={() => setShowCreate(true)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-semibold text-white"
              style={{ background: "var(--ibs-accent)" }}>
              <UserPlus size={14} /> Thêm nhân viên
            </button>
          )}
        </div>
      </div>

      {showFilters && (() => {
        const fCls = "w-full px-2.5 py-1.5 rounded-lg text-[12px] outline-none border";
        const fSt = { background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" } as React.CSSProperties;
        const lCls = "block text-[11px] font-semibold mb-1";
        const lSt = { color: "var(--ibs-text-dim)" } as React.CSSProperties;
        return (
          <div className="mb-4 p-4 rounded-xl border grid grid-cols-2 md:grid-cols-4 gap-3" style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
            <div>
              <label className={lCls} style={lSt}>Phòng ban</label>
              <select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)} className={fCls} style={fSt}>
                <option value="">Tất cả</option>
                {deptOptions.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className={lCls} style={lSt}>Trạng thái</label>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={fCls} style={fSt}>
                <option value="">Tất cả</option>
                <option value="ACTIVE">Đang làm</option>
                <option value="PROBATION">Thử việc</option>
                <option value="ON_LEAVE">Tạm nghỉ</option>
                <option value="RESIGNED">Đã nghỉ</option>
                <option value="TERMINATED">Sa thải</option>
              </select>
            </div>
            <div>
              <label className={lCls} style={lSt}>Giới tính</label>
              <select value={genderFilter} onChange={(e) => setGenderFilter(e.target.value)} className={fCls} style={fSt}>
                <option value="">Tất cả</option>
                <option value="MALE">Nam</option>
                <option value="FEMALE">Nữ</option>
              </select>
            </div>
            {teamOptions.length > 0 && (
              <div>
                <label className={lCls} style={lSt}>Tổ / Đội / Bộ phận</label>
                <select value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)} className={fCls} style={fSt}>
                  <option value="">Tất cả</option>
                  {teamOptions.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className={lCls} style={lSt}>Chức vụ</label>
              <select value={jobRoleFilter} onChange={(e) => setJobRoleFilter(e.target.value)} className={fCls} style={fSt}>
                <option value="">Tất cả</option>
                {jobRoleOptions.map((j) => <option key={j} value={j}>{j}</option>)}
              </select>
            </div>
            <div>
              <label className={lCls} style={lSt}>Vị trí làm việc</label>
              <select value={positionFilter} onChange={(e) => setPositionFilter(e.target.value)} className={fCls} style={fSt}>
                <option value="">Tất cả</option>
                {positionOptions.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className={lCls} style={lSt}>Cấp bậc thợ (bậc lương)</label>
              <select value={gradeFilter} onChange={(e) => setGradeFilter(e.target.value)} className={fCls} style={fSt}>
                <option value="">Tất cả</option>
                {gradeOptions.map((g) => <option key={g} value={String(g)}>Bậc {g}</option>)}
              </select>
            </div>
            <div>
              <label className={lCls} style={lSt}>Loại hợp đồng</label>
              <select value={contractFilter} onChange={(e) => setContractFilter(e.target.value)} className={fCls} style={fSt}>
                <option value="">Tất cả</option>
                {Object.entries(CONTRACT_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className={lCls} style={lSt}>Độ tuổi nhân sự</label>
              <div className="flex items-center gap-1">
                <input type="number" min="0" value={ageMin} onChange={(e) => setAgeMin(e.target.value)} placeholder="từ" className={fCls} style={fSt} />
                <span className="text-[11px]" style={{ color: "var(--ibs-text-dim)" }}>–</span>
                <input type="number" min="0" value={ageMax} onChange={(e) => setAgeMax(e.target.value)} placeholder="đến" className={fCls} style={fSt} />
              </div>
            </div>
            <div>
              <label className={lCls} style={lSt}>Tháng sinh</label>
              <select value={birthMonthFilter} onChange={(e) => setBirthMonthFilter(e.target.value)} className={fCls} style={fSt}>
                <option value="">Tất cả</option>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => <option key={m} value={m}>Tháng {m}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className={lCls} style={lSt}>Ngày vào làm (từ – đến)</label>
              <div className="flex items-center gap-1">
                <DateInput value={joinFrom} onChange={(e) => setJoinFrom(e.target.value)} className={fCls} style={fSt} />
                <span className="text-[11px]" style={{ color: "var(--ibs-text-dim)" }}>–</span>
                <DateInput value={joinTo} onChange={(e) => setJoinTo(e.target.value)} className={fCls} style={fSt} />
              </div>
            </div>
            <div>
              <label className={lCls} style={lSt}>Người phụ thuộc (NPT)</label>
              <select value={nptFilter} onChange={(e) => setNptFilter(e.target.value)} className={fCls} style={fSt}>
                <option value="">Tất cả</option>
                <option value="yes">Có NPT</option>
                <option value="no">Không có NPT</option>
              </select>
            </div>
            <div>
              <label className={lCls} style={lSt}>Có con theo độ tuổi</label>
              <select value={childAgeRange} onChange={(e) => setChildAgeRange(e.target.value)} className={fCls} style={fSt}>
                {CHILD_AGE_RANGES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            {canViewSalary && (
              <div className="col-span-2">
                <label className={lCls} style={lSt}>Khoảng lương (Tổng thu nhập)</label>
                <div className="flex items-center gap-1">
                  <input type="text" inputMode="numeric" value={salaryMin ? Number(salaryMin).toLocaleString("vi-VN") : ""} onChange={(e) => setSalaryMin(e.target.value.replace(/\D/g, ""))} placeholder="từ (đ)" className={fCls} style={fSt} />
                  <span className="text-[11px]" style={{ color: "var(--ibs-text-dim)" }}>–</span>
                  <input type="text" inputMode="numeric" value={salaryMax ? Number(salaryMax).toLocaleString("vi-VN") : ""} onChange={(e) => setSalaryMax(e.target.value.replace(/\D/g, ""))} placeholder="đến (đ)" className={fCls} style={fSt} />
                </div>
              </div>
            )}
            <div className="col-span-2 md:col-span-4 flex justify-end">
              {activeFilterCount > 0 && (
                <button onClick={clearAllFilters} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[12px] border" style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-muted)" }}>
                  <X size={12} /> Xóa tất cả lọc ({activeFilterCount})
                </button>
              )}
            </div>
          </div>
        );
      })()}

      <div className="rounded-xl border overflow-hidden"
        style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
        <div className="px-5 py-4 border-b flex justify-between items-center"
          style={{ borderColor: "var(--ibs-border)" }}>
          <h3 className="text-sm font-semibold">👤 Danh sách CBNV</h3>
          <span className="text-[12px]" style={{ color: "var(--ibs-text-dim)" }}>
            {loading ? "Đang tải..." : `${filtered.length}${filtered.length !== total ? ` / ${total}` : ""} nhân viên`}
          </span>
        </div>
        <div className="p-5">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-[13px]"
              style={{ color: "var(--ibs-text-dim)" }}>
              <RefreshCw size={16} className="animate-spin mr-2" /> Đang tải dữ liệu...
            </div>
          ) : (
            <DataTable columns={columns} data={filtered as unknown as Record<string, unknown>[]}
              searchPlaceholder="Tìm mã NV, họ tên..." searchKeys={["code", "fullName"]} pageSize={20}
              onSearchChange={setTableSearch} />
          )}
        </div>
      </div>

      {showCreate && (
        <CreateEmployeeDialog
          onClose={() => setShowCreate(false)}
          onSuccess={(emp) => { setAllEmployees((prev) => [emp, ...prev]); setTotal((t) => t + 1); setShowCreate(false); }}
        />
      )}
    </div>
  );
}

// ── Create Employee Dialog ──────────────────────────────────────────────────
function CreateEmployeeDialog({ onClose, onSuccess }: {
  onClose: () => void;
  onSuccess: (emp: Employee) => void;
}) {
  const [depts, setDepts] = useState<Dept[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    fullName: "", gender: "MALE", dateOfBirth: "", idNumber: "", phone: "",
    address: "", departmentId: "", positionId: "", startDate: "",
    salaryGrade: "", salaryCoefficient: "",
  });
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);

  useEffect(() => {
    fetch("/api/v1/departments").then((r) => r.json()).then((res) => setDepts(res.data || []));
  }, []);

  useEffect(() => {
    if (!form.departmentId) { setPositions([]); return; }
    fetch(`/api/v1/positions?departmentId=${form.departmentId}`)
      .then((r) => r.json()).then((res) => setPositions(res.data || []));
  }, [form.departmentId]);

  function set(field: string, val: string) {
    setForm((f) => ({ ...f, [field]: val }));
    if (field === "departmentId") setForm((f) => ({ ...f, departmentId: val, positionId: "" }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const body = {
        ...form,
        salaryGrade: form.salaryGrade ? parseInt(form.salaryGrade) : undefined,
        salaryCoefficient: form.salaryCoefficient ? parseFloat(form.salaryCoefficient) : undefined,
        bankAccounts,
      };
      const res = await fetch("/api/v1/employees", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(apiError(res.status, data.error)); return;
      }
      onSuccess(data.data);
    } finally {
      setSubmitting(false);
    }
  }

  const inputStyle = {
    background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)",
  };
  const inputClass = "w-full px-3 py-2 rounded-lg text-[13px] outline-none border";
  const labelClass = "block text-[12px] font-medium mb-1.5";
  const labelStyle = { color: "var(--ibs-text-muted)" };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto py-6"
      style={{ background: "rgba(0,0,0,0.7)" }}>
      <div className="rounded-2xl border w-full max-w-[680px] mx-4"
        style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
        {/* Header */}
        <div className="flex justify-between items-center px-6 py-4 border-b"
          style={{ borderColor: "var(--ibs-border)" }}>
          <h3 className="text-[16px] font-bold">Thêm nhân viên mới</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ color: "var(--ibs-text-dim)" }}><X size={16} /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          <div className="grid grid-cols-2 gap-4">
            {/* Full name */}
            <div className="col-span-2">
              <label className={labelClass} style={labelStyle}>Họ tên đầy đủ *</label>
              <input required value={form.fullName} onChange={(e) => set("fullName", e.target.value)}
                placeholder="Nguyễn Văn A" className={inputClass} style={inputStyle} />
            </div>
            {/* Gender + DOB */}
            <div>
              <label className={labelClass} style={labelStyle}>Giới tính *</label>
              <select required value={form.gender} onChange={(e) => set("gender", e.target.value)}
                className={inputClass} style={inputStyle}>
                <option value="MALE">Nam</option>
                <option value="FEMALE">Nữ</option>
              </select>
            </div>
            <div>
              <label className={labelClass} style={labelStyle}>Ngày sinh *</label>
              <DateInput required value={form.dateOfBirth} onChange={(e) => set("dateOfBirth", e.target.value)}
                className={inputClass} style={inputStyle} />
            </div>
            {/* ID + Phone */}
            <div>
              <label className={labelClass} style={labelStyle}>Số CCCD/CMND * (9-12 số)</label>
              <input required value={form.idNumber} onChange={(e) => set("idNumber", e.target.value)}
                placeholder="012345678901" className={inputClass} style={inputStyle} />
            </div>
            <div>
              <label className={labelClass} style={labelStyle}>Số điện thoại * (0xxxxxxxxx)</label>
              <input required value={form.phone} onChange={(e) => set("phone", e.target.value)}
                placeholder="0912345678" className={inputClass} style={inputStyle} />
            </div>
            {/* Address */}
            <div className="col-span-2">
              <label className={labelClass} style={labelStyle}>Địa chỉ thường trú *</label>
              <input required value={form.address} onChange={(e) => set("address", e.target.value)}
                placeholder="Số 1, Đường ABC, Quận XYZ, TP.HCM" className={inputClass} style={inputStyle} />
            </div>
            {/* Department + Position */}
            <div>
              <label className={labelClass} style={labelStyle}>Phòng ban *</label>
              <select required value={form.departmentId} onChange={(e) => set("departmentId", e.target.value)}
                className={inputClass} style={inputStyle}>
                <option value="">-- Chọn phòng ban --</option>
                {depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass} style={labelStyle}>Chức vụ *</label>
              <select required value={form.positionId} onChange={(e) => set("positionId", e.target.value)}
                className={inputClass} style={inputStyle} disabled={!form.departmentId}>
                <option value="">-- Chọn chức vụ --</option>
                {positions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            {/* Start date */}
            <div>
              <label className={labelClass} style={labelStyle}>Ngày vào làm *</label>
              <DateInput required value={form.startDate} onChange={(e) => set("startDate", e.target.value)}
                className={inputClass} style={inputStyle} />
            </div>
            {/* Salary grade + coeff */}
            <div>
              <label className={labelClass} style={labelStyle}>Bậc lương (1-7)</label>
              <input type="number" min="1" max="7" value={form.salaryGrade}
                onChange={(e) => set("salaryGrade", e.target.value)}
                placeholder="3" className={inputClass} style={inputStyle} />
            </div>
            <div>
              <label className={labelClass} style={labelStyle}>Hệ số lương</label>
              <input type="number" step="0.1" min="1" max="10" value={form.salaryCoefficient}
                onChange={(e) => set("salaryCoefficient", e.target.value)}
                placeholder="3.2" className={inputClass} style={inputStyle} />
            </div>
          </div>

          {/* Tài khoản ngân hàng */}
          <div className="mt-4">
            <label className={labelClass} style={labelStyle}>Tài khoản ngân hàng (tối đa 5)</label>
            <BankAccountsEditor value={bankAccounts} onChange={setBankAccounts} />
          </div>

          {/* Info box */}
          <div className="mt-4 px-4 py-3 rounded-lg text-[12px]"
            style={{ background: "rgba(0,180,216,0.08)", color: "var(--ibs-text-muted)", border: "1px solid rgba(0,180,216,0.2)" }}>
            ℹ️ Mật khẩu mặc định sẽ là 6 số cuối của CCCD. Email: [tên].[họ viết tắt]@ibs.com.vn
          </div>

          {error && (
            <div className="mt-3 px-3 py-2 rounded-lg text-[12px]"
              style={{ background: "rgba(239,68,68,0.1)", color: "var(--ibs-danger)" }}>
              ⚠️ {error}
            </div>
          )}

          <div className="flex gap-3 mt-5">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 rounded-lg text-[13px] border"
              style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-muted)" }}>
              Hủy
            </button>
            <button type="submit" disabled={submitting}
              className="flex-1 py-2.5 rounded-lg text-[13px] font-semibold text-white disabled:opacity-60"
              style={{ background: "var(--ibs-accent)" }}>
              {submitting ? "Đang tạo..." : "Tạo nhân viên"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
