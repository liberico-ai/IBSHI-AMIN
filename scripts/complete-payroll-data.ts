// Hoàn tất dữ liệu để chạy bảng lương T4/2026:
//   1. Tạo NV mới: 190840 Nguyễn Đức Hiếu (file lương khách có, DB chưa)
//   2. Tạo HĐ ACTIVE + allowances cho 13 NV chưa có HĐ
//      (mức chính + KPI lấy từ file lương khách)
//
// Chạy: npx tsx --env-file=.env scripts/complete-payroll-data.ts          (dry-run)
//       npx tsx --env-file=.env scripts/complete-payroll-data.ts --apply

import * as XLSX from "xlsx";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { hash } from "bcryptjs";

const APPLY = process.argv.includes("--apply");
const F = "C:/Users/sontt/Downloads/HSNS và Lương/Bảng lương 04.2026 (11.05.2026).xls";
const START_DATE = new Date("2026-04-01");

// Map "bộ phận" trong file lương → { departmentId, teamId? } trong DB
// Lấy từ list teams/depts đã in trước đó. Tổ trực tiếp = không "Tổ" prefix.
const DEPT = {
  SAN_XUAT: "92d578a4-7abc-4547-a32a-e99a6d675099",
  KY_THUAT: "20677755-aa3a-48de-bc7a-bba8d0a718d3",
  THUONG_MAI: "d133e26e-bde6-452f-843b-bafd4e0e0443",
  HCNS: "06e07e74-2e93-4646-a722-51b0b82edf37",
};
const TEAM = {
  GA_LAP_3: "4d23b629-a477-456f-93b0-de4739b5a2cc",
  GA_LAP_4: "4c6dd861-3267-4440-8c8e-9c84b546129f",
  PHA_CAT_2: "371140fa-3a6a-426c-ae4f-041f73b02601",
  PHA_CAT_3: "9284d934-ba24-41b4-9592-3650ddc852ea",
  HAN_1: "728b9c89-db49-473e-8dbf-0684c2bee01c",
  GCCK: "7cac13d6-b6e6-43b6-a6ba-6a2875784ebd",
  SON: "9bf5d8c6-1e7b-4dd0-9157-9b8df6aa8c95",
};

function mapDept(text: string): { departmentId: string; teamId: string | null } {
  const t = text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
  if (t.includes("phong thiet ke")) return { departmentId: DEPT.KY_THUAT, teamId: null };
  if (t.includes("phong thuong mai")) return { departmentId: DEPT.THUONG_MAI, teamId: null };
  if (t.includes("phong hanh chinh")) return { departmentId: DEPT.HCNS, teamId: null };
  if (t.includes("ga lap 3")) return { departmentId: DEPT.SAN_XUAT, teamId: TEAM.GA_LAP_3 };
  if (t.includes("ga lap 4")) return { departmentId: DEPT.SAN_XUAT, teamId: TEAM.GA_LAP_4 };
  if (t.includes("pha cat 2")) return { departmentId: DEPT.SAN_XUAT, teamId: TEAM.PHA_CAT_2 };
  if (t.includes("pha cat 3")) return { departmentId: DEPT.SAN_XUAT, teamId: TEAM.PHA_CAT_3 };
  if (t.includes("han 1")) return { departmentId: DEPT.SAN_XUAT, teamId: TEAM.HAN_1 };
  if (t.includes("gia cong co khi") || t.includes("co khi")) return { departmentId: DEPT.SAN_XUAT, teamId: TEAM.GCCK };
  if (t.includes("to son") || t === "son") return { departmentId: DEPT.SAN_XUAT, teamId: TEAM.SON };
  // mặc định gián tiếp HCNS (sẽ log để xem lại)
  console.warn(`  ⚠️ Không map được "${text}" → mặc định P. HCNS`);
  return { departmentId: DEPT.HCNS, teamId: null };
}

interface FileNV {
  ma: string; name: string; deptText: string; chucDanh: string;
  mucChinh: number; kpi: number; responsibility: number; xangXe: number;
}

function readFile(): FileNV[] {
  const wb = XLSX.readFile(F);
  const out: FileNV[] = [];
  for (const sn of ["Chi tiết lương", "Lương thuê ngoài"]) {
    const ws = wb.Sheets[sn]; if (!ws) continue;
    const data = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: "", raw: true });
    for (let r = 9; r < data.length; r++) {
      const ma = String(data[r][1] ?? "").trim();
      // chỉ chấp nhận mã ≥ 4 chữ số (loại "1" garbage)
      if (!/^\d{4,}$/.test(ma)) continue;
      out.push({
        ma, name: String(data[r][2] ?? "").trim(), deptText: String(data[r][3] ?? "").trim(),
        chucDanh: String(data[r][4] ?? "").trim(),
        mucChinh: Number(data[r][12]) || 0,
        kpi: Number(data[r][16]) || 0,
        responsibility: Number(data[r][18]) || 0,
        xangXe: Number(data[r][19]) || 0,
      });
    }
  }
  return out;
}

function emailFrom(name: string): string {
  const parts = name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/[^a-z\s]/g, "").trim().split(/\s+/);
  const last = parts[parts.length - 1] || "nv";
  const first = parts[0]?.charAt(0) || "x";
  return `${last}.${first}`;
}

