"use client";

import { useState, useEffect, useMemo } from "react";
import { X, RefreshCw, Shield, Users, FileText, BarChart3, Download, Lock, Globe, Moon, Sun, Check, Eye, EyeOff, UserCircle } from "lucide-react";
import { PageTitle } from "@/components/layout/page-title";
import { DataTable, Column } from "@/components/shared/data-table";
import { formatDateTime, apiError } from "@/lib/utils";
import { useSession } from "next-auth/react";
import { usePermission } from "@/hooks/use-permission";
import { isSystemAdmin } from "@/lib/permissions";
import { useLang, useT } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";

// ── Types ──────────────────────────────────────────────────────────────────────
type SystemUser = {
  id: string;
  employeeCode: string;
  email: string;
  role: string;
  isActive: boolean;
  employee: {
    fullName: string;
    department: { name: string } | null;
  } | null;
};

type AuditLog = {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  newValue: unknown;
  createdAt: string;
  user: { employeeCode: string; email: string } | null;
};

// ── Constants ──────────────────────────────────────────────────────────────────
const ROLE_CONFIG: Record<string, { label: string; bg: string; color: string }> = {
  ADMIN:     { label: "Quản trị HT", bg: "rgba(239,68,68,0.15)", color: "#ef4444" },
  BOM:       { label: "Ban GĐ",   bg: "rgba(168,85,247,0.15)", color: "#a855f7" },
  HR_ADMIN:  { label: "HC Nhân sự", bg: "rgba(59,130,246,0.15)",  color: "#3b82f6" },
  MANAGER:   { label: "Trưởng phòng", bg: "rgba(34,197,94,0.15)", color: "var(--ibs-success)" },
  TEAM_LEAD: { label: "Tổ trưởng", bg: "rgba(20,184,166,0.15)", color: "#14b8a6" },
  EMPLOYEE:  { label: "Nhân viên", bg: "rgba(100,116,139,0.15)", color: "#94a3b8" },
};

const ROLE_ORDER = ["ADMIN", "BOM", "HR_ADMIN", "MANAGER", "TEAM_LEAD", "EMPLOYEE"];

const ACTION_CONFIG: Record<string, { label: string; bg: string; color: string }> = {
  CREATE:  { label: "Tạo mới",   bg: "rgba(34,197,94,0.15)",   color: "var(--ibs-success)" },
  UPDATE:  { label: "Cập nhật",  bg: "rgba(59,130,246,0.15)",   color: "#3b82f6" },
  DELETE:  { label: "Xoá",       bg: "rgba(239,68,68,0.15)",    color: "var(--ibs-danger)" },
  APPROVE: { label: "Duyệt",     bg: "rgba(20,184,166,0.15)",   color: "#14b8a6" },
  REJECT:  { label: "Từ chối",   bg: "rgba(249,115,22,0.15)",   color: "#f97316" },
  LOGIN:   { label: "Đăng nhập", bg: "rgba(168,85,247,0.15)",   color: "#a855f7" },
  VIEW:    { label: "Truy cập",  bg: "rgba(100,116,139,0.15)",  color: "#94a3b8" },
  IMPORT:  { label: "Nhập file", bg: "rgba(59,130,246,0.15)",   color: "#3b82f6" },
  EXPORT:  { label: "Xuất file", bg: "rgba(34,197,94,0.15)",    color: "var(--ibs-success)" },
};

// ── Badge components ───────────────────────────────────────────────────────────
function RoleBadge({ role }: { role: string }) {
  const cfg = ROLE_CONFIG[role] || ROLE_CONFIG["EMPLOYEE"];
  return (
    <span
      className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold"
      style={{ background: cfg.bg, color: cfg.color }}
    >
      {cfg.label}
    </span>
  );
}

function ActionBadge({ action }: { action: string }) {
  const cfg = ACTION_CONFIG[action] || { label: action, bg: "rgba(100,116,139,0.15)", color: "#94a3b8" };
  return (
    <span
      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold"
      style={{ background: cfg.bg, color: cfg.color }}
    >
      {cfg.label}
    </span>
  );
}

