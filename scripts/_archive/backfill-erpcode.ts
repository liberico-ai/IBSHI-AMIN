// Backfill User.erpCode cho các NV cũ chưa có erpCode.
// Nguồn maNV → tên: gộp từ tất cả file Excel công T4 + HSNS.
// Match DB Employee theo TÊN → nếu erpCode trống thì set = maNV.
//
// Chạy: npx tsx scripts/backfill-erpcode.ts          (dry-run)
//       npx tsx scripts/backfill-erpcode.ts --apply

import * as XLSX from "xlsx";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const APPLY = process.argv.includes("--apply");
const OUTPUT = "C:/Users/sontt/Desktop/Bao-cao-backfill-erpcode.xlsx";

const SOURCES = [
  { file: "C:/Users/sontt/Downloads/Công tháng 4/công t4 trực tiếp.xlsx", sheet: "TH công", maCol: 0, nameCol: 1, startRow: 6 },
  { file: "C:/Users/sontt/Downloads/Công tháng 4/công t4 gián tiếp.xlsx", sheet: "T04-2026-GIÁN TIẾP VP", maCol: 1, nameCol: 2, startRow: 6 },
  { file: "C:/Users/sontt/Downloads/Công tháng 4/danh sách ns trực tiếp.xlsx", sheet: "Danh sách", maCol: 1, nameCol: 2, startRow: 1 },
];

function normName(s: string): string {
  return String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
}

async function main() {
  console.log(APPLY ? "🚀 APPLY MODE" : "🔍 DRY-RUN");

  // Gộp maNV → name từ tất cả nguồn
  const maToName = new Map<string, string>();
  for (const src of SOURCES) {
    const wb = XLSX.readFile(src.file);
    const data = XLSX.utils.sheet_to_json<any[]>(wb.Sheets[src.sheet], { header: 1, defval: "", raw: true });
    for (let r = src.startRow; r < data.length; r++) {
      const ma = String(data[r][src.maCol] || "").trim();
      const name = String(data[r][src.nameCol] || "").trim();
      if (/^\d+$/.test(ma) && name && !maToName.has(ma)) maToName.set(ma, name);
    }
  }
  console.log(`Tổng maNV unique từ các file: ${maToName.size}`);

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
  });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  const dbEmps = await prisma.employee.findMany({
    include: { user: { select: { id: true, erpCode: true } } },
  });
  const dbErpSet = new Set(dbEmps.map((e) => e.user?.erpCode).filter(Boolean));
  const dbByName = new Map<string, (typeof dbEmps)[number][]>();
  for (const e of dbEmps) {
    const nn = normName(e.fullName);
    if (!dbByName.has(nn)) dbByName.set(nn, []);
    dbByName.get(nn)!.push(e);
  }

  const willSet: any[] = [];        // sẽ set erpCode
  const alreadyHas: any[] = [];     // đã có erpCode đúng
  const conflict: any[] = [];       // erpCode đã có nhưng khác
  const notFound: any[] = [];       // không tìm thấy NV trong DB
  const ambiguous: any[] = [];      // trùng tên — không chắc
  const usedMaNV = new Set<string>();

  for (const [maNV, name] of maToName) {
    // Nếu maNV này đã là erpCode của ai đó trong DB → bỏ qua (đã OK)
    if (dbErpSet.has(maNV)) { alreadyHas.push({ maNV, name }); continue; }

    const cands = dbByName.get(normName(name));
    if (!cands || cands.length === 0) {
      notFound.push({ "Mã NV": maNV, "Họ tên": name });
      continue;
    }
    if (cands.length > 1) {
      // Trùng tên — chỉ xử lý nếu chỉ 1 cái chưa có erpCode
      const noErp = cands.filter((c) => !c.user?.erpCode);
      if (noErp.length === 1) {
        const e = noErp[0];
        willSet.push({ empId: e.id, userId: e.user!.id, "Mã NV (DB)": e.code, "Họ tên": e.fullName, "erpCode sẽ set": maNV, "Ghi chú": "trùng tên — chọn cái chưa có erpCode" });
        usedMaNV.add(maNV);
      } else {
        ambiguous.push({ "Mã NV": maNV, "Họ tên": name, "Số NV trùng tên": cands.length });
      }
      continue;
    }

    const e = cands[0];
    const curErp = e.user?.erpCode;
    if (!curErp) {
      willSet.push({ empId: e.id, userId: e.user!.id, "Mã NV (DB)": e.code, "Họ tên": e.fullName, "erpCode sẽ set": maNV, "Ghi chú": "" });
      usedMaNV.add(maNV);
    } else if (curErp === maNV) {
      alreadyHas.push({ maNV, name });
    } else {
      conflict.push({ "Mã NV (DB)": e.code, "Họ tên": e.fullName, "erpCode hiện tại": curErp, "erpCode file": maNV });
    }
  }

  console.log(`\n📊 Kết quả:`);
  console.log(`  ✅ Sẽ set erpCode: ${willSet.length}`);
  console.log(`  Đã có erpCode đúng: ${alreadyHas.length}`);
  console.log(`  ⚠️ Conflict (erpCode khác): ${conflict.length}`);
  console.log(`  ⚠️ Trùng tên không chắc: ${ambiguous.length}`);
  console.log(`  ❌ Không tìm thấy NV trong DB: ${notFound.length}`);

  if (APPLY) {
    console.log(`\n🚀 Đang set erpCode cho ${willSet.length} NV...`);
    let done = 0;
    for (const w of willSet) {
      try {
        await prisma.user.update({ where: { id: w.userId }, data: { erpCode: w["erpCode sẽ set"] } });
        done++;
      } catch (e: any) {
        if (e.message?.includes("Unique")) {
          console.log(`  ⚠️ Skip ${w["Mã NV (DB)"]} — erpCode ${w["erpCode sẽ set"]} đã tồn tại`);
        } else throw e;
      }
    }
    console.log(`  ✅ Updated ${done} User.erpCode`);
  }

  const wb = XLSX.utils.book_new();
  const summary = [
    { Mục: "Mode", "Giá trị": APPLY ? "APPLY" : "DRY-RUN" },
    { Mục: "maNV unique từ file", "Giá trị": maToName.size },
    { Mục: "✅ Sẽ set erpCode", "Giá trị": willSet.length },
    { Mục: "Đã có erpCode đúng", "Giá trị": alreadyHas.length },
    { Mục: "⚠️ Conflict", "Giá trị": conflict.length },
    { Mục: "⚠️ Trùng tên không chắc", "Giá trị": ambiguous.length },
    { Mục: "❌ Không tìm thấy DB", "Giá trị": notFound.length },
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary), "Tổng quan");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(willSet.map(({ empId, userId, ...r }) => r)), "Sẽ set erpCode");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(conflict), "Conflict");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ambiguous), "Trùng tên không chắc");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(notFound), "Không tìm thấy DB");

  let outPath = OUTPUT;
  try { XLSX.writeFile(wb, outPath); }
  catch (e: any) { if (e.code === "EBUSY") { outPath = OUTPUT.replace(".xlsx", `_${Date.now()}.xlsx`); XLSX.writeFile(wb, outPath); } else throw e; }
  console.log(`\n✅ Xuất: ${outPath}`);

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
