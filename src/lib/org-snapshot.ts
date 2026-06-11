import prisma from "./prisma";

const WORKING = ["ACTIVE", "PROBATION"] as const;

// Tháng hiện tại theo giờ VN: "YYYY-MM".
export function currentPeriod(): string {
  const d = new Date(Date.now() + 7 * 3600 * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

// Chốt sĩ số phòng ban + tổ sản xuất (đang làm + thử việc) cho 1 tháng. Idempotent.
export async function captureOrgSnapshot(period: string) {
  const [depts, teams, deptCounts, teamCounts] = await Promise.all([
    prisma.department.findMany({ where: { isActive: true }, select: { id: true, code: true, name: true } }),
    prisma.productionTeam.findMany({ select: { id: true, name: true } }),
    prisma.employee.groupBy({ by: ["departmentId"], where: { status: { in: [...WORKING] } }, _count: { id: true } }),
    prisma.employee.groupBy({ by: ["teamId"], where: { status: { in: [...WORKING] }, teamId: { not: null } }, _count: { id: true } }),
  ]);
  const dMap = new Map(deptCounts.map((d) => [d.departmentId, d._count.id]));
  const tMap = new Map(teamCounts.map((t) => [t.teamId, t._count.id]));

  const rows = [
    ...depts.map((d) => ({ scope: "DEPT", refId: d.id, refName: d.name, refCode: d.code as string | null, activeCount: dMap.get(d.id) ?? 0 })),
    ...teams.map((t) => ({ scope: "TEAM", refId: t.id, refName: t.name, refCode: null as string | null, activeCount: tMap.get(t.id) ?? 0 })),
  ];

  for (const r of rows) {
    await prisma.orgSnapshot.upsert({
      where: { period_scope_refId: { period, scope: r.scope, refId: r.refId } },
      create: { period, ...r },
      update: { activeCount: r.activeCount, refName: r.refName, refCode: r.refCode },
    });
  }
  return { period, rows: rows.length };
}
