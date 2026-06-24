// Render Phiếu lương chi tiết (PDF) — font Be Vietnam Pro hỗ trợ tiếng Việt đầy đủ.
// Dữ liệu lấy từ PayrollRecord.detail (snapshot tính lương kỳ đó).

import PDFKit from "pdfkit";
import path from "path";

const PDFDocument: any = (PDFKit as any).default || PDFKit;

const FONTS_DIR = path.join(process.cwd(), "src", "assets", "fonts");
const FONT_REG = path.join(FONTS_DIR, "BeVietnamPro-Regular.ttf");
const FONT_BOLD = path.join(FONTS_DIR, "BeVietnamPro-Bold.ttf");

const f = (n: number) => Math.round(n || 0).toLocaleString("vi-VN") + " ₫";
const h = (n: number) => (n || 0).toLocaleString("vi-VN", { maximumFractionDigits: 4 }); // công/giờ giữ số thật (chỉ tiền mới làm tròn)

export interface PayslipPdfInput {
  month: number;
  year: number;
  employee: {
    code?: string | null;
    fullName: string;
    departmentName?: string | null;
    jobTitle?: string | null;
    taxCode?: string | null;
    bankName?: string | null;
    bankAccount?: string | null;
  };
  detail: any; // PayrollRecord.detail
}

