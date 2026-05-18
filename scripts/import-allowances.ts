// Import phụ cấp HĐ + cờ fuelHousingEligible từ Bảng lương T4 → DB
//   Contract.allowances = { phone, fuel, housing, responsibility }   (cột N/O/P/S)
//   Employee.fuelHousingEligible = (cột T == 200000)
//
// Chạy:
//   Dry-run: npx tsx scripts/import-allowances.ts
//   Apply:   npx tsx scripts/import-allowances.ts --apply

import * as XLSX from "xlsx";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const FILE_LUONG = "C:/Users/sontt/Downloads/HSNS và Lương/Bảng lương 04.2026 (11.05.2026).xls";
const OUTPUT = "C:/Users/sontt/Desktop/Bao-cao-import-phu-cap.xlsx";
const APPLY = process.argv.includes("--apply");

// Cột trong "Chi tiết lương"
const COL = { MA_NV: 1, HO_TEN: 2, PHONE: 13, FUEL: 14, HOUSING: 15, RESPONSIBILITY: 18, FUEL_HOUSING_200K: 19 };

function normName(s: string): string {
  return String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
}

async function main() {
  console.log(APPLY ? "🚀 APPLY MODE" : "🔍 DRY-RUN");

  const wb = XLSX.readFile(FILE_LUONG);
  const ws = wb.Sheets["Chi tiết lương"];
  const data = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: "", raw: true });

  type Row = { maNV: string; name: string; phone: number; fuel: number; housing: number; responsibility: number; fuelHousing200: boolean };
  const rows: Row[] = [];
  for (let r = 11; r < data.length; r++) {
    const row = data[r] || [];
    const maNV = String(row[COL.MA_NV] || "").trim();
    if (!/^\d+$/.test(maNV)) continue;
    rows.push({
      maNV,
      name: String(row[COL.HO_TEN] || "").trim(),
      phone: Math.round(Number(row[COL.PHONE]) || 0),
      fuel: Math.round(Number(row[COL.FUEL]) || 0),
      housing: Math.round(Number(row[COL.HOUSING]) || 0),
      responsibility: Math.round(Number(row[COL.RESPONSIBILITY]) || 0),
      fuelHousing200: Math.round(Number(row[COL.FUEL_HOUSING_200K]) || 0) >= 200000,
    });
  }
  console.log(`Đọc ${rows.length} NV từ Bảng lương T4`);

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
  });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  const dbEmps = await prisma.employee.findMany({
    include: {
      user: { select: { erpCode: true } },
      contracts: { where: { status: "ACTIVE" }, orderBy: { startDate: "desc" }, take: 1 },
    },
  });
  const dbByErp = new Map<string, (typeof dbEmps)[number]>();
  const dbByName = new Map<string, (typeof dbEmps)[number][]>();
  for (const e of dbEmps) {
    if (e.user?.erpCode) dbByErp.set(e.user.erpCode, e);
    const nn = normName(e.fullName);
    if (!dbByName.has(nn)) dbByName.set(nn, []);
    dbByName.get(nn)!.push(e);
  }

  const planContract: any[] = [];
  const planEligible: any[] = [];
  const notMatched: any[] = [];
  const noActiveContract: any[] = [];
  const usedIds = new Set<string>();

  for (const row of rows) {
    let db = dbByErp.get(row.maNV);
    let matchBy = db ? "erpCode" : null;
    if (!db) {
      const cands = dbByName.get(normName(row.name));
      if (cands && cands.length === 1) { db = cands[0]; matchBy = "tên"; }
      else if (cands && cands.length > 1) { db = cands.find((c) => !usedIds.has(c.id)) || cands[0]; matchBy = "tên (trùng)"; }
    }
    if (!db) { notMatched.push({ "Mã NV": row.maNV, "Họ tên": row.name }); continue; }
    if (usedIds.has(db.id)) continue;
    usedIds.add(db.id);

    // Eligible flag
    planEligible.push({ empId: db.id, "Mã NV": db.code, "Họ tên": db.fullName, "fuelHousingEligible": row.fuelHousing200, "Match": matchBy });

    // Contract.allowances
    const activeContract = db.contracts[0];
    if (!activeContract) {
      noActiveContract.push({ "Mã NV": db.code, "Họ tên": db.fullName });
      continue;
    }
    const allowances = {
      phone: row.phone,
      fuel: row.fuel,
      housing: row.housing,
      responsibility: row.responsibility,
    };
    planContract.push({
      contractId: activeContract.id,
      "Mã NV": db.code,
      "Họ tên": db.fullName,
      "Số HĐ": activeContract.contractNumber,
      "PC điện thoại": allowances.phone,
      "PC xăng xe": allowances.fuel,
      "PC nhà ở": allowances.housing,
      "PC trách nhiệm": allowances.responsibility,
      _allowances: allowances,
    });
  }

  console.log(`\n📊 Kết quả:`);
  console.log(`  Match được: ${usedIds.size}`);
  console.log(`  Cập nhật fuelHousingEligible: ${planEligible.length} (trong đó ${planEligible.filter((p) => p.fuelHousingEligible).length} NV = true)`);
  console.log(`  Cập nhật Contract.allowances: ${planContract.length}`);
  console.log(`  NV match nhưng KHÔNG có HĐ ACTIVE (skip allowances): ${noActiveContract.length}`);
  console.log(`  KHÔNG match: ${notMatched.length}`);

  if (APPLY) {
    console.log(`\n🚀 Đang apply...`);
    for (const p of planEligible) {
      await prisma.employee.update({ where: { id: p.empId }, data: { fuelHousingEligible: p.fuelHousingEligible } });
    }
    console.log(`  ✅ Updated ${planEligible.length} Employee.fuelHousingEligible`);
    for (const p of planContract) {
      await prisma.contract.update({ where: { id: p.contractId }, data: { allowances: p._allowances } });
    }
    console.log(`  ✅ Updated ${planContract.length} Contract.allowances`);
  }

  // Output
  const wbOut = XLSX.utils.book_new();
  const summary = [
    { Mục: "Mode", "Giá trị": APPLY ? "APPLY" : "DRY-RUN" },
    { Mục: "NV đọc từ Bảng lương T4", "Giá trị": rows.length },
    { Mục: "Match được với DB", "Giá trị": usedIds.size },
    { Mục: "Cập nhật fuelHousingEligible", "Giá trị": planEligible.length },
    { Mục: "   ↳ trong đó = true (nhận 200K)", "Giá trị": planEligible.filter((p) => p.fuelHousingEligible).length },
    { Mục: "Cập nhật Contract.allowances", "Giá trị": planContract.length },
    { Mục: "NV không có HĐ ACTIVE (skip allowances)", "Giá trị": noActiveContract.length },
    { Mục: "KHÔNG match", "Giá trị": notMatched.length },
  ];
  XLSX.utils.book_append_sheet(wbOut, XLSX.utils.json_to_sheet(summary), "Tổng quan");
  XLSX.utils.book_append_sheet(wbOut, XLSX.utils.json_to_sheet(planContract.map(({ _allowances, contractId, ...rest }) => rest)), "Contract allowances");
  XLSX.utils.book_append_sheet(wbOut, XLSX.utils.json_to_sheet(planEligible.map(({ empId, ...rest }) => rest)), "fuelHousingEligible");
  XLSX.utils.book_append_sheet(wbOut, XLSX.utils.json_to_sheet(noActiveContract), "NV chưa có HĐ active");
  XLSX.utils.book_append_sheet(wbOut, XLSX.utils.json_to_sheet(notMatched), "KHÔNG match");

  let outputPath = OUTPUT;
  try { XLSX.writeFile(wbOut, outputPath); }
  catch (e: any) {
    if (e.code === "EBUSY") {
      outputPath = OUTPUT.replace(".xlsx", `_${Date.now()}.xlsx`);
      XLSX.writeFile(wbOut, outputPath);
    } else throw e;
  }
  console.log(`\n✅ Xuất: ${outputPath}`);

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
