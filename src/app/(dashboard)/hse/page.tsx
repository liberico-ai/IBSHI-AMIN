"use client";

import { useState, useEffect, useMemo } from "react";
import { PageTitle } from "@/components/layout/page-title";
import { DataTable, Column } from "@/components/shared/data-table";
import { formatDate } from "@/lib/utils";
import { Plus, RefreshCw, X, ShieldAlert, AlertTriangle } from "lucide-react";
import { FileUpload } from "@/components/shared/file-upload";
import { BUCKETS } from "@/lib/minio-constants";

// ─── Types ───────────────────────────────────────────────────────────────────

type IncidentType = "INJURY" | "LTI" | "NEAR_MISS" | "FIRST_AID" | "PROPERTY_DAMAGE" | "OBSERVATION" | "ENVIRONMENTAL";
type IncidentSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
type IncidentStatus = "REPORTED" | "INVESTIGATING" | "ACTION_REQUIRED" | "RESOLVED" | "CLOSED";

type HSEIncident = {
  id: string;
  type: IncidentType;
  severity: IncidentSeverity;
  location: string;
  description: string;
  status: IncidentStatus;
  incidentDate: string;
  injuredPerson?: string;
  investigation?: string;
  correctiveAction?: string;
  reporter: { code: string; fullName: string; department: { name: string } };
};

type Induction = {
  id: string;
  employeeId: string;
  conductedBy: string;
  inductionDate: string;
  passed: boolean;
  score?: number;
  nextDueDate?: string;
  notes?: string;
  employee: { code: string; fullName: string; department: { name: string } };
};

type PPEItem = {
  id: string;
  name: string;
  code: string;
  unit: string;
  stockQuantity: number;
  minimumStock: number;
  issuances: { id: string; quantity: number; employeeId: string; issuedAt: string }[];
};

type Employee = { id: string; code: string; fullName: string; department: { name: string } };

// ─── Label / Color Maps ───────────────────────────────────────────────────────

const TYPE_LABELS: Record<IncidentType, string> = {
  INJURY: "Tai nạn",
  LTI: "Mất ngày công (LTI)",
  NEAR_MISS: "Suýt xảy ra",
  FIRST_AID: "Sơ cứu tại chỗ",
  PROPERTY_DAMAGE: "Hư hại tài sản",
  OBSERVATION: "Quan sát",
  ENVIRONMENTAL: "Môi trường",
};

const SEVERITY_LABELS: Record<IncidentSeverity, string> = {
  LOW: "Nhẹ",
  MEDIUM: "Trung bình",
  HIGH: "Cao",
  CRITICAL: "Nghiêm trọng",
};

const SEVERITY_COLORS: Record<IncidentSeverity, string> = {
  LOW: "#22c55e",
  MEDIUM: "#eab308",
  HIGH: "#f97316",
  CRITICAL: "#ef4444",
};

const STATUS_LABELS: Record<IncidentStatus, string> = {
  REPORTED: "Vừa báo cáo",
  INVESTIGATING: "Đang điều tra",
  ACTION_REQUIRED: "Cần hành động",
  RESOLVED: "Đã giải quyết",
  CLOSED: "Đã đóng",
};

const STATUS_COLORS: Record<IncidentStatus, string> = {
  REPORTED: "#f97316",
  INVESTIGATING: "#3b82f6",
  ACTION_REQUIRED: "#eab308",
  RESOLVED: "#22c55e",
  CLOSED: "#6b7280",
};

