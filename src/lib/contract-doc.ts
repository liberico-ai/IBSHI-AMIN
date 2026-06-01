// Hợp đồng lao động dạng VĂN BẢN (HTML) — soạn thảo/sửa trong hệ thống (contentEditable),
// xuất ra cả PDF (pdfkit) và Word (.docx). Parser HTML đơn giản cho các thẻ contentEditable sinh ra.
import PDFKit from "pdfkit";
import path from "path";
import { Document, Packer, Paragraph, TextRun, AlignmentType } from "docx";

const PDFDocument: any = (PDFKit as any).default || PDFKit;
const FONTS_DIR = path.join(process.cwd(), "src", "assets", "fonts");
const FONT_REG = path.join(FONTS_DIR, "BeVietnamPro-Regular.ttf");
const FONT_BOLD = path.join(FONTS_DIR, "BeVietnamPro-Bold.ttf");

export const COMPANY_INFO = {
  name: "CÔNG TY CỔ PHẦN CÔNG NGHIỆP NẶNG IBS",
  address: "Km 6 Quốc lộ 5, Phường Hồng Bàng, Thành phố Hải Phòng, Việt Nam",
  representative: "",
  representativeTitle: "Giám đốc",
};

const CONTRACT_TYPE_LABELS: Record<string, string> = {
  INDEFINITE: "Không xác định thời hạn",
  DEFINITE_36M: "Xác định thời hạn 36 tháng",
  DEFINITE_24M: "Xác định thời hạn 24 tháng",
  DEFINITE_12M: "Xác định thời hạn 12 tháng",
  PROBATION: "Thử việc",
};
const TERM_MONTHS: Record<string, string> = { DEFINITE_36M: "36 tháng", DEFINITE_24M: "24 tháng", DEFINITE_12M: "12 tháng", INDEFINITE: "Không xác định thời hạn" };

