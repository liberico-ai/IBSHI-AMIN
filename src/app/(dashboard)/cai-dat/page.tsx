"use client";

import { useState, useEffect, useMemo } from "react";
import { X, RefreshCw, Shield, Users, FileText } from "lucide-react";
import { PageTitle } from "@/components/layout/page-title";
import { DataTable, Column } from "@/components/shared/data-table";
import { formatDateTime } from "@/lib/utils";

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
  BOM:       { label: "Ban GĐ",   bg: "rgba(168,85,247,0.15)", color: "#a855f7" },
  HR_ADMIN:  { label: "HC Nhân sự", bg: "rgba(59,130,246,0.15)",  color: "#3b82f6" },
  MANAGER:   { label: "Trưởng phòng", bg: "rgba(34,197,94,0.15)", color: "var(--ibs-success)" },
  TEAM_LEAD: { label: "Tổ trưởng", bg: "rgba(20,184,166,0.15)", color: "#14b8a6" },
  EMPLOYEE:  { label: "Nhân viên", bg: "rgba(100,116,139,0.15)", color: "#94a3b8" },
};

const ROLE_ORDER = ["BOM", "HR_ADMIN", "MANAGER", "TEAM_LEAD", "EMPLOYEE"];

const ACTION_CONFIG: Record<string, { label: string; bg: string; color: string }> = {
  CREATE:  { label: "Tạo mới",   bg: "rgba(34,197,94,0.15)",   color: "var(--ibs-success)" },
  UPDATE:  { label: "Cập nhật",  bg: "rgba(59,130,246,0.15)",   color: "#3b82f6" },
  DELETE:  { label: "Xoá",       bg: "rgba(239,68,68,0.15)",    color: "var(--ibs-danger)" },
  APPROVE: { label: "Duyệt",     bg: "rgba(20,184,166,0.15)",   color: "#14b8a6" },
  REJECT:  { label: "Từ chối",   bg: "rgba(249,115,22,0.15)",   color: "#f97316" },
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
          ? "Chức năng này chỉ dành cho Ban Giám đốc (BOM). Vui lòng liên hệ quản trị viên."
          : "Trang Cài đặt hệ thống chỉ dành cho Ban Giám đốc (BOM). Vui lòng liên hệ quản trị viên để được cấp quyền."}
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
        setError(data.error?.message || "Có lỗi xảy ra");
        return;
      }
      onSuccess({ id: user.id, role, isActive });
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

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function CaiDatPage() {
  // Role — in production comes from session via layout context
  const [userRole] = useState<string>("BOM");
  const [activeTab, setActiveTab] = useState<"users" | "audit">("users");

  const isBOM = userRole === "BOM";

  if (!isBOM) {
    return (
      <div>
        <PageTitle title="Cài đặt hệ thống" description="Phân quyền, tài khoản người dùng và audit log" />
        <ForbiddenBlock />
      </div>
    );
  }

  const tabs = [
    { id: "users" as const, label: "Người dùng", icon: Users },
    { id: "audit" as const, label: "Audit Log", icon: FileText },
  ];

  return (
    <div>
      <PageTitle
        title="Cài đặt hệ thống"
        description="Phân quyền RBAC, quản lý tài khoản và theo dõi hoạt động hệ thống"
      />

      {/* Tab bar */}
      <div
        className="flex gap-1 mb-6 p-1 rounded-xl w-fit"
        style={{ background: "var(--ibs-bg-card)", border: "1px solid var(--ibs-border)" }}
      >
        {tabs.map(({ id, label, icon: Icon }) => {
          const isActive = activeTab === id;
          return (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-medium transition-all"
              style={{
                background: isActive ? "var(--ibs-accent)" : "transparent",
                color: isActive ? "#fff" : "var(--ibs-text-dim)",
              }}
            >
              <Icon size={14} />
              {label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {activeTab === "users" && <UsersTab isBOM={isBOM} />}
      {activeTab === "audit" && <AuditLogTab />}
    </div>
  );
}
