// Đối soát chi tiết chấm công T4/2026 cho TẤT CẢ NV.
// Cộng dồn theo từng cột ngày trong file (col 4..33 cho gián tiếp, col 3..32 cho trực tiếp)
// → so với AttendanceRecord trong DB.
//
// Cảnh báo các trường hợp:
//   - DB ngày công ≠ file số ngày công > 0
//   - DB tổng work hours ≠ file
//   - DB tổng OT ≠ file
//
// Chạy: npx tsx --env-file=.env scripts/reconcile-attendance-detail.ts

import * as XLSX from "xlsx";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const DIR = "C:/Users/sontt/Downloads/Công tháng 4/";
const OUTPUT = "C:/Users/sontt/Desktop/Bao-cao-doi-soat-cong-T4-chi-tiet.xlsx";

interface FileNV {
  ma: string; name: string; loai: "TT" | "GT";
  workDaysCount: number;  // số ngày có workHours > 0
  workHoursTotal: number;
  otHoursTotal: number;
  daysDetail: { day: number; wh: number; oh: number }[];
}

function readGianTiep(): FileNV[] {
  const wb = XLSX.readFile(DIR + "công t4 gián tiếp.xlsx");
  const data = XLSX.utils.sheet_to_json<any[]>(wb.Sheets["T04-2026-GIÁN TIẾP VP"], { header: 1, defval: "", raw: true });
  // header row 4 có Excel date serial → day cols: 4..33 (T4/1..T4/30)
  // Mỗi NV: 3 dòng (work + OT + blank-note)
  const blocks = new Map<string, any[][]>(); // ma → các dòng của NV
  for (let r = 6; r < data.length; r++) {
    const ma = String(data[r][1] ?? "").trim();
    if (!/^\d+$/.test(ma)) continue;
    if (!blocks.has(ma)) blocks.set(ma, []);
    blocks.get(ma)!.push(data[r]);
  }
  const out: FileNV[] = [];
  for (const [ma, rows] of blocks) {
    const workRow = rows[0]; // dòng đầu = work
    // OT row = dòng tiếp theo có col 40="Thêm giờ" hoặc dòng có data > 0 ở day cols
    let otRow: any[] | undefined;
    for (let k = 1; k < rows.length; k++) {
      const label = String(rows[k][40] ?? "").toLowerCase();
      if (label.includes("thêm")) { otRow = rows[k]; break; }
      // fallback: dòng có data day-col > 0
      for (let c = 4; c <= 33; c++) {
        if ((Number(rows[k][c]) || 0) > 0) { otRow = rows[k]; break; }
      }
      if (otRow) break;
    }
    const daysDetail: any[] = []; let workDaysCount = 0; let whSum = 0; let ohSum = 0;
    for (let d = 1; d <= 30; d++) {
      const col = 3 + d; // col 4 = ngày 1
      const wh = Number(workRow?.[col]) || 0;
      const oh = otRow ? (Number(otRow[col]) || 0) : 0;
      daysDetail.push({ day: d, wh, oh });
      if (wh > 0) workDaysCount++;
      whSum += wh; ohSum += oh;
    }
    out.push({ ma, name: String(workRow[2] ?? "").trim(), loai: "GT", workDaysCount, workHoursTotal: +whSum.toFixed(2), otHoursTotal: +ohSum.toFixed(2), daysDetail });
  }
  return out;
}

function readTrucTiep(): FileNV[] {
  const wb = XLSX.readFile(DIR + "công t4 trực tiếp.xlsx");
  const data = XLSX.utils.sheet_to_json<any[]>(wb.Sheets["TH công"], { header: 1, defval: "", raw: true });
  // header row 5 có ngày 1..31 ở col 3..33 (col 3 = ngày 1)
  const blocks = new Map<string, any[][]>();
  for (let r = 6; r < data.length; r++) {
    const ma = String(data[r][0] ?? "").trim();
    if (!/^\d+$/.test(ma)) continue;
    if (!blocks.has(ma)) blocks.set(ma, []);
    blocks.get(ma)!.push(data[r]);
  }
  const out: FileNV[] = [];
  for (const [ma, rows] of blocks) {
    const workRow = rows[0];
    let otRow: any[] | undefined;
    for (let k = 1; k < rows.length; k++) {
      const label = String(rows[k][40] ?? "").toLowerCase();
      if (label.includes("thêm")) { otRow = rows[k]; break; }
      for (let c = 3; c <= 33; c++) {
        if ((Number(rows[k][c]) || 0) > 0) { otRow = rows[k]; break; }
      }
      if (otRow) break;
    }
    const daysDetail: any[] = []; let workDaysCount = 0; let whSum = 0; let ohSum = 0;
    for (let d = 1; d <= 30; d++) {
      const col = 2 + d; // col 3 = ngày 1
      const wh = Number(workRow?.[col]) || 0;
      const oh = otRow ? (Number(otRow[col]) || 0) : 0;
      daysDetail.push({ day: d, wh, oh });
      if (wh > 0) workDaysCount++;
      whSum += wh; ohSum += oh;
    }
    // ⚠️ File công trực tiếp ghi sai mã 190839 cho Nguyễn Đức Hiếu — đúng là 190840
    const effMa = ma === "190839" ? "190840" : ma;
    out.push({ ma: effMa, name: String(workRow[1] ?? "").trim(), loai: "TT", workDaysCount, workHoursTotal: +whSum.toFixed(2), otHoursTotal: +ohSum.toFixed(2), daysDetail });
  }
  return out;
}