// Tên file an toàn cho HTTP header (Content-Disposition không nhận non-ASCII).
export function safeFileName(s: string): string {
  return String(s ?? "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/Đ/g, "D").replace(/đ/g, "d")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "") || "HopDong";
}

const vnd = (n: number) => (n || 0).toLocaleString("vi-VN") + " đồng";
const dmy = (d?: Date | string | null) => { if (!d) return "…/…/……"; const x = new Date(d); return `${String(x.getDate()).padStart(2, "0")}/${String(x.getMonth() + 1).padStart(2, "0")}/${x.getFullYear()}`; };
const esc = (s: string) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export interface ContractDocData {
  contractNumber: string;
  contractType: string;
  startDate?: Date | string | null;
  endDate?: Date | string | null;
  baseSalary: number;
  allowance?: number;
  kpi?: number;
  jobTitle?: string | null;
  workLocation?: string | null;
  terms?: string | null;
  issuedDate?: Date | string | null;
  employee: { fullName: string; dateOfBirth?: Date | string | null; idNumber?: string | null; address?: string | null; departmentName?: string | null };
}

// ── Dựng HTML hợp đồng mẫu, pre-fill toàn bộ ──
export function buildContractHtml(d: ContractDocData): string {
  const total = (d.baseSalary || 0) + (d.allowance || 0) + (d.kpi || 0);
  const termLabel = TERM_MONTHS[d.contractType] || CONTRACT_TYPE_LABELS[d.contractType] || d.contractType;
  const wl = d.workLocation || COMPANY_INFO.address;
  const rows: string[] = [];
  rows.push(`<h1>HỢP ĐỒNG LAO ĐỘNG</h1>`);
  rows.push(`<p class="center">Số: ${esc(d.contractNumber)}</p>`);
  rows.push(`<p class="center"><i>(Loại hợp đồng: ${esc(termLabel)})</i></p>`);
  rows.push(`<p><i>Căn cứ Bộ luật Lao động và các văn bản hướng dẫn thi hành;</i></p>`);
  rows.push(`<p><i>Căn cứ nhu cầu và sự thỏa thuận của hai bên,</i></p>`);
  rows.push(`<p>Hôm nay, ngày ${dmy(d.issuedDate || new Date())}, tại ${esc(COMPANY_INFO.name)}, chúng tôi gồm:</p>`);
  rows.push(`<p><b>BÊN A (NGƯỜI SỬ DỤNG LAO ĐỘNG):</b></p>`);
  rows.push(`<p>Tên đơn vị: <b>${esc(COMPANY_INFO.name)}</b></p>`);
  rows.push(`<p>Địa chỉ: ${esc(COMPANY_INFO.address)}</p>`);
  rows.push(`<p>Đại diện: …………………………  Chức vụ: ${esc(COMPANY_INFO.representativeTitle)}</p>`);
  rows.push(`<p><b>BÊN B (NGƯỜI LAO ĐỘNG):</b></p>`);
  rows.push(`<p>Họ và tên: <b>${esc(d.employee.fullName)}</b></p>`);
  rows.push(`<p>Ngày sinh: ${dmy(d.employee.dateOfBirth)}　　Số CCCD: ${esc(d.employee.idNumber || "………………")}</p>`);
  rows.push(`<p>Địa chỉ thường trú: ${esc(d.employee.address || "………………")}</p>`);
  rows.push(`<p>Hai bên thỏa thuận ký kết hợp đồng lao động với các điều khoản sau:</p>`);
  rows.push(`<p><b>Điều 1. Loại hợp đồng và thời hạn</b></p>`);
  rows.push(`<p>- Loại hợp đồng: <b>${esc(termLabel)}</b>.</p>`);
  rows.push(`<p>- Thời hạn: từ ngày ${dmy(d.startDate)}${d.contractType === "INDEFINITE" ? "" : ` đến ngày ${dmy(d.endDate)}`}.</p>`);
  rows.push(`<p><b>Điều 2. Công việc và địa điểm làm việc</b></p>`);
  rows.push(`<p>- Chức danh/vị trí: <b>${esc(d.jobTitle || "")}</b> — Bộ phận: ${esc(d.employee.departmentName || "")}.</p>`);
  rows.push(`<p>- Địa điểm làm việc: ${esc(wl)}.</p>`);
  rows.push(`<p><b>Điều 3. Thời giờ làm việc</b></p>`);
  rows.push(`<p>- Theo nội quy lao động và quy định của Công ty.</p>`);
  rows.push(`<p><b>Điều 4. Lương và phụ cấp</b></p>`);
  rows.push(`<p>- Lương chính (mức đóng BHXH): <b>${vnd(d.baseSalary)}</b>/tháng.</p>`);
  if ((d.allowance || 0) > 0) rows.push(`<p>- Phụ cấp: ${vnd(d.allowance!)}/tháng.</p>`);
  if ((d.kpi || 0) > 0) rows.push(`<p>- Lương hiệu suất (KPI): ${vnd(d.kpi!)}/tháng.</p>`);
  rows.push(`<p>- Tổng thu nhập: <b>${vnd(total)}</b>/tháng.</p>`);
  rows.push(`<p>- Hình thức trả lương: chuyển khoản, kỳ trả lương theo quy định Công ty.</p>`);
  rows.push(`<p><b>Điều 5. Chế độ BHXH, BHYT, BHTN</b></p>`);
  rows.push(`<p>- Thực hiện theo quy định của pháp luật hiện hành.</p>`);
  rows.push(`<p><b>Điều 6. Quyền và nghĩa vụ của hai bên</b></p>`);
  rows.push(`<p>- Hai bên thực hiện đúng quyền và nghĩa vụ theo Bộ luật Lao động và nội quy Công ty.</p>`);
  if (d.terms && d.terms.trim()) {
    rows.push(`<p><b>Điều 7. Điều khoản khác</b></p>`);
    rows.push(`<p>${esc(d.terms)}</p>`);
  }
  rows.push(`<p>Hợp đồng được lập thành 02 bản, mỗi bên giữ 01 bản và có giá trị pháp lý như nhau.</p>`);
  rows.push(`<p>&nbsp;</p>`);
  rows.push(`<p class="sign"><b>NGƯỜI LAO ĐỘNG</b>　　　　　　　　　　<b>NGƯỜI SỬ DỤNG LAO ĐỘNG</b></p>`);
  rows.push(`<p class="sign"><i>(Ký, ghi rõ họ tên)</i>　　　　　　　　　　　　<i>(Ký, đóng dấu)</i></p>`);
  return rows.join("\n");
}

// ── Phụ lục HĐ: dựng HTML mẫu cho phụ lục điều chỉnh điều khoản ──
export interface AddendumDocData {
  addendumNumber: string;
  parentContractNumber: string;
  effectiveDate: Date | string;
  issuedDate?: Date | string | null;
  changes: { label: string; oldValue?: string | number | null; newValue?: string | number | null; isMoney?: boolean }[];
  employee: { fullName: string; idNumber?: string | null; departmentName?: string | null };
}
export function buildAddendumHtml(d: AddendumDocData): string {
  const fmt = (v: any, money?: boolean) => v == null || v === "" ? "—" : money ? vnd(Number(v)) : String(v);
  const rows: string[] = [];
  rows.push(`<h1>PHỤ LỤC HỢP ĐỒNG LAO ĐỘNG</h1>`);
  rows.push(`<p class="center">Số: ${esc(d.addendumNumber)}</p>`);
  rows.push(`<p class="center"><i>(Đính kèm Hợp đồng lao động số ${esc(d.parentContractNumber)})</i></p>`);
  rows.push(`<p><i>Căn cứ thỏa thuận của hai bên,</i></p>`);
  rows.push(`<p>Hôm nay, ngày ${dmy(d.issuedDate || new Date())}, tại ${esc(COMPANY_INFO.name)}, hai bên gồm:</p>`);
  rows.push(`<p><b>BÊN A (NGƯỜI SỬ DỤNG LAO ĐỘNG):</b> ${esc(COMPANY_INFO.name)}</p>`);
  rows.push(`<p><b>BÊN B (NGƯỜI LAO ĐỘNG):</b> ${esc(d.employee.fullName)} — CCCD: ${esc(d.employee.idNumber || "………………")}</p>`);
  rows.push(`<p>Thống nhất ký kết Phụ lục Hợp đồng lao động số ${esc(d.parentContractNumber)} với các nội dung điều chỉnh sau:</p>`);
  rows.push(`<p><b>Điều 1. Nội dung điều chỉnh</b></p>`);
  rows.push(`<p>Hai bên thống nhất điều chỉnh các điều khoản sau, có hiệu lực kể từ ngày <b>${dmy(d.effectiveDate)}</b>:</p>`);
  for (const c of d.changes) {
    rows.push(`<p>- ${esc(c.label)}: <i>từ</i> <b>${esc(fmt(c.oldValue, c.isMoney))}</b> <i>→ thành</i> <b>${esc(fmt(c.newValue, c.isMoney))}</b>.</p>`);
  }
  rows.push(`<p><b>Điều 2. Hiệu lực</b></p>`);
  rows.push(`<p>- Phụ lục này có hiệu lực kể từ ngày ${dmy(d.effectiveDate)} và là bộ phận không tách rời của Hợp đồng lao động số ${esc(d.parentContractNumber)}.</p>`);
  rows.push(`<p>- Các điều khoản khác của HĐLĐ không đề cập trong Phụ lục này vẫn giữ nguyên hiệu lực.</p>`);
  rows.push(`<p>Phụ lục được lập thành 02 bản, mỗi bên giữ 01 bản và có giá trị pháp lý như nhau.</p>`);
  rows.push(`<p>&nbsp;</p>`);
  rows.push(`<p class="sign"><b>NGƯỜI LAO ĐỘNG</b>　　　　　　　　　　<b>NGƯỜI SỬ DỤNG LAO ĐỘNG</b></p>`);
  rows.push(`<p class="sign"><i>(Ký, ghi rõ họ tên)</i>　　　　　　　　　　　　<i>(Ký, đóng dấu)</i></p>`);
  return rows.join("\n");
}

// ── Parse HTML đơn giản → khối {tag, runs:[{text,bold,italic}], align} ──
interface Run { text: string; bold?: boolean; italic?: boolean }
interface Block { tag: "h1" | "h2" | "p"; align: "left" | "center"; runs: Run[] }

export function htmlToBlocks(html: string): Block[] {
  // Chuẩn hoá: <div> & <br> → ranh giới đoạn
  const norm = (html || "")
    .replace(/<\/(p|div|h1|h2|h3|li)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ");
  // Tách theo thẻ mở khối để biết tag/align; đơn giản: tách theo \n sau chuẩn hoá, giữ inline b/i
  const segments = norm.split(/\n/);
  const blocks: Block[] = [];
  for (let seg of segments) {
    const isH1 = /<h1/i.test(seg);
    const isH2 = /<h[23]/i.test(seg);
    const center = /class="[^"]*center[^"]*"|class="[^"]*sign[^"]*"|text-align:\s*center/i.test(seg);
    // bỏ thẻ khối
    seg = seg.replace(/<(p|div|h1|h2|h3)[^>]*>/gi, "");
    // parse inline bold/italic
    const runs: Run[] = [];
    const re = /<(b|strong|i|em)>([\s\S]*?)<\/\1>|([^<]+)/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(seg)) !== null) {
      if (m[2] !== undefined) {
        const tag = m[1].toLowerCase();
        const txt = decode(stripTags(m[2]));
        if (txt) runs.push({ text: txt, bold: tag === "b" || tag === "strong", italic: tag === "i" || tag === "em" });
      } else if (m[3] !== undefined) {
        const txt = decode(stripTags(m[3]));
        if (txt) runs.push({ text: txt });
      }
    }
    const text = runs.map((r) => r.text).join("").trim();
    if (!text) continue;
    blocks.push({ tag: isH1 ? "h1" : isH2 ? "h2" : "p", align: center ? "center" : "left", runs });
  }
  return blocks;
}
const stripTags = (s: string) => s.replace(/<[^>]+>/g, "");
const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/　/g, "    ");