function StatusBadgeSimple({ active }: { active: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold"
      style={{
        background: active ? "rgba(34,197,94,0.15)" : "rgba(100,116,139,0.12)",
        color: active ? "var(--ibs-success)" : "#94a3b8",
      }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full inline-block"
        style={{ background: active ? "var(--ibs-success)" : "#94a3b8" }}
      />
      {active ? "Hoạt động" : "Vô hiệu"}
    </span>
  );
}

// ── Permission guard ───────────────────────────────────────────────────────────
function ForbiddenBlock({ partial }: { partial?: boolean }) {
  return (
    <div
      className="rounded-xl border flex flex-col items-center justify-center py-20"
      style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}
    >
      <div
        className="w-14 h-14 rounded-full flex items-center justify-center mb-4"
        style={{ background: "rgba(239,68,68,0.1)" }}
      >
        <Shield size={24} style={{ color: "var(--ibs-danger)" }} />
      </div>
      <h3 className="text-[16px] font-bold mb-2">Truy cập bị từ chối</h3>
      <p
        className="text-[13px] text-center max-w-[420px]"
        style={{ color: "var(--ibs-text-dim)" }}
      >
        {partial
          ? "Chức năng này chỉ dành cho Quản trị hệ thống (ADMIN). Vui lòng liên hệ quản trị viên."
          : "Trang Cài đặt hệ thống chỉ dành cho Quản trị hệ thống (ADMIN). Vui lòng liên hệ quản trị viên để được cấp quyền."}
      </p>
    </div>
  );
}

