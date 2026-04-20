"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { PageTitle } from "@/components/layout/page-title";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatDate, getInitials, formatVND } from "@/lib/utils";
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
  department: { name: string };
  position: { name: string; level: string };
  team?: { name: string };
  user: { email: string; isActive: boolean };
  contracts: {
    id: string;
    contractNumber: string;
    contractType: string;
    startDate: string;
    endDate?: string;
    baseSalary: number;
    status: string;
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
  INDEFINITE: "Không XH",
  PROBATION: "Thử việc",
};

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
  { value: "DEFINITE_36M", label: "Có thời hạn 36 tháng" },
  { value: "INDEFINITE", label: "Không xác định thời hạn" },
];

function AddContractDialog({
  employeeId,
  onClose,
  onSuccess,
}: {
  employeeId: string;
  onClose: () => void;
  onSuccess: (contract: any) => void;
}) {
  const [form, setForm] = useState({
    contractNumber: "",
    contractType: "DEFINITE_12M",
    startDate: "",
    endDate: "",
    baseSalary: "",
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
        contractNumber: form.contractNumber.trim(),
        contractType: form.contractType,
        startDate: form.startDate,
        baseSalary: parseInt(form.baseSalary.replace(/\D/g, ""), 10),
      };
      if (form.endDate) body.endDate = form.endDate;
      if (form.fileUrl) body.fileUrl = form.fileUrl;

      const res = await fetch(`/api/v1/employees/${employeeId}/contracts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        const msg =
          json?.error?.issues?.[0]?.message ||
          json?.error?.message ||
          "Có lỗi xảy ra";
        setError(msg);
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
          <h3 className="text-[15px] font-semibold">Thêm hợp đồng lao động</h3>
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

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--ibs-text-muted)" }}>
                Số hợp đồng *
              </label>
              <input
                required
                value={form.contractNumber}
                onChange={(e) => handleChange("contractNumber", e.target.value)}
                placeholder="VD: HĐ-2024-001"
                className="w-full px-3 py-2 rounded-lg text-[13px] outline-none"
                style={{ background: "var(--ibs-bg)", border: "1px solid var(--ibs-border)", color: "var(--ibs-text)" }}
              />
            </div>
            <div>
              <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--ibs-text-muted)" }}>
                Loại hợp đồng *
              </label>
              <select
                required
                value={form.contractType}
                onChange={(e) => handleChange("contractType", e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-[13px] outline-none"
                style={{ background: "var(--ibs-bg)", border: "1px solid var(--ibs-border)", color: "var(--ibs-text)" }}
              >
                {CONTRACT_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--ibs-text-muted)" }}>
                Ngày bắt đầu *
              </label>
              <input
                required
                type="date"
                value={form.startDate}
                onChange={(e) => handleChange("startDate", e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-[13px] outline-none"
                style={{ background: "var(--ibs-bg)", border: "1px solid var(--ibs-border)", color: "var(--ibs-text)" }}
              />
            </div>
            <div>
              <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--ibs-text-muted)" }}>
                Ngày kết thúc
              </label>
              <input
                type="date"
                value={form.endDate}
                onChange={(e) => handleChange("endDate", e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-[13px] outline-none"
                style={{ background: "var(--ibs-bg)", border: "1px solid var(--ibs-border)", color: "var(--ibs-text)" }}
              />
            </div>
          </div>

          <div>
            <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--ibs-text-muted)" }}>
              Lương cơ bản (VNĐ) *
            </label>
            <input
              required
              type="number"
              min={0}
              value={form.baseSalary}
              onChange={(e) => handleChange("baseSalary", e.target.value)}
              placeholder="VD: 8500000"
              className="w-full px-3 py-2 rounded-lg text-[13px] outline-none"
              style={{ background: "var(--ibs-bg)", border: "1px solid var(--ibs-border)", color: "var(--ibs-text)" }}
            />
          </div>

          <div>
            <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--ibs-text-muted)" }}>
              File hợp đồng (PDF / ảnh)
            </label>
            <FileUpload
              bucket={BUCKETS.HR_DOCUMENTS}
              folder="contracts"
              accept=".pdf,.jpg,.jpeg,.png"
              label="Tải file hợp đồng lên"
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
              {saving ? "Đang lưu..." : "Lưu hợp đồng"}
            </button>
          </div>
        </form>
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
        const msg =
          json?.error?.issues?.[0]?.message ||
          json?.error?.message ||
          "Có lỗi xảy ra";
        setError(msg);
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
              <input
                required
                type="date"
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
              <input
                type="date"
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
    phone: employee.phone || "",
    currentAddress: employee.currentAddress || "",
    address: employee.address || "",
    bankAccount: employee.bankAccount || "",
    bankName: employee.bankName || "",
    taxCode: employee.taxCode || "",
    insuranceNumber: employee.insuranceNumber || "",
    emergencyContact: employee.emergencyContact || "",
    emergencyPhone: employee.emergencyPhone || "",
    status: employee.status || "ACTIVE",
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
        phone: form.phone,
        currentAddress: form.currentAddress,
        emergencyContact: form.emergencyContact,
        emergencyPhone: form.emergencyPhone,
      };
      if (isHR) {
        body.address = form.address;
        body.bankAccount = form.bankAccount;
        body.bankName = form.bankName;
        body.taxCode = form.taxCode;
        body.insuranceNumber = form.insuranceNumber;
        body.status = form.status;
      }

      const res = await fetch(`/api/v1/employees/${employee.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error?.message || "Có lỗi xảy ra");
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
  const [showAddCertificate, setShowAddCertificate] = useState(false);
  const [showEditEmployee, setShowEditEmployee] = useState(false);
  const [userRole, setUserRole] = useState<string>("EMPLOYEE");

  useEffect(() => {
    fetch("/api/v1/me")
      .then((r) => r.json())
      .then((res) => { if (res.role) setUserRole(res.role); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch(`/api/v1/employees/${id}`)
      .then((r) => r.json())
      .then((res) => setEmployee(res.data))
      .finally(() => setLoading(false));
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
    { key: "contracts", label: "Hợp đồng", icon: FileText, count: employee.contracts.length },
    { key: "certificates", label: "Chứng chỉ", icon: Award, count: employee.certificates.length },
    { key: "history", label: "Lịch sử công tác", icon: History, count: employee.workHistory.length },
  ];

  const leaveBalance = employee.leaveBalances?.[0];

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
            {employee.code} · {employee.department.name} · {employee.position.name}
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
          onSuccess={(updates) => {
            setEmployee((prev) => prev ? { ...prev, ...updates } : prev);
            setShowEditEmployee(false);
          }}
        />
      )}
      {showAddContract && employee && (
        <AddContractDialog
          employeeId={employee.id}
          onClose={() => setShowAddContract(false)}
          onSuccess={(contract) => {
            setEmployee((prev) =>
              prev ? { ...prev, contracts: [contract, ...prev.contracts] } : prev
            );
            setShowAddContract(false);
          }}
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
              <InfoRow label="Chức vụ" value={employee.position.name} icon={Briefcase} />
              {employee.team && <InfoRow label="Tổ / Đội" value={employee.team.name} />}
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
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-[13px] font-semibold">
                Danh sách hợp đồng ({employee.contracts.length})
              </h4>
              <button
                onClick={() => setShowAddContract(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium text-white transition-colors"
                style={{ background: "var(--ibs-accent)" }}
              >
                <Plus size={13} /> Thêm hợp đồng
              </button>
            </div>
            {employee.contracts.length === 0 ? (
              <div className="text-center py-10 text-[13px]" style={{ color: "var(--ibs-text-dim)" }}>
                Chưa có hợp đồng nào
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      {["Số HĐ", "Loại HĐ", "Ngày bắt đầu", "Ngày kết thúc", "Lương cơ bản", "Trạng thái"].map(
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
                        <td className="px-4 py-3 text-[13px]">{formatDate(new Date(c.startDate))}</td>
                        <td className="px-4 py-3 text-[13px]">
                          {c.endDate ? formatDate(new Date(c.endDate)) : <span style={{ color: "var(--ibs-text-dim)" }}>—</span>}
                        </td>
                        <td className="px-4 py-3 text-[13px] font-medium" style={{ color: "var(--ibs-success)" }}>
                          {formatVND(c.baseSalary)}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={c.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
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
