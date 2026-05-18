// Import hàng loạt thông tin NV từ 4 file Excel
//   - MST.xlsx (sheet 1: MST + CCCD)
//   - MST.xlsx (sheet 2: NPT)
//   - BHXH 04.2026.xlsx (mã BHXH + mức đóng)
//   - HSNS.xlsx (lịch sử hợp đồng)
//   - Bảng lương 04.2026.xls (lương cơ bản hiện tại)
//
// Match Employee bằng User.erpCode (Mã NV ERP — 6 chữ số) → fallback theo tên.
//
// Chạy:
//   - Dry-run (default):  npx tsx scripts/import-employee-extra-info.ts
//   - Apply thật:         npx tsx scripts/import-employee-extra-info.ts --apply

import * as XLSX from "xlsx";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const FILE_MST = "C:/Users/sontt/Downloads/MST/Danh sách mã số thuế TNCN 2026.xlsx";
const FILE_BHXH = "C:/Users/sontt/Downloads/MST/BHXH 04.2026.xlsx";
const FILE_HSNS = "C:/Users/sontt/Downloads/HSNS và Lương/HSNS.xlsx";
const FILE_LUONG = "C:/Users/sontt/Downloads/HSNS và Lương/Bảng lương 04.2026 (11.05.2026).xls";
const OUTPUT = "C:/Users/sontt/Desktop/Bao-cao-import-thong-tin-NV.xlsx";

const APPLY = process.argv.includes("--apply");

// ====== Helpers ======
function normName(s: string): string {
  return String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
}

function excelDateToJSDate(serial: any): Date | null {
  if (!serial || typeof serial !== "number") return null;
  // Excel epoch 1900-01-01 (with 1-day off due to 1900-leap-year bug)
  const utcDays = serial - 25569;
  const ms = utcDays * 86400 * 1000;
  const d = new Date(ms);
  if (isNaN(d.getTime())) return null;
  return d;
}

function mapContractType(s: string): "DEFINITE_12M" | "DEFINITE_24M" | "DEFINITE_36M" | "INDEFINITE" | "PROBATION" {
  const t = s.toLowerCase();
  if (t.includes("không xác định") || t.includes("không thời hạn") || t.includes("vĩnh viễn")) return "INDEFINITE";
  if (t.includes("3 năm") || t.includes("36")) return "DEFINITE_36M";
  if (t.includes("2 năm") || t.includes("24")) return "DEFINITE_24M";
  if (t.includes("1 năm") || t.includes("12")) return "DEFINITE_12M";
  if (t.includes("thử việc")) return "PROBATION";
  return "DEFINITE_12M"; // default fallback
}

function mapContractStatus(s: string): "ACTIVE" | "EXPIRED" | "TERMINATED" | "EXPIRING_SOON" | "RENEWED" {
  const t = s.toLowerCase();
  if (t.includes("đang hiệu lực") || t.includes("còn hiệu lực")) return "ACTIVE";
  if (t.includes("đã chấm dứt") || t.includes("chấm dứt")) return "TERMINATED";
  if (t.includes("đã hết hạn") || t.includes("hết hạn")) return "EXPIRED";
  return "EXPIRED";
}

// ====== Read sources ======
interface MstEmployeeInfo { maNV: string; taxCode: string; idNumber: string }
interface DependentInfo { maNV: string; fullName: string; relationship: string; taxCode: string; dateOfBirth: Date | null }
interface BhxhInfo { maNV: string; insuranceNumber: string; insuranceSalary: number }
interface ContractRow { maNV: string; contractNumber: string; loaiHD: string; ngayBatDau: Date | null; ngayHetHan: Date | null; trangThai: string }
interface LuongInfo { maNV: string; baseSalary: number; boPhan: string; chucDanh: string; ngayVaoCT: Date | null; fullName: string }

