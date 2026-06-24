// @ts-nocheck
/**
 * scripts/import-hr-certificates.ts
 *
 * Nạp BẰNG CẤP / QUYẾT ĐỊNH BỔ NHIỆM (file scan) từ kho hồ sơ vào tab Chứng chỉ (M1).
 * Đặt tên chung "Bằng cấp/chứng chỉ 1, 2, 3..." theo thứ tự tăng dần (không ghi cụ thể loại).
 * Chỉ đính kèm file để XEM — như hợp đồng.
 *
 * Nguồn: scripts/hr-cert-manifest.json (do bước rà soát tạo) + thư mục giải nén RAR.
 *
 * Cách chạy:
 *   npx tsx scripts/import-hr-certificates.ts --dry-run
 *   npx tsx scripts/import-hr-certificates.ts --only 190019
 *   npx tsx scripts/import-hr-certificates.ts
 *
 * Idempotent: xoá các cert tên "Bằng cấp/chứng chỉ*" cũ của NV rồi tạo lại (không đụng cert nhập tay khác).
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import * as Minio from "minio";
import * as fs from "fs";
import * as path from "path";

for (const f of [path.resolve(__dirname, "../.env.local"), path.resolve(__dirname, "../.env")]) {
  if (fs.existsSync(f)) for (const line of fs.readFileSync(f, "utf-8").split("\n")) {
    const m = line.match(/^([^#=\s]+)\s*=\s*"?([^"]*)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes("--dry-run");
const onlyIdx = argv.indexOf("--only");
const ONLY = onlyIdx !== -1 ? argv.slice(onlyIdx + 1).filter((a) => !a.startsWith("--")) : [];
const MANIFEST = path.resolve(__dirname, "hr-cert-manifest.json");
const EXTRACT_ROOT = "C:\\Users\\sontt\\Downloads\\hoso-extract\\Hồ sơ nhân sự\\Hồ sơ";

const pool = new Pool({ connectionString: process.env.DATABASE_URL!, ssl: process.env.DATABASE_SSL === "false" ? undefined : { rejectUnauthorized: false } });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) } as any);

const HR_ENDPOINT = process.env.HR_MINIO_ENDPOINT || "";
const HR_PORT = parseInt(process.env.HR_MINIO_PORT || "443");
const HR_SSL = process.env.HR_MINIO_USE_SSL !== "false";
const HR_BUCKET = process.env.HR_MINIO_BUCKET || "ibshi";
let hrClient: Minio.Client | null = null;
const getHr = () => (hrClient ||= new Minio.Client({ endPoint: HR_ENDPOINT, port: HR_PORT, useSSL: HR_SSL, accessKey: process.env.HR_MINIO_ACCESS_KEY || "", secretKey: process.env.HR_MINIO_SECRET_KEY || "" }));
const hrUrl = (o: string) => { const proto = HR_SSL ? "https" : "http"; const pp = (HR_SSL && HR_PORT === 443) || (!HR_SSL && HR_PORT === 80) ? "" : `:${HR_PORT}`; return `${proto}://${HR_ENDPOINT}${pp}/${HR_BUCKET}/${o}`; };
let seq = 0;
async function uploadFile(localPath: string): Promise<string> {
  const ext = (localPath.split(".").pop() || "bin").toLowerCase();
  const ct = ext === "pdf" ? "application/pdf" : ext === "png" ? "image/png" : "image/jpeg";
  const obj = `hr-documents/certificates/${Date.now()}_${(seq++).toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}.${ext}`;
  const buf = fs.readFileSync(localPath);
  await getHr().putObject(HR_BUCKET, obj, buf, buf.length, { "Content-Type": ct });
  return hrUrl(obj);
}

async function main() {
  console.log(`\n=== NẠP BẰNG CẤP/QĐ → tab Chứng chỉ ${DRY_RUN ? "[DRY-RUN]" : "[GHI THẬT]"} ===\n`);
  let items = JSON.parse(fs.readFileSync(MANIFEST, "utf-8"));
  if (ONLY.length) items = items.filter((e: any) => ONLY.includes(String(e.code)));

  const report = { created: 0, deleted: 0, files: 0, skippedNoEmp: [] as string[], warnings: [] as string[] };

  for (const emp of items) {
    const dbEmp = await prisma.employee.findFirst({ where: { code: String(emp.code) }, select: { id: true, fullName: true, startDate: true } });
    if (!dbEmp) { report.skippedNoEmp.push(emp.code); continue; }
    const folder = path.join(EXTRACT_ROOT, emp.folder);

    // Xoá cert "Bằng cấp/chứng chỉ*" cũ (idempotent) — không đụng cert nhập tay khác.
    if (!DRY_RUN) {
      const del = await prisma.certificate.deleteMany({ where: { employeeId: dbEmp.id, name: { startsWith: "Bằng cấp/chứng chỉ" } } });
      report.deleted += del.count;
    }

    let n = 0;
    for (const file of emp.certs) {
      const fp = path.join(folder, file);
      if (!fs.existsSync(fp)) { report.warnings.push(`${emp.code} thiếu file ${file}`); continue; }
      n++;
      const name = `Bằng cấp/chứng chỉ ${n}`;
      let fileUrl: string | null = null;
      if (!DRY_RUN) fileUrl = await uploadFile(fp);
      report.files++;
      console.log(`  [${emp.code}] ${dbEmp.fullName} → ${name}  (${file})`);
      if (!DRY_RUN) {
        await prisma.certificate.create({
          data: {
            employeeId: dbEmp.id, name, issuer: "—",
            issueDate: dbEmp.startDate || new Date(), expiryDate: null,
            fileUrl, status: "VALID",
          },
        });
      }
      report.created++;
    }
  }

  console.log(`\n--- TỔNG KẾT ${DRY_RUN ? "(DRY-RUN)" : ""} ---`);
  console.log(`  Cert tạo: ${report.created} | file upload: ${report.files} | cert cũ xoá: ${report.deleted}`);
  console.log(`  NV không thấy trong DB: ${report.skippedNoEmp.length}${report.skippedNoEmp.length ? " (" + report.skippedNoEmp.join(",") + ")" : ""}`);
  if (report.warnings.length) { console.log("  Cảnh báo:"); report.warnings.forEach((w) => console.log("   • " + w)); }
  console.log(DRY_RUN ? "\n👉 DRY-RUN — bỏ --dry-run để ghi thật.\n" : "\n✅ Hoàn tất.\n");
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