type Tab = "incidents" | "inductions" | "ppe" | "briefings";
type SafetyBriefing = {
  id: string; date: string; topic: string; presenter: string; departmentId: string;
  totalAttendees: number; totalTarget: number; attendanceRate: number; lowAttendance: boolean;
  notes: string | null;
  presenterEmployee: { code: string; fullName: string };
  department: { name: string };
};
type Department = { id: string; name: string; code: string };

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function HsePage() {
  const [activeTab, setActiveTab] = useState<Tab>("incidents");
  const [userRole, setUserRole] = useState("");

  const [incidents, setIncidents] = useState<HSEIncident[]>([]);
  const [loadingIncidents, setLoadingIncidents] = useState(true);

  const [inductions, setInductions] = useState<Induction[]>([]);
  const [loadingInductions, setLoadingInductions] = useState(true);

  const [ppeItems, setPpeItems] = useState<PPEItem[]>([]);
  const [loadingPpe, setLoadingPpe] = useState(true);

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [briefings, setBriefings] = useState<SafetyBriefing[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);

  // Modal states
  const [showReportIncident, setShowReportIncident] = useState(false);
  const [selectedIncident, setSelectedIncident] = useState<HSEIncident | null>(null);
  const [showAddInduction, setShowAddInduction] = useState(false);
  const [showAddPpe, setShowAddPpe] = useState(false);
  const [showIssuePpe, setShowIssuePpe] = useState(false);
  const [showAddBriefing, setShowAddBriefing] = useState(false);

  function fetchIncidents() {
    setLoadingIncidents(true);
    fetch("/api/v1/hse/incidents")
      .then((r) => r.json())
      .then((res) => setIncidents(res.data || []))
      .finally(() => setLoadingIncidents(false));
  }

  function fetchInductions() {
    setLoadingInductions(true);
    fetch("/api/v1/hse/inductions")
      .then((r) => r.json())
      .then((res) => setInductions(res.data || []))
      .finally(() => setLoadingInductions(false));
  }

  function fetchPpe() {
    setLoadingPpe(true);
    fetch("/api/v1/hse/ppe")
      .then((r) => r.json())
      .then((res) => setPpeItems(res.data || []))
      .finally(() => setLoadingPpe(false));
  }

  function fetchBriefings() {
    fetch(`/api/v1/hse/briefings?year=${new Date().getFullYear()}`)
      .then((r) => r.json()).then((res) => setBriefings(res.data || []));
  }

  useEffect(() => {
    fetch("/api/v1/me").then((r) => r.json()).then((res) => setUserRole(res.data?.role || ""));
    fetch("/api/v1/employees?limit=300").then((r) => r.json()).then((res) => setEmployees(res.data || []));
    fetch("/api/v1/departments").then((r) => r.json()).then((res) => setDepartments(res.data || []));
    fetchIncidents();
    fetchInductions();
    fetchPpe();
    fetchBriefings();
  }, []);

  const canManage = userRole === "HR_ADMIN" || userRole === "BOM";

  const tabs: { key: Tab; label: string }[] = [
    { key: "incidents", label: "Sự cố" },
    { key: "inductions", label: "Induction" },
    { key: "ppe", label: "PPE" },
    { key: "briefings", label: `Briefing${briefings.filter(b => b.lowAttendance).length > 0 ? ` ⚠${briefings.filter(b => b.lowAttendance).length}` : ""}` },
  ];

  return (
    <div>
      <PageTitle
        title="M9 — HSE An toàn"
        description="Quản lý sự cố, induction nhân viên và trang bị bảo hộ lao động"
      />

      {/* Tabs */}
      <div
        className="flex gap-1 mb-6 p-1 rounded-xl w-fit"
        style={{ background: "var(--ibs-bg-card)", border: "1px solid var(--ibs-border)" }}
      >
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className="px-4 py-2 rounded-lg text-[13px] font-medium transition-all"
            style={{
              background: activeTab === t.key ? "var(--ibs-accent)" : "transparent",
              color: activeTab === t.key ? "#fff" : "var(--ibs-text-dim)",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab 1 — Sự cố */}
      {activeTab === "incidents" && (
        <IncidentsTab
          incidents={incidents}
          loading={loadingIncidents}
          canManage={canManage}
          onRefresh={fetchIncidents}
          onReportClick={() => setShowReportIncident(true)}
          onUpdateClick={(inc) => setSelectedIncident(inc)}
        />
      )}

      {/* Tab 2 — Inductions */}
      {activeTab === "inductions" && (
        <InductionsTab
          inductions={inductions}
          loading={loadingInductions}
          canManage={canManage}
          onRefresh={fetchInductions}
          onAddClick={() => setShowAddInduction(true)}
        />
      )}

      {/* Tab 3 — PPE */}
      {activeTab === "ppe" && (
        <PpeTab
          ppeItems={ppeItems}
          loading={loadingPpe}
          canManage={canManage}
          onRefresh={fetchPpe}
          onAddClick={() => setShowAddPpe(true)}
          onIssueClick={() => setShowIssuePpe(true)}
        />
      )}

      {activeTab === "briefings" && (
        <BriefingsTab
          briefings={briefings}
          canManage={canManage}
          onRefresh={fetchBriefings}
          onAddClick={() => setShowAddBriefing(true)}
        />
      )}

      {/* Modals */}
      {showReportIncident && (
        <ReportIncidentModal
          onClose={() => setShowReportIncident(false)}
          onSuccess={() => { setShowReportIncident(false); fetchIncidents(); }}
        />
      )}

      {selectedIncident && (
        <UpdateIncidentModal
          incident={selectedIncident}
          canManage={canManage}
          onClose={() => setSelectedIncident(null)}
          onSuccess={() => { setSelectedIncident(null); fetchIncidents(); }}
        />
      )}

      {showAddInduction && (
        <AddInductionModal
          employees={employees}
          onClose={() => setShowAddInduction(false)}
          onSuccess={() => { setShowAddInduction(false); fetchInductions(); }}
        />
      )}

      {showAddPpe && (
        <AddPpeModal
          onClose={() => setShowAddPpe(false)}
          onSuccess={() => { setShowAddPpe(false); fetchPpe(); }}
        />
      )}

      {showIssuePpe && (
        <IssuePpeModal
          ppeItems={ppeItems}
          employees={employees}
          onClose={() => setShowIssuePpe(false)}
          onSuccess={() => { setShowIssuePpe(false); fetchPpe(); }}
        />
      )}
      {showAddBriefing && (
        <AddBriefingModal
          employees={employees}
          departments={departments}
          onClose={() => setShowAddBriefing(false)}
          onSuccess={() => { setShowAddBriefing(false); fetchBriefings(); }}
        />
      )}
    </div>
  );
}

// ─── Tab 1: Sự cố ─────────────────────────────────────────────────────────────

function IncidentsTab({
  incidents,
  loading,
  canManage,
  onRefresh,
  onReportClick,
  onUpdateClick,
}: {
  incidents: HSEIncident[];
  loading: boolean;
  canManage: boolean;
  onRefresh: () => void;
  onReportClick: () => void;
  onUpdateClick: (inc: HSEIncident) => void;
}) {
  const now = new Date();
  const thisMonth = incidents.filter((i) => {
    const d = new Date(i.incidentDate);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  });
  const openCount = incidents.filter(
    (i) => i.status === "REPORTED" || i.status === "INVESTIGATING"
  ).length;
  const criticalCount = incidents.filter((i) => i.severity === "CRITICAL").length;
  const resolvedCount = incidents.filter(
    (i) => i.status === "RESOLVED" || i.status === "CLOSED"
  ).length;
  const resolvedRate =
    incidents.length > 0 ? Math.round((resolvedCount / incidents.length) * 100) : 0;

  const summaryCards = [
    {
      label: "Sự cố tháng này",
      value: thisMonth.length,
      color: "var(--ibs-accent)",
      icon: <ShieldAlert size={18} />,
    },
    {
      label: "Đang mở",
      value: openCount,
      color: "var(--ibs-warning)",
      icon: <AlertTriangle size={18} />,
    },
    {
      label: "Nghiêm trọng",
      value: criticalCount,
      color: "#ef4444",
      icon: <AlertTriangle size={18} />,
    },
    {
      label: "Tỷ lệ giải quyết",
      value: `${resolvedRate}%`,
      color: "var(--ibs-success)",
      icon: <ShieldAlert size={18} />,
    },
  ];

  const columns: Column<HSEIncident>[] = [
    {
      key: "incidentDate",
      header: "Ngày xảy ra",
      sortable: true,
      render: (r) => <span className="font-mono text-[12px]">{formatDate(r.incidentDate)}</span>,
    },
    {
      key: "type",
      header: "Loại sự cố",
      render: (r) => (
        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-lg"
          style={{ background: "rgba(59,130,246,0.1)", color: "#3b82f6" }}>
          {TYPE_LABELS[r.type]}
        </span>
      ),
    },
    {
      key: "severity",
      header: "Mức độ",
      render: (r) => (
        <span
          className="text-[11px] font-semibold px-2 py-0.5 rounded-lg"
          style={{
            background: `${SEVERITY_COLORS[r.severity]}20`,
            color: SEVERITY_COLORS[r.severity],
          }}
        >
          {SEVERITY_LABELS[r.severity]}
        </span>
      ),
    },
    {
      key: "location",
      header: "Địa điểm",
      render: (r) => <span className="text-[13px]">{r.location}</span>,
    },
    {
      key: "reporter",
      header: "Người báo cáo",
      render: (r) => (
        <div>
          <div className="font-semibold text-[13px]">{r.reporter.fullName}</div>
          <div className="text-[11px]" style={{ color: "var(--ibs-text-dim)" }}>
            {r.reporter.code} · {r.reporter.department.name}
          </div>
        </div>
      ),
    },
    {
      key: "injuredPerson",
      header: "Người bị thương",
      render: (r) =>
        r.injuredPerson ? (
          <span className="text-[13px]">{r.injuredPerson}</span>
        ) : (
          <span style={{ color: "var(--ibs-text-dim)" }}>—</span>
        ),
    },
    {
      key: "status",
      header: "Trạng thái",
      render: (r) => (
        <span
          className="text-[11px] font-semibold px-2 py-0.5 rounded-lg"
          style={{
            background: `${STATUS_COLORS[r.status]}20`,
            color: STATUS_COLORS[r.status],
          }}
        >
          {STATUS_LABELS[r.status]}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      render: (r) => (
        <button
          onClick={() => onUpdateClick(r)}
          className="text-[11px] px-2 py-1 rounded-lg font-semibold"
          style={{ color: "var(--ibs-accent)" }}
        >
          {canManage ? "Cập nhật" : "Xem"}
        </button>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {summaryCards.map((card) => (
          <div
            key={card.label}
            className="rounded-xl p-4 flex flex-col gap-2"
            style={{ background: "var(--ibs-bg-card)", border: "1px solid var(--ibs-border)" }}
          >
            <div className="flex items-center justify-between">
              <span className="text-[12px]" style={{ color: "var(--ibs-text-dim)" }}>
                {card.label}
              </span>
              <span style={{ color: card.color }}>{card.icon}</span>
            </div>
            <div className="text-[28px] font-bold" style={{ color: card.color }}>
              {card.value}
            </div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div
        className="rounded-xl border"
        style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}
      >
        <div
          className="flex items-center justify-between px-5 py-4 border-b"
          style={{ borderColor: "var(--ibs-border)" }}
        >
          <div className="text-[14px] font-semibold">Danh sách sự cố</div>
          <div className="flex gap-2">
            <button
              onClick={onRefresh}
              className="p-2 rounded-lg hover:opacity-70"
              style={{ color: "var(--ibs-text-dim)" }}
            >
              <RefreshCw size={15} />
            </button>
            <button
              onClick={onReportClick}
              className="flex items-center gap-1.5 text-[13px] px-3 py-2 rounded-lg font-semibold"
              style={{ background: "var(--ibs-danger)", color: "#fff" }}
            >
              <Plus size={14} /> Báo cáo sự cố
            </button>
          </div>
        </div>
        <DataTable
          columns={columns}
          data={incidents}
          loading={loading}
          emptyText="Chưa có sự cố nào được báo cáo"
        />
      </div>
    </div>
  );
}

// ─── Tab 2: Inductions ────────────────────────────────────────────────────────

function InductionsTab({
  inductions,
  loading,
  canManage,
  onRefresh,
  onAddClick,
}: {
  inductions: Induction[];
  loading: boolean;
  canManage: boolean;
  onRefresh: () => void;
  onAddClick: () => void;
}) {
  const twelveMonthsAgo = useMemo(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 1);
    return d;
  }, []);

  // Map employeeId -> latest induction date
  const latestByEmployee = useMemo(() => {
    const map: Record<string, Date> = {};
    for (const ind of inductions) {
      const d = new Date(ind.inductionDate);
      if (!map[ind.employeeId] || d > map[ind.employeeId]) {
        map[ind.employeeId] = d;
      }
    }
    return map;
  }, [inductions]);

  function isOverdue(ind: Induction): boolean {
    const latest = latestByEmployee[ind.employeeId];
    return !latest || latest < twelveMonthsAgo;
  }

  const columns: Column<Induction>[] = [
    {
      key: "inductionDate",
      header: "Ngày Induction",
      sortable: true,
      render: (r) => <span className="font-mono text-[12px]">{formatDate(r.inductionDate)}</span>,
    },
    {
      key: "employee",
      header: "Nhân viên",
      render: (r) => (
        <div>
          <div className="font-semibold text-[13px]">{r.employee.fullName}</div>
          <div className="text-[11px]" style={{ color: "var(--ibs-text-dim)" }}>
            {r.employee.code} · {r.employee.department.name}
          </div>
        </div>
      ),
    },
    {
      key: "conductedBy",
      header: "Người hướng dẫn",
      render: (r) => <span className="text-[13px]">{r.conductedBy}</span>,
    },
    {
      key: "passed",
      header: "Kết quả",
      render: (r) => (
        <span
          className="text-[11px] font-semibold px-2 py-0.5 rounded-lg"
          style={{
            background: r.passed ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)",
            color: r.passed ? "#22c55e" : "#ef4444",
          }}
        >
          {r.passed ? "Đạt" : "Không đạt"}
        </span>
      ),
    },
    {
      key: "score",
      header: "Điểm",
      render: (r) =>
        r.score !== undefined ? (
          <span className="font-mono font-semibold text-[13px]">{r.score}</span>
        ) : (
          <span style={{ color: "var(--ibs-text-dim)" }}>—</span>
        ),
    },
    {
      key: "nextDueDate",
      header: "Hạn tiếp theo",
      render: (r) => {
        const overdue = isOverdue(r);
        return r.nextDueDate ? (
          <span
            className="text-[12px] font-mono"
            style={{ color: overdue ? "#ef4444" : "var(--ibs-text)" }}
          >
            {formatDate(r.nextDueDate)}
            {overdue && " ⚠"}
          </span>
        ) : (
          <span style={{ color: overdue ? "#ef4444" : "var(--ibs-text-dim)" }}>
            {overdue ? "Quá hạn ⚠" : "—"}
          </span>
        );
      },
    },
  ];

  // Augment rows with row-level styling via wrapper
  const overdueIds = new Set(
    inductions.filter((i) => isOverdue(i)).map((i) => i.employeeId)
  );
  const overdueCount = overdueIds.size;

  return (
    <div className="flex flex-col gap-5">
      {overdueCount > 0 && (
        <div
          className="flex items-center gap-3 px-4 py-3 rounded-xl text-[13px] font-medium"
          style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)", color: "#ef4444" }}
        >
          <AlertTriangle size={16} />
          {overdueCount} nhân viên chưa được induction trong 12 tháng qua — các dòng được đánh dấu đỏ.
        </div>
      )}

      <div
        className="rounded-xl border"
        style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}
      >
        <div
          className="flex items-center justify-between px-5 py-4 border-b"
          style={{ borderColor: "var(--ibs-border)" }}
        >
          <div className="text-[14px] font-semibold">Danh sách Induction</div>
          <div className="flex gap-2">
            <button
              onClick={onRefresh}
              className="p-2 rounded-lg hover:opacity-70"
              style={{ color: "var(--ibs-text-dim)" }}
            >
              <RefreshCw size={15} />
            </button>
            {canManage && (
              <button
                onClick={onAddClick}
                className="flex items-center gap-1.5 text-[13px] px-3 py-2 rounded-lg font-semibold"
                style={{ background: "var(--ibs-accent)", color: "#fff" }}
              >
                <Plus size={14} /> Thêm induction
              </button>
            )}
          </div>
        </div>

        {/* Custom table with row highlight for overdue */}
        <InductionTableWithHighlight
          columns={columns}
          data={inductions}
          loading={loading}
          overdueEmployeeIds={overdueIds}
        />
      </div>
    </div>
  );
}

function InductionTableWithHighlight({
  columns,
  data,
  loading,
  overdueEmployeeIds,
}: {
  columns: Column<Induction>[];
  data: Induction[];
  loading: boolean;
  overdueEmployeeIds: Set<string>;
}) {
  if (loading) {
    return (
      <div className="py-10 text-center text-[13px]" style={{ color: "var(--ibs-text-dim)" }}>
        Đang tải...
      </div>
    );
  }
  if (data.length === 0) {
    return (
      <div className="py-10 text-center text-[13px]" style={{ color: "var(--ibs-text-dim)" }}>
        Chưa có dữ liệu induction
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                className="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.8px] font-semibold"
                style={{
                  borderBottom: "1px solid var(--ibs-border)",
                  color: "var(--ibs-text-dim)",
                }}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => {
            const overdue = overdueEmployeeIds.has(row.employeeId);
            return (
              <tr
                key={i}
                style={{
                  borderBottom: "1px solid rgba(51,65,85,0.5)",
                  background: overdue ? "rgba(239,68,68,0.05)" : "transparent",
                }}
              >
                {columns.map((col) => (
                  <td key={col.key} className="px-4 py-3 text-[13px]">
                    {col.render
                      ? col.render(row as unknown as Induction & Record<string, unknown>)
                      : String((row as Record<string, unknown>)[col.key] ?? "")}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Tab 3: PPE ───────────────────────────────────────────────────────────────

function PpeTab({
  ppeItems,
  loading,
  canManage,
  onRefresh,
  onAddClick,
  onIssueClick,
}: {
  ppeItems: PPEItem[];
  loading: boolean;
  canManage: boolean;
  onRefresh: () => void;
  onAddClick: () => void;
  onIssueClick: () => void;
}) {
  const lowStockItems = ppeItems.filter((item) => item.stockQuantity <= item.minimumStock);

  return (
    <div className="flex flex-col gap-5">
      {/* Header row */}
      <div
        className="flex items-center justify-between px-5 py-4 rounded-xl border"
        style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}
      >
        <div>
          <div className="text-[14px] font-semibold">Kho trang bị bảo hộ (PPE)</div>
          {lowStockItems.length > 0 && (
            <div className="text-[12px] mt-0.5" style={{ color: "#f97316" }}>
              {lowStockItems.length} mục sắp hết hoặc dưới mức tối thiểu
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={onRefresh}
            className="p-2 rounded-lg hover:opacity-70"
            style={{ color: "var(--ibs-text-dim)" }}
          >
            <RefreshCw size={15} />
          </button>
          {canManage && (
            <>
              <button
                onClick={onIssueClick}
                className="flex items-center gap-1.5 text-[13px] px-3 py-2 rounded-lg font-semibold border"
                style={{ borderColor: "var(--ibs-accent)", color: "var(--ibs-accent)" }}
              >
                <ShieldAlert size={14} /> Cấp phát
              </button>
              <button
                onClick={onAddClick}
                className="flex items-center gap-1.5 text-[13px] px-3 py-2 rounded-lg font-semibold"
                style={{ background: "var(--ibs-accent)", color: "#fff" }}
              >
                <Plus size={14} /> Thêm thiết bị
              </button>
            </>
          )}
        </div>
      </div>

      {/* Stock Cards */}
      {loading ? (
        <div className="py-10 text-center text-[13px]" style={{ color: "var(--ibs-text-dim)" }}>
          Đang tải...
        </div>
      ) : ppeItems.length === 0 ? (
        <div
          className="py-16 text-center text-[13px] rounded-xl border"
          style={{
            color: "var(--ibs-text-dim)",
            background: "var(--ibs-bg-card)",
            borderColor: "var(--ibs-border)",
          }}
        >
          Chưa có thiết bị bảo hộ nào trong kho
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {ppeItems.map((item) => {
            const pct = item.minimumStock > 0
              ? Math.min(100, Math.round((item.stockQuantity / item.minimumStock) * 100))
              : 100;
            const isLow = item.stockQuantity <= item.minimumStock;
            const isCritical = item.stockQuantity === 0;
            const barColor = isCritical ? "#ef4444" : isLow ? "#f97316" : "var(--ibs-success)";
            const totalIssued = item.issuances.reduce((sum, iss) => sum + iss.quantity, 0);

            return (
              <div
                key={item.id}
                className="rounded-xl p-4 flex flex-col gap-3"
                style={{
                  background: "var(--ibs-bg-card)",
                  border: `1px solid ${isLow ? (isCritical ? "rgba(239,68,68,0.4)" : "rgba(249,115,22,0.4)") : "var(--ibs-border)"}`,
                }}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-semibold text-[14px]">{item.name}</div>
                    <div className="text-[11px] font-mono mt-0.5" style={{ color: "var(--ibs-text-dim)" }}>
                      {item.code}
                    </div>
                  </div>
                  {isLow && (
                    <span
                      className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                      style={{
                        background: isCritical ? "rgba(239,68,68,0.15)" : "rgba(249,115,22,0.15)",
                        color: isCritical ? "#ef4444" : "#f97316",
                      }}
                    >
                      {isCritical ? "HẾT HÀNG" : "SẮP HẾT"}
                    </span>
                  )}
                </div>

                <div className="flex flex-col gap-1">
                  <div className="flex justify-between text-[12px]">
                    <span style={{ color: "var(--ibs-text-dim)" }}>Tồn kho</span>
                    <span className="font-semibold" style={{ color: barColor }}>
                      {item.stockQuantity} / {item.minimumStock} {item.unit}
                    </span>
                  </div>
                  <div
                    className="h-2 rounded-full overflow-hidden"
                    style={{ background: "rgba(255,255,255,0.08)" }}
                  >
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${pct}%`, background: barColor }}
                    />
                  </div>
                  <div className="text-[11px]" style={{ color: "var(--ibs-text-dim)" }}>
                    Tối thiểu: {item.minimumStock} {item.unit} · Đã cấp: {totalIssued}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Modal: Báo cáo sự cố ─────────────────────────────────────────────────────

function ReportIncidentModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [form, setForm] = useState({
    incidentDate: new Date().toISOString().split("T")[0],
    type: "NEAR_MISS" as IncidentType,
    severity: "LOW" as IncidentSeverity,
    location: "",
    description: "",
    injuredPerson: "",
    correctiveAction: "",
  });
  const [photos, setPhotos] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const body: Record<string, unknown> = { ...form };
    if (!body.injuredPerson) delete body.injuredPerson;
    if (!body.correctiveAction) delete body.correctiveAction;
    if (photos.length > 0) body.photos = photos;
    const res = await fetch("/api/v1/hse/incidents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
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
    <Modal title="Báo cáo sự cố HSE" onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <FieldLabel>Ngày xảy ra *</FieldLabel>
            <input
              required
              type="date"
              value={form.incidentDate}
              onChange={(e) => setForm({ ...form, incidentDate: e.target.value })}
              className="w-full rounded-lg px-3 py-2 text-[13px] border"
              style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }}
            />
          </div>
          <div>
            <FieldLabel>Loại sự cố *</FieldLabel>
            <select
              required
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value as IncidentType })}
              className="w-full rounded-lg px-3 py-2 text-[13px] border"
              style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }}
            >
              {(Object.keys(TYPE_LABELS) as IncidentType[]).map((k) => (
                <option key={k} value={k}>{TYPE_LABELS[k]}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <FieldLabel>Mức độ nghiêm trọng *</FieldLabel>
            <select
              required
              value={form.severity}
              onChange={(e) => setForm({ ...form, severity: e.target.value as IncidentSeverity })}
              className="w-full rounded-lg px-3 py-2 text-[13px] border"
              style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }}
            >
              {(Object.keys(SEVERITY_LABELS) as IncidentSeverity[]).map((k) => (
                <option key={k} value={k}>{SEVERITY_LABELS[k]}</option>
              ))}
            </select>
          </div>
          <div>
            <FieldLabel>Địa điểm *</FieldLabel>
            <input
              required
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              className="w-full rounded-lg px-3 py-2 text-[13px] border"
              style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }}
              placeholder="VD: Xưởng A, khu vực máy cắt"
            />
          </div>
        </div>
        <div>
          <FieldLabel>Mô tả sự cố *</FieldLabel>
          <textarea
            required
            rows={3}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="w-full rounded-lg px-3 py-2 text-[13px] border resize-none"
            style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }}
            placeholder="Mô tả chi tiết sự cố..."
          />
        </div>
        <div>
          <FieldLabel>Người bị thương / liên quan (nếu có)</FieldLabel>
          <input
            value={form.injuredPerson}
            onChange={(e) => setForm({ ...form, injuredPerson: e.target.value })}
            className="w-full rounded-lg px-3 py-2 text-[13px] border"
            style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }}
            placeholder="Tên nhân viên bị ảnh hưởng"
          />
        </div>
        <div>
          <FieldLabel>Biện pháp khắc phục ban đầu (nếu có)</FieldLabel>
          <textarea
            rows={2}
            value={form.correctiveAction}
            onChange={(e) => setForm({ ...form, correctiveAction: e.target.value })}
            className="w-full rounded-lg px-3 py-2 text-[13px] border resize-none"
            style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }}
          />
        </div>
        <div>
          <FieldLabel>Ảnh hiện trường (tối đa 5 ảnh)</FieldLabel>
          {photos.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {photos.map((url, i) => (
                <div key={i} className="relative">
                  <img src={url} alt={`photo-${i}`} className="h-16 w-16 object-cover rounded border" style={{ borderColor: "var(--ibs-border)" }} />
                  <button type="button" onClick={() => setPhotos(photos.filter((_, j) => j !== i))}
                    className="absolute -top-1 -right-1 rounded-full bg-red-500 text-white w-4 h-4 flex items-center justify-center text-[10px]">
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
          {photos.length < 5 && (
            <FileUpload
              bucket={BUCKETS.HSE_PHOTOS}
              folder="incidents"
              accept="image/*"
              label={`Tải ảnh hiện trường (${photos.length}/5)`}
              onUploaded={(result) => setPhotos([...photos, result.url])}
              onError={(msg) => setError(msg)}
            />
          )}
        </div>
        {error && <div className="text-[12px] text-red-500">{error}</div>}
        <ModalFooter onClose={onClose} saving={saving} label="Báo cáo sự cố" color="var(--ibs-danger)" />
      </form>
    </Modal>
  );
}

// ─── Modal: Cập nhật sự cố ────────────────────────────────────────────────────

function UpdateIncidentModal({
  incident,
  canManage,
  onClose,
  onSuccess,
}: {
  incident: HSEIncident;
  canManage: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [status, setStatus] = useState<IncidentStatus>(incident.status);
  const [investigation, setInvestigation] = useState(incident.investigation || "");
  const [correctiveAction, setCorrectiveAction] = useState(incident.correctiveAction || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch(`/api/v1/hse/incidents/${incident.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status,
        investigation: investigation || undefined,
        correctiveAction: correctiveAction || undefined,
      }),
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
    <Modal title="Chi tiết sự cố" onClose={onClose}>
      <div className="flex flex-col gap-3 mb-4">
        <div className="grid grid-cols-2 gap-3">
          <InfoRow label="Loại sự cố" value={TYPE_LABELS[incident.type]} />
          <InfoRow label="Mức độ" value={
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-lg"
              style={{ background: `${SEVERITY_COLORS[incident.severity]}20`, color: SEVERITY_COLORS[incident.severity] }}>
              {SEVERITY_LABELS[incident.severity]}
            </span>
          } />
          <InfoRow label="Ngày xảy ra" value={formatDate(incident.incidentDate)} />
          <InfoRow label="Địa điểm" value={incident.location} />
          <InfoRow label="Người báo cáo" value={`${incident.reporter.fullName} (${incident.reporter.code})`} />
          {incident.injuredPerson && (
            <InfoRow label="Người bị thương" value={incident.injuredPerson} />
          )}
        </div>
        <div className="p-3 rounded-lg" style={{ background: "var(--ibs-bg)", border: "1px solid var(--ibs-border)" }}>
          <div className="text-[11px] mb-1" style={{ color: "var(--ibs-text-dim)" }}>Mô tả sự cố</div>
          <div className="text-[13px]">{incident.description}</div>
        </div>
      </div>

      {canManage ? (
        <form onSubmit={handleSubmit} className="flex flex-col gap-3 border-t pt-4" style={{ borderColor: "var(--ibs-border)" }}>
          <div className="text-[13px] font-semibold">Cập nhật xử lý</div>
          <div>
            <FieldLabel>Trạng thái *</FieldLabel>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as IncidentStatus)}
              className="w-full rounded-lg px-3 py-2 text-[13px] border"
              style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }}
            >
              {(Object.keys(STATUS_LABELS) as IncidentStatus[]).map((k) => (
                <option key={k} value={k}>{STATUS_LABELS[k]}</option>
              ))}
            </select>
          </div>
          <div>
            <FieldLabel>Kết quả điều tra</FieldLabel>
            <textarea
              rows={3}
              value={investigation}
              onChange={(e) => setInvestigation(e.target.value)}
              placeholder="Nguyên nhân gốc rễ, diễn biến sự cố..."
              className="w-full rounded-lg px-3 py-2 text-[13px] border resize-none"
              style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }}
            />
          </div>
          <div>
            <FieldLabel>Biện pháp khắc phục</FieldLabel>
            <textarea
              rows={3}
              value={correctiveAction}
              onChange={(e) => setCorrectiveAction(e.target.value)}
              className="w-full rounded-lg px-3 py-2 text-[13px] border resize-none"
              style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }}
            />
          </div>
          {error && <div className="text-[12px] text-red-500">{error}</div>}
          <ModalFooter onClose={onClose} saving={saving} label="Lưu cập nhật" color="var(--ibs-accent)" />
        </form>
      ) : (
        <div className="flex justify-end border-t pt-4" style={{ borderColor: "var(--ibs-border)" }}>
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-[13px] border"
            style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-dim)" }}>Đóng</button>
        </div>
      )}
    </Modal>
  );
}

// ─── Modal: Thêm Induction ────────────────────────────────────────────────────

function AddInductionModal({
  employees,
  onClose,
  onSuccess,
}: {
  employees: Employee[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [form, setForm] = useState({
    employeeId: "",
    conductedBy: "",
    inductionDate: new Date().toISOString().split("T")[0],
    passed: true,
    score: "",
    nextDueDate: "",
    notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const body: Record<string, unknown> = {
      employeeId: form.employeeId,
      conductedBy: form.conductedBy,
      inductionDate: form.inductionDate,
      passed: form.passed,
    };
    if (form.score) body.score = Number(form.score);
    if (form.nextDueDate) body.nextDueDate = form.nextDueDate;
    if (form.notes) body.notes = form.notes;
    const res = await fetch("/api/v1/hse/inductions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
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
    <Modal title="Thêm hồ sơ Induction" onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div>
          <FieldLabel>Nhân viên *</FieldLabel>
          <select
            required
            value={form.employeeId}
            onChange={(e) => setForm({ ...form, employeeId: e.target.value })}
            className="w-full rounded-lg px-3 py-2 text-[13px] border"
            style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }}
          >
            <option value="">Chọn nhân viên...</option>
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.fullName} ({emp.code}) — {emp.department.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <FieldLabel>Người hướng dẫn *</FieldLabel>
            <input
              required
              value={form.conductedBy}
              onChange={(e) => setForm({ ...form, conductedBy: e.target.value })}
              className="w-full rounded-lg px-3 py-2 text-[13px] border"
              style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }}
              placeholder="Tên người hướng dẫn"
            />
          </div>
          <div>
            <FieldLabel>Ngày induction *</FieldLabel>
            <input
              required
              type="date"
              value={form.inductionDate}
              onChange={(e) => setForm({ ...form, inductionDate: e.target.value })}
              className="w-full rounded-lg px-3 py-2 text-[13px] border"
              style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <FieldLabel>Kết quả *</FieldLabel>
            <select
              value={form.passed ? "1" : "0"}
              onChange={(e) => setForm({ ...form, passed: e.target.value === "1" })}
              className="w-full rounded-lg px-3 py-2 text-[13px] border"
              style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }}
            >
              <option value="1">Đạt</option>
              <option value="0">Không đạt</option>
            </select>
          </div>
          <div>
            <FieldLabel>Điểm (nếu có)</FieldLabel>
            <input
              type="number"
              min="0"
              max="100"
              value={form.score}
              onChange={(e) => setForm({ ...form, score: e.target.value })}
              className="w-full rounded-lg px-3 py-2 text-[13px] border"
              style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }}
              placeholder="0 – 100"
            />
          </div>
        </div>
        <div>
          <FieldLabel>Hạn induction tiếp theo</FieldLabel>
          <input
            type="date"
            value={form.nextDueDate}
            onChange={(e) => setForm({ ...form, nextDueDate: e.target.value })}
            className="w-full rounded-lg px-3 py-2 text-[13px] border"
            style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }}
          />
        </div>
        <div>
          <FieldLabel>Ghi chú</FieldLabel>
          <textarea
            rows={2}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            className="w-full rounded-lg px-3 py-2 text-[13px] border resize-none"
            style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }}
          />
        </div>
        {error && <div className="text-[12px] text-red-500">{error}</div>}
        <ModalFooter onClose={onClose} saving={saving} label="Thêm induction" color="var(--ibs-accent)" />
      </form>
    </Modal>
  );
}

