"use client";

import { useState, useEffect } from "react";
import { X, Loader2 } from "lucide-react";

type Dept = {
  id: string;
  code: string;
  name: string;
  headcount: number;
  actual: number;
  directorateName: string | null;
  directorateId: string | null;
};

type Directorate = { id: string; name: string; nameVi: string };

const DIR_COLORS: Record<string, string> = {
  "Commercial Director": "#00B4D8",
  COO: "#22c55e",
  "Production Director": "#f59e0b",
};

function ConnectorLine({ vertical = false }: { vertical?: boolean }) {
  return (
    <div
      style={{
        background: "var(--ibs-border)",
        width: vertical ? "1px" : "100%",
        height: vertical ? "24px" : "1px",
        flexShrink: 0,
      }}
    />
  );
}

function DeptCard({ code, name, actual, headcount, color, onClick }: {
  code: string; name: string; actual: number; headcount: number; color: string; onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className="rounded-xl border p-3 text-center transition-all duration-200 hover:-translate-y-0.5"
      style={{
        background: "var(--ibs-bg-card)",
        borderColor: "var(--ibs-border)",
        borderTop: `2px solid ${color}`,
        minWidth: "110px",
        cursor: onClick ? "pointer" : "default",
      }}
    >
      <div className="text-[11px] font-bold mb-0.5" style={{ color }}>{code}</div>
      <div className="text-[12px] font-medium mb-1">{name}</div>
      <div className="text-[10px]" style={{ color: "var(--ibs-text-dim)" }}>
        {actual}/{headcount} CBNV
      </div>
    </div>
  );
}

