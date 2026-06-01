"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { PageTitle } from "@/components/layout/page-title";
import { DataTable, Column } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { getInitials, apiError } from "@/lib/utils";
import { UserPlus, Eye, RefreshCw, X, Download } from "lucide-react";
import { usePermission } from "@/hooks/use-permission";
import { DateInput } from "@/components/shared/date-input";

type Employee = {
  id: string; code: string; fullName: string; gender: string; status: string;
  startDate: string;
  idNumber?: string | null; taxCode?: string | null; address?: string | null;
  insuranceNumber?: string | null; dateOfBirth?: string | null;
  department: { id: string; name: string };
  position: { name: string };
  jobRole?: string | null;
  contracts: { contractType: string; status: string; baseSalary: number; endDate?: string | null }[];
};

// HĐ đang hiệu lực (hoặc mới nhất) + số ngày còn lại tới hạn.
function activeContract(e: Employee) { return e.contracts?.find((c) => c.status === "ACTIVE") || e.contracts?.[0] || null; }
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

export default function EmployeesPage() {
  const router = useRouter();
  const { canDo } = usePermission();
  const [allEmployees, setAllEmployees] = useState<Employee[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [deptFilter, setDeptFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [view, setView] = useState<"all" | "incomplete" | "expiring">("all");
  const incompleteOnly = view === "incomplete";

  function fetchEmployees() {
    setLoading(true);
    fetch("/api/v1/employees?limit=500")
      .then((r) => r.json())
      .then((res) => { setAllEmployees(res.data || []); setTotal(res.total || 0); })
      .finally(() => setLoading(false));
  }

  useEffect(() => { fetchEmployees(); }, []);

  const deptOptions = useMemo(
    () => Array.from(new Set(allEmployees.map((e) => e.department?.name).filter(Boolean))) as string[],
    [allEmployees]
  );

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

  const filtered = useMemo(() => allEmployees.filter((emp) => {
    if (deptFilter && emp.department?.name !== deptFilter) return false;
    if (statusFilter && emp.status !== statusFilter) return false;
    if (view === "incomplete" && !(["ACTIVE", "PROBATION"].includes(emp.status) && missingFields(emp).length > 0)) return false;
    if (view === "expiring" && !isExpiringSoon(emp)) return false;
    return true;
  }), [allEmployees, deptFilter, statusFilter, view]);

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
    filtered.forEach((emp) => {
      ws.addRow({
        code: emp.code,
        fullName: emp.fullName,
        dept: emp.department?.name || "",
        pos: emp.jobRole || emp.position?.name || "",
        contract: CONTRACT_TYPE_LABELS[emp.contracts?.[0]?.contractType || ""] || "",
        status: emp.status,
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

  const columns: Column<Record<string, unknown>>[] = [
    { key: "code", header: "Mã NV", sortable: true, width: "90px" },
    {
      key: "fullName", header: "Họ tên", sortable: true,
      render: (row) => {
        const emp = row as unknown as Employee;
        return (
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-[11px] font-bold text-white"
              style={{ background: "var(--ibs-accent)" }}>
              {getInitials(emp.fullName)}
            </div>
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
        <select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)}
          className="px-3 py-2 rounded-lg text-[13px] outline-none border"
          style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }}>
          <option value="">Tất cả phòng ban</option>
          {deptOptions.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 rounded-lg text-[13px] outline-none border"
          style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }}>
          <option value="">Tất cả trạng thái</option>
          <option value="ACTIVE">Đang làm</option>
          <option value="PROBATION">Thử việc</option>
          <option value="ON_LEAVE">Tạm nghỉ</option>
          <option value="RESIGNED">Đã nghỉ</option>
          <option value="TERMINATED">Sa thải</option>
        </select>
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
          {canDo("employees", "create") && (
            <button onClick={() => setShowCreate(true)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-semibold text-white"
              style={{ background: "var(--ibs-accent)" }}>
              <UserPlus size={14} /> Thêm nhân viên
            </button>
          )}
        </div>
      </div>

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
              searchPlaceholder="Tìm mã NV, họ tên..." searchKeys={["code", "fullName"]} pageSize={20} />
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