// ─── Modal: Thêm thiết bị PPE ─────────────────────────────────────────────────

function AddPpeModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [form, setForm] = useState({
    name: "",
    code: "",
    unit: "",
    stockQuantity: "",
    minimumStock: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch("/api/v1/hse/ppe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        code: form.code,
        unit: form.unit,
        stockQuantity: Number(form.stockQuantity),
        minimumStock: Number(form.minimumStock),
      }),
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
    <Modal title="Thêm trang bị bảo hộ" onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <FieldLabel>Mã thiết bị *</FieldLabel>
            <input
              required
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
              className="w-full rounded-lg px-3 py-2 text-[13px] border font-mono"
              style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }}
              placeholder="PPE-001"
            />
          </div>
          <div>
            <FieldLabel>Đơn vị *</FieldLabel>
            <input
              required
              value={form.unit}
              onChange={(e) => setForm({ ...form, unit: e.target.value })}
              className="w-full rounded-lg px-3 py-2 text-[13px] border"
              style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }}
              placeholder="Cái, bộ, đôi..."
            />
          </div>
        </div>
        <div>
          <FieldLabel>Tên thiết bị *</FieldLabel>
          <input
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full rounded-lg px-3 py-2 text-[13px] border"
            style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }}
            placeholder="VD: Mũ bảo hộ, Găng tay chống cắt..."
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <FieldLabel>Số lượng tồn kho *</FieldLabel>
            <input
              required
              type="number"
              min="0"
              value={form.stockQuantity}
              onChange={(e) => setForm({ ...form, stockQuantity: e.target.value })}
              className="w-full rounded-lg px-3 py-2 text-[13px] border"
              style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }}
            />
          </div>
          <div>
            <FieldLabel>Tồn kho tối thiểu *</FieldLabel>
            <input
              required
              type="number"
              min="0"
              value={form.minimumStock}
              onChange={(e) => setForm({ ...form, minimumStock: e.target.value })}
              className="w-full rounded-lg px-3 py-2 text-[13px] border"
              style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }}
            />
          </div>
        </div>
        {error && <div className="text-[12px] text-red-500">{error}</div>}
        <ModalFooter onClose={onClose} saving={saving} label="Thêm thiết bị" color="var(--ibs-accent)" />
      </form>
    </Modal>
  );
}