// ── Edit User Modal ────────────────────────────────────────────────────────────
function EditUserModal({
  user,
  canChangeRole,
  onClose,
  onSuccess,
}: {
  user: SystemUser;
  canChangeRole: boolean;
  onClose: () => void;
  onSuccess: (updated: { id: string; role: string; isActive: boolean }) => void;
}) {
  const [role, setRole] = useState(user.role);
  const [isActive, setIsActive] = useState(user.isActive);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSave() {
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/v1/settings/users", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, role, isActive }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(apiError(res.status, data.error));
        return;
      }
      onSuccess({ id: user.id, role, isActive });
    } catch {
      setError("Không kết nối được máy chủ");
    } finally {
      setSubmitting(false);
    }
  }

  const selectStyle = {
    background: "var(--ibs-bg)",
    borderColor: "var(--ibs-border)",
    color: "var(--ibs-text)",
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.75)" }}
    >
      <div
        className="rounded-2xl border w-full max-w-[460px] mx-4"
        style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}
      >
        {/* Header */}
        <div
          className="flex justify-between items-center px-6 py-4 border-b"
          style={{ borderColor: "var(--ibs-border)" }}
        >
          <div>
            <h3 className="text-[15px] font-bold">Phân quyền người dùng</h3>
            <p className="text-[12px] mt-0.5" style={{ color: "var(--ibs-text-dim)" }}>
              {user.employee?.fullName || user.email}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ color: "var(--ibs-text-dim)" }}
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* User info */}
          <div
            className="rounded-lg p-4 space-y-2"
            style={{ background: "var(--ibs-bg)", border: "1px solid var(--ibs-border)" }}
          >
            <div className="flex justify-between text-[13px]">
              <span style={{ color: "var(--ibs-text-dim)" }}>Mã NV</span>
              <span className="font-medium">{user.employeeCode}</span>
            </div>
            <div className="flex justify-between text-[13px]">
              <span style={{ color: "var(--ibs-text-dim)" }}>Email</span>
              <span className="font-medium">{user.email}</span>
            </div>
            <div className="flex justify-between text-[13px]">
              <span style={{ color: "var(--ibs-text-dim)" }}>Phòng ban</span>
              <span className="font-medium">{user.employee?.department?.name || "—"}</span>
            </div>
          </div>

          {/* Role select */}
          <div>
            <label
              className="block text-[12px] font-medium mb-1.5"
              style={{ color: "var(--ibs-text-dim)" }}
            >
              Vai trò hệ thống
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              disabled={!canChangeRole}
              className="w-full px-3 py-2 rounded-lg text-[13px] outline-none border disabled:opacity-50"
              style={selectStyle}
            >
              {ROLE_ORDER.map((r) => (
                <option key={r} value={r}>
                  {ROLE_CONFIG[r]?.label || r}
                </option>
              ))}
            </select>
            {!canChangeRole && (
              <p className="text-[11px] mt-1" style={{ color: "var(--ibs-text-dim)" }}>
                Chỉ BOM mới có thể thay đổi vai trò
              </p>
            )}
          </div>

          {/* Active toggle */}
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[13px] font-medium">Trạng thái tài khoản</div>
              <div className="text-[12px] mt-0.5" style={{ color: "var(--ibs-text-dim)" }}>
                {isActive ? "Tài khoản đang hoạt động" : "Tài khoản bị vô hiệu hoá"}
              </div>
            </div>
            <button
              onClick={() => setIsActive((v) => !v)}
              className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
              style={{
                background: isActive ? "var(--ibs-accent)" : "rgba(100,116,139,0.4)",
              }}
            >
              <span
                className="inline-block h-4 w-4 rounded-full bg-white shadow transition-transform"
                style={{ transform: isActive ? "translateX(22px)" : "translateX(2px)" }}
              />
            </button>
          </div>

          {error && (
            <div
              className="px-3 py-2 rounded-lg text-[12px]"
              style={{ background: "rgba(239,68,68,0.1)", color: "var(--ibs-danger)" }}
            >
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-lg text-[13px] border"
              style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-dim)" }}
            >
              Hủy
            </button>
            <button
              onClick={handleSave}
              disabled={submitting}
              className="flex-1 py-2.5 rounded-lg text-[13px] font-semibold text-white disabled:opacity-60"
              style={{ background: "var(--ibs-accent)" }}
            >
              {submitting ? "Đang lưu..." : "Lưu thay đổi"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Tab: Người dùng ────────────────────────────────────────────────────────────
function UsersTab({ isBOM }: { isBOM: boolean }) {
  const [users, setUsers] = useState<SystemUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [editUser, setEditUser] = useState<SystemUser | null>(null);
  const [search, setSearch] = useState("");

  function fetchUsers() {
    setLoading(true);
    fetch("/api/v1/settings/users")
      .then((r) => r.json())
      .then((res) => setUsers(Array.isArray(res) ? res : res.data || []))
      .catch(() => setUsers([]))
      .finally(() => setLoading(false));
  }

  useEffect(() => { fetchUsers(); }, []);

  const filteredUsers = useMemo(() => {
    if (!search) return users;
    const lower = search.toLowerCase();
    return users.filter(
      (u) =>
        u.employeeCode.toLowerCase().includes(lower) ||
        (u.employee?.fullName || "").toLowerCase().includes(lower) ||
        u.email.toLowerCase().includes(lower)
    );
  }, [users, search]);

  function handleUpdateSuccess(updated: { id: string; role: string; isActive: boolean }) {
    setUsers((prev) =>
      prev.map((u) =>
        u.id === updated.id ? { ...u, role: updated.role, isActive: updated.isActive } : u
      )
    );
    setEditUser(null);
  }

  const columns: Column<Record<string, unknown>>[] = [
    {
      key: "employeeCode",
      header: "Mã NV",
      sortable: true,
      width: "90px",
      render: (row) => (
        <span className="font-mono text-[12px]" style={{ color: "var(--ibs-text-dim)" }}>
          {(row as unknown as SystemUser).employeeCode}
        </span>
      ),
    },
    {
      key: "fullName",
      header: "Tên nhân viên",
      sortable: true,
      render: (row) => {
        const u = row as unknown as SystemUser;
        const name = u.employee?.fullName || "—";
        return <span className="font-medium">{name}</span>;
      },
    },
    {
      key: "email",
      header: "Email",
      render: (row) => (
        <span className="text-[13px]" style={{ color: "var(--ibs-text-dim)" }}>
          {(row as unknown as SystemUser).email}
        </span>
      ),
    },
    {
      key: "department",
      header: "Phòng ban",
      render: (row) => {
        const u = row as unknown as SystemUser;
        return (
          <span className="text-[13px]" style={{ color: "var(--ibs-text-dim)" }}>
            {u.employee?.department?.name || "—"}
          </span>
        );
      },
    },
    {
      key: "role",
      header: "Vai trò",
      sortable: true,
      render: (row) => <RoleBadge role={(row as unknown as SystemUser).role} />,
    },
    {
      key: "isActive",
      header: "Trạng thái",
      render: (row) => <StatusBadgeSimple active={(row as unknown as SystemUser).isActive} />,
    },
    {
      key: "id",
      header: "Thao tác",
      width: "90px",
      render: (row) => {
        const u = row as unknown as SystemUser;
        return (
          <button
            onClick={(e) => { e.stopPropagation(); setEditUser(u); }}
            className="flex items-center gap-1.5 text-[12px] px-2.5 py-1.5 rounded-lg border transition-colors"
            style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-dim)" }}
            onMouseEnter={(e) => {
              const b = e.currentTarget as HTMLButtonElement;
              b.style.borderColor = "var(--ibs-accent)";
              b.style.color = "var(--ibs-accent)";
            }}
            onMouseLeave={(e) => {
              const b = e.currentTarget as HTMLButtonElement;
              b.style.borderColor = "var(--ibs-border)";
              b.style.color = "var(--ibs-text-dim)";
            }}
          >
            <Shield size={11} /> Phân quyền
          </button>
        );
      },
    },
  ];

  return (
    <div>
      {/* Search + refresh bar */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-[320px]">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm mã NV, tên, email..."
            className="w-full pl-4 pr-3 py-2 rounded-lg text-[13px] outline-none border"
            style={{
              background: "var(--ibs-bg)",
              borderColor: "var(--ibs-border)",
              color: "var(--ibs-text)",
            }}
          />
        </div>
        <button
          onClick={fetchUsers}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[13px] border"
          style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-dim)" }}
        >
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          Làm mới
        </button>
        <span className="text-[12px] ml-auto" style={{ color: "var(--ibs-text-dim)" }}>
          {filteredUsers.length} tài khoản
        </span>
      </div>

      <div
        className="rounded-xl border overflow-hidden"
        style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}
      >
        <DataTable
          columns={columns}
          data={filteredUsers as unknown as Record<string, unknown>[]}
          loading={loading}
          emptyText="Không tìm thấy tài khoản"
          pageSize={20}
        />
      </div>

      {editUser && (
        <EditUserModal
          user={editUser}
          canChangeRole={isBOM}
          onClose={() => setEditUser(null)}
          onSuccess={handleUpdateSuccess}
        />
      )}
    </div>
  );
}

