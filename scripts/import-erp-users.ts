// @ts-nocheck
/**
 * scripts/import-erp-users.ts
 *
 * Import users from danh_sach_user_ibs_erp.csv into IBS ONE Platform.
 *
 * Usage:
 *   npx tsx scripts/import-erp-users.ts                    # live run
 *   npx tsx scripts/import-erp-users.ts --dry-run          # preview only
 *   npx tsx scripts/import-erp-users.ts --csv /path/to/file.csv
 *
 * What it does:
 *  1. Parse CSV
 *  2. Deduplicate by full name (keep highest-role record, store ERP code)
 *  3. Map ERP roles (R01–R11) → system UserRole enum
 *  4. Resolve department name → Department.id (or production team → SX dept)
 *  5. Resolve / create default Position per role tier
 *  6. Generate email (username@ibs.com.vn), random temp password
 *  7. Upsert User + Employee in a transaction (skips existing usernames)
 *  8. Print detailed report
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import * as fs from "fs";
import * as path from "path";
// Load .env.local for DATABASE_URL (Next.js convention)
const envFiles = [
  path.resolve(__dirname, "../.env.local"),
  path.resolve(__dirname, "../.env"),
];
for (const f of envFiles) {
  if (fs.existsSync(f)) {
    const lines = fs.readFileSync(f, "utf-8").split("\n");
    for (const line of lines) {
      const m = line.match(/^([^#=\s]+)\s*=\s*"?([^"]*)"?\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  }
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter } as any);
const DRY_RUN = process.argv.includes("--dry-run");

const csvArgIdx = process.argv.indexOf("--csv");
const CSV_PATH =
  csvArgIdx !== -1
    ? process.argv[csvArgIdx + 1]
    : path.resolve(__dirname, "../../danh_sach_user_ibs_erp.csv");

// ─── Role mapping ─────────────────────────────────────────────────────────────
const ROLE_MAP: Record<string, string> = {
  R01: "BOM",
  R02: "MANAGER",
  R02a: "EMPLOYEE",
  R03: "MANAGER",
  R03a: "EMPLOYEE",
  R04: "MANAGER",
  R04a: "EMPLOYEE",
  R05: "MANAGER",
  R05a: "EMPLOYEE",
  R06: "MANAGER",
  R06a: "TEAM_LEAD",
  R06b: "EMPLOYEE",
  R07: "MANAGER",
  R07a: "EMPLOYEE",
  R08: "MANAGER",
  R08a: "EMPLOYEE",
  R09: "MANAGER",
  R09a: "EMPLOYEE",
  R10: "HR_ADMIN",
  R11: "HR_ADMIN",
};

// Priority for dedup: higher = keep this record when two entries have same name
const ROLE_PRIORITY: Record<string, number> = {
  R01: 10, R10: 9, R11: 8,
  R02: 7, R03: 7, R04: 7, R05: 7, R06: 7, R07: 7, R08: 7, R09: 7,
  R06a: 5,
  R02a: 3, R03a: 3, R04a: 3, R05a: 3, R07a: 3, R08a: 3, R09a: 3,
  R06b: 1,
};

// ─── Department alias mapping ─────────────────────────────────────────────────
// Maps free-form CSV phòng ban names → exact Department.name in DB
// DB departments: Ban Giám đốc, P. HCNS, P. Kế toán, P. Kinh doanh,
//                 P. Kỹ thuật, P. QAQC, P. QLDA, P. Sản xuất, P. Thiết bị, P. Thương mại
const DEPT_ALIASES: Record<string, string> = {
  // ERP shortnames
  "Ban Giám đốc": "Ban Giám đốc",
  "Quản lý Dự án": "P. QLDA",
  "Kinh tế Kế hoạch": "P. QLDA",          // KTKH merged into QLDA
  "Thiết kế": "P. Kỹ thuật",
  "Kho vận": "P. Thiết bị",               // closest match for warehouse/logistics
  "Bộ phận Kho": "P. Thiết bị",
  "Sản xuất": "P. Sản xuất",
  "Thương mại": "P. Thương mại",
  "Kế toán": "P. Kế toán",
  "Chất lượng": "P. QAQC",
  // ERP "Phòng X" → canonical
  "Phòng Quản lý Sản xuất": "P. Sản xuất",
  "Phòng Kinh doanh": "P. Kinh doanh",
  "Phòng Dự án": "P. QLDA",
  "Phòng Chất lượng": "P. QAQC",
  "Phòng Thiết kế": "P. Kỹ thuật",
  "Phòng Tài chính kế toán": "P. Kế toán",
  "Phòng Hành chính Nhân sự": "P. HCNS",
  "Phòng Thương mại": "P. Thương mại",
  "Phòng Kinh doanh": "P. Kinh doanh",
};

// Production team names: employee belongs to SX dept, teamId resolved separately
const PRODUCTION_TEAM_NAMES = new Set([
  "Tổ gia công cơ khí",
  "Tổ gá lắp 1", "Tổ gá lắp 2", "Tổ gá lắp 3", "Tổ gá lắp 4", "Tổ gá lắp 5",
  "Tổ pha cắt 1", "Tổ pha cắt 2", "Tổ pha cắt 3",
  "Tổ hàn 1", "Tổ hàn 2",
  "Tổ sơn", "Tổ tổng hợp", "Tổ cơ giới",
]);

// ─── Position tier per role ───────────────────────────────────────────────────
// Which PositionLevel to use when creating a default position for this role
const ROLE_TO_POSITION_LEVEL: Record<string, string> = {
  BOM: "C_LEVEL",
  HR_ADMIN: "MANAGER",
  MANAGER: "MANAGER",
  TEAM_LEAD: "TEAM_LEAD",
  EMPLOYEE: "SPECIALIST",
};

const DEFAULT_POSITION_NAMES: Record<string, string> = {
  C_LEVEL: "Ban Giám đốc",
  MANAGER: "Trưởng phòng",
  TEAM_LEAD: "Tổ trưởng",
  SPECIALIST: "Nhân viên",
  WORKER: "Công nhân",
};

// ─── CSV parser ───────────────────────────────────────────────────────────────
interface CsvRow {
  username: string;
  fullName: string;
  email: string;
  roleCode: string;
  roleName: string;
  level: number;
  status: string;
  telegram: string;
  deptName: string;
  createdAt: string;
}

function parseCsv(filePath: string): CsvRow[] {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.trim().split("\n");
  const rows: CsvRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Simple quoted-CSV parser
    const fields: string[] = [];
    let cur = "";
    let inQ = false;
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; continue; }
      if (ch === "," && !inQ) { fields.push(cur.trim()); cur = ""; continue; }
      cur += ch;
    }
    fields.push(cur.trim());

    if (!fields[0]) continue;
    rows.push({
      username: fields[0],
      fullName: fields[1] || "",
      email: fields[2] || "",
      roleCode: fields[3] || "",
      roleName: fields[4] || "",
      level: parseInt(fields[5]) || 2,
      status: fields[6] || "",
      telegram: fields[7] || "",
      deptName: fields[8] || "",
      createdAt: fields[9] || "",
    });
  }
  return rows;
}

// ─── Dedup logic ──────────────────────────────────────────────────────────────
interface Deduped {
  primaryUsername: string;   // username to use for login (email prefix)
  erpCode: string;           // nv-code or username (for reference)
  fullName: string;
  roleCode: string;
  deptName: string;
  telegram: string;
  duplicateUsernames: string[];  // other usernames that were merged
  ambiguous: boolean;            // same name but very different roles → flag
}

function deduplicate(rows: CsvRow[]): Deduped[] {
  // Group by fullName
  const groups = new Map<string, CsvRow[]>();
  for (const row of rows) {
    const key = row.fullName.trim().toLowerCase();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }

  const result: Deduped[] = [];

  for (const [, group] of groups) {
    if (group.length === 1) {
      const r = group[0];
      const isNvCode = /^nv\d+$/i.test(r.username);
      result.push({
        primaryUsername: r.username,
        erpCode: r.username,
        fullName: r.fullName,
        roleCode: r.roleCode,
        deptName: r.deptName,
        telegram: r.telegram,
        duplicateUsernames: [],
        ambiguous: false,
      });
      continue;
    }

    // Multiple entries with same name → dedup
    // Sort by priority descending (highest role wins)
    group.sort((a, b) => {
      const pa = ROLE_PRIORITY[a.roleCode] ?? 0;
      const pb = ROLE_PRIORITY[b.roleCode] ?? 0;
      if (pb !== pa) return pb - pa;
      // Same role priority: prefer shortname (non-nv-code) as primary
      const aIsNv = /^nv\d+$/i.test(a.username);
      const bIsNv = /^nv\d+$/i.test(b.username);
      if (aIsNv !== bIsNv) return aIsNv ? 1 : -1;
      return 0;
    });

    const primary = group[0];
    const others = group.slice(1);

    // Find nv-code for reference
    const nvRecord = group.find((r) => /^nv\d+$/i.test(r.username));
    const erpCode = nvRecord ? nvRecord.username : primary.username;

    // Detect ambiguous: roles come from very different departments/tiers
    const roleTiers = group.map((r) => ROLE_MAP[r.roleCode] ?? "EMPLOYEE");
    const uniqueTiers = new Set(roleTiers);
    const ambiguous =
      (uniqueTiers.has("BOM") && uniqueTiers.has("EMPLOYEE")) ||
      (uniqueTiers.has("MANAGER") && uniqueTiers.has("EMPLOYEE") &&
        group.some((r) => r.deptName !== primary.deptName && r.deptName !== ""));

    result.push({
      primaryUsername: primary.username,
      erpCode,
      fullName: primary.fullName,
      roleCode: primary.roleCode,
      deptName: primary.deptName || others.find((r) => r.deptName)?.deptName || "",
      telegram: primary.telegram === "Đã liên kết"
        ? primary.telegram
        : (others.find((r) => r.telegram === "Đã liên kết")?.telegram ?? primary.telegram),
      duplicateUsernames: others.map((r) => r.username),
      ambiguous,
    });
  }

  return result;
}

// ─── Generate next Employee code ──────────────────────────────────────────────
async function nextEmployeeCode(offset = 0): Promise<string> {
  const last = await prisma.employee.findFirst({
    where: { code: { startsWith: "IBS-" } },
    orderBy: { code: "desc" },
    select: { code: true },
  });
  const maxNum = last ? (parseInt(last.code.replace("IBS-", "")) || 0) : 0;
  return `IBS-${String(maxNum + 1 + offset).padStart(3, "0")}`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  IBS ONE — ERP User Import`);
  console.log(`  Mode: ${DRY_RUN ? "DRY RUN (no DB writes)" : "LIVE"}`);
  console.log(`  CSV : ${CSV_PATH}`);
  console.log(`${"=".repeat(60)}\n`);

  if (!fs.existsSync(CSV_PATH)) {
    console.error(`❌ CSV file not found: ${CSV_PATH}`);
    process.exit(1);
  }

  // ── Step 1: Parse + dedup ────────────────────────────────────────────────
  const raw = parseCsv(CSV_PATH);
  console.log(`📄 Parsed ${raw.length} raw rows from CSV`);

  const deduped = deduplicate(raw);
  const duplicateCount = raw.length - deduped.length;
  console.log(`🔧 After dedup: ${deduped.length} unique users (${duplicateCount} merged)\n`);

  // ── Step 2: Load DB lookups ───────────────────────────────────────────────
  const departments = await prisma.department.findMany({
    select: { id: true, name: true, code: true },
  });
  // Index by exact name AND by code for reliable lookup
  const deptByName = new Map(departments.map((d) => [d.name.toLowerCase(), d]));
  const deptByCode = new Map(departments.map((d) => [d.code.toLowerCase(), d]));

  const productionTeams = await prisma.productionTeam.findMany({
    select: { id: true, name: true, departmentId: true },
  });
  const teamByName = new Map(productionTeams.map((t) => [t.name.toLowerCase(), t]));

  const positions = await prisma.position.findMany({
    select: { id: true, name: true, level: true },
  });
  const positionByLevel = new Map<string, { id: string; name: string }>();
  for (const p of positions) {
    if (!positionByLevel.has(p.level)) positionByLevel.set(p.level, p);
  }

  // Load existing users to skip duplicates
  const existingUsers = await prisma.user.findMany({
    select: { employeeCode: true, email: true },
  });
  const existingCodes = new Set(existingUsers.map((u) => u.employeeCode.toLowerCase()));
  const existingEmails = new Set(existingUsers.map((u) => u.email.toLowerCase()));

  console.log(`🗄️  DB state: ${departments.length} depts, ${positions.length} positions, ${existingUsers.length} existing users\n`);

  // ── Step 3: Process each user ─────────────────────────────────────────────
  const results = {
    created: [] as string[],
    skipped: [] as { username: string; reason: string }[],
    ambiguous: [] as { username: string; fullName: string; merged: string[] }[],
    noPosition: [] as string[],
    noDept: [] as string[],
  };

  let empCodeOffset = 0;

  for (const row of deduped) {
    const label = `[${row.primaryUsername}] ${row.fullName}`;

    // Track ambiguous for report
    if (row.ambiguous) {
      results.ambiguous.push({
        username: row.primaryUsername,
        fullName: row.fullName,
        merged: row.duplicateUsernames,
      });
    }

    // Skip if already in system
    if (existingCodes.has(row.primaryUsername.toLowerCase())) {
      results.skipped.push({ username: row.primaryUsername, reason: "employeeCode already exists" });
      continue;
    }

    // Generate email
    const baseEmail = `${row.primaryUsername}@ibs.com.vn`;
    let email = baseEmail;
    let emailSuffix = 1;
    while (existingEmails.has(email.toLowerCase())) {
      email = `${row.primaryUsername}${emailSuffix}@ibs.com.vn`;
      emailSuffix++;
    }
    existingEmails.add(email.toLowerCase()); // reserve

    // Map role
    const systemRole = ROLE_MAP[row.roleCode] ?? "EMPLOYEE";

    // Resolve department
    let deptId: string | null = null;
    let teamId: string | null = null;
    const csvDept = row.deptName.trim();

    if (PRODUCTION_TEAM_NAMES.has(csvDept)) {
      // Production team → find team, fallback to SX dept
      const team = teamByName.get(csvDept.toLowerCase());
      if (team) {
        teamId = team.id;
        deptId = team.departmentId;
      } else {
        // Fallback: look for any dept that looks like SX
        const sxDept = [...deptByName.values()].find(
          (d) => d.name.includes("Sản xuất") || d.code === "SX"
        );
        deptId = sxDept?.id ?? null;
        results.noDept.push(`${label} (team "${csvDept}" not found in DB)`);
      }
    } else if (csvDept) {
      const canonical = DEPT_ALIASES[csvDept] ?? csvDept;
      const dept = deptByName.get(canonical.toLowerCase());
      if (dept) {
        deptId = dept.id;
      } else {
        // Fuzzy fallback: partial match
        const fuzzy = [...deptByName.values()].find(
          (d) => d.name.toLowerCase().includes(csvDept.toLowerCase().replace(/^phòng\s*/i, ""))
        );
        deptId = fuzzy?.id ?? null;
        if (!deptId) {
          results.noDept.push(`${label} (dept "${csvDept}" not found)`);
        }
      }
    } else {
      results.noDept.push(`${label} (empty dept in CSV)`);
    }

    // Resolve position
    const posLevel = ROLE_TO_POSITION_LEVEL[systemRole] ?? "SPECIALIST";
    let positionId: string | null = positionByLevel.get(posLevel)?.id ?? null;

    if (!positionId) {
      results.noPosition.push(`${label} — needs position level ${posLevel}`);
      // Will create placeholder position below (or skip Employee)
    }

    // Generate temp password
    const tempPassword = randomBytes(6).toString("hex");
    const passwordHash = await bcrypt.hash(tempPassword, 10);

    const empCode = await nextEmployeeCode(empCodeOffset++);

    if (DRY_RUN) {
      console.log(
        `  [DRY] Would create: ${label} | ${email} | role=${systemRole} | dept=${deptId ?? "MISSING"} | empCode=${empCode}`
      );
      results.created.push(`${row.primaryUsername} (${row.fullName})`);
      continue;
    }

    // ── Live: create User + Employee in transaction ──────────────────────
    try {
      await prisma.$transaction(async (tx) => {
        // Ensure position exists
        if (!positionId) {
          const posName = DEFAULT_POSITION_NAMES[posLevel] ?? "Nhân viên";
          const newPos = await tx.position.upsert({
            where: { id: `auto-${posLevel.toLowerCase()}` },
            create: {
              id: `auto-${posLevel.toLowerCase()}`,
              name: posName,
              level: posLevel as any,
            },
            update: {},
          });
          positionId = newPos.id;
          positionByLevel.set(posLevel, newPos); // cache
        }

        // Create User
        const user = await tx.user.create({
          data: {
            employeeCode: row.primaryUsername, // old ERP username as code
            email,
            passwordHash,
            role: systemRole as any,
            isActive: row.status === "Đang hoạt động",
            forcePasswordChange: true,
          },
        });

        // Create Employee (placeholder required fields)
        await tx.employee.create({
          data: {
            userId: user.id,
            code: empCode,
            fullName: row.fullName,
            gender: "MALE" as any,           // placeholder — must be updated
            dateOfBirth: new Date("1990-01-01"), // placeholder
            idNumber: `ERP-${row.erpCode}`,  // store ERP code here for reference
            phone: "000000000",              // placeholder
            address: "Chưa cập nhật",        // placeholder
            departmentId: deptId ?? departments[0]?.id, // fallback to first dept if missing
            positionId: positionId!,
            teamId: teamId ?? undefined,
            startDate: new Date(row.createdAt || "2026-01-01"),
            status: "ACTIVE",
          },
        });
      });

      results.created.push(`${row.primaryUsername} (${row.fullName})`);
    } catch (err: any) {
      results.skipped.push({
        username: row.primaryUsername,
        reason: err?.message?.split("\n")[0] ?? String(err),
      });
    }
  }

  // ── Step 4: Print report ──────────────────────────────────────────────────
  const W = 60;
  console.log(`\n${"─".repeat(W)}`);
  console.log(`  IMPORT REPORT ${DRY_RUN ? "(DRY RUN)" : ""}`);
  console.log(`${"─".repeat(W)}`);
  console.log(`  ✅ Created : ${results.created.length}`);
  console.log(`  ⏭️  Skipped : ${results.skipped.length}`);
  console.log(`  ⚠️  No dept : ${results.noDept.length}`);
  console.log(`  ⚠️  No pos  : ${results.noPosition.length}`);
  console.log(`  🔀 Ambiguous: ${results.ambiguous.length}`);
  console.log(`${"─".repeat(W)}\n`);

  if (results.skipped.length) {
    console.log("⏭️  SKIPPED:");
    for (const s of results.skipped) console.log(`   • ${s.username}: ${s.reason}`);
    console.log();
  }

  if (results.noDept.length) {
    console.log("⚠️  DEPT NOT RESOLVED (assigned to fallback dept, update manually):");
    for (const s of results.noDept) console.log(`   • ${s}`);
    console.log();
  }

  if (results.noPosition.length) {
    console.log("⚠️  POSITION NOT FOUND (placeholder created):");
    for (const s of results.noPosition) console.log(`   • ${s}`);
    console.log();
  }

  if (results.ambiguous.length) {
    console.log("🔀 AMBIGUOUS MERGES (same name, different roles — verify manually):");
    for (const a of results.ambiguous) {
      console.log(`   • ${a.fullName} (kept: ${a.username}, merged: ${a.merged.join(", ")})`);
    }
    console.log();
  }

  if (!DRY_RUN) {
    console.log(`\n📋 POST-IMPORT CHECKLIST:`);
    console.log(`   1. Update Employee.gender for female staff (Thị, Xuân, Hương...)`);
    console.log(`   2. Update Employee.dateOfBirth, idNumber, phone, address`);
    console.log(`   3. Verify department assignments for flagged users above`);
    console.log(`   4. Production team workers: verify teamId assignments`);
    console.log(`   5. Telegram: re-link accounts that were previously connected`);
    console.log(`   6. All users have forcePasswordChange=true (login will prompt reset)`);
    console.log();
  }

  console.log("Done.\n");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});