// ─── Modal: Cấp phát PPE ──────────────────────────────────────────────────────

function IssuePpeModal({
  ppeItems,
  employees,
  onClose,
  onSuccess,
}: {
  ppeItems: PPEItem[];
  employees: Employee[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [form, setForm] = useState({
    itemId: "",
    employeeId: "",
    quantity: "1",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const selectedItem = ppeItems.find((p) => p.id === form.itemId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch("/api/v1/hse/ppe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "issue",
        itemId: form.itemId,
        employeeId: form.employeeId,
        quantity: Number(form.quantity),
      }),
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
    <Modal title="Cấp phát trang bị bảo hộ" onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div>
          <FieldLabel>Thiết bị cấp phát *</FieldLabel>
          <select
            required
            value={form.itemId}
            onChange={(e) => setForm({ ...form, itemId: e.target.value })}
            className="w-full rounded-lg px-3 py-2 text-[13px] border"
            style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }}
          >
            <option value="">Chọn thiết bị...</option>
            {ppeItems.map((item) => (
              <option key={item.id} value={item.id}>
                [{item.code}] {item.name} — Tồn: {item.stockQuantity} {item.unit}
              </option>
            ))}
          </select>
          {selectedItem && selectedItem.stockQuantity <= selectedItem.minimumStock && (
            <div className="text-[11px] mt-1" style={{ color: "#f97316" }}>
              Cảnh báo: Tồn kho thấp ({selectedItem.stockQuantity} {selectedItem.unit} còn lại)
            </div>
          )}
        </div>
        <div>
          <FieldLabel>Nhân viên nhận *</FieldLabel>
          <select
            required
            value={form.employeeId}
            onChange={(e) => setForm({ ...form, employeeId: e.target.value })}
            className="w-full rounded-lg px-3 py-2 text-[13px] border"
            style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }}
          >
            <option value="">Chọn nhân viên...</option>
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.fullName} ({emp.code}) — {emp.department.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <FieldLabel>Số lượng *</FieldLabel>
          <input
            required
            type="number"
            min="1"
            max={selectedItem?.stockQuantity ?? 9999}
            value={form.quantity}
            onChange={(e) => setForm({ ...form, quantity: e.target.value })}
            className="w-full rounded-lg px-3 py-2 text-[13px] border"
            style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }}
          />
        </div>
        {error && <div className="text-[12px] text-red-500">{error}</div>}
        <ModalFooter onClose={onClose} saving={saving} label="Xác nhận cấp phát" color="var(--ibs-accent)" />
      </form>
    </Modal>
  );
}