async function main() {
  const tt = readTrucTiep();
  const gt = readGianTiep();
  const allFile = new Map<string, FileNV>();
  for (const r of [...tt, ...gt]) {
    if (!allFile.has(r.ma)) allFile.set(r.ma, r);
  }
  console.log(`File: ${tt.length} trực tiếp + ${gt.length} gián tiếp = ${allFile.size} NV unique`);

  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  // DB attendance T4
  const att = await prisma.attendanceRecord.findMany({
    where: { date: { gte: new Date("2026-04-01"), lt: new Date("2026-05-01") } },
    include: { employee: { include: { user: { select: { erpCode: true } } } } },
  });
  console.log(`DB attendance T4: ${att.length} bản ghi\n`);

  const dbByErp = new Map<string, { workDays: number; workHours: number; otHours: number; recs: any[] }>();
  for (const a of att) {
    const erp = a.employee.user?.erpCode; if (!erp) continue;
    if (!dbByErp.has(erp)) dbByErp.set(erp, { workDays: 0, workHours: 0, otHours: 0, recs: [] });
    const cur = dbByErp.get(erp)!;
    if (a.workHours > 0) cur.workDays++;
    cur.workHours += a.workHours;
    cur.otHours += a.otHours;
    cur.recs.push(a);
  }

  const issues: any[] = [];
  const allRows: any[] = [];

  for (const [ma, f] of allFile) {
    const db = dbByErp.get(ma) || { workDays: 0, workHours: 0, otHours: 0, recs: [] };
    const diffDays = db.workDays - f.workDaysCount;
    const diffHours = +(db.workHours - f.workHoursTotal).toFixed(2);
    const diffOt = +(db.otHours - f.otHoursTotal).toFixed(2);
    const row = {
      "Mã NV": ma, "Họ tên": f.name, "Loại": f.loai,
      "Ngày công (file)": f.workDaysCount, "Ngày công (DB)": db.workDays, "Chênh ngày": diffDays,
      "Tổng h work (file)": f.workHoursTotal, "Tổng h work (DB)": +db.workHours.toFixed(2), "Chênh h": diffHours,
      "Tổng OT (file)": f.otHoursTotal, "Tổng OT (DB)": +db.otHours.toFixed(2), "Chênh OT": diffOt,
    };
    allRows.push(row);
    if (Math.abs(diffDays) > 0 || Math.abs(diffHours) > 0.5 || Math.abs(diffOt) > 0.5) {
      issues.push(row);
    }
  }

  console.log(`📊 KẾT QUẢ:`);
  console.log(`  Tổng NV đối soát: ${allFile.size}`);
  console.log(`  ✅ Khớp (lệch ≤ 0.5h): ${allFile.size - issues.length}`);
  console.log(`  ⚠️ Có lệch:           ${issues.length}`);

  // Phân loại issue
  const onlyDays = issues.filter((x) => Math.abs(x["Chênh ngày"]) > 0 && Math.abs(x["Chênh h"]) <= 0.5 && Math.abs(x["Chênh OT"]) <= 0.5).length;
  const onlyHours = issues.filter((x) => Math.abs(x["Chênh ngày"]) === 0 && Math.abs(x["Chênh h"]) > 0.5).length;
  const onlyOT = issues.filter((x) => Math.abs(x["Chênh OT"]) > 0.5 && Math.abs(x["Chênh ngày"]) === 0 && Math.abs(x["Chênh h"]) <= 0.5).length;
  const dbZero = issues.filter((x) => x["Ngày công (DB)"] === 0 && x["Ngày công (file)"] > 0).length;
  console.log(`     ↳ Chỉ lệch ngày công: ${onlyDays}`);
  console.log(`     ↳ Chỉ lệch h work:   ${onlyHours}`);
  console.log(`     ↳ Chỉ lệch OT:       ${onlyOT}`);
  console.log(`     ↳ DB=0 nhưng file>0: ${dbZero}`);

  // Top 10 lệch lớn nhất theo ngày công
  const top = [...issues].sort((a, b) => Math.abs(b["Chênh ngày"]) - Math.abs(a["Chênh ngày"])).slice(0, 10);
  console.log(`\n  TOP 10 lệch ngày công lớn nhất:`);
  for (const r of top) console.log(`    ${r["Mã NV"]} ${r["Họ tên"]} | file:${r["Ngày công (file)"]} ↔ DB:${r["Ngày công (DB)"]} (chênh ${r["Chênh ngày"]})`);

  // Output
  const wb = XLSX.utils.book_new();
  const summary = [
    { Mục: "Tổng NV đối soát", "Giá trị": allFile.size },
    { Mục: "Khớp (lệch ≤ 0.5)", "Giá trị": allFile.size - issues.length },
    { Mục: "Có lệch", "Giá trị": issues.length },
    { Mục: "  ↳ Chỉ lệch ngày", "Giá trị": onlyDays },
    { Mục: "  ↳ Chỉ lệch h work", "Giá trị": onlyHours },
    { Mục: "  ↳ Chỉ lệch OT", "Giá trị": onlyOT },
    { Mục: "  ↳ DB=0 file>0", "Giá trị": dbZero },
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary), "Tổng quan");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(issues), `Có lệch (${issues.length})`);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(allRows), `Tất cả (${allRows.length})`);

  let outPath = OUTPUT;
  try { XLSX.writeFile(wb, outPath); }
  catch (e: any) { if (e.code === "EBUSY") { outPath = OUTPUT.replace(".xlsx", `_${Date.now()}.xlsx`); XLSX.writeFile(wb, outPath); } else throw e; }
  console.log(`\n✅ Xuất: ${outPath}`);

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
