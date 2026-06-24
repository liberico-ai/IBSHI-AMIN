// @ts-nocheck
/**
 * scripts/import-hr-records.ts
 *
 * Nạp hồ sơ nhân sự (ảnh chân dung + hợp đồng) từ kho "Hồ sơ nhân sự" vào M1.
 *
 * Nguồn dữ liệu:
 *   - scripts/hr-records-data.json : metadata HĐ đã OCR từ PDF (số HĐ/loại/vị trí/ngày).
 *   - Thư mục giải nén RAR          : ảnh .jpg + file scan HĐ*.pdf của từng NV.
 *   - 01.Sổ nhân sự IBS.xlsx        : chỉ dùng để lấy LƯƠNG THỬ VIỆC cho HĐ thêm mới.
 *
 * NGUYÊN TẮC (theo yêu cầu):
 *   - KHÔNG xóa hợp đồng. Chỉ SỬA TẠI CHỖ metadata, GIỮ NGUYÊN cột lương/phụ cấp hiện có.
 *   - Khớp HĐ trong PDF với HĐ đang có trong app theo (loại + năm), rồi cập nhật số HĐ,
 *     loại, vị trí, ngày bắt đầu/kết thúc, trạng thái — lương để nguyên.
 *   - HĐ có trong PDF nhưng app chưa có  → THÊM MỚI (lương lấy từ Excel, đánh dấu cần kiểm).
 *   - HĐ app có nhưng PDF không có        → GIỮ NGUYÊN, chỉ cảnh báo để kiểm tay.
 *   - HĐ mới nhất (ngày bắt đầu lớn nhất) → ACTIVE; còn lại → EXPIRED.
 *   - Upload ảnh chân dung + scan PDF lên HR MinIO, gắn fileUrl / photo.
 *
 * Cách chạy:
 *   npx tsx scripts/import-hr-records.ts --dry-run                 # xem trước, không ghi
 *   npx tsx scripts/import-hr-records.ts --only 100008 --dry-run   # 1 NV
 *   npx tsx scripts/import-hr-records.ts --only 100008             # chạy thật 1 NV (MẪU)
 *   npx tsx scripts/import-hr-records.ts                           # chạy toàn bộ
 *
 * Tham số:
 *   --dry-run            : không ghi DB, không upload — chỉ in báo cáo diff
 *   --only <code>        : chỉ xử lý 1 mã NV (có thể lặp lại nhiều lần)
 *   --skip-upload        : bỏ qua upload file (chỉ cập nhật metadata)
 *   --force-photo        : ghi đè ảnh chân dung kể cả khi đã có
 *   --force-reupload     : upload lại scan kể cả HĐ đã có fileUrl
 *   --data <path>        : đường dẫn dataset JSON (mặc định scripts/hr-records-data.json)
 *   --extract-root <dir> : thư mục giải nén chứa "<code>-<TÊN>/..." (mặc định: Downloads\hoso-extract\...\Hồ sơ)
 *   --excel <path>       : đường dẫn 01.Sổ nhân sự IBS.xlsx
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import * as Minio from "minio";
import * as XLSX from "xlsx";
import * as fs from "fs";
import * as path from "path";

// ─── Load .env ────────────────────────────────────────────────────────────────
for (const f of [path.resolve(__dirname, "../.env.local"), path.resolve(__dirname, "../.env")]) {
  if (fs.existsSync(f)) {
    for (const line of fs.readFileSync(f, "utf-8").split("\n")) {
      const m = line.match(/^([^#=\s]+)\s*=\s*"?([^"]*)"?\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  }
}

// ─── Args ─────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const has = (f: string) => argv.includes(f);
const val = (f: string) => { const i = argv.indexOf(f); return i !== -1 ? argv[i + 1] : undefined; };
const valAll = (f: string) => argv.reduce((acc, a, i) => (a === f && argv[i + 1] ? [...acc, argv[i + 1]] : acc), [] as string[]);

const DRY_RUN = has("--dry-run");
const SKIP_UPLOAD = has("--skip-upload");
const FORCE_PHOTO = has("--force-photo");
const FORCE_REUPLOAD = has("--force-reupload");
const ONLY = valAll("--only");
const DATA_PATH = val("--data") || path.resolve(__dirname, "hr-records-data.json");
const EXTRACT_ROOT =
  val("--extract-root") ||
  "C:\\Users\\sontt\\Downloads\\hoso-extract\\Hồ sơ nhân sự\\Hồ sơ";
const EXCEL_PATH =
  val("--excel") ||
  "C:\\Users\\sontt\\Downloads\\hoso-extract\\Hồ sơ nhân sự\\01.Sổ nhân sự IBS.xlsx";

// ─── Prisma (giống src/lib/prisma.ts: Pool + SSL) ─────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL!,
  ssl: process.env.DATABASE_SSL === "false" ? undefined : { rejectUnauthorized: false },
});
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) } as any);

// ─── HR MinIO (giống src/lib/minio.ts) ────────────────────────────────────────
const HR_ENDPOINT = process.env.HR_MINIO_ENDPOINT || "";
const HR_PORT = parseInt(process.env.HR_MINIO_PORT || "443");
const HR_SSL = process.env.HR_MINIO_USE_SSL !== "false";
const HR_BUCKET = process.env.HR_MINIO_BUCKET || "ibshi";
const HR_LOGICAL = "hr-documents";
let hrClient: Minio.Client | null = null;
function getHr(): Minio.Client {
  if (!HR_ENDPOINT) throw new Error("Chưa cấu hình HR_MINIO_ENDPOINT trong .env");
  if (!hrClient) hrClient = new Minio.Client({
    endPoint: HR_ENDPOINT, port: HR_PORT, useSSL: HR_SSL,
    accessKey: process.env.HR_MINIO_ACCESS_KEY || "", secretKey: process.env.HR_MINIO_SECRET_KEY || "",
  });
  return hrClient;
}
function hrUrl(objectName: string): string {
  const proto = HR_SSL ? "https" : "http";
  const portPart = (HR_SSL && HR_PORT === 443) || (!HR_SSL && HR_PORT === 80) ? "" : `:${HR_PORT}`;
  return `${proto}://${HR_ENDPOINT}${portPart}/${HR_BUCKET}/${objectName}`;
}
let uploadSeq = 0;
async function uploadFile(localPath: string, folder: string): Promise<string> {
  const ext = (localPath.split(".").pop() || "bin").toLowerCase();
  const ct = ext === "pdf" ? "application/pdf" : ext === "png" ? "image/png" : ext === "jpg" || ext === "jpeg" ? "image/jpeg" : "application/octet-stream";
  const safe = `${Date.now()}_${(uploadSeq++).toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}.${ext}`;
  const objectName = `${HR_LOGICAL}/${folder}/${safe}`;
  const buf = fs.readFileSync(localPath);
  await getHr().putObject(HR_BUCKET, objectName, buf, buf.length, { "Content-Type": ct });
  return hrUrl(objectName);
}

// ─── Excel: map code → { probationBase, probationAllowance } ───────────────────
// Sheet "Nhân sự ": cột 1 = Mã NV, cột 45 = LCB thử việc, cột 52 = Tổng phụ cấp thử việc.
function loadProbationSalary(): Map<string, { base: number; allowance: number }> {
  const map = new Map();
  try {
    const wb = XLSX.readFile(EXCEL_PATH, { sheetRows: 1000 });
    const ws = wb.Sheets["Nhân sự "] || wb.Sheets["Nhân sự"];
    if (!ws) return map;
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", blankrows: false });
    for (let i = 1; i < rows.length; i++) {
      const code = String(rows[i][1] || "").trim();
      if (!code || !/^\d+$/.test(code)) continue;
      const base = Number(rows[i][45]) || 0;
      const allowance = Number(rows[i][52]) || 0;
      if (base > 0) map.set(code, { base, allowance });
    }
  } catch (e: any) {
    console.warn("⚠️  Không đọc được Excel lương thử việc:", e?.message || e);
  }
  return map;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const TYPE_LABEL: Record<string, string> = {
  PROBATION: "Thử việc", DEFINITE_12M: "12 tháng", DEFINITE_24M: "24 tháng",
  DEFINITE_36M: "36 tháng", INDEFINITE: "Không XĐ",
};
const yearOf = (d: any) => new Date(d).getFullYear();
const dstr = (d: any) => (d ? new Date(d).toISOString().slice(0, 10) : "—");

function findEmployeeFolder(emp: any): string | null {
  const candidates = [emp.folder, `${emp.code}-${(emp.fullName || "").toUpperCase()}`];
  for (const c of candidates) {
    if (c && fs.existsSync(path.join(EXTRACT_ROOT, c))) return path.join(EXTRACT_ROOT, c);
  }
  // fallback: quét thư mục bắt đầu bằng "<code>-"
  try {
    const hit = fs.readdirSync(EXTRACT_ROOT).find((d) => d.startsWith(emp.code + "-") || d.startsWith(emp.code + " "));
    if (hit) return path.join(EXTRACT_ROOT, hit);
  } catch {}
  return null;
}

// Khớp HĐ PDF với HĐ đang có trong app.
function matchContracts(pdf: any[], existing: any[]) {
  const used = new Set<string>();
  for (const p of pdf) p._match = null;
  // Pass 1: cùng loại + cùng năm bắt đầu
  for (const p of pdf) {
    const m = existing.find((e) => !used.has(e.id) && e.contractType === p.contractType && yearOf(e.startDate) === yearOf(p.startDate));
    if (m) { p._match = m; used.add(m.id); }
  }
  // Pass 2: cùng loại (khác năm)
  for (const p of pdf) {
    if (p._match) continue;
    const m = existing.find((e) => !used.has(e.id) && e.contractType === p.contractType);
    if (m) { p._match = m; used.add(m.id); p._looseYear = true; }
  }
  // Pass 3: gần ngày nhất (≤ 366 ngày), khác loại → đổi cả loại
  for (const p of pdf) {
    if (p._match) continue;
    let best = null, bestDiff = Infinity;
    for (const e of existing) {
      if (used.has(e.id)) continue;
      const diff = Math.abs(+new Date(e.startDate) - +new Date(p.startDate));
      if (diff < bestDiff) { bestDiff = diff; best = e; }
    }
    if (best && bestDiff <= 366 * 86400000) { p._match = best; used.add(best.id); p._typeChanged = true; }
  }
  const unmatchedExisting = existing.filter((e) => !used.has(e.id));
  return { unmatchedExisting };
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const W = 64;
  console.log("\n" + "=".repeat(W));
  console.log(`  NẠP HỒ SƠ NHÂN SỰ → M1   ${DRY_RUN ? "[DRY-RUN — không ghi]" : "[GHI THẬT]"}`);
  console.log(`  Dataset : ${DATA_PATH}`);
  console.log(`  Files   : ${EXTRACT_ROOT}`);
  if (ONLY.length) console.log(`  Chỉ NV  : ${ONLY.join(", ")}`);
  console.log("=".repeat(W) + "\n");

  if (!fs.existsSync(DATA_PATH)) { console.error("❌ Không thấy dataset:", DATA_PATH); process.exit(1); }
  const dataset = JSON.parse(fs.readFileSync(DATA_PATH, "utf-8"));
  let employees = dataset.employees || [];
  if (ONLY.length) employees = employees.filter((e: any) => ONLY.includes(String(e.code)));
  if (!employees.length) { console.error("❌ Không có NV nào để xử lý."); process.exit(1); }

  const probation = loadProbationSalary();
  console.log(`💰 Đọc lương thử việc từ Excel: ${probation.size} NV\n`);

  const report = { updated: 0, created: 0, photos: 0, scans: 0, skipped: [] as string[], warnings: [] as string[] };

  for (const emp of employees) {
    const label = `[${emp.code}] ${emp.fullName}`;
    const dbEmp = await prisma.employee.findFirst({
      where: { code: String(emp.code) },
      include: { contracts: { orderBy: { startDate: "asc" } } },
    });
    if (!dbEmp) { report.skipped.push(`${label} — không tìm thấy trong DB (code)`); console.log(`⏭️  ${label}: KHÔNG có trong DB\n`); continue; }

    const folder = findEmployeeFolder(emp);
    console.log(`\n── ${label} ${"─".repeat(Math.max(0, W - label.length - 4))}`);
    if (!folder) report.warnings.push(`${label} — không thấy thư mục file (ảnh/scan sẽ bỏ qua)`);

    const pdf = [...emp.contracts].sort((a, b) => (a.startDate < b.startDate ? -1 : 1));
    const { unmatchedExisting } = matchContracts(pdf, dbEmp.contracts);

    // Trạng thái: HĐ ngày bắt đầu mới nhất = ACTIVE, còn lại EXPIRED.
    // NGOẠI LỆ: nếu app đang có HĐ ĐANG LÀM (ACTIVE/EXPIRING_SOON) mới hơn hoặc bằng HĐ mới nhất trong PDF
    // (tức PDF thiếu HĐ hiện hành) → KHÔNG promote HĐ PDF nào lên ACTIVE; giữ nguyên HĐ đang làm của app.
    const pdfLatest = pdf.length ? new Date(pdf[pdf.length - 1].startDate) : null;
    const existingActiveLater = pdfLatest && unmatchedExisting.find(
      (e) => (e.status === "ACTIVE" || e.status === "EXPIRING_SOON") && new Date(e.startDate) >= pdfLatest
    );
    pdf.forEach((c, i) => (c._status = (!existingActiveLater && i === pdf.length - 1) ? "ACTIVE" : "EXPIRED"));
    if (existingActiveLater) {
      report.warnings.push(`${label} — PDF THIẾU HĐ hiện hành; giữ nguyên HĐ đang làm của app (${existingActiveLater.contractNumber}, lương ${Number(existingActiveLater.baseSalary).toLocaleString("vi-VN")}đ). Mọi HĐ từ PDF đặt Hết hạn.`);
    }

    // Upload ảnh chân dung
    if (folder && emp.photoFile && (FORCE_PHOTO || !dbEmp.photo)) {
      const photoPath = path.join(folder, emp.photoFile);
      if (fs.existsSync(photoPath)) {
        if (DRY_RUN || SKIP_UPLOAD) {
          console.log(`  📷 ảnh: ${emp.photoFile} → (sẽ upload & set Employee.photo)`);
        } else {
          const url = await uploadFile(photoPath, "photos");
          await prisma.employee.update({ where: { id: dbEmp.id }, data: { photo: url } });
          console.log(`  📷 ảnh: ${emp.photoFile} → ${url}`);
        }
        report.photos++;
      } else report.warnings.push(`${label} — không thấy ảnh ${emp.photoFile}`);
    }

    // Xử lý từng HĐ
    for (const p of pdf) {
      const scanPath = folder ? path.join(folder, p.sourceFile) : null;
      const m = p._match;
      const tag = m ? (p._typeChanged ? "SỬA(đổi loại)" : p._looseYear ? "SỬA" : "SỬA") : "THÊM MỚI";
      const head = `  • ${p.sourceFile} → [${tag}] ${p.contractNumber} | ${TYPE_LABEL[p.contractType]} | ${dstr(p.startDate)}→${dstr(p.endDate)} | ${p._status === "ACTIVE" ? "ĐANG LÀM" : "Hết hạn"}`;
      console.log(head);

      // Upload scan
      let fileUrl: string | undefined;
      const needUpload = scanPath && fs.existsSync(scanPath) && !SKIP_UPLOAD &&
        (FORCE_REUPLOAD || !(m && m.fileUrl));
      if (scanPath && !fs.existsSync(scanPath)) report.warnings.push(`${label} — thiếu scan ${p.sourceFile}`);
      if (needUpload && !DRY_RUN) { fileUrl = await uploadFile(scanPath!, "contracts"); report.scans++; }
      else if (needUpload && DRY_RUN) { report.scans++; }

      if (m) {
        // SỬA TẠI CHỖ — giữ nguyên lương (baseSalary/insuranceSalary/allowance/allowances)
        const before = `${m.contractNumber} | ${TYPE_LABEL[m.contractType] || m.contractType} | ${dstr(m.startDate)}→${dstr(m.endDate)} | ${m.status}`;
        console.log(`      cũ: ${before}   (giữ lương: ${Number(m.baseSalary).toLocaleString("vi-VN")}đ)`);
        const data: any = {
          contractNumber: p.contractNumber, contractType: p.contractType,
          position: p.position || m.position, startDate: new Date(p.startDate),
          endDate: p.endDate ? new Date(p.endDate) : null, status: p._status,
        };
        if (fileUrl) data.fileUrl = fileUrl;
        if (!DRY_RUN) await prisma.contract.update({ where: { id: m.id }, data });
        report.updated++;
      } else {
        // THÊM MỚI — lương lấy từ Excel (ưu tiên lương thử việc cho HĐ Thử việc)
        const sal = probation.get(String(emp.code));
        const baseSalary = sal?.base || Number(dbEmp.contracts.find((c) => c.status === "ACTIVE")?.baseSalary) || 0;
        const allowance = sal?.allowance ?? null;
        console.log(`      + tạo mới — lương (Excel): ${baseSalary.toLocaleString("vi-VN")}đ ${sal ? "(lương thử việc)" : "(⚠ ước tính từ HĐ đang làm)"}`);
        if (!baseSalary) { report.warnings.push(`${label} — HĐ mới ${p.contractNumber} KHÔNG có lương để điền (bỏ qua tạo)`); continue; }
        if (!DRY_RUN) {
          await prisma.contract.create({
            data: {
              employeeId: dbEmp.id, contractNumber: p.contractNumber, contractType: p.contractType,
              position: p.position || null, startDate: new Date(p.startDate),
              endDate: p.endDate ? new Date(p.endDate) : null, baseSalary, insuranceSalary: baseSalary,
              allowance, status: p._status, fileUrl: fileUrl || null,
            },
          });
        }
        report.created++;
      }
    }

    for (const e of unmatchedExisting) {
      const isChosenActive = existingActiveLater && e.id === existingActiveLater.id;
      const isStaleActive = !isChosenActive && (e.status === "ACTIVE" || e.status === "EXPIRING_SOON");
      if (isStaleActive) {
        // Tránh 2 HĐ "đang làm": HĐ app ACTIVE dư thừa (không phải HĐ hiện hành) → Hết hạn (chỉ đổi trạng thái, GIỮ lương).
        if (!DRY_RUN) await prisma.contract.update({ where: { id: e.id }, data: { status: "EXPIRED" } });
        const msg = `${label} — HĐ app dư thừa đặt 'Hết hạn' (giữ lương ${Number(e.baseSalary).toLocaleString("vi-VN")}đ): ${e.contractNumber} (${TYPE_LABEL[e.contractType] || e.contractType}, ${dstr(e.startDate)})`;
        console.log(`  ⚠️  ${msg}`);
        report.warnings.push(msg);
      } else {
        const msg = `${label} — HĐ app không khớp PDF, giữ nguyên: ${e.contractNumber} (${TYPE_LABEL[e.contractType] || e.contractType}, ${dstr(e.startDate)}, ${e.status})`;
        console.log(`  ⚠️  ${msg}`);
        report.warnings.push(msg);
      }
    }
  }

  // ─── Báo cáo ────────────────────────────────────────────────────────────────
  console.log("\n" + "─".repeat(W));
  console.log(`  TỔNG KẾT ${DRY_RUN ? "(DRY-RUN)" : ""}`);
  console.log("─".repeat(W));
  console.log(`  ✅ HĐ sửa tại chỗ : ${report.updated}`);
  console.log(`  ➕ HĐ thêm mới    : ${report.created}`);
  console.log(`  📷 Ảnh chân dung  : ${report.photos}`);
  console.log(`  📎 Scan upload    : ${report.scans}`);
  console.log(`  ⏭️  NV bỏ qua      : ${report.skipped.length}`);
  console.log(`  ⚠️  Cảnh báo       : ${report.warnings.length}`);
  console.log("─".repeat(W));
  if (report.skipped.length) { console.log("\n⏭️  BỎ QUA:"); report.skipped.forEach((s) => console.log("   • " + s)); }
  if (report.warnings.length) { console.log("\n⚠️  CẢNH BÁO (kiểm tay):"); report.warnings.forEach((s) => console.log("   • " + s)); }
  console.log(DRY_RUN ? "\n👉 Đây là DRY-RUN. Bỏ --dry-run để ghi thật.\n" : "\n✅ Hoàn tất.\n");

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