export function OrgChartTabs({
  departments,
  directorates,
  productionTeams,
}: {
  departments: Dept[];
  directorates: Directorate[];
  productionTeams: string[];
}) {
  const [activeTab, setActiveTab] = useState<"chart" | "headcount">("chart");
  const [selectedDept, setSelectedDept] = useState<Dept | null>(null);

  const tabs = [
    { key: "chart" as const, label: "Sơ đồ tổ chức" },
    { key: "headcount" as const, label: "Headcount" },
  ];

  // Group departments by directorate
  const deptsByDir: Record<string, Dept[]> = {};
  for (const d of departments) {
    const key = d.directorateId ?? "bom";
    if (!deptsByDir[key]) deptsByDir[key] = [];
    deptsByDir[key].push(d);
  }

  return (
    <>
      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b" style={{ borderColor: "var(--ibs-border)" }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className="px-4 py-2.5 text-[13px] font-medium border-b-2 transition-colors"
            style={{
              borderBottomColor: activeTab === t.key ? "var(--ibs-accent)" : "transparent",
              color: activeTab === t.key ? "var(--ibs-accent)" : "var(--ibs-text-muted)",
              marginBottom: "-1px",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab: Sơ đồ */}
      {activeTab === "chart" && (
        <div
          className="rounded-xl border p-8 overflow-x-auto"
          style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}
        >
          <div className="min-w-[900px]">
            {/* HĐQT */}
            <div className="flex justify-center mb-2">
              <div className="rounded-xl px-6 py-3 border text-center"
                style={{ background: "rgba(31,78,121,0.3)", borderColor: "rgba(31,78,121,0.6)" }}>
                <div className="text-[14px] font-bold">Hội đồng Quản trị</div>
                <div className="text-[11px]" style={{ color: "var(--ibs-text-dim)" }}>Board of Directors (HĐQT)</div>
              </div>
            </div>
            <div className="flex justify-center"><ConnectorLine vertical /></div>

            {/* BOM */}
            <div className="flex justify-center gap-4 mb-2">
              {(deptsByDir["bom"] || []).slice(0, 1).map((d) => (
                <div key={d.id} className="rounded-xl px-4 py-3 border text-center"
                  style={{ background: "linear-gradient(135deg,rgba(0,180,216,0.2),rgba(31,78,121,0.3))", borderColor: "var(--ibs-accent)", minWidth: "160px" }}>
                  <div className="text-[13px] font-semibold" style={{ color: "var(--ibs-accent)" }}>{d.name}</div>
                  <div className="text-[11px]" style={{ color: "var(--ibs-text-dim)" }}>Ban Giám đốc (BOM)</div>
                  <div className="text-[10px] mt-0.5" style={{ color: "var(--ibs-accent)" }}>{d.actual} thành viên</div>
                </div>
              ))}
            </div>
            <div className="flex justify-center"><ConnectorLine vertical /></div>
            <div className="flex justify-center mb-0">
              <div style={{ width: "66.67%", height: "1px", background: "var(--ibs-border)" }} />
            </div>

            {/* Directors */}
            <div className="grid grid-cols-3 gap-4 mb-2">
              {directorates.map((dir) => {
                const color = DIR_COLORS[dir.name] ?? "var(--ibs-accent)";
                return (
                  <div key={dir.id} className="flex flex-col items-center">
                    <ConnectorLine vertical />
                    <div className="rounded-xl px-4 py-3 border text-center"
                      style={{ background: "var(--ibs-bg-card)", borderColor: color, minWidth: "160px" }}>
                      <div className="text-[13px] font-semibold" style={{ color }}>{dir.nameVi}</div>
                      <div className="text-[11px]" style={{ color: "var(--ibs-text-dim)" }}>{dir.name}</div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Departments per director */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              {directorates.map((dir) => {
                const color = DIR_COLORS[dir.name] ?? "var(--ibs-accent)";
                const depts = deptsByDir[dir.id] ?? [];
                return (
                  <div key={dir.id} className="flex flex-col items-center gap-2">
                    <ConnectorLine vertical />
                    {depts.length > 1 && (
                      <div style={{ width: "85%", height: "1px", background: "var(--ibs-border)" }} />
                    )}
                    <div className="flex justify-center gap-2 flex-wrap">
                      {depts.map((dept) => (
                        <div key={dept.id} className="flex flex-col items-center">
                          <ConnectorLine vertical />
                          <DeptCard code={dept.code} name={dept.name} actual={dept.actual} headcount={dept.headcount} color={color} onClick={() => setSelectedDept(dept)} />
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Production teams */}
            <div className="mt-4 pt-4 border-t" style={{ borderColor: "var(--ibs-border)" }}>
              <div className="text-center text-[11px] font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--ibs-text-dim)" }}>
                {productionTeams.length} Tổ sản xuất — P. Sản xuất
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                {productionTeams.map((team) => (
                  <div key={team} className="px-3 py-1.5 rounded-lg text-[11px] font-medium border"
                    style={{ background: "rgba(245,158,11,0.08)", borderColor: "rgba(245,158,11,0.3)", color: "#f59e0b" }}>
                    {team}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Dept employees modal */}
      {selectedDept && (
        <DeptEmployeesModal dept={selectedDept} onClose={() => setSelectedDept(null)} />
      )}

      {/* Tab: Headcount */}
      {activeTab === "headcount" && (
        <div className="rounded-xl border overflow-hidden"
          style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
          <div className="px-5 py-3 border-b" style={{ borderColor: "var(--ibs-border)" }}>
            <h4 className="text-[13px] font-semibold">Biên chế vs Thực tế theo phòng ban</h4>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  {["Phòng ban", "Mã", "Biên chế", "Thực tế", "Trống", "Tỷ lệ"].map((h) => (
                    <th key={h}
                      className="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.8px] font-semibold border-b"
                      style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-dim)" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {departments.map((d) => {
                  const vacant = Math.max(0, d.headcount - d.actual);
                  const rate = d.headcount > 0 ? Math.round((d.actual / d.headcount) * 100) : 0;
                  const rateColor = rate >= 90 ? "var(--ibs-success)" : rate >= 70 ? "var(--ibs-warning)" : "var(--ibs-danger)";
                  return (
                    <tr key={d.id} className="border-b" style={{ borderColor: "rgba(51,65,85,0.4)" }}>
                      <td className="px-4 py-3 text-[13px] font-medium">{d.name}</td>
                      <td className="px-4 py-3 text-[12px] font-mono" style={{ color: "var(--ibs-accent)" }}>{d.code}</td>
                      <td className="px-4 py-3 text-[13px]">{d.headcount}</td>
                      <td className="px-4 py-3 text-[13px] font-medium" style={{ color: "var(--ibs-success)" }}>{d.actual}</td>
                      <td className="px-4 py-3 text-[13px]"
                        style={{ color: vacant > 0 ? "var(--ibs-warning)" : "var(--ibs-text-dim)" }}>
                        {vacant > 0 ? `−${vacant}` : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 rounded-full" style={{ background: "var(--ibs-border)" }}>
                            <div className="h-full rounded-full" style={{ width: `${rate}%`, background: rateColor }} />
                          </div>
                          <span className="text-[11px] w-9 text-right" style={{ color: rateColor }}>{rate}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ background: "rgba(0,180,216,0.04)" }}>
                  <td className="px-4 py-3 text-[13px] font-bold" colSpan={2}>Tổng cộng</td>
                  <td className="px-4 py-3 text-[13px] font-bold">{departments.reduce((s, d) => s + d.headcount, 0)}</td>
                  <td className="px-4 py-3 text-[13px] font-bold" style={{ color: "var(--ibs-success)" }}>
                    {departments.reduce((s, d) => s + d.actual, 0)}
                  </td>
                  <td className="px-4 py-3 text-[13px] font-bold" style={{ color: "var(--ibs-warning)" }}>
                    {(() => {
                      const v = departments.reduce((s, d) => s + Math.max(0, d.headcount - d.actual), 0);
                      return v > 0 ? `−${v}` : "—";
                    })()}
                  </td>
                  <td className="px-4 py-3" />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

// ── DeptEmployeesModal ────────────────────────────────────────────────────────
type EmpRow = {
  id: string;
  employeeId: string;
  fullName: string;
  position: { name: string } | string | null;
  email: string | null;
  status: string;
};

function DeptEmployeesModal({ dept, onClose }: { dept: Dept; onClose: () => void }) {
  const [employees, setEmployees] = useState<EmpRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/v1/employees?departmentId=${dept.id}&limit=100`)
      .then((r) => r.json())
      .then((json) => setEmployees(json.data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [dept.id]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={onClose}
    >
      <div
        className="rounded-2xl border w-full max-w-2xl max-h-[80vh] flex flex-col"
        style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: "var(--ibs-border)" }}>
          <div>
            <h3 className="text-[15px] font-semibold">{dept.name}</h3>
            <p className="text-[12px] mt-0.5" style={{ color: "var(--ibs-text-dim)" }}>
              {dept.actual} / {dept.headcount} CBNV
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/5 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1">
          {loading ? (
            <div className="flex justify-center items-center py-12">
              <Loader2 size={24} className="animate-spin" style={{ color: "var(--ibs-accent)" }} />
            </div>
          ) : employees.length === 0 ? (
            <p className="text-center py-10 text-[13px]" style={{ color: "var(--ibs-text-dim)" }}>
              Chưa có nhân viên nào trong phòng ban này
            </p>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  {["Mã NV", "Họ và tên", "Chức vụ", "Email", "Trạng thái"].map((h) => (
                    <th key={h}
                      className="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.8px] font-semibold border-b"
                      style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-dim)" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {employees.map((emp) => (
                  <tr key={emp.id} className="border-b hover:bg-white/2 transition-colors"
                    style={{ borderColor: "rgba(51,65,85,0.4)" }}>
                    <td className="px-4 py-3 text-[12px] font-mono" style={{ color: "var(--ibs-accent)" }}>{emp.employeeId}</td>
                    <td className="px-4 py-3 text-[13px] font-medium">{emp.fullName}</td>
                    <td className="px-4 py-3 text-[12px]" style={{ color: "var(--ibs-text-muted)" }}>
                      {emp.position == null ? "—" : (emp.position as any).name ?? (emp.position as string)}
                    </td>
                    <td className="px-4 py-3 text-[12px]" style={{ color: "var(--ibs-text-muted)" }}>{emp.email ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span
                        className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold"
                        style={{
                          background: emp.status === "ACTIVE" ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)",
                          color: emp.status === "ACTIVE" ? "var(--ibs-success)" : "var(--ibs-danger)",
                        }}
                      >
                        {emp.status === "ACTIVE" ? "Đang làm" : "Đã nghỉ"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
