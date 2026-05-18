// Render Offer Letter (Thư mời nhận việc) PDF từ template IBSHI
// Sử dụng font Be Vietnam Pro (TTF tự bundle) để hỗ trợ tiếng Việt đầy đủ.

import PDFKit from "pdfkit";
import path from "path";

// Webpack/Next.js RSC có thể export pdfkit qua .default — handle cả 2 cases
const PDFDocument: any = (PDFKit as any).default || PDFKit;

const FONTS_DIR = path.join(process.cwd(), "src", "assets", "fonts");
const FONT_REG = path.join(FONTS_DIR, "BeVietnamPro-Regular.ttf");
const FONT_BOLD = path.join(FONTS_DIR, "BeVietnamPro-Bold.ttf");
const FONT_ITALIC = path.join(FONTS_DIR, "BeVietnamPro-Italic.ttf");
const FONT_BOLD_ITALIC = path.join(FONTS_DIR, "BeVietnamPro-BoldItalic.ttf");
const LOGO_PATH = path.join(process.cwd(), "src", "assets", "images", "logo-ibs.png");

function fmtVND(n: number): string {
  return n.toLocaleString("vi-VN");
}
function fmtDate(d: Date): string {
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

export interface OfferLetterPdfData {
  letterNumber: string;
  candidateFullName: string;
  candidateGender: "Anh" | "Chị";
  position: string;
  departmentName: string;
  workLocation: string;
  officialSalary: number;
  probationarySalary: number;
  probationDays: number;
  startDate: Date;
  probationEndDate: Date;
  benefits: string;
  hrManagerName: string;
  issuedDate: Date;
}

export async function renderOfferLetterPdf(data: OfferLetterPdfData): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: 50 });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));

  // Đăng ký fonts hỗ trợ tiếng Việt
  doc.registerFont("VN", FONT_REG);
  doc.registerFont("VN-Bold", FONT_BOLD);
  doc.registerFont("VN-Italic", FONT_ITALIC);
  doc.registerFont("VN-BoldItalic", FONT_BOLD_ITALIC);

  const PAGE_W = doc.page.width;
  const M = 50;
  const COL_W = PAGE_W - 2 * M;

  await new Promise<void>((resolve) => {
    doc.on("end", resolve);

    // ── Header (chuẩn Việt Nam: 2 cột; trái = Logo + Tên cty + Số; phải = Cộng hoà tiêu ngữ) ──
    const headerY = doc.y;
    const LOGO_W = 55;
    const LOGO_H = 55;
    const LEFT_COL_W = COL_W / 2;
    const RIGHT_COL_X = M + LEFT_COL_W;

    // Logo trái
    try {
      doc.image(LOGO_PATH, M, headerY, { width: LOGO_W, height: LOGO_H });
    } catch {
      // Bỏ qua nếu file logo không tồn tại
    }

    // Tên cty + Số (cùng dòng với logo, dịch sang phải logo)
    const COMPANY_TEXT_X = M + LOGO_W + 8;
    const COMPANY_TEXT_W = LEFT_COL_W - LOGO_W - 8;
    doc.font("VN-Bold").fontSize(11).text("CÔNG TY CỔ PHẦN", COMPANY_TEXT_X, headerY + 4, { width: COMPANY_TEXT_W });
    doc.font("VN-Bold").fontSize(11).text("CÔNG NGHIỆP NẶNG IBS", COMPANY_TEXT_X, doc.y, { width: COMPANY_TEXT_W });
    doc.font("VN").fontSize(9).text(`Số: ${data.letterNumber}`, COMPANY_TEXT_X, doc.y + 4, { width: COMPANY_TEXT_W });

    // Cột phải: Cộng hoà — căn giữa trong cột (chuẩn Việt Nam) + gạch chân dưới tiêu ngữ
    const rightTextY = headerY + 8;
    doc.font("VN-Bold").fontSize(11).text("CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM", RIGHT_COL_X, rightTextY, { width: LEFT_COL_W, align: "center" });
    const slogYStart = doc.y + 2;
    doc.font("VN-Bold").fontSize(11).text("Độc lập - Tự do - Hạnh phúc", RIGHT_COL_X, slogYStart, { width: LEFT_COL_W, align: "center" });
    // Gạch chân ngắn dưới tiêu ngữ
    const slogTextWidth = doc.widthOfString("Độc lập - Tự do - Hạnh phúc");
    const slogUnderlineY = doc.y + 1;
    const slogUnderlineX1 = RIGHT_COL_X + (LEFT_COL_W - slogTextWidth) / 2;
    doc.moveTo(slogUnderlineX1, slogUnderlineY).lineTo(slogUnderlineX1 + slogTextWidth, slogUnderlineY).strokeColor("#000").lineWidth(0.5).stroke();

    // Đảm bảo y cursor xuống dưới phần header
    doc.y = headerY + Math.max(LOGO_H, 50) + 6;
    doc.moveDown(0.4);

    // Date
    doc.font("VN-Italic").fontSize(10).text(`Hải Phòng, ngày ${String(data.issuedDate.getDate()).padStart(2, "0")} tháng ${String(data.issuedDate.getMonth() + 1).padStart(2, "0")} năm ${data.issuedDate.getFullYear()}`, M, doc.y, { width: COL_W, align: "right" });

    doc.moveDown(1.5);

    // ── Title ──
    doc.font("VN-Bold").fontSize(18).fillColor("#000").text("THƯ MỜI NHẬN VIỆC", { align: "center", characterSpacing: 1 });
    doc.moveDown(1);

    // ── Greeting ──
    doc.font("VN-BoldItalic").fontSize(11).text(`Kính gửi ${data.candidateGender} ${data.candidateFullName}`);
    doc.moveDown(0.6);

    // ── Intro ──
    doc.font("VN").fontSize(10.5).text(
      `Sau buổi trao đổi giữa Hội đồng Tuyển dụng Công ty với ${data.candidateGender} về công việc và các nội dung liên quan, Hội đồng tuyển dụng cùng Lãnh đạo công ty đều nhất trí về trình độ, kinh nghiệm chuyên môn lẫn phẩm chất cá nhân của ${data.candidateGender} là phù hợp với môi trường của công ty chúng tôi.`,
      { align: "justify", lineGap: 2 }
    );
    doc.moveDown(0.6);
    doc.text(`Bằng thư này, Công ty chúng tôi xin trân trọng gửi thư mời làm việc tới ${data.candidateGender} với các thông tin sau:`, { align: "justify", lineGap: 2 });
    doc.moveDown(0.6);

    // ── 9 thông tin ──
    const labelW = 200;
    const valueX = M + labelW + 10;
    function info(label: string, value: string) {
      const y = doc.y;
      doc.font("VN").fontSize(10.5).text(label, M, y, { width: labelW });
      doc.font("VN-Bold").fontSize(10.5).text(value, valueX, y, { width: COL_W - labelW - 10 });
      doc.y = Math.max(doc.y, y + 16);
    }

    info("1. Mức lương chính thức (sau thử việc):", `${fmtVND(data.officialSalary)} đồng/tháng`);
    info("2. Mức lương thử việc:", `${fmtVND(data.probationarySalary)} đồng/tháng`);
    info("3. Thời gian thử việc:", `${data.probationDays} ngày`);
    info("4. Thời gian bắt đầu làm việc:", fmtDate(data.startDate));
    info("5. Thời gian kết thúc thử việc:", fmtDate(data.probationEndDate));
    info("6. Địa điểm làm việc:", data.workLocation);
    info("7. Vị trí công việc:", data.position);
    info("8. Bộ phận:", data.departmentName);

    doc.moveDown(0.3);
    // Mục 9 dài nên dùng full width
    doc.font("VN").fontSize(10.5);
    doc.text("9. Các chế độ liên quan: ", M, doc.y, { continued: true });
    doc.text(data.benefits || "Được đóng BHXH khi lao động được tiếp nhận chính thức, được hưởng các quyền lợi của lao động chính thức theo quy định công ty, được cấp phát các phương tiện làm việc và hưởng các quyền lợi của lao động chính thức theo quy định Công ty và Luật lao động.", { align: "justify", lineGap: 2 });

    doc.moveDown(0.6);
    doc.text(`${data.candidateGender} vui lòng xác nhận lại thông tin ngay sau khi nhận được thư mời trên đồng thời gửi ảnh chân dung để bộ phận Hành chính Nhân sự làm thư giới thiệu tới toàn thể CBNV Công ty. Công ty mong nhận được phản hồi sớm của ${data.candidateGender}. Ngoài ra, trong ngày đầu tiên đi làm, ${data.candidateGender} vui lòng bổ sung đầy đủ hồ sơ nhân sự cho bộ phận Hành chính Nhân sự Công ty.`, { align: "justify", lineGap: 2 });

    doc.moveDown(0.6);
    doc.text(`Chúng tôi hoan nghênh sự gia nhập của ${data.candidateGender} vào Công ty và hy vọng chúng ta sẽ có một sự hợp tác tốt đẹp, lâu bền.`, { align: "justify", lineGap: 2 });

    doc.moveDown(0.6);
    doc.font("VN-Bold").text("Trân trọng!");

    // ── Signature block (right) ──
    doc.moveDown(1.2);
    const sigX = M + COL_W * 0.55;
    const sigW = COL_W * 0.45;
    doc.font("VN-Bold").fontSize(11).text("THAY MẶT CÔNG TY", sigX, doc.y, { width: sigW, align: "center" });
    doc.font("VN-Italic").fontSize(10).text("Trưởng phòng Hành Chính Nhân sự", sigX, doc.y + 2, { width: sigW, align: "center" });
    doc.moveDown(0.4);
    doc.font("VN-Italic").fillColor("#888").fontSize(11).text("(Đã ký)", sigX, doc.y, { width: sigW, align: "center" });
    doc.moveDown(2);
    doc.font("VN-Bold").fillColor("#000").fontSize(11).text(data.hrManagerName, sigX, doc.y, { width: sigW, align: "center" });

    doc.end();
  });

  return Buffer.concat(chunks);
}
