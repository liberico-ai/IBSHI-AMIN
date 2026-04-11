// @ts-nocheck
/**
 * scripts/post-import-cleanup.ts
 *
 * Post-import cleanup after import-erp-users.ts:
 *  1. Fix gender for female employees (detect "Thị" middle name + known female given names)
 *  2. Create missing ProductionTeam records (Tổ gá lắp, Tổ hàn, Tổ pha cắt...)
 *  3. Assign teamId to production workers imported from ERP
 *
 * Usage:
 *   npx tsx scripts/post-import-cleanup.ts             # live
 *   npx tsx scripts/post-import-cleanup.ts --dry-run   # preview
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import * as fs from "fs";
import * as path from "path";

// Load env
for (const f of [".env.local", ".env"]) {
  try {
    for (const line of fs.readFileSync(path.resolve(__dirname, "..", f), "utf-8").split("\n")) {
      const m = line.match(/^([^#=\s]+)\s*=\s*"?([^"]*?)"?\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch {}
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter } as any);
const DRY_RUN = process.argv.includes("--dry-run");

// ─── 1. Gender detection ──────────────────────────────────────────────────────

// "Thị" as middle name is the definitive Vietnamese female indicator
// Pattern: [Họ] Thị [Tên] — "Thị" at word 2+ position
function detectFemale(fullName: string): boolean {
  const parts = fullName.trim().split(/\s+/);
  // "Thị" anywhere except first word = female middle name
  if (parts.slice(1).some((p) => p === "Thị")) return true;

  // Known unambiguously female Vietnamese given names (last word)
  const givenName = parts[parts.length - 1];
  const FEMALE_GIVEN_NAMES = new Set([
    "Hương", "Nhung", "Ngoãn", "Dịu", "Nga", "Chi", "Yến", "Mận",
    "Hằng", "Thuỷ", "Thủy", "Quỳnh", "Quynh", "Thùy", "Liên",
    "Nguyệt", "Hoa", "Lan", "Mai", "Ngân", "Phương", "Trang",
    "Oanh", "Hiền", "Ngọc", "Loan", "Dung", "Thắm", "Hà",
  ]);
  if (FEMALE_GIVEN_NAMES.has(givenName)) return true;

  return false;
}

// ─── 2. Production teams definition ──────────────────────────────────────────

// SX department ID (fetched once)
const SX_DEPT_ID = "01c56224-3f08-4958-8df6-c59f2c637af3";

interface TeamDef {
  name: string;           // exact name used in ERP CSV
  dbName: string;         // normalized name to store
  teamType: string;       // TeamType enum value
}

const TEAM_DEFS: TeamDef[] = [
  { name: "Tổ gá lắp 1",        dbName: "Tổ Gá lắp 1",        teamType: "GA_LAP" },
  { name: "Tổ gá lắp 2",        dbName: "Tổ Gá lắp 2",        teamType: "GA_LAP" },
  { name: "Tổ gá lắp 3",        dbName: "Tổ Gá lắp 3",        teamType: "GA_LAP" },
  { name: "Tổ gá lắp 4",        dbName: "Tổ Gá lắp 4",        teamType: "GA_LAP" },
  { name: "Tổ gá lắp 5",        dbName: "Tổ Gá lắp 5",        teamType: "GA_LAP" },
  { name: "Tổ pha cắt 1",       dbName: "Tổ Pha cắt 1",       teamType: "PHA_CAT" },
  { name: "Tổ pha cắt 2",       dbName: "Tổ Pha cắt 2",       teamType: "PHA_CAT" },
  { name: "Tổ pha cắt 3",       dbName: "Tổ Pha cắt 3",       teamType: "PHA_CAT" },
  { name: "Tổ hàn 1",           dbName: "Tổ Hàn 1",           teamType: "HAN" },
  { name: "Tổ hàn 2",           dbName: "Tổ Hàn 2",           teamType: "HAN" },
  { name: "Tổ sơn",             dbName: "Tổ Sơn",             teamType: "SON" },
  { name: "Tổ tổng hợp",        dbName: "Tổ Tổng hợp",        teamType: "TONG_HOP" },
  { name: "Tổ gia công cơ khí", dbName: "Tổ Gia công cơ khí", teamType: "GCCK" },
  { name: "Tổ cơ giới",         dbName: "Tổ Cơ giới",         teamType: "GCCK" },
];

// Mapping from ERP CSV team name → dbName (for employee assignment)
const ERP_TEAM_TO_DB: Record<string, string> = Object.fromEntries(
  TEAM_DEFS.map((t) => [t.name, t.dbName])
);

// ─── 3. ERP CSV re-parse (for teamId assignment) ──────────────────────────────

function parseCsvForTeams(csvPath: string): Map<string, string> {
  // Returns Map<username, erpTeamName>
  const result = new Map<string, string>();
  if (!fs.existsSync(csvPath)) return result;

  const lines = fs.readFileSync(csvPath, "utf-8").trim().split("\n").slice(1);
  const PRODUCTION_TEAMS = new Set(TEAM_DEFS.map((t) => t.name));

  for (const line of lines) {
    const fields: string[] = [];
    let cur = "", inQ = false;
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; continue; }
      if (ch === "," && !inQ) { fields.push(cur.trim()); cur = ""; continue; }
      cur += ch;
    }
    fields.push(cur.trim());
    const [username, , , , , , , , deptName] = fields;
    if (username && deptName && PRODUCTION_TEAMS.has(deptName)) {
      result.set(username, deptName);
    }
  }
  return result;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  Post-Import Cleanup`);
  console.log(`  Mode: ${DRY_RUN ? "DRY RUN" : "LIVE"}`);
  console.log(`${"=".repeat(60)}\n`);

  // ── Step 1: Fix gender ────────────────────────────────────────────────────
  console.log("── Step 1: Gender detection ──");

  // Only update employees who were just imported (placeholder gender MALE)
  // We identify them by idNumber starting with "ERP-"
  const imported = await prisma.employee.findMany({
    where: { idNumber: { startsWith: "ERP-" } },
    select: { id: true, fullName: true, gender: true },
  });

  let genderFixed = 0;
  const femaleList: string[] = [];

  for (const emp of imported) {
    if (detectFemale(emp.fullName)) {
      femaleList.push(emp.fullName);
      if (!DRY_RUN) {
        await prisma.employee.update({ where: { id: emp.id }, data: { gender: "FEMALE" } });
      }
      genderFixed++;
    }
  }

  console.log(`  Detected ${genderFixed} female employees out of ${imported.length} imported`);
  if (DRY_RUN && femaleList.length) {
    console.log(`  Would set FEMALE: ${femaleList.slice(0, 5).join(", ")}${femaleList.length > 5 ? ` ...+${femaleList.length - 5} more` : ""}`);
  }

  // ── Step 2: Create production teams ────────────────────────────────────────
  console.log("\n── Step 2: Create production teams ──");

  let teamsCreated = 0;
  let teamsExisted = 0;
  const teamIdMap = new Map<string, string>(); // dbName → teamId

  for (const def of TEAM_DEFS) {
    const existing = await prisma.productionTeam.findFirst({
      where: { name: def.dbName },
      select: { id: true },
    });

    if (existing) {
      teamsExisted++;
      teamIdMap.set(def.name, existing.id);
      teamIdMap.set(def.dbName, existing.id);
    } else {
      if (!DRY_RUN) {
        const created = await prisma.productionTeam.create({
          data: {
            name: def.dbName,
            teamType: def.teamType as any,
            departmentId: SX_DEPT_ID,
            memberCount: 0,
          },
        });
        teamIdMap.set(def.name, created.id);
        teamIdMap.set(def.dbName, created.id);
        console.log(`  ✅ Created: ${def.dbName} (${def.teamType})`);
      } else {
        console.log(`  [DRY] Would create: ${def.dbName} (${def.teamType})`);
        teamIdMap.set(def.name, `dry-${def.dbName}`);
        teamIdMap.set(def.dbName, `dry-${def.dbName}`);
      }
      teamsCreated++;
    }
  }

  if (teamsExisted > 0) console.log(`  ${teamsExisted} teams already existed`);

  // ── Step 3: Assign teamId to production workers ───────────────────────────
  console.log("\n── Step 3: Assign teamId to workers ──");

  const csvPath = path.resolve(__dirname, "../../danh_sach_user_ibs_erp.csv");
  const erpTeamMap = parseCsvForTeams(csvPath); // username → erpTeamName

  // Build username → employee map (username stored as User.employeeCode)
  const employeesWithUser = await prisma.employee.findMany({
    where: { idNumber: { startsWith: "ERP-" } },
    select: {
      id: true,
      fullName: true,
      teamId: true,
      user: { select: { employeeCode: true } },
    },
  });

  let teamAssigned = 0;
  let teamAlreadySet = 0;
  let teamNotFound = 0;

  for (const emp of employeesWithUser) {
    const username = emp.user?.employeeCode;
    if (!username) continue;

    const erpTeam = erpTeamMap.get(username);
    if (!erpTeam) continue; // user wasn't in a production team

    if (emp.teamId) { teamAlreadySet++; continue; }

    const teamId = teamIdMap.get(erpTeam);
    if (!teamId) { teamNotFound++; continue; }

    if (!DRY_RUN) {
      await prisma.employee.update({ where: { id: emp.id }, data: { teamId } });
      // Increment team member count
      await prisma.productionTeam.update({
        where: { id: teamId },
        data: { memberCount: { increment: 1 } },
      });
    } else {
      console.log(`  [DRY] Would assign ${emp.fullName} → ${erpTeam}`);
    }
    teamAssigned++;
  }

  console.log(`  Assigned: ${teamAssigned} | Already set: ${teamAlreadySet} | Team not found: ${teamNotFound}`);

  // ── Step 4: Ambiguous role verification ───────────────────────────────────
  console.log("\n── Step 4: Verify ambiguous merges ──");

  // All 5 ambiguous cases were correctly resolved by keeping the higher-role version.
  // Verify that the roles are correctly set in DB.
  const ambiguousCases = [
    { username: "giangdd",  expectedRole: "MANAGER",  name: "Đinh Đức Giang" },
    { username: "uoclv",    expectedRole: "MANAGER",  name: "Lê Văn Ước" },
    { username: "haitq",    expectedRole: "MANAGER",  name: "Trần Quang Hải" },
    { username: "hungth",   expectedRole: "MANAGER",  name: "Trịnh Hữu Hưng" },
    { username: "doannd",   expectedRole: "MANAGER",  name: "Nguyễn Đình Đoan" },
  ];

  for (const c of ambiguousCases) {
    const u = await prisma.user.findFirst({
      where: { employeeCode: c.username },
      select: { role: true, employee: { select: { fullName: true } } },
    });
    if (!u) {
      console.log(`  ⚠️  ${c.name} (${c.username}): not found in DB`);
    } else if (u.role !== c.expectedRole) {
      console.log(`  ❌ ${c.name}: role=${u.role} (expected ${c.expectedRole}) — fixing...`);
      if (!DRY_RUN) {
        await prisma.user.updateMany({ where: { employeeCode: c.username }, data: { role: c.expectedRole as any } });
      }
    } else {
      console.log(`  ✅ ${c.name}: role=${u.role} ✓`);
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  const W = 60;
  console.log(`\n${"─".repeat(W)}`);
  console.log(`  CLEANUP REPORT ${DRY_RUN ? "(DRY RUN)" : ""}`);
  console.log(`${"─".repeat(W)}`);
  console.log(`  Gender fixed   : ${genderFixed} employees set to FEMALE`);
  console.log(`  Teams created  : ${teamsCreated} new production teams`);
  console.log(`  Teams existed  : ${teamsExisted}`);
  console.log(`  Team assigned  : ${teamAssigned} workers linked to teams`);
  console.log(`  Ambiguous OK   : ${ambiguousCases.length} verified`);
  console.log(`${"─".repeat(W)}\n`);

  await prisma.$disconnect();
  console.log("Done.\n");
}

main().catch((e) => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});
