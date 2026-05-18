// Rà soát + fix lại contractType cho TẤT CẢ Contract trong DB
// Logic: contractType được suy ra từ (endDate - startDate), tin cậy hơn text Excel
//   - endDate = null      → INDEFINITE
//   - 15-90 ngày          → PROBATION
//   - 300-450 ngày        → DEFINITE_12M
//   - 600-840 ngày        → DEFINITE_24M
//   - 950-1300 ngày       → DEFINITE_36M
//   - khác (vd 1500+ ngày) → giữ nguyên + flag để user verify
//
// Chạy:
//   - Dry-run (default): npx tsx scripts/fix-contract-types.ts
//   - Apply:             npx tsx scripts/fix-contract-types.ts --apply

import * as XLSX from "xlsx";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const OUTPUT = "C:/Users/sontt/Desktop/Bao-cao-fix-contract-types.xlsx";
const APPLY = process.argv.includes("--apply");

type ContractType = "PROBATION" | "DEFINITE_12M" | "DEFINITE_24M" | "DEFINITE_36M" | "INDEFINITE";

function deriveContractType(startDate: Date, endDate: Date | null): { type: ContractType; days: number | null; confidence: "high" | "low" } {
  if (!endDate) return { type: "INDEFINITE", days: null, confidence: "high" };
  const days = Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  if (days < 15) return { type: "PROBATION", days, confidence: "low" }; // <15 ngày nghi sai
  if (days <= 90) return { type: "PROBATION", days, confidence: "high" };
  if (days >= 300 && days <= 450) return { type: "DEFINITE_12M", days, confidence: "high" };
  if (days >= 600 && days <= 840) return { type: "DEFINITE_24M", days, confidence: "high" };
  if (days >= 950 && days <= 1300) return { type: "DEFINITE_36M", days, confidence: "high" };
  // Trường hợp lạ: 91-299 ngày (giữa probation và 12M) hoặc 451-599 (giữa 12-24M) hoặc 841-949 (giữa 24-36M) hoặc >1300
  if (days < 300) return { type: "DEFINITE_12M", days, confidence: "low" }; // gần 12M nhất
  if (days < 600) return { type: "DEFINITE_12M", days, confidence: "low" };
  if (days < 950) return { type: "DEFINITE_24M", days, confidence: "low" };
  return { type: "DEFINITE_36M", days, confidence: "low" };
}

async function main() {
  console.log(APPLY ? "🚀 APPLY MODE" : "🔍 DRY-RUN");

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
  });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  const contracts = await prisma.contract.findMany({
    include: { employee: { select: { code: true, fullName: true } } },
    orderBy: [{ employeeId: "asc" }, { startDate: "asc" }],
  });
  console.log(`Tổng số Contract trong DB: ${contracts.length}`);

  const mismatches: any[] = [];
  const lowConfidence: any[] = [];
  const correct: any[] = [];

  for (const c of contracts) {
    const derived = deriveContractType(c.startDate, c.endDate);
    if (c.contractType === derived.type && derived.confidence === "high") {
      correct.push(c);
      continue;
    }
    const row = {
      contractNumber: c.contractNumber,
      "Mã NV": c.employee?.code || "",
      "Họ tên": c.employee?.fullName || "",
      "Ngày bắt đầu": c.startDate.toISOString().slice(0, 10),
      "Ngày kết thúc": c.endDate ? c.endDate.toISOString().slice(0, 10) : "(INDEFINITE)",
      "Số ngày": derived.days != null ? derived.days : "—",
      "Loại HĐ HIỆN TẠI (DB)": c.contractType,
      "Loại HĐ ĐÚNG (theo dates)": derived.type,
      "Confidence": derived.confidence,
      contractId: c.id,
    };
    if (c.contractType !== derived.type) {
      mismatches.push(row);
    } else if (derived.confidence === "low") {
      lowConfidence.push(row);
    }
  }

  console.log(`\n📊 Kết quả:`);
  console.log(`  ✅ Đúng: ${correct.length}`);
  console.log(`  ❌ SAI cần fix: ${mismatches.length}`);
  console.log(`     ↳ High confidence (chắc chắn fix): ${mismatches.filter((m) => m.Confidence === "high").length}`);
  console.log(`     ↳ Low confidence (cần verify): ${mismatches.filter((m) => m.Confidence === "low").length}`);
  console.log(`  ⚠️ Loại đúng nhưng dates lạ: ${lowConfidence.length}`);

  // Group mismatch by current → derived
  const byTransition = new Map<string, number>();
  for (const m of mismatches) {
    const k = `${m["Loại HĐ HIỆN TẠI (DB)"]} → ${m["Loại HĐ ĐÚNG (theo dates)"]}`;
    byTransition.set(k, (byTransition.get(k) || 0) + 1);
  }
  console.log(`\n📈 Phân loại sai:`);
  [...byTransition.entries()].sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`  ${k}: ${v}`));

  // Apply — CHỈ fix high confidence (option b)
  if (APPLY) {
    const toFix = mismatches.filter((m) => m.Confidence === "high");
    console.log(`\n🚀 Đang fix ${toFix.length} contracts high-confidence (skip ${mismatches.length - toFix.length} low-confidence)...`);
    let fixed = 0;
    for (const m of toFix) {
      await prisma.contract.update({
        where: { id: m.contractId },
        data: { contractType: m["Loại HĐ ĐÚNG (theo dates)"] as any },
      });
      fixed++;
    }
    console.log(`  ✅ Fixed ${fixed} contracts`);
  }

  // Output Excel
  const wb = XLSX.utils.book_new();
  const summary = [
    { Mục: "Mode", "Giá trị": APPLY ? "APPLY" : "DRY-RUN" },
    { Mục: "Tổng Contract", "Giá trị": contracts.length },
    { Mục: "Đúng (không cần fix)", "Giá trị": correct.length },
    { Mục: "❌ Sai cần fix", "Giá trị": mismatches.length },
    { Mục: "   ↳ High confidence", "Giá trị": mismatches.filter((m) => m.Confidence === "high").length },
    { Mục: "   ↳ Low confidence (verify thủ công)", "Giá trị": mismatches.filter((m) => m.Confidence === "low").length },
    { Mục: "⚠️ Đúng loại nhưng dates lạ", "Giá trị": lowConfidence.length },
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary), "Tổng quan");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(mismatches), "SAI cần fix");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(lowConfidence), "Đúng nhưng dates lạ");

  let outputPath = OUTPUT;
  try {
    XLSX.writeFile(wb, outputPath);
  } catch (e: any) {
    if (e.code === "EBUSY") {
      const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      outputPath = OUTPUT.replace(".xlsx", `_${ts}.xlsx`);
      XLSX.writeFile(wb, outputPath);
    } else throw e;
  }
  console.log(`\n✅ Xuất: ${outputPath}`);

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