async function main() {
  console.log(APPLY ? "🚀 APPLY MODE" : "🔍 DRY-RUN");
  const rows = readFile();
  const byMa = new Map(rows.map((r) => [r.ma, r]));

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
  });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  const dbEmps = await prisma.employee.findMany({
    include: { user: { select: { id: true, erpCode: true } }, contracts: { where: { status: "ACTIVE" } } },
  });
  const dbByErp = new Map(dbEmps.filter((e) => e.user?.erpCode).map((e) => [e.user!.erpCode!, e]));

  // Position cache theo dept
  const posCache = new Map<string, string>();
  async function pickPos(deptId: string): Promise<string> {
    if (posCache.has(deptId)) return posCache.get(deptId)!;
    let p = await prisma.position.findFirst({ where: { departmentId: deptId, level: "WORKER" } });
    if (!p) p = await prisma.position.findFirst({ where: { departmentId: deptId } });
    if (!p) throw new Error(`Không có Position cho dept ${deptId}`);
    posCache.set(deptId, p.id);
    return p.id;
  }

  // ── 1. Tạo NV mới: NV trong file mà DB chưa có ──
  console.log(`\n1) Tạo NV mới (trong file lương, DB chưa có):`);
  const maxRes: any[] = await prisma.$queryRawUnsafe(
    `SELECT MAX(CAST(SUBSTRING(code FROM 5) AS INTEGER)) as max_num FROM "Employee" WHERE code LIKE 'IBS-%'`,
  );
  let nextNum = (Number(maxRes[0]?.max_num) || 0) + 1;
  const newCreated: any[] = [];

  for (const r of rows) {
    if (dbByErp.has(r.ma)) continue;
    const newCode = `IBS-${String(nextNum).padStart(3, "0")}`;
    nextNum++;
    const { departmentId, teamId } = mapDept(r.deptText);
    const isFemale = r.name.includes("Thị") || r.name.includes("Nữ");
    console.log(`   ➕ ${newCode} | ${r.name} | erpCode ${r.ma} | ${r.deptText} | ${r.chucDanh} | mức chính ${r.mucChinh.toLocaleString("vi-VN")} + KPI ${r.kpi.toLocaleString("vi-VN")}`);

    if (APPLY) {
      const positionId = await pickPos(departmentId);
      let base = emailFrom(r.name);
      let email = `${base}@ibs.vn`, suffix = 2;
      while (await prisma.user.findFirst({ where: { email } })) { email = `${base}${suffix}@ibs.vn`; suffix++; }
      const tempHash = await hash("123456", 10);
      const newUser = await prisma.user.create({
        data: { employeeCode: newCode, erpCode: r.ma, email, passwordHash: tempHash, role: "EMPLOYEE", isActive: true, forcePasswordChange: true },
      });
      const newEmp = await prisma.employee.create({
        data: {
          userId: newUser.id, code: newCode, fullName: r.name,
          gender: isFemale ? "FEMALE" : "MALE",
          dateOfBirth: new Date("1990-01-01"), idNumber: "000000000000", phone: "", address: "",
          departmentId, positionId, teamId,
          startDate: START_DATE, status: "ACTIVE", dependents: 0,
          fuelHousingEligible: r.xangXe > 0,
        },
      });
      // Tạo HĐ ACTIVE
      const allw: Record<string, number> = { kpi: r.kpi };
      if (r.responsibility > 0) allw.responsibility = r.responsibility;
      await prisma.contract.create({
        data: {
          employeeId: newEmp.id,
          contractNumber: `BACKFILL-LUONG-${r.ma}`,
          contractType: "INDEFINITE",
          position: r.chucDanh,
          startDate: START_DATE,
          endDate: null,
          baseSalary: r.mucChinh,
          insuranceSalary: r.mucChinh,
          allowances: allw,
          status: "ACTIVE",
        },
      });
      console.log(`     ✅ Đã tạo NV + HĐ (email ${email})`);
    }
    newCreated.push({ "Mã NV": newCode, "Họ tên": r.name, erpCode: r.ma, "Phòng ban (file)": r.deptText, "Chức danh": r.chucDanh, "Mức chính": r.mucChinh, KPI: r.kpi });
  }

  // ── 2. Tạo HĐ ACTIVE cho NV đã có nhưng thiếu HĐ ──
  console.log(`\n2) Tạo HĐ ACTIVE cho NV chưa có HĐ:`);
  const newContracts: any[] = [];

  for (const emp of dbEmps) {
    const erp = emp.user?.erpCode; if (!erp) continue;
    if (emp.contracts.length > 0) continue;
    const r = byMa.get(erp);
    if (!r) continue; // không có trong file lương
    console.log(`   ➕ HĐ cho ${emp.code} | ${emp.fullName} | erpCode ${erp} | ${r.chucDanh} | mức chính ${r.mucChinh.toLocaleString("vi-VN")} + KPI ${r.kpi.toLocaleString("vi-VN")}`);

    if (APPLY) {
      const allw: Record<string, number> = { kpi: r.kpi };
      if (r.responsibility > 0) allw.responsibility = r.responsibility;
      await prisma.contract.create({
        data: {
          employeeId: emp.id,
          contractNumber: `BACKFILL-LUONG-${erp}`,
          contractType: "INDEFINITE",
          position: r.chucDanh,
          startDate: START_DATE, endDate: null,
          baseSalary: r.mucChinh, insuranceSalary: r.mucChinh,
          allowances: allw, status: "ACTIVE",
        },
      });
      console.log(`     ✅ Đã tạo HĐ`);
    }
    newContracts.push({ "Mã NV": emp.code, "Họ tên": emp.fullName, erpCode: erp, "Chức danh": r.chucDanh, "Mức chính": r.mucChinh, KPI: r.kpi });
  }

  console.log(`\n📊 Tổng kết:`);
  console.log(`  ➕ NV mới: ${newCreated.length}`);
  console.log(`  ➕ HĐ ACTIVE mới: ${newContracts.length}`);
  console.log(APPLY ? "\n✅ HOÀN TẤT — anh chạy lại bảng lương để kiểm tra" : "\n⚠️ DRY-RUN — chạy lại với --apply để thực thi");

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
