import * as XLSX from "xlsx";
import prisma from "../src/lib/prisma";

const APPLY = process.argv.includes("--apply");
const FILE = "C:/Users/sontt/Downloads/Thông tin lương.xlsx";

type Row = { erp: string; name: string; baseFile: number | null; allowFile: number | null };

function num(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[, ]/g, ""));
  return Number.isFinite(n) ? Math.round(n) : null;
}

async function main() {
  const wb = XLSX.readFile(FILE);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });

  const rows: Row[] = [];
  for (let i = 1; i < raw.length; i++) {
    const r = raw[i] || [];
    const erp = r[1] == null ? "" : String(r[1]).trim();
    if (!erp) continue;
    rows.push({ erp, name: String(r[2] ?? "").trim(), baseFile: num(r[8]), allowFile: num(r[9]) });
  }
  console.log(`File: ${rows.length} dòng có Mã NV\n`);

  let matched = 0, noUser = 0, noContract = 0;
  let baseOk = 0, baseMismatch = 0, baseFileEmpty = 0;
  let allowToSet = 0, allowEmpty = 0;
  const mismatches: string[] = [];
  const unmatched: string[] = [];

  for (const row of rows) {
    const user = await prisma.user.findFirst({
      where: { erpCode: row.erp },
      select: { employee: { select: { id: true, code: true, fullName: true } } },
    });
    const emp = user?.employee;
    if (!emp) { noUser++; unmatched.push(`${row.erp} ${row.name}`); continue; }
    matched++;

    const contract = await prisma.contract.findFirst({
      where: { employeeId: emp.id },
      orderBy: [{ status: "asc" }, { startDate: "desc" }], // ACTIVE trước (enum), mới nhất
    });
    // ưu tiên contract ACTIVE thực sự
    const active = await prisma.contract.findFirst({
      where: { employeeId: emp.id, status: "ACTIVE" },
      orderBy: { startDate: "desc" },
    });
    const target = active ?? contract;
    if (!target) { noContract++; continue; }

    // so khớp lương cơ bản
    if (row.baseFile == null) baseFileEmpty++;
    else if (row.baseFile === target.baseSalary) baseOk++;
    else { baseMismatch++; if (mismatches.length < 40) mismatches.push(`${emp.code} ${emp.fullName}: hệ thống=${target.baseSalary.toLocaleString()} | file=${row.baseFile.toLocaleString()} (lệch ${(row.baseFile-target.baseSalary).toLocaleString()})`); }

    // phụ cấp
    if (row.allowFile == null) allowEmpty++;
    else {
      allowToSet++;
      if (APPLY) await prisma.contract.update({ where: { id: target.id }, data: { allowance: row.allowFile } });
    }
  }

  console.log("=== KHỚP NHÂN SỰ ===");
  console.log(`  Khớp erpCode: ${matched} | Không thấy NV: ${noUser} | Không có HĐ: ${noContract}`);
  console.log("\n=== SO LƯƠNG CƠ BẢN (file cột I vs hệ thống) ===");
  console.log(`  Khớp: ${baseOk} | Lệch: ${baseMismatch} | File trống cột I: ${baseFileEmpty}`);
  console.log("\n=== PHỤ CẤP (cột J) ===");
  console.log(`  ${APPLY ? "Đã set" : "Sẽ set"}: ${allowToSet} | File trống cột J: ${allowEmpty}`);

  if (unmatched.length) { console.log(`\n--- Không khớp NV (${unmatched.length}) ---`); unmatched.slice(0,30).forEach(s=>console.log("  "+s)); }
  if (mismatches.length) { console.log(`\n--- Lệch lương cơ bản (hiện ${mismatches.length}${baseMismatch>mismatches.length?`/${baseMismatch}`:""}) ---`); mismatches.forEach(s=>console.log("  "+s)); }

  console.log(APPLY ? "\n>>> ĐÃ APPLY phụ cấp." : "\n>>> DRY-RUN. Chạy --apply để ghi phụ cấp.");
}
main().finally(() => process.exit(0));