function readMSTSheet1(): MstEmployeeInfo[] {
  const wb = XLSX.readFile(FILE_MST);
  const ws = wb.Sheets["Mã số thuế người lao động"];
  const data = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: "", raw: true });
  const out: MstEmployeeInfo[] = [];
  for (let r = 2; r < data.length; r++) {
    const row = data[r] || [];
    const maNV = String(row[1] || "").trim();
    if (!/^\d+$/.test(maNV)) continue;
    out.push({
      maNV,
      taxCode: String(row[3] || "").trim(),
      idNumber: String(row[5] || "").trim(),
    });
  }
  return out;
}

function readMSTSheet2(): DependentInfo[] {
  const wb = XLSX.readFile(FILE_MST);
  const ws = wb.Sheets["Mã số thuế người phụ thuộc"];
  const data = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: "", raw: true });
  const out: DependentInfo[] = [];
  for (let r = 1; r < data.length; r++) {
    const row = data[r] || [];
    const maNV = String(row[1] || "").trim();
    if (!/^\d+$/.test(maNV)) continue;
    const fullName = String(row[4] || "").trim();
    if (!fullName) continue;
    out.push({
      maNV,
      fullName,
      relationship: String(row[7] || "Khác").trim(),
      taxCode: String(row[6] || "").trim(),
      dateOfBirth: excelDateToJSDate(row[5]),
    });
  }
  return out;
}

function readBHXH(): BhxhInfo[] {
  const wb = XLSX.readFile(FILE_BHXH);
  const ws = wb.Sheets["04"];
  const data = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: "", raw: true });
  const out: BhxhInfo[] = [];
  // Headers ở row 4 và 5. Data từ row 7.
  for (let r = 7; r < data.length; r++) {
    const row = data[r] || [];
    const maNV = String(row[1] || "").trim();
    if (!/^\d+$/.test(maNV)) continue;
    const bhxhNo = String(row[3] || "").trim();
    const mucHienTai = Number(row[8] || 0);
    if (!bhxhNo && !mucHienTai) continue;
    out.push({ maNV, insuranceNumber: bhxhNo, insuranceSalary: Math.round(mucHienTai) || 0 });
  }
  return out;
}

function readHSNS(): ContractRow[] {
  const wb = XLSX.readFile(FILE_HSNS);
  const ws = wb.Sheets["HOPDONG"];
  const data = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: "", raw: true });
  const out: ContractRow[] = [];
  for (let r = 1; r < data.length; r++) {
    const row = data[r] || [];
    const maNV = String(row[1] || "").trim();
    const cn = String(row[0] || "").trim();
    if (!cn || !maNV) continue;
    out.push({
      maNV,
      contractNumber: cn,
      loaiHD: String(row[3] || "").trim(),
      ngayBatDau: excelDateToJSDate(row[5]),
      ngayHetHan: excelDateToJSDate(row[6]),
      trangThai: String(row[9] || "").trim(),
    });
  }
  return out;
}

function readLuong(): LuongInfo[] {
  const wb = XLSX.readFile(FILE_LUONG);
  const ws = wb.Sheets["Chi tiết lương"];
  const data = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: "", raw: true });
  const out: LuongInfo[] = [];
  for (let r = 11; r < data.length; r++) {
    const row = data[r] || [];
    const maNV = String(row[1] || "").trim();
    if (!/^\d+$/.test(maNV)) continue;
    const luong = Number(row[12] || 0);
    if (!luong) continue;
    out.push({
      maNV,
      fullName: String(row[2] || "").trim(),
      boPhan: String(row[3] || "").trim(),
      chucDanh: String(row[4] || "").trim(),
      baseSalary: Math.round(luong),
      ngayVaoCT: excelDateToJSDate(row[8]),
    });
  }
  return out;
}

