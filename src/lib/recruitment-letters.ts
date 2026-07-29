// Mẫu nội dung thư tuyển dụng (dùng chung cho: sinh preview + gửi thật).
// Tách ra để HCNS có thể "Xem trước" + sửa nội dung trước khi gửi (giống soạn hợp đồng).

export const INTERVIEW_DEFAULT_LOCATION = "Km 6 Quốc lộ 5, Phường Hồng Bàng, TP. Hải Phòng";
// Người ký thư mời nhận việc — TP Hành chính Nhân sự (fix cứng theo yêu cầu, chốt 2026-07-29).
export const OFFER_SIGNER_NAME = "Hoàng Văn Toại";

const fmtDate = (d: string) => d.split("-").reverse().join("/");

export type InterviewInviteData = {
  fullName: string;
  position: string;
  deptName?: string | null;
  interviewDate: string;              // "YYYY-MM-DD"
  interviewTime?: string | null;      // "09:00"
  location?: string | null;
  contact?: string | null;
  note?: string | null;
};

// HTML thân thư mời phỏng vấn — trả về đoạn HTML để (a) hiển thị xem trước/sửa, (b) gửi email.
export function interviewInviteHtml(p: InterviewInviteData): string {
  const location = p.location?.trim() || INTERVIEW_DEFAULT_LOCATION;
  const when = `${p.interviewTime?.trim() ? p.interviewTime.trim() + ", " : ""}ngày ${fmtDate(p.interviewDate)}`;
  const dept = p.deptName?.trim() ? ` – ${p.deptName.trim()}` : "";
  return `
    <div style="font-family:Arial,sans-serif;font-size:14px;color:#0f172a;line-height:1.6">
      <p>Kính gửi Anh/Chị <b>${p.fullName}</b>,</p>
      <p><b>CÔNG TY CỔ PHẦN CÔNG NGHIỆP NẶNG IBS</b> trân trọng cảm ơn Anh/Chị đã quan tâm và ứng tuyển.
      Chúng tôi trân trọng kính mời Anh/Chị tham gia buổi <b>phỏng vấn</b> cho vị trí
      <b>${p.position}</b>${dept} với thông tin như sau:</p>
      <ul>
        <li><b>Thời gian:</b> ${when}</li>
        <li><b>Địa điểm:</b> ${location}</li>
        ${p.contact?.trim() ? `<li><b>Người liên hệ / phỏng vấn:</b> ${p.contact.trim()}</li>` : ""}
      </ul>
      ${p.note?.trim() ? `<p><b>Lưu ý:</b> ${p.note.trim().replace(/\n/g, "<br/>")}</p>` : ""}
      <p>Đề nghị Anh/Chị mang theo CMND/CCCD và đến đúng giờ. Nếu cần thay đổi lịch, vui lòng phản hồi email này.</p>
      <p>Trân trọng,<br/><b>Phòng Hành chính – Nhân sự</b><br/>Công ty CP Công nghiệp nặng IBS</p>
    </div>`;
}

// ── THƯ MỜI NHẬN VIỆC — bản HTML xem trước (khớp nội dung file PDF sinh bằng PDFKit) ──
const vnd = (n: number) => (n || 0).toLocaleString("vi-VN");
const dmy = (d: Date) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;

export type OfferLetterPreviewData = {
  letterNumber?: string | null;
  candidateFullName: string;
  candidateGender?: "Anh" | "Chị" | "Anh/Chị";
  position: string;
  departmentName: string;
  workLocation: string;
  officialSalary: number;
  probationarySalary: number;
  probationDays: number;
  startDate: Date;
  probationEndDate: Date;
  benefits?: string | null;
  hrManagerName?: string | null;
  issuedDate?: Date;
};