// ── Tab: Audit Log ─────────────────────────────────────────────────────────────
function AuditLogTab() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [entityTypeFilter, setEntityTypeFilter] = useState("");
  const [actionFilter, setActionFilter] = useState("");

  function fetchLogs() {
    setLoading(true);
    fetch("/api/v1/settings/audit-logs?limit=200")
      .then((r) => r.json())
      .then((res) => setLogs(Array.isArray(res) ? res : res.data || []))
      .catch(() => setLogs([]))
      .finally(() => setLoading(false));
  }

  useEffect(() => { fetchLogs(); }, []);

  const entityTypes = useMemo(
    () => Array.from(new Set(logs.map((l) => l.entityType).filter(Boolean))).sort(),
    [logs]
  );

  const filteredLogs = useMemo(() => {
    return logs.filter((l) => {
      if (entityTypeFilter && l.entityType !== entityTypeFilter) return false;
      if (actionFilter && l.action !== actionFilter) return false;
      return true;
    });
  }, [logs, entityTypeFilter, actionFilter]);

  const selectStyle = {
    background: "var(--ibs-bg)",
    borderColor: "var(--ibs-border)",
    color: "var(--ibs-text)",
  };
  const selectClass = "px-3 py-2 rounded-lg text-[13px] outline-none border";

  const columns: Column<Record<string, unknown>>[] = [
    {
      key: "createdAt",
      header: "Thời gian",
      sortable: true,
      width: "150px",
      render: (row) => (
        <span className="text-[12px] tabular-nums" style={{ color: "var(--ibs-text-dim)" }}>
          {formatDateTime((row as unknown as AuditLog).createdAt)}
        </span>
      ),
    },
    {
      key: "user",
      header: "Người thực hiện",
      render: (row) => {
        const log = row as unknown as AuditLog;
        if (!log.user) return <span style={{ color: "var(--ibs-text-dim)" }}>System</span>;
        return (
          <div>
            <div className="text-[13px] font-medium">{log.user.employeeCode}</div>
            <div className="text-[11px]" style={{ color: "var(--ibs-text-dim)" }}>
              {log.user.email}
            </div>
          </div>
        );
      },
    },
    {
      key: "action",
      header: "Hành động",
      sortable: true,
      width: "110px",
      render: (row) => <ActionBadge action={(row as unknown as AuditLog).action} />,
    },
    {
      key: "entityType",
      header: "Loại đối tượng",
      sortable: true,
      width: "140px",
      render: (row) => (
        <span
          className="text-[12px] font-mono px-2 py-0.5 rounded"
          style={{
            background: "rgba(0,180,216,0.08)",
            color: "var(--ibs-accent)",
          }}
        >
          {(row as unknown as AuditLog).entityType}
        </span>
      ),
    },
    {
      key: "entityId",
      header: "ID",
      width: "100px",
      render: (row) => (
        <span className="text-[11px] font-mono" style={{ color: "var(--ibs-text-dim)" }}>
          {((row as unknown as AuditLog).entityId || "").slice(0, 8)}…
        </span>
      ),
    },
    {
      key: "newValue",
      header: "Nội dung",
      render: (row) => {
        const log = row as unknown as AuditLog;
        const val = log.newValue;
        if (!val) return <span style={{ color: "var(--ibs-text-dim)" }}>—</span>;
        let text = "";
        try {
          text = typeof val === "string" ? val : JSON.stringify(val);
        } catch {
          text = String(val);
        }
        const truncated = text.length > 80 ? text.slice(0, 80) + "…" : text;
        return (
          <span
            className="text-[12px] font-mono"
            style={{ color: "var(--ibs-text-dim)" }}
            title={text}
          >
            {truncated}
          </span>
        );
      },
    },
  ];

  return (
    <div>
      {/* Filters */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <select
          value={entityTypeFilter}
          onChange={(e) => setEntityTypeFilter(e.target.value)}
          className={selectClass}
          style={selectStyle}
        >
          <option value="">Tất cả đối tượng</option>
          {entityTypes.map((et) => (
            <option key={et} value={et}>
              {et}
            </option>
          ))}
        </select>
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className={selectClass}
          style={selectStyle}
        >
          <option value="">Tất cả hành động</option>
          {Object.keys(ACTION_CONFIG).map((a) => (
            <option key={a} value={a}>
              {ACTION_CONFIG[a].label}
            </option>
          ))}
        </select>
        <button
          onClick={fetchLogs}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[13px] border"
          style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-dim)" }}
        >
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          Làm mới
        </button>
        <span className="text-[12px] ml-auto" style={{ color: "var(--ibs-text-dim)" }}>
          {filteredLogs.length} bản ghi
        </span>
      </div>

      <div
        className="rounded-xl border overflow-hidden"
        style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}
      >
        <DataTable
          columns={columns}
          data={filteredLogs as unknown as Record<string, unknown>[]}
          loading={loading}
          emptyText="Không có bản ghi audit log"
          pageSize={25}
        />
      </div>
    </div>
  );
}

