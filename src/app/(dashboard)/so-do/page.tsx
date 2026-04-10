import { PageTitle } from "@/components/layout/page-title";
import prisma from "@/lib/prisma";
import { OrgChartTabs } from "./org-chart-tabs";

export default async function OrgChartPage() {
  const [departments, directorates, productionTeams, employeeCounts] = await Promise.all([
    prisma.department.findMany({
      where: { isActive: true },
      include: { directorate: true },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.directorate.findMany({ orderBy: { name: "asc" } }),
    prisma.productionTeam.findMany({ orderBy: { name: "asc" } }),
    prisma.employee.groupBy({
      by: ["departmentId"],
      where: { status: { in: ["ACTIVE", "PROBATION"] } },
      _count: { id: true },
    }),
  ]);

  const countMap: Record<string, number> = {};
  for (const c of employeeCounts) {
    countMap[c.departmentId] = c._count.id;
  }

  const totalActive = Object.values(countMap).reduce((a, b) => a + b, 0);

  const deptWithCounts = departments.map((d) => ({
    id: d.id,
    code: d.code,
    name: d.name,
    headcount: d.headcount,
    actual: countMap[d.id] ?? 0,
    directorateName: d.directorate?.nameVi ?? null,
    directorateId: d.directorateId ?? null,
  }));

  return (
    <div>
      <PageTitle
        title="M2 - Sơ đồ tổ chức"
        description="IBS Heavy Industry JSC — Cơ cấu tổ chức theo QĐ SĐTC 11/2025"
      />

      {/* Stats */}
      <div className="flex gap-3 mb-6 flex-wrap">
        {[
          { label: "Tổng CBNV", value: totalActive },
          { label: "Phòng ban", value: departments.length },
          { label: "Tổ sản xuất", value: productionTeams.length },
          { label: "Cấp quản lý", value: 4 },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-xl px-5 py-3 border flex items-center gap-3"
            style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}
          >
            <span className="text-[20px] font-bold" style={{ color: "var(--ibs-accent)" }}>
              {s.value}
            </span>
            <span className="text-[12px]" style={{ color: "var(--ibs-text-dim)" }}>
              {s.label}
            </span>
          </div>
        ))}
      </div>

      <OrgChartTabs
        departments={deptWithCounts}
        directorates={directorates.map((d) => ({ id: d.id, name: d.name, nameVi: d.nameVi }))}
        productionTeams={productionTeams.map((t) => t.name)}
      />

      {/* Legend */}
      <div className="flex gap-4 mt-4 flex-wrap">
        {[
          { color: "var(--ibs-accent)", label: "Ban lãnh đạo" },
          { color: "#00B4D8", label: "Khối Thương mại" },
          { color: "#22c55e", label: "Khối Vận hành" },
          { color: "#f59e0b", label: "Khối Sản xuất" },
        ].map((l) => (
          <div key={l.label} className="flex items-center gap-2 text-[12px]" style={{ color: "var(--ibs-text-muted)" }}>
            <div className="w-3 h-3 rounded-sm" style={{ background: l.color }} />
            {l.label}
          </div>
        ))}
      </div>
    </div>
  );
}