export function offerLetterHtml(p: OfferLetterPreviewData): string {
  const g = p.candidateGender || "Anh/Chị";
  const issued = p.issuedDate || p.startDate;
  const benefits = p.benefits?.trim() ||
    "Được đóng BHXH khi lao động được tiếp nhận chính thức, được hưởng các quyền lợi của lao động chính thức theo quy định công ty, được cấp phát các phương tiện làm việc và hưởng các quyền lợi của lao động chính thức theo quy định Công ty và Luật lao động.";
  const row = (label: string, value: string) =>
    `<tr><td style="padding:2px 8px 2px 0;vertical-align:top;width:46%">${label}</td><td style="padding:2px 0;font-weight:bold">${value}</td></tr>`;
  return `
    <div style="font-family:'Times New Roman',serif;font-size:14px;color:#000;line-height:1.55;max-width:720px">
      <table style="width:100%;border-collapse:collapse"><tr>
        <td style="width:50%;vertical-align:top;font-size:12px">
          <b>CÔNG TY CỔ PHẦN<br/>CÔNG NGHIỆP NẶNG IBS</b><br/>Số: ${p.letterNumber || "(số tự sinh khi tạo)"}
        </td>
        <td style="width:50%;text-align:center;vertical-align:top;font-size:12px">
          <b>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</b><br/><b>Độc lập - Tự do - Hạnh phúc</b><br/>———
        </td>
      </tr></table>
      <p style="text-align:right;font-style:italic;margin:8px 0">Hải Phòng, ngày ${String(issued.getDate()).padStart(2, "0")} tháng ${String(issued.getMonth() + 1).padStart(2, "0")} năm ${issued.getFullYear()}</p>
      <h2 style="text-align:center;letter-spacing:1px;margin:14px 0">THƯ MỜI NHẬN VIỆC</h2>
      <p><b><i>Kính gửi ${g} ${p.candidateFullName}</i></b></p>
      <p style="text-align:justify">Sau buổi trao đổi giữa Hội đồng Tuyển dụng Công ty với ${g} về công việc và các nội dung liên quan, Hội đồng tuyển dụng cùng Lãnh đạo công ty đều nhất trí về trình độ, kinh nghiệm chuyên môn lẫn phẩm chất cá nhân của ${g} là phù hợp với môi trường của công ty chúng tôi.</p>
      <p style="text-align:justify">Bằng thư này, Công ty chúng tôi xin trân trọng gửi thư mời làm việc tới ${g} với các thông tin sau:</p>
      <table style="width:100%;border-collapse:collapse;margin:6px 0">
        ${row("1. Mức lương chính thức (sau thử việc):", `${vnd(p.officialSalary)} đồng/tháng`)}
        ${row("2. Mức lương thử việc:", `${vnd(p.probationarySalary)} đồng/tháng`)}
        ${row("3. Thời gian thử việc:", `${p.probationDays} ngày`)}
        ${row("4. Thời gian bắt đầu làm việc:", dmy(p.startDate))}
        ${row("5. Thời gian kết thúc thử việc:", dmy(p.probationEndDate))}
        ${row("6. Địa điểm làm việc:", p.workLocation)}
        ${row("7. Vị trí công việc:", p.position)}
        ${row("8. Bộ phận:", p.departmentName)}
      </table>
      <p style="text-align:justify"><b>9. Các chế độ liên quan:</b> ${benefits}</p>
      <p style="text-align:justify">${g} vui lòng xác nhận lại thông tin ngay sau khi nhận được thư mời trên đồng thời gửi ảnh chân dung để bộ phận Hành chính Nhân sự làm thư giới thiệu tới toàn thể CBNV Công ty. Công ty mong nhận được phản hồi sớm của ${g}. Ngoài ra, trong ngày đầu tiên đi làm, ${g} vui lòng bổ sung đầy đủ hồ sơ nhân sự cho bộ phận Hành chính Nhân sự Công ty.</p>
      <p style="text-align:justify">Chúng tôi hoan nghênh sự gia nhập của ${g} vào Công ty và hy vọng chúng ta sẽ có một sự hợp tác tốt đẹp, lâu bền.</p>
      <p><b>Trân trọng!</b></p>
      <div style="text-align:center;width:45%;margin-left:55%;margin-top:16px">
        <b>THAY MẶT CÔNG TY</b><br/><i>Trưởng phòng Hành Chính Nhân sự</i><br/><i style="color:#888">(Đã ký)</i><br/><br/><b>${p.hrManagerName || OFFER_SIGNER_NAME}</b>
      </div>
    </div>`;
}