// ─── Shared Primitives ────────────────────────────────────────────────────────

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div
        className="rounded-2xl w-full max-w-lg mx-4 p-6 max-h-[90vh] overflow-y-auto"
        style={{ background: "var(--ibs-bg-card)", border: "1px solid var(--ibs-border)" }}
      >
        <div className="flex items-center justify-between mb-5">
          <div className="text-[16px] font-bold">{title}</div>
          <button onClick={onClose} style={{ color: "var(--ibs-text-dim)" }}>
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>
      {children}
    </label>
  );
}

function ModalFooter({
  onClose,
  saving,
  label,
  color,
}: {
  onClose: () => void;
  saving: boolean;
  label: string;
  color: string;
}) {
  return (
    <div className="flex gap-2 justify-end mt-2">
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
        className="px-4 py-2 rounded-lg text-[13px] font-semibold disabled:opacity-60"
        style={{ background: color, color: "#fff" }}
      >
        {saving ? "Đang lưu..." : label}
      </button>
    </div>
  );
}

// ─── Tab 4: Safety Briefings ──────────────────────────────────────────────────

function BriefingsTab({ briefings, canManage, onRefresh, onAddClick }: {
  briefings: SafetyBriefing[]; canManage: boolean; onRefresh: () => void; onAddClick: () => void;
}) {
  const lowCount = briefings.filter((b) => b.lowAttendance).length;
  return (
    <div>
      {lowCount > 0 && (
        <div className="rounded-xl border px-4 py-3 mb-4 flex items-center gap-3" style={{ background: "rgba(245,158,11,0.08)", borderColor: "rgba(245,158,11,0.3)" }}>
          <span className="text-[20px]">⚠️</span>
          <span className="text-[13px]" style={{ color: "var(--ibs-warning)" }}><b>{lowCount} buổi briefing</b> có tỷ lệ tham dự &lt;85%. Cần theo dõi.</span>
        </div>
      )}
      <div className="rounded-xl border" style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
        <div className="flex items-center gap-3 px-5 py-4 border-b flex-wrap" style={{ borderColor: "var(--ibs-border)" }}>
          <div className="text-[14px] font-semibold">An toàn lao động — Safety Briefing</div>
          <button onClick={onRefresh} className="p-2 rounded-lg" style={{ color: "var(--ibs-text-dim)" }}><RefreshCw size={15} /></button>
          {canManage && (
            <button onClick={onAddClick} className="flex items-center gap-1.5 text-[13px] px-3 py-2 rounded-lg font-semibold ml-auto" style={{ background: "var(--ibs-accent)", color: "#fff" }}>
              <Plus size={14} /> Thêm briefing
            </button>
          )}
        </div>
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b" style={{ borderColor: "var(--ibs-border)" }}>
              <th className="text-left px-5 py-2.5 text-[11px] font-semibold" style={{ color: "var(--ibs-text-dim)" }}>Ngày</th>
              <th className="text-left px-3 py-2.5 text-[11px] font-semibold" style={{ color: "var(--ibs-text-dim)" }}>Chủ đề</th>
              <th className="text-left px-3 py-2.5 text-[11px] font-semibold" style={{ color: "var(--ibs-text-dim)" }}>Phòng ban</th>
              <th className="text-left px-3 py-2.5 text-[11px] font-semibold" style={{ color: "var(--ibs-text-dim)" }}>Người trình bày</th>
              <th className="text-left px-3 py-2.5 text-[11px] font-semibold" style={{ color: "var(--ibs-text-dim)" }}>Tỷ lệ tham dự</th>
            </tr>
          </thead>
          <tbody>
            {briefings.map((b) => (
              <tr key={b.id} className="border-b last:border-0" style={{ borderColor: "var(--ibs-border)", background: b.lowAttendance ? "rgba(245,158,11,0.04)" : undefined }}>
                <td className="px-5 py-2.5">{new Date(b.date).toLocaleDateString("vi-VN")}</td>
                <td className="px-3 py-2.5 font-medium">{b.topic}</td>
                <td className="px-3 py-2.5" style={{ color: "var(--ibs-text-dim)" }}>{b.department.name}</td>
                <td className="px-3 py-2.5">{b.presenterEmployee.fullName}</td>
                <td className="px-3 py-2.5">
                  <span className="font-semibold" style={{ color: b.lowAttendance ? "var(--ibs-warning)" : "var(--ibs-success)" }}>
                    {b.attendanceRate}% {b.lowAttendance ? "⚠️" : "✓"}
                  </span>
                  <div className="text-[11px]" style={{ color: "var(--ibs-text-dim)" }}>{b.totalAttendees}/{b.totalTarget} người</div>
                </td>
              </tr>
            ))}
            {briefings.length === 0 && (
              <tr><td colSpan={5} className="px-5 py-12 text-center text-[13px]" style={{ color: "var(--ibs-text-dim)" }}>Chưa có buổi briefing nào</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AddBriefingModal({ employees, departments, onClose, onSuccess }: {
  employees: Employee[]; departments: Department[]; onClose: () => void; onSuccess: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({ date: today, topic: "", presenter: "", departmentId: "", totalAttendees: "", totalTarget: "", notes: "" });
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setSaving(true);
    await fetch("/api/v1/hse/briefings", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: form.date, topic: form.topic, presenter: form.presenter,
        departmentId: form.departmentId,
        totalAttendees: parseInt(form.totalAttendees),
        totalTarget: parseInt(form.totalTarget),
        notes: form.notes || null,
      }),
    });
    setSaving(false); onSuccess();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="rounded-2xl w-full max-w-lg mx-4 p-6 max-h-[90vh] overflow-y-auto" style={{ background: "var(--ibs-bg-card)", border: "1px solid var(--ibs-border)" }}>
        <div className="flex items-center justify-between mb-5"><div className="text-[16px] font-bold">Thêm Safety Briefing</div><button onClick={onClose}><X size={18} /></button></div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Ngày *</label>
              <input required type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })}
                className="w-full rounded-lg px-3 py-2 text-[13px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }} />
            </div>
            <div>
              <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Phòng ban *</label>
              <select required value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value })}
                className="w-full rounded-lg px-3 py-2 text-[13px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }}>
                <option value="">Chọn phòng ban...</option>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Chủ đề *</label>
            <input required value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })}
              placeholder="VD: An toàn khi hàn trên cao"
              className="w-full rounded-lg px-3 py-2 text-[13px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }} />
          </div>
          <div>
            <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Người trình bày *</label>
            <select required value={form.presenter} onChange={(e) => setForm({ ...form, presenter: e.target.value })}
              className="w-full rounded-lg px-3 py-2 text-[13px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }}>
              <option value="">Chọn nhân viên...</option>
              {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.fullName} ({emp.code})</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Số người tham dự *</label>
              <input required type="number" min={0} value={form.totalAttendees} onChange={(e) => setForm({ ...form, totalAttendees: e.target.value })}
                className="w-full rounded-lg px-3 py-2 text-[13px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }} />
            </div>
            <div>
              <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Tổng cần tham dự *</label>
              <input required type="number" min={1} value={form.totalTarget} onChange={(e) => setForm({ ...form, totalTarget: e.target.value })}
                className="w-full rounded-lg px-3 py-2 text-[13px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }} />
            </div>
          </div>
          {form.totalAttendees && form.totalTarget && parseInt(form.totalAttendees) / parseInt(form.totalTarget) < 0.85 && (
            <div className="text-[12px] px-3 py-2 rounded-lg" style={{ background: "rgba(245,158,11,0.1)", color: "var(--ibs-warning)" }}>
              ⚠️ Tỷ lệ tham dự {Math.round(parseInt(form.totalAttendees) / parseInt(form.totalTarget) * 100)}% — thấp hơn 85%. Sẽ gửi cảnh báo.
            </div>
          )}
          <div>
            <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Ghi chú</label>
            <textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="w-full rounded-lg px-3 py-2 text-[13px] border resize-none" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }} />
          </div>
          <div className="flex gap-2 justify-end mt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-[13px] border" style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-dim)" }}>Hủy</button>
            <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg text-[13px] font-semibold" style={{ background: "var(--ibs-accent)", color: "#fff" }}>{saving ? "Đang lưu..." : "Lưu"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] mb-0.5" style={{ color: "var(--ibs-text-dim)" }}>{label}</div>
      <div className="text-[13px] font-medium">{value}</div>
    </div>
  );
}
