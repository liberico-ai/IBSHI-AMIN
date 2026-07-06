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
    prisma.productionTeam.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    prisma.employee.groupBy({
      by: ["departmentId"],
      where: { status: { in: ["ACTIVE", "PROBATION"] } },
      _count: { id: true },
    }),
  ]);

  // Số NV đang làm theo từng tổ
  const teamCounts = await prisma.employee.groupBy({
    by: ["teamId"],
    where: { status: { in: ["ACTIVE", "PROBATION"] }, teamId: { not: null } },
    _count: { id: true },
  });
  const teamCountMap: Record<string, number> = {};
  for (const c of teamCounts) if (c.teamId) teamCountMap[c.teamId] = c._count.id;

  // Giám đốc của từng khối (Directorate.directorIds = Employee.id[]).
  const dirEmpIds = Array.from(
    new Set(directorates.flatMap((d) => d.directorIds ?? []))
  ).filter((x): x is string => !!x);
  const directorEmps = dirEmpIds.length
    ? await prisma.employee.findMany({
        where: { id: { in: dirEmpIds } },
        select: { id: true, code: true, fullName: true, jobRole: true, department: { select: { name: true } } },
      })
    : [];
  const dirEmpMap = new Map(directorEmps.map((e) => [e.id, e]));

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
          // Tổ sản xuất: ẩn nếu không còn tổ nào đang hoạt động (Xưởng nay là phòng ban).
          ...(productionTeams.length > 0 ? [{ label: "Tổ sản xuất", value: productionTeams.length }] : []),
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
        directorates={directorates.map((d) => ({
          id: d.id,
          name: d.name,
          nameVi: d.nameVi,
          directors: (d.directorIds ?? [])
            .map((eid) => dirEmpMap.get(eid))
            .filter((e): e is NonNullable<typeof e> => !!e)
            .map((e) => ({ code: e.code, fullName: e.fullName, jobRole: e.jobRole, deptName: e.department?.name ?? null })),
        }))}
        productionTeams={productionTeams.map((t) => ({ id: t.id, name: t.name, memberCount: t.memberCount, actual: teamCountMap[t.id] ?? 0 }))}
      />

      {/* Legend */}
      <div className="flex gap-4 mt-4 flex-wrap">
        {[
          { color: "var(--ibs-accent)", label: "Ban lãnh đạo" },
          { color: "#f59e0b", label: "Khối Trực tiếp" },
          { color: "#00B4D8", label: "Khối Gián tiếp" },
          { color: "#22c55e", label: "Khối Chuyển đổi & Quản trị" },
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