export async function renderPayslipPdf(input: PayslipPdfInput): Promise<Buffer> {
  const { month, year, employee: emp, detail: d } = input;
  const doc = new PDFDocument({ size: "A4", margin: 45 });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));

  doc.registerFont("VN", FONT_REG);
  doc.registerFont("VN-Bold", FONT_BOLD);

  const M = 45;
  const RIGHT = doc.page.width - M; // 550
  const labelColor = "#555555";
  const navy = "#0a2540";
  const red = "#CC0000";

  const convDays = (d.otConvertedHours || 0) / 8;
  const totalWorkDays = (d.workDays || 0) + convDays;

  await new Promise<void>((resolve) => {
    doc.on("end", resolve);

    // ── Header ──
    doc.font("VN-Bold").fontSize(17).fillColor(navy).text("PHIẾU LƯƠNG", { align: "center" });
    doc.font("VN").fontSize(12).fillColor("#000000").text(`Tháng ${month}/${year}`, { align: "center" });
    doc.moveDown(0.4);
    doc.moveTo(M, doc.y).lineTo(RIGHT, doc.y).strokeColor(navy).lineWidth(2).stroke();
    doc.moveDown(0.7);

    // ── Helpers ──
    const lineH = 17;
    function infoRow(label: string, value: string) {
      const y = doc.y;
      doc.font("VN").fontSize(9.5).fillColor(labelColor).text(label, M, y, { width: 150 });
      doc.font("VN").fontSize(9.5).fillColor("#000000").text(value, M + 150, y, { width: RIGHT - M - 150 });
      doc.y = y + lineH;
    }
    function sectionTitle(t: string) {
      doc.moveDown(0.5);
      doc.font("VN-Bold").fontSize(11).fillColor(navy).text(t, M);
      doc.moveDown(0.2);
    }
    // 2-cột số liệu: nhãn trái, giá trị phải
    function dataRow(label: string, value: string, opts: { bold?: boolean; color?: string; indent?: number } = {}) {
      const y = doc.y;
      const font = opts.bold ? "VN-Bold" : "VN";
      const color = opts.color || "#000000";
      const x = M + (opts.indent || 0);
      doc.font(font).fontSize(9.5).fillColor(opts.indent ? labelColor : color).text(label, x, y, { width: 360 - (opts.indent || 0) });
      doc.font(font).fontSize(9.5).fillColor(color).text(value, 370, y, { width: RIGHT - 370, align: "right" });
      doc.y = y + lineH;
    }
    function divider(color = "#DDDDDD", w = 1) {
      doc.moveDown(0.2);
      doc.moveTo(M, doc.y).lineTo(RIGHT, doc.y).strokeColor(color).lineWidth(w).stroke();
      doc.moveDown(0.3);
    }

    // ── Thông tin NV ──
    infoRow("Mã nhân viên:", emp.code ?? "—");
    infoRow("Họ và tên:", emp.fullName);
    infoRow("Phòng ban:", emp.departmentName ?? "—");
    infoRow("Chức vụ:", emp.jobTitle ?? "—");
    infoRow("Mã số thuế:", emp.taxCode ?? "—");
    infoRow("Ngân hàng / STK:", `${emp.bankName ?? "—"}${emp.bankAccount ? " — " + emp.bankAccount : ""}`);

    // ── A. Công & giờ làm ──
    sectionTitle("A. NGÀY CÔNG & GIỜ TĂNG CA");
    dataRow("Công chuẩn trong tháng", `${h(d.standardDays)} ngày`);
    dataRow("Ngày công đi làm", `${h(d.workDays)} ngày`);
    dataRow("Ngày nghỉ phép/lễ (hưởng lương)", `${h(d.leaveDays)} ngày`);
    if (d.otWeekday > 0) dataRow("Giờ OT ngày thường (×1,5)", `${h(d.otWeekday)} giờ`);
    if (d.otWeekdayNight > 0) dataRow("Giờ OT đêm ngày thường (×2,0)", `${h(d.otWeekdayNight)} giờ`);
    if (d.otSunday > 0) dataRow("Giờ OT Chủ nhật (×2,0)", `${h(d.otSunday)} giờ`);
    if (d.otSundayNight > 0) dataRow("Giờ OT đêm Chủ nhật (×2,7)", `${h(d.otSundayNight)} giờ`);
    if (d.otHoliday > 0) dataRow("Giờ OT ngày lễ (×3,0)", `${h(d.otHoliday)} giờ`);
    if (d.otHolidayNight > 0) dataRow("Giờ OT đêm ngày lễ (×3,9)", `${h(d.otHolidayNight)} giờ`);
    dataRow("Tổng giờ OT quy đổi", `${h(d.otConvertedHours)} giờ`);
    dataRow("Ngày OT quy đổi (÷8)", `${h(convDays)} ngày`);
    dataRow("Tổng ngày công (công + OT quy đổi)", `${h(totalWorkDays)} ngày`, { bold: true, color: navy });

    // ── B. Thu nhập ──
    sectionTitle("B. THU NHẬP");
    dataRow("Lương ngày công đi làm", f(d.salaryWorkActual));
    if (d.leavePay > 0) dataRow("Lương phép/lễ", f(d.leavePay));
    if (d.fillPay > 0) dataRow("Lương giờ OT bù công (1×)", f(d.fillPay));
    if (d.salaryOT > 0) dataRow("Lương tăng ca (đã nhân hệ số)", f(d.salaryOT));
    if ((d.pieceRate || 0) > 0) dataRow("Lương sản phẩm/khoán", f(d.pieceRate));
    if (d.responsibilityAllow > 0) dataRow("Phụ cấp trách nhiệm", f(d.responsibilityAllow));
    if (d.farAllowance > 0) dataRow("Phụ cấp nhà xa (≥20km)", f(d.farAllowance));
    if ((d.adjustment || 0) !== 0) dataRow("Điều chỉnh/bổ sung", f(d.adjustment));
    divider();
    dataRow("TỔNG THU NHẬP (GROSS)", f(d.grossSalary), { bold: true, color: navy });

    // ── C. Khấu trừ & thuế ──
    sectionTitle("C. KHẤU TRỪ & THUẾ");
    if (d.bhxh8 > 0) dataRow("BHXH người lao động (8%)", f(d.bhxh8), { color: red, indent: 10 });
    if (d.bhyt15 > 0) dataRow("BHYT (1,5%)", f(d.bhyt15), { color: red, indent: 10 });
    if (d.bhtn1 > 0) dataRow("BHTN (1%)", f(d.bhtn1), { color: red, indent: 10 });
    dataRow("Thuế TNCN", f(d.tncn), { color: red, indent: 10 });
    // chi tiết cơ sở tính thuế
    doc.font("VN").fontSize(8).fillColor(labelColor);
    doc.text(`(Thu nhập chịu thuế ${f(d.taxableIncome)} − Giảm trừ gia cảnh ${f(d.personalDeduction)}${d.otTaxExempt > 0 ? " — OT miễn thuế " + f(d.otTaxExempt) : ""})`, M + 10, doc.y, { width: RIGHT - M - 10 });
    doc.moveDown(0.4);
    divider(navy, 1.5);
    dataRow("LƯƠNG THỰC NHẬN (NET)", f(d.netSalary), { bold: true, color: navy });

    // ── D. Tham khảo: công ty đóng ──
    sectionTitle("D. PHẦN CÔNG TY ĐÓNG (tham khảo — không trừ vào lương)");
    dataRow("BHXH công ty đóng (21,5%)", f(d.bhxhEmployer), { color: labelColor });

    // ── Footer ──
    doc.moveDown(1.5);
    doc.moveTo(M, doc.y).lineTo(RIGHT, doc.y).strokeColor("#CCCCCC").lineWidth(0.5).stroke();
    doc.moveDown(0.4);
    doc.font("VN").fontSize(8).fillColor(labelColor).text(
      `Phiếu lương được tạo tự động bởi IBS ONE Platform — ${new Date().toLocaleDateString("vi-VN")}`,
      { align: "center" }
    );

    doc.end();
  });

  return Buffer.concat(chunks);
}