// ── Render PDF ──
export async function renderContractPdfFromHtml(html: string): Promise<Buffer> {
  const blocks = htmlToBlocks(html);
  const doc = new PDFDocument({ size: "A4", margin: 55 });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  doc.registerFont("VN", FONT_REG);
  doc.registerFont("VN-Bold", FONT_BOLD);
  await new Promise<void>((resolve) => {
    doc.on("end", resolve);
    for (const b of blocks) {
      const size = b.tag === "h1" ? 16 : b.tag === "h2" ? 12 : 10.5;
      const opts: any = { align: b.align === "center" ? "center" : "justify", lineGap: 2 };
      // render runs nối tiếp (continued)
      b.runs.forEach((r, i) => {
        doc.font(r.bold || b.tag === "h1" ? "VN-Bold" : "VN").fontSize(size).fillColor("#000");
        if (r.italic) { try { doc.font("VN"); } catch {} }
        doc.text(r.text, { ...opts, continued: i < b.runs.length - 1 });
      });
      doc.moveDown(b.tag === "h1" ? 0.6 : 0.25);
    }
    doc.end();
  });
  return Buffer.concat(chunks);
}

// ── Render Word (.docx) ──
export async function renderContractDocxFromHtml(html: string): Promise<Buffer> {
  const blocks = htmlToBlocks(html);
  const paras = blocks.map((b) => new Paragraph({
    alignment: b.align === "center" ? AlignmentType.CENTER : AlignmentType.JUSTIFIED,
    spacing: { after: b.tag === "h1" ? 160 : 80 },
    children: b.runs.map((r) => new TextRun({ text: r.text, bold: r.bold || b.tag === "h1", italics: r.italic, size: b.tag === "h1" ? 32 : b.tag === "h2" ? 24 : 22, font: "Times New Roman" })),
  }));
  const doc = new Document({ sections: [{ properties: { page: { margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } }, children: paras }] });
  return Packer.toBuffer(doc) as unknown as Buffer;
}