// ── Tab: Báo cáo hoạt động (tổng hợp) ────────────────────────────────────────────
type ReportUser = {
  employeeCode: string;
  fullName: string;
  department: string;
  logins: number;
  views: number;
  actions: number;
  lastActive: string;
};
type ReportModule = { module: string; views: number; users: number };
type ReportData = {
  from: string;
  to: string;
  totals: { logins: number; views: number; actions: number; activeUsers: number };
  users: ReportUser[];
  modules: ReportModule[];
};

const isoToday = () => new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD theo giờ máy

function ReportTab() {
  const [from, setFrom] = useState<string>(isoToday());
  const [to, setTo] = useState<string>(isoToday());
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  const load = (f = from, t = to) => {
    setLoading(true);
    fetch(`/api/v1/settings/activity-report?from=${f}&to=${t}`)
      .then((r) => r.json())
      .then((j) => setData(j.data || null))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const quick = (kind: "today" | "week" | "month") => {
    const now = new Date();
    let f = new Date(now);
    if (kind === "week") f.setDate(now.getDate() - 6);
    if (kind === "month") f = new Date(now.getFullYear(), now.getMonth(), 1);
    const fs = f.toLocaleDateString("en-CA");
    const ts = now.toLocaleDateString("en-CA");
    setFrom(fs); setTo(ts); load(fs, ts);
  };

  const exportExcel = async () => {
    if (!data) return;
    setExporting(true);
    try {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      const range = data.from === data.to ? data.from : `${data.from}_${data.to}`;

      const s1 = wb.addWorksheet("Theo nhân sự");
      s1.columns = [
        { header: "Mã NV", key: "code", width: 12 },
        { header: "Họ tên", key: "name", width: 26 },
        { header: "Phòng ban", key: "dept", width: 24 },
        { header: "Số lần đăng nhập", key: "logins", width: 16 },
        { header: "Lượt truy cập module", key: "views", width: 18 },
        { header: "Số thao tác", key: "actions", width: 14 },
        { header: "Hoạt động gần nhất", key: "last", width: 20 },
      ];
      data.users.forEach((u) =>
        s1.addRow({ code: u.employeeCode, name: u.fullName, dept: u.department, logins: u.logins, views: u.views, actions: u.actions, last: formatDateTime(u.lastActive) })
      );
      s1.getRow(1).font = { bold: true };

      const s2 = wb.addWorksheet("Theo module");
      s2.columns = [
        { header: "Module", key: "module", width: 30 },
        { header: "Lượt truy cập", key: "views", width: 16 },
        { header: "Số NV sử dụng", key: "users", width: 16 },
      ];
      data.modules.forEach((m) => s2.addRow({ module: m.module, views: m.views, users: m.users }));
      s2.getRow(1).font = { bold: true };

      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `bao-cao-hoat-dong-${range}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  const userCols: Column<Record<string, unknown>>[] = [
    { key: "employeeCode", header: "Mã NV", sortable: true },
    { key: "fullName", header: "Họ tên", sortable: true },
    { key: "department", header: "Phòng ban", sortable: true },
    { key: "logins", header: "Đăng nhập", sortable: true, render: (r) => <span className="tabular-nums">{(r as unknown as ReportUser).logins}</span> },
    { key: "views", header: "Truy cập module", sortable: true, render: (r) => <span className="tabular-nums">{(r as unknown as ReportUser).views}</span> },
    { key: "actions", header: "Thao tác", sortable: true, render: (r) => <span className="tabular-nums">{(r as unknown as ReportUser).actions}</span> },
    { key: "lastActive", header: "Gần nhất", sortable: true, render: (r) => <span className="text-[12px]" style={{ color: "var(--ibs-text-dim)" }}>{formatDateTime((r as unknown as ReportUser).lastActive)}</span> },
  ];
  const moduleCols: Column<Record<string, unknown>>[] = [
    { key: "module", header: "Module", sortable: true },
    { key: "views", header: "Lượt truy cập", sortable: true, render: (r) => <span className="tabular-nums">{(r as unknown as ReportModule).views}</span> },
    { key: "users", header: "Số NV sử dụng", sortable: true, render: (r) => <span className="tabular-nums">{(r as unknown as ReportModule).users}</span> },
  ];

  const cards = [
    { label: "NV hoạt động", value: data?.totals.activeUsers ?? 0, color: "#a855f7" },
    { label: "Lượt đăng nhập", value: data?.totals.logins ?? 0, color: "#3b82f6" },
    { label: "Lượt truy cập module", value: data?.totals.views ?? 0, color: "#10b981" },
    { label: "Tổng thao tác", value: data?.totals.actions ?? 0, color: "#f59e0b" },
  ];

  return (
    <div>
      {/* Bộ lọc */}
      <div className="flex flex-wrap items-end gap-3 mb-5">
        <div>
          <label className="block text-[11px] mb-1" style={{ color: "var(--ibs-text-dim)" }}>Từ ngày</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="px-3 py-2 rounded-lg text-[13px]" style={{ background: "var(--ibs-bg-card)", border: "1px solid var(--ibs-border)", color: "var(--ibs-text)" }} />
        </div>
        <div>
          <label className="block text-[11px] mb-1" style={{ color: "var(--ibs-text-dim)" }}>Đến ngày</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="px-3 py-2 rounded-lg text-[13px]" style={{ background: "var(--ibs-bg-card)", border: "1px solid var(--ibs-border)", color: "var(--ibs-text)" }} />
        </div>
        <button onClick={() => load()} className="flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-medium" style={{ background: "var(--ibs-accent)", color: "#fff" }}>
          <RefreshCw size={14} /> Xem
        </button>
        <div className="flex gap-1">
          <button onClick={() => quick("today")} className="px-3 py-2 rounded-lg text-[12px]" style={{ background: "var(--ibs-bg-card)", border: "1px solid var(--ibs-border)", color: "var(--ibs-text-dim)" }}>Hôm nay</button>
          <button onClick={() => quick("week")} className="px-3 py-2 rounded-lg text-[12px]" style={{ background: "var(--ibs-bg-card)", border: "1px solid var(--ibs-border)", color: "var(--ibs-text-dim)" }}>7 ngày</button>
          <button onClick={() => quick("month")} className="px-3 py-2 rounded-lg text-[12px]" style={{ background: "var(--ibs-bg-card)", border: "1px solid var(--ibs-border)", color: "var(--ibs-text-dim)" }}>Tháng này</button>
        </div>
        <button onClick={exportExcel} disabled={exporting || !data} className="flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-medium ml-auto" style={{ background: "#10b981", color: "#fff", opacity: exporting || !data ? 0.6 : 1 }}>
          <Download size={14} /> {exporting ? "Đang xuất…" : "Export Excel"}
        </button>
      </div>

      {/* Thẻ tổng hợp */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        {cards.map((c) => (
          <div key={c.label} className="rounded-xl border p-4" style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
            <div className="text-[12px]" style={{ color: "var(--ibs-text-dim)" }}>{c.label}</div>
            <div className="text-[24px] font-semibold tabular-nums" style={{ color: c.color }}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* Bảng theo nhân sự */}
      <div className="text-[13px] font-medium mb-2" style={{ color: "var(--ibs-text)" }}>Theo nhân sự</div>
      <div className="rounded-xl border overflow-hidden mb-6" style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
        <DataTable columns={userCols} data={(data?.users || []) as unknown as Record<string, unknown>[]} loading={loading} emptyText="Không có hoạt động trong khoảng này" pageSize={15} />
      </div>

      {/* Bảng theo module */}
      <div className="text-[13px] font-medium mb-2" style={{ color: "var(--ibs-text)" }}>Theo module</div>
      <div className="rounded-xl border overflow-hidden" style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
        <DataTable columns={moduleCols} data={(data?.modules || []) as unknown as Record<string, unknown>[]} loading={loading} emptyText="Không có lượt truy cập module" pageSize={15} />
      </div>
    </div>
  );
}

// ── Cài đặt cá nhân (mọi user) ───────────────────────────────────────────────────
function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-3 border-b last:border-b-0" style={{ borderColor: "var(--ibs-border)" }}>
      <span className="text-[13px]" style={{ color: "var(--ibs-text-dim)" }}>{label}</span>
      <span className="text-[13px] font-medium" style={{ color: "var(--ibs-text)" }}>{value}</span>
    </div>
  );
}

function SettingCard({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border p-6 mb-5" style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
      <div className="flex items-center gap-2 mb-4">
        <Icon size={16} />
        <h3 className="text-[15px] font-bold" style={{ color: "var(--ibs-text)" }}>{title}</h3>
      </div>
      {children}
    </div>
  );
}

function PersonalSettings() {
  const t = useT();
  const { lang, setLang } = useLang();
  const { theme, setTheme } = useTheme();
  const { data: session } = useSession();
  const user = session?.user as any;
  const roleLabel = ROLE_CONFIG[user?.role]?.label || user?.role || "—";

  const [cur, setCur] = useState("");
  const [nw, setNw] = useState("");
  const [cf, setCf] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function submitPw(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (nw !== cf) { setMsg({ ok: false, text: t("Xác nhận mật khẩu không khớp", "Password confirmation does not match") }); return; }
    if (nw.length < 8) { setMsg({ ok: false, text: t("Mật khẩu mới tối thiểu 8 ký tự", "New password must be at least 8 characters") }); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/v1/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: cur, newPassword: nw }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg({ ok: false, text: data?.error?.message || t("Đổi mật khẩu thất bại", "Failed to change password") });
        return;
      }
      setMsg({ ok: true, text: t("Đổi mật khẩu thành công", "Password changed successfully") });
      setCur(""); setNw(""); setCf("");
    } catch {
      setMsg({ ok: false, text: t("Không kết nối được máy chủ", "Cannot connect to server") });
    } finally {
      setSaving(false);
    }
  }

  const inputCls = "w-full px-3 py-2.5 rounded-lg text-[13px] outline-none border";
  const inputStyle = { background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" };

  const SegBtn = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) => (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all"
      style={{ background: active ? "var(--ibs-accent)" : "transparent", color: active ? "#fff" : "var(--ibs-text-dim)" }}
    >
      {children}
    </button>
  );

  return (
    <div className="max-w-[640px]">
      {/* Thông tin tài khoản — chỉ xem (admin sửa ở Thông tin nhân sự) */}
      <SettingCard title={t("Thông tin tài khoản", "Account information")} icon={UserCircle}>
        <InfoRow label={t("Họ tên", "Full name")} value={user?.name || "—"} />
        <InfoRow label={t("Email", "Email")} value={user?.email || "—"} />
        <InfoRow label={t("Vai trò", "Role")} value={<RoleBadge role={user?.role || "EMPLOYEE"} />} />
        <p className="text-[11px] mt-3" style={{ color: "var(--ibs-text-dim)" }}>
          {t("Thông tin này do Quản trị nhân sự quản lý trong hồ sơ nhân sự.", "This information is managed by HR in the employee records.")}
        </p>
      </SettingCard>

      {/* Ngôn ngữ & Giao diện */}
      <SettingCard title={t("Ngôn ngữ & Giao diện", "Language & Appearance")} icon={Globe}>
        <div className="flex items-center justify-between py-3 border-b" style={{ borderColor: "var(--ibs-border)" }}>
          <div>
            <div className="text-[13px] font-medium" style={{ color: "var(--ibs-text)" }}>{t("Ngôn ngữ", "Language")}</div>
            <div className="text-[11px]" style={{ color: "var(--ibs-text-dim)" }}>{t("Chuyển đổi Việt ↔ English", "Switch Vietnamese ↔ English")}</div>
          </div>
          <div className="flex gap-1 p-1 rounded-lg" style={{ background: "var(--ibs-bg)", border: "1px solid var(--ibs-border)" }}>
            <SegBtn active={lang === "vi"} onClick={() => setLang("vi")}>Tiếng Việt</SegBtn>
            <SegBtn active={lang === "en"} onClick={() => setLang("en")}>English</SegBtn>
          </div>
        </div>
        <div className="flex items-center justify-between py-3">
          <div>
            <div className="text-[13px] font-medium" style={{ color: "var(--ibs-text)" }}>{t("Giao diện", "Theme")}</div>
            <div className="text-[11px]" style={{ color: "var(--ibs-text-dim)" }}>{t("Chế độ Sáng / Tối", "Light / Dark mode")}</div>
          </div>
          <div className="flex gap-1 p-1 rounded-lg" style={{ background: "var(--ibs-bg)", border: "1px solid var(--ibs-border)" }}>
            <SegBtn active={theme === "light"} onClick={() => setTheme("light")}><Sun size={13} /> {t("Sáng", "Light")}</SegBtn>
            <SegBtn active={theme === "dark"} onClick={() => setTheme("dark")}><Moon size={13} /> {t("Tối", "Dark")}</SegBtn>
          </div>
        </div>
      </SettingCard>

      {/* Đổi mật khẩu */}
      <SettingCard title={t("Đổi mật khẩu", "Change password")} icon={Lock}>
        <form onSubmit={submitPw} className="space-y-4">
          <div>
            <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--ibs-text-dim)" }}>{t("Mật khẩu hiện tại", "Current password")}</label>
            <input type={showPw ? "text" : "password"} value={cur} onChange={(e) => setCur(e.target.value)} required className={inputCls} style={inputStyle} />
          </div>
          <div>
            <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--ibs-text-dim)" }}>{t("Mật khẩu mới (tối thiểu 8 ký tự)", "New password (min. 8 characters)")}</label>
            <input type={showPw ? "text" : "password"} value={nw} onChange={(e) => setNw(e.target.value)} required className={inputCls} style={inputStyle} />
          </div>
          <div>
            <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--ibs-text-dim)" }}>{t("Xác nhận mật khẩu mới", "Confirm new password")}</label>
            <input type={showPw ? "text" : "password"} value={cf} onChange={(e) => setCf(e.target.value)} required className={inputCls} style={inputStyle} />
          </div>

          <button type="button" onClick={() => setShowPw((v) => !v)} className="flex items-center gap-1.5 text-[12px]" style={{ color: "var(--ibs-text-dim)" }}>
            {showPw ? <EyeOff size={13} /> : <Eye size={13} />} {showPw ? t("Ẩn mật khẩu", "Hide passwords") : t("Hiện mật khẩu", "Show passwords")}
          </button>

          {msg && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-[12px]" style={{ background: msg.ok ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.1)", color: msg.ok ? "var(--ibs-success)" : "var(--ibs-danger)" }}>
              {msg.ok && <Check size={13} />} {msg.text}
            </div>
          )}

          <button type="submit" disabled={saving} className="py-2.5 px-6 rounded-lg text-[13px] font-semibold text-white disabled:opacity-60" style={{ background: "var(--ibs-accent)" }}>
            {saving ? t("Đang lưu…", "Saving…") : t("Đổi mật khẩu", "Change password")}
          </button>
        </form>
      </SettingCard>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function CaiDatPage() {
  const { role } = usePermission();
  const { status } = useSession();
  const t = useT();
  const [activeTab, setActiveTab] = useState<"users" | "audit" | "report">("users");

  const isAdmin = isSystemAdmin(role);

  if (status === "loading") {
    return <PageTitle title={t("Cài đặt", "Settings")} description={t("Đang tải…", "Loading…")} />;
  }

  const tabs = [
    { id: "users" as const, label: t("Người dùng", "Users"), icon: Users },
    { id: "audit" as const, label: "Audit Log", icon: FileText },
    { id: "report" as const, label: t("Báo cáo hoạt động", "Activity report"), icon: BarChart3 },
  ];

  return (
    <div>
      <PageTitle title={t("Cài đặt", "Settings")} description={t("Quản lý tài khoản và cấu hình hệ thống", "Manage your account and system settings")} />

      <PersonalSettings />

      {/* Khu Quản trị hệ thống — chỉ ADMIN */}
      {isAdmin && (
        <div className="mt-10">
          <div className="flex items-center gap-2 mb-4">
            <Shield size={16} style={{ color: "var(--ibs-accent)" }} />
            <h2 className="text-[16px] font-bold" style={{ color: "var(--ibs-text)" }}>{t("Quản trị hệ thống", "System administration")}</h2>
          </div>

          {/* Tab bar */}
          <div className="flex gap-1 mb-6 p-1 rounded-xl w-fit" style={{ background: "var(--ibs-bg-card)", border: "1px solid var(--ibs-border)" }}>
            {tabs.map(({ id, label, icon: Icon }) => {
              const active = activeTab === id;
              return (
                <button
                  key={id}
                  onClick={() => setActiveTab(id)}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-medium transition-all"
                  style={{ background: active ? "var(--ibs-accent)" : "transparent", color: active ? "#fff" : "var(--ibs-text-dim)" }}
                >
                  <Icon size={14} />
                  {label}
                </button>
              );
            })}
          </div>

          {activeTab === "users" && <UsersTab isBOM={true} />}
          {activeTab === "audit" && <AuditLogTab />}
          {activeTab === "report" && <ReportTab />}
        </div>
      )}
    </div>
  );
}