// ====== Main ======
async function main() {
  console.log(APPLY ? "🚀 APPLY MODE — sẽ update DB thật" : "🔍 DRY-RUN MODE — không động vào DB");

  console.log("\nĐang đọc các file Excel...");
  const mstEmps = readMSTSheet1();
  const dependents = readMSTSheet2();
  const bhxhRows = readBHXH();
  const contractRows = readHSNS();
  const luongRows = readLuong();
  console.log(`  MST NLĐ: ${mstEmps.length}`);
  console.log(`  Người phụ thuộc: ${dependents.length}`);
  console.log(`  BHXH: ${bhxhRows.length}`);
  console.log(`  Lịch sử HĐ: ${contractRows.length}`);
  console.log(`  Lương T4: ${luongRows.length}`);

  // Index Excel data by maNV
  const luongByMaNV = new Map(luongRows.map((x) => [x.maNV, x.baseSalary]));
  const luongFullByMaNV = new Map(luongRows.map((x) => [x.maNV, x]));
  const bhxhByMaNV = new Map(bhxhRows.map((x) => [x.maNV, x]));
  const dependentsByMaNV = new Map<string, DependentInfo[]>();
  for (const d of dependents) {
    if (!dependentsByMaNV.has(d.maNV)) dependentsByMaNV.set(d.maNV, []);
    dependentsByMaNV.get(d.maNV)!.push(d);
  }
  const contractsByMaNV = new Map<string, ContractRow[]>();
  for (const c of contractRows) {
    if (!contractsByMaNV.has(c.maNV)) contractsByMaNV.set(c.maNV, []);
    contractsByMaNV.get(c.maNV)!.push(c);
  }

  // Gộp tất cả mã NV xuất hiện + lưu name từ các nguồn để fallback match by name
  const nameByMaNV = new Map<string, string>();
  // Read MST sheet 1 again to get name (was missing in readMSTSheet1 return)
  {
    const wb = XLSX.readFile(FILE_MST);
    const ws = wb.Sheets["Mã số thuế người lao động"];
    const data = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: "", raw: true });
    for (let r = 2; r < data.length; r++) {
      const row = data[r] || [];
      const maNV = String(row[1] || "").trim();
      const hoTen = String(row[2] || "").trim();
      if (/^\d+$/.test(maNV) && hoTen) nameByMaNV.set(maNV, hoTen);
    }
  }
  // Also from BHXH (col 2) and HSNS (col 2) and Luong (col 2)
  {
    const wb = XLSX.readFile(FILE_BHXH);
    const ws = wb.Sheets["04"];
    const data = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: "", raw: true });
    for (let r = 7; r < data.length; r++) {
      const row = data[r] || [];
      const maNV = String(row[1] || "").trim();
      const hoTen = String(row[2] || "").trim();
      if (/^\d+$/.test(maNV) && hoTen && !nameByMaNV.has(maNV)) nameByMaNV.set(maNV, hoTen);
    }
  }
  {
    const wb = XLSX.readFile(FILE_HSNS);
    const ws = wb.Sheets["HOPDONG"];
    const data = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: "", raw: true });
    for (let r = 1; r < data.length; r++) {
      const row = data[r] || [];
      const maNV = String(row[1] || "").trim();
      const hoTen = String(row[2] || "").trim();
      if (maNV && hoTen && !nameByMaNV.has(maNV)) nameByMaNV.set(maNV, hoTen);
    }
  }
  {
    const wb = XLSX.readFile(FILE_LUONG);
    const ws = wb.Sheets["Chi tiết lương"];
    const data = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: "", raw: true });
    for (let r = 11; r < data.length; r++) {
      const row = data[r] || [];
      const maNV = String(row[1] || "").trim();
      const hoTen = String(row[2] || "").trim();
      if (/^\d+$/.test(maNV) && hoTen && !nameByMaNV.has(maNV)) nameByMaNV.set(maNV, hoTen);
    }
  }

  const allMaNV = new Set<string>([
    ...mstEmps.map((x) => x.maNV),
    ...dependents.map((x) => x.maNV),
    ...bhxhRows.map((x) => x.maNV),
    ...contractRows.map((x) => x.maNV),
    ...luongRows.map((x) => x.maNV),
  ]);
  console.log(`\nTổng mã NV unique trong các file Excel: ${allMaNV.size}`);

  // ====== Connect DB ======
  console.log("\nĐang query DB...");
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
  });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  const dbEmps = await prisma.employee.findMany({
    include: {
      user: { select: { erpCode: true, email: true } },
      department: { select: { name: true } },
      position: { select: { name: true } },
      contracts: { select: { id: true, contractNumber: true, status: true } },
      dependentsList: { select: { id: true, fullName: true } },
    },
  });
  console.log(`  DB Employees: ${dbEmps.length}`);

  // Build lookup maps
  const dbByErp = new Map<string, (typeof dbEmps)[number]>();
  const dbByName = new Map<string, (typeof dbEmps)[number][]>();
  for (const e of dbEmps) {
    if (e.user?.erpCode) dbByErp.set(e.user.erpCode, e);
    const nn = normName(e.fullName);
    if (!dbByName.has(nn)) dbByName.set(nn, []);
    dbByName.get(nn)!.push(e);
  }

  // ====== Plan các thay đổi ======
  const planEmployeeUpdates: any[] = [];
  const planContractsCreate: any[] = [];
  const planDependentsCreate: any[] = [];
  const notMatched: string[] = [];
  const usedDbIds = new Set<string>();

  const matchByStats = { erpCode: 0, name: 0, nameAmbiguous: 0 };
  const matchByLookup = new Map<string, string>(); // dbEmpId → "erpCode" | "tên" | "tên (trùng)"

  for (const maNV of allMaNV) {
    let db = dbByErp.get(maNV);
    let matchBy: string | null = db ? "erpCode" : null;

    // Fallback: match by name
    if (!db) {
      const excelName = nameByMaNV.get(maNV);
      if (excelName) {
        const cands = dbByName.get(normName(excelName));
        if (cands && cands.length === 1) {
          db = cands[0];
          matchBy = "tên (unique)";
        } else if (cands && cands.length > 1) {
          // Multiple matches by name — take first, mark as ambiguous
          db = cands.find((c) => !usedDbIds.has(c.id)) || cands[0];
          matchBy = `tên (trùng ${cands.length}, lấy đầu tiên)`;
        }
      }
    }

    if (!db) {
      notMatched.push(maNV);
      continue;
    }
    if (usedDbIds.has(db.id)) {
      // Already matched to another maNV → conflict, log but don't update again
      continue;
    }
    usedDbIds.add(db.id);
    matchByLookup.set(db.id, matchBy || "?");
    if (matchBy === "erpCode") matchByStats.erpCode++;
    else if (matchBy?.startsWith("tên (unique)")) matchByStats.name++;
    else if (matchBy?.startsWith("tên")) matchByStats.nameAmbiguous++;

    // 1) Employee updates
    const mst = mstEmps.find((x) => x.maNV === maNV);
    const bhxh = bhxhByMaNV.get(maNV);
    const empUpdate: any = {};
    if (mst?.taxCode) empUpdate.taxCode = mst.taxCode;
    if (mst?.idNumber && (db.idNumber === "000000000000" || db.idNumber === "" || !db.idNumber)) {
      empUpdate.idNumber = mst.idNumber;
    }
    if (bhxh?.insuranceNumber) empUpdate.insuranceNumber = bhxh.insuranceNumber;

    if (Object.keys(empUpdate).length > 0) {
      planEmployeeUpdates.push({
        empId: db.id,
        maNV,
        "Mã NV (DB)": db.code,
        "Họ tên": db.fullName,
        "Match theo": matchBy,
        ...Object.fromEntries(
          Object.entries(empUpdate).map(([k, v]) => [`${k} (mới)`, v]),
        ),
      });
    }

    // 2) Contract — backfill lịch sử HĐ từ HSNS
    const existingContractNumbers = new Set(db.contracts.map((c) => c.contractNumber));
    const contractsForNV = contractsByMaNV.get(maNV) || [];
    // Sắp xếp theo ngày bắt đầu
    const sortedContracts = [...contractsForNV].sort((a, b) => {
      const da = a.ngayBatDau?.getTime() || 0;
      const dbt = b.ngayBatDau?.getTime() || 0;
      return da - dbt;
    });
    const baseSalaryT4 = luongByMaNV.get(maNV) || 0;
    const insuranceSalaryNow = bhxh?.insuranceSalary || 0;

    for (let i = 0; i < sortedContracts.length; i++) {
      const c = sortedContracts[i];
      if (existingContractNumbers.has(c.contractNumber)) continue;
      const status = mapContractStatus(c.trangThai);
      const isLatestActive = status === "ACTIVE";

      planContractsCreate.push({
        empId: db.id,
        maNV,
        "Họ tên": db.fullName,
        contractNumber: c.contractNumber,
        contractType: mapContractType(c.loaiHD),
        position: db.position?.name || null,
        startDate: c.ngayBatDau,
        endDate: c.ngayHetHan,
        baseSalary: isLatestActive ? baseSalaryT4 : 0,
        insuranceSalary: isLatestActive ? insuranceSalaryNow : null,
        status,
      });
    }

    // 3) Dependents — chỉ tạo nếu chưa có cùng tên + quan hệ
    const existingDepKey = new Set(
      db.dependentsList.map((d) => normName(d.fullName)),
    );
    const depsForNV = dependentsByMaNV.get(maNV) || [];
    for (const d of depsForNV) {
      if (existingDepKey.has(normName(d.fullName))) continue;
      planDependentsCreate.push({
        empId: db.id,
        maNV,
        "NV chính (DB)": db.fullName,
        "Tên NPT": d.fullName,
        "Quan hệ": d.relationship,
        "MST NPT": d.taxCode,
        "Ngày sinh": d.dateOfBirth?.toISOString().slice(0, 10) || "",
      });
    }
  }

  const dbNotInExcel = dbEmps
    .filter((e) => !usedDbIds.has(e.id) && ["ACTIVE", "PROBATION", "ON_LEAVE"].includes(e.status))
    .map((e) => ({
      "Mã NV (DB)": e.code,
      "ERP Code": e.user?.erpCode || "(không có)",
      "Họ tên": e.fullName,
      "Phòng ban": e.department?.name || "",
      "Trạng thái": e.status,
    }));

  // Phân loại 485 "Excel only" thành 2 nhóm:
  //   - Active: xuất hiện trong Bảng lương T4 hoặc BHXH 04.2026 → NV đang đi làm, cần TẠO
  //   - Historical: chỉ trong HSNS → NV cũ đã nghỉ, BỎ QUA
  const luongMaNVs = new Set(luongRows.map((x) => x.maNV));
  const bhxhMaNVs = new Set(bhxhRows.map((x) => x.maNV));

  const excelActiveToCreate: any[] = [];
  const excelHistoricalSkip: any[] = [];
  for (const maNV of notMatched) {
    const isActive = luongMaNVs.has(maNV) || bhxhMaNVs.has(maNV);
    const name = nameByMaNV.get(maNV) || "(không rõ)";
    const inMST = mstEmps.some((x) => x.maNV === maNV);
    const inHSNS = contractRows.some((x) => x.maNV === maNV);
    const inBHXH = bhxhMaNVs.has(maNV);
    const inLuong = luongMaNVs.has(maNV);
    const baseSalary = luongRows.find((x) => x.maNV === maNV)?.baseSalary || 0;
    const bhxhInfo = bhxhRows.find((x) => x.maNV === maNV);
    const mstInfo = mstEmps.find((x) => x.maNV === maNV);

    if (isActive) {
      excelActiveToCreate.push({
        "Mã NV (Excel)": maNV,
        "Họ tên": name,
        "Lương cơ bản (T4)": baseSalary,
        "Mã BHXH": bhxhInfo?.insuranceNumber || "",
        "Mức đóng BHXH": bhxhInfo?.insuranceSalary || "",
        "CCCD": mstInfo?.idNumber || "",
        "MST": mstInfo?.taxCode || "",
        "Có trong Lương T4?": inLuong ? "✓" : "",
        "Có trong BHXH?": inBHXH ? "✓" : "",
        "Có trong MST?": inMST ? "✓" : "",
        "Có trong HSNS?": inHSNS ? "✓" : "",
      });
    } else {
      excelHistoricalSkip.push({
        "Mã NV (Excel)": maNV,
        "Họ tên": name,
        "Có trong MST?": inMST ? "✓" : "",
        "Có trong HSNS?": inHSNS ? "✓" : "",
        "Ghi chú": "NV cũ đã nghỉ — chỉ có trong file lịch sử",
      });
    }
  }

  // ====== Stats ======
  const summary = [
    { Mục: "Mode", "Giá trị": APPLY ? "APPLY THẬT" : "DRY-RUN (không update)" },
    { Mục: "—", "Giá trị": "" },
    { Mục: "Mã NV xuất hiện trong file Excel", "Giá trị": allMaNV.size },
    { Mục: "Match được với DB", "Giá trị": usedDbIds.size },
    { Mục: "   ↳ Match theo erpCode (chính xác)", "Giá trị": matchByStats.erpCode },
    { Mục: "   ↳ Match theo tên (unique - an toàn)", "Giá trị": matchByStats.name },
    { Mục: "   ↳ Match theo tên (trùng - CẦN VERIFY)", "Giá trị": matchByStats.nameAmbiguous },
    { Mục: "KHÔNG match", "Giá trị": notMatched.length },
    { Mục: "   ↳ NV active (Lương/BHXH T4) — CẦN TẠO MỚI", "Giá trị": excelActiveToCreate.length },
    { Mục: "   ↳ NV lịch sử (chỉ HSNS) — BỎ QUA", "Giá trị": excelHistoricalSkip.length },
    { Mục: "—", "Giá trị": "" },
    { Mục: "Employee sẽ update (đã match)", "Giá trị": planEmployeeUpdates.length },
    { Mục: "Contract sẽ tạo mới (backfill từ HSNS)", "Giá trị": planContractsCreate.length },
    { Mục: "Dependent sẽ tạo mới", "Giá trị": planDependentsCreate.length },
    { Mục: "—", "Giá trị": "" },
    { Mục: "NV trong DB ACTIVE/PROBATION/ON_LEAVE không có trong Excel", "Giá trị": dbNotInExcel.length },
  ];

  // ====== APPLY ======
  let createdNewCount = 0;
  if (APPLY) {
    console.log("\n🚀 Đang apply thay đổi vào DB...");

    // ── 0) Auto-tạo NV active mới (từ excelActiveToCreate) ──
    const bcrypt = await import("bcryptjs");
    const allDepts = await prisma.department.findMany({ select: { id: true, name: true } });
    const allPositions = await prisma.position.findMany({ select: { id: true, name: true, departmentId: true } });
    const deptByNormName = new Map(allDepts.map((d) => [normName(d.name), d]));
    const fallbackDept = allDepts[0];
    if (!fallbackDept) throw new Error("Không có Department nào trong DB — không thể tạo NV mới");

    function findPosition(deptId: string, posName: string) {
      const nn = normName(posName);
      let p = allPositions.find((x) => x.departmentId === deptId && normName(x.name) === nn);
      if (p) return p;
      p = allPositions.find((x) => normName(x.name) === nn);
      if (p) return p;
      p = allPositions.find((x) => x.departmentId === deptId);
      if (p) return p;
      return allPositions[0];
    }

    // Cache max numeric code — tăng dần trong loop, không query DB nữa
    const maxRes: any[] = await prisma.$queryRawUnsafe(
      `SELECT MAX(CAST(SUBSTRING(code FROM 5) AS INTEGER)) as max_num FROM "Employee" WHERE code LIKE 'IBS-%'`,
    );
    let nextEmpNum = (Number(maxRes[0]?.max_num) || 0) + 1;

    for (const nv of excelActiveToCreate) {
      const maNV = nv["Mã NV (Excel)"];

      // ⚠️ Skip nếu erpCode/tên này đã có Employee (partial apply trước đó)
      const existsByErp = await prisma.user.findFirst({
        where: { erpCode: maNV },
        select: { id: true },
      });
      if (existsByErp) {
        console.log(`  ⏭  Skip ${maNV} — đã có User.erpCode trong DB`);
        continue;
      }

      const luongInfo = luongFullByMaNV.get(maNV);
      const dept = luongInfo ? (deptByNormName.get(normName(luongInfo.boPhan)) || fallbackDept) : fallbackDept;
      const pos = findPosition(dept.id, luongInfo?.chucDanh || "");
      if (!pos) continue;

      const newCode = `IBS-${String(nextEmpNum).padStart(3, "0")}`;
      nextEmpNum++;

      // Generate email (normalized name)
      const nameClean = String(nv["Họ tên"] || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z\s]/g, "").trim().split(/\s+/);
      const emailBase = (nameClean[nameClean.length - 1] || "nv") + "." + (nameClean[0]?.charAt(0) || "x");
      let email = `${emailBase}@ibs.vn`;
      let suffix = 2;
      while (await prisma.user.findFirst({ where: { email } })) {
        email = `${emailBase}${suffix}@ibs.vn`;
        suffix++;
      }

      const erpToUse = maNV; // đã verify không clash ở trên

      const tempHash = await bcrypt.hash("123456", 10);
      const newUser = await prisma.user.create({
        data: {
          employeeCode: newCode,
          erpCode: erpToUse,
          email,
          passwordHash: tempHash,
          role: "EMPLOYEE",
          isActive: true,
          forcePasswordChange: true,
        },
      });

      const newEmp = await prisma.employee.create({
        data: {
          userId: newUser.id,
          code: newCode,
          fullName: nv["Họ tên"],
          gender: "MALE", // placeholder
          dateOfBirth: new Date("1990-01-01"), // placeholder
          idNumber: nv["CCCD"] || "000000000000",
          phone: "",
          address: "",
          departmentId: dept.id,
          positionId: pos.id,
          startDate: luongInfo?.ngayVaoCT || new Date(),
          status: "ACTIVE",
          taxCode: nv["MST"] || null,
          insuranceNumber: nv["Mã BHXH"] || null,
          dependents: 0,
        },
      });

      // Cập nhật map để các bước sau biết NV này đã tồn tại
      dbByErp.set(maNV, { ...newEmp, user: { erpCode: maNV, email }, department: dept, position: pos, contracts: [], dependentsList: [] } as any);
      createdNewCount++;
    }
    console.log(`  ✅ Created ${createdNewCount} NV active mới`);

    // 1) Update Employee
    for (const e of planEmployeeUpdates) {
      const data: any = {};
      for (const [k, v] of Object.entries(e)) {
        if (k.endsWith(" (mới)")) data[k.replace(" (mới)", "")] = v;
      }
      if (Object.keys(data).length === 0) continue;
      await prisma.employee.update({ where: { id: e.empId }, data });
    }
    console.log(`  ✅ Updated ${planEmployeeUpdates.length} Employee đã có sẵn`);

    // 2) Create Contracts (cho cả NV cũ + NV vừa tạo)
    // Re-process contracts for newly-created NV
    const contractsForNew: any[] = [];
    for (const nv of excelActiveToCreate) {
      const maNV = nv["Mã NV (Excel)"];
      const db = dbByErp.get(maNV);
      if (!db) continue;
      const contractsForNV = contractsByMaNV.get(maNV) || [];
      const sortedC = [...contractsForNV].sort((a, b) => (a.ngayBatDau?.getTime() || 0) - (b.ngayBatDau?.getTime() || 0));
      const baseSalaryT4 = luongByMaNV.get(maNV) || 0;
      const insuranceSalaryNow = bhxhByMaNV.get(maNV)?.insuranceSalary || 0;
      for (const c of sortedC) {
        const status = mapContractStatus(c.trangThai);
        const isLatestActive = status === "ACTIVE";
        contractsForNew.push({
          empId: db.id,
          contractNumber: c.contractNumber,
          contractType: mapContractType(c.loaiHD),
          position: db.position?.name || null,
          startDate: c.ngayBatDau,
          endDate: c.ngayHetHan,
          baseSalary: isLatestActive ? baseSalaryT4 : 0,
          insuranceSalary: isLatestActive ? insuranceSalaryNow : null,
          status,
        });
      }
    }
    const allContractsToCreate = [...planContractsCreate, ...contractsForNew];
    for (const c of allContractsToCreate) {
      if (!c.startDate) continue;
      try {
        await prisma.contract.create({
          data: {
            employeeId: c.empId,
            contractNumber: c.contractNumber,
            contractType: c.contractType,
            position: c.position,
            startDate: c.startDate,
            endDate: c.endDate,
            baseSalary: c.baseSalary,
            insuranceSalary: c.insuranceSalary,
            status: c.status,
          },
        });
      } catch (e: any) {
        if (!e.message?.includes("Unique")) throw e;
      }
    }
    console.log(`  ✅ Created ${allContractsToCreate.length} Contract`);

    // 3) Create Dependents (cho cả NV cũ + NV vừa tạo)
    const allDepsToCreate = [...planDependentsCreate];
    for (const nv of excelActiveToCreate) {
      const maNV = nv["Mã NV (Excel)"];
      const db = dbByErp.get(maNV);
      if (!db) continue;
      const deps = dependentsByMaNV.get(maNV) || [];
      for (const d of deps) {
        allDepsToCreate.push({
          empId: db.id,
          "Tên NPT": d.fullName,
          "Quan hệ": d.relationship,
          "MST NPT": d.taxCode,
          "Ngày sinh": d.dateOfBirth?.toISOString().slice(0, 10) || "",
        });
      }
    }
    for (const d of allDepsToCreate) {
      await prisma.dependent.create({
        data: {
          employeeId: d.empId,
          fullName: d["Tên NPT"],
          relationship: d["Quan hệ"],
          taxCode: d["MST NPT"] || null,
          dateOfBirth: d["Ngày sinh"] ? new Date(d["Ngày sinh"]) : null,
        },
      });
    }
    console.log(`  ✅ Created ${allDepsToCreate.length} Dependent`);
  }

  // ====== Output Excel ======
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary), "Tổng quan");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(planEmployeeUpdates), "Employee update");
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(
      planContractsCreate.map((c) => ({
        "Mã NV (DB)": c.maNV,
        "Họ tên": c["Họ tên"],
        "Số HĐ": c.contractNumber,
        "Loại HĐ": c.contractType,
        "Vị trí (snapshot)": c.position,
        "Ngày bắt đầu": c.startDate ? c.startDate.toISOString().slice(0, 10) : "",
        "Ngày hết hạn": c.endDate ? c.endDate.toISOString().slice(0, 10) : "",
        "Lương cơ bản": c.baseSalary,
        "Lương đóng BHXH": c.insuranceSalary || "",
        "Trạng thái": c.status,
      })),
    ),
    "Contract create",
  );
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(planDependentsCreate), "Dependent create");
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(excelActiveToCreate),
    "NV active CẦN TẠO MỚI",
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(excelHistoricalSkip),
    "NV lịch sử (bỏ qua)",
  );
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dbNotInExcel), "DB có, Excel không có");

  // Nếu file đang mở (locked) → ghi sang file có timestamp
  let outputPath = OUTPUT;
  try {
    XLSX.writeFile(wb, outputPath);
  } catch (e: any) {
    if (e.code === "EBUSY") {
      const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      outputPath = OUTPUT.replace(".xlsx", `_${ts}.xlsx`);
      XLSX.writeFile(wb, outputPath);
      console.log(`⚠️  File cũ đang mở — đã ghi sang: ${outputPath}`);
    } else {
      throw e;
    }
  }
  console.log(`\n✅ Xuất file: ${outputPath}`);
  console.log("\n=== TÓM TẮT ===");
  for (const s of summary) console.log(`  ${s.Mục}: ${s["Giá trị"]}`);

  if (!APPLY) {
    console.log("\n⚠️  Đây là DRY-RUN. Để apply thật, chạy: npx tsx scripts/import-employee-extra-info.ts --apply");
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
