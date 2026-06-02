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
  shortName: "IBS HI",
  address: "Km6- QL5- P. Hồng Bàng- Tp. Hải Phòng",
  phone: "0225. 8831. 440",
  representative: "Trịnh Thị Hà",
  representativeGender: "Bà" as "Ông" | "Bà",
  representativeTitle: "Giám đốc",
};

const CONTRACT_TYPE_LABEL_FORM: Record<string, string> = {
  INDEFINITE: "Hợp đồng không xác định thời hạn",
  DEFINITE_36M: "Hợp đồng xác định thời hạn 36 tháng",
  DEFINITE_24M: "Hợp đồng xác định thời hạn 24 tháng",
  DEFINITE_12M: "Hợp đồng xác định thời hạn 12 tháng",
  PROBATION: "Hợp đồng thử việc",
};

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
  employee: {
    fullName: string;
    gender?: string | null;          // "Nam" / "Nữ" — fallback "Ông/Bà"
    dateOfBirth?: Date | string | null;
    nationality?: string | null;     // mặc định "Việt Nam"
    idNumber?: string | null;
    idIssueDate?: Date | string | null;
    idIssuePlace?: string | null;
    qualification?: string | null;   // Trình độ chuyên môn
    address?: string | null;         // HKTT
    departmentName?: string | null;
  };
}

// ── Dựng HTML hợp đồng mẫu IBSHI, pre-fill toàn bộ ──
// Format theo mẫu IBSHI_Mẫu HĐLĐKXĐTH (áp dụng cho mọi loại HĐ: thử việc, 12M, 24M, KXĐ).
export function buildContractHtml(d: ContractDocData): string {
  const total = (d.baseSalary || 0) + (d.allowance || 0) + (d.kpi || 0);
  const termLabel = CONTRACT_TYPE_LABEL_FORM[d.contractType] || d.contractType;
  const wl = d.workLocation || "Trụ sở chính của Công ty Cổ phần Công nghiệp nặng IBS và các địa điểm làm việc khác theo quyết định điều động cụ thể của Công ty";
  const empTitle = d.employee.gender === "Nam" ? "Ông" : d.employee.gender === "Nữ" ? "Bà" : "Ông/Bà";
  const nationality = d.employee.nationality || "Việt Nam";
  const repTitle = COMPANY_INFO.representativeGender;

  // Câu thời hạn HĐ — KXĐ chỉ có "từ ngày"; có thời hạn thì kèm "đến ngày"
  const termSentence = d.contractType === "INDEFINITE"
    ? `Thời hạn hợp đồng: từ ngày ${dmy(d.startDate)}`
    : `Thời hạn hợp đồng: từ ngày ${dmy(d.startDate)} đến ngày ${dmy(d.endDate)}`;

  const rows: string[] = [];

  // ── Header ──
  rows.push(`<p class="center"><b>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</b></p>`);
  rows.push(`<p class="center"><b>Độc lập - Tự do - Hạnh phúc</b></p>`);
  rows.push(`<p class="center"><i>----------</i></p>`);
  rows.push(`<p class="center"><b>${esc(COMPANY_INFO.name)}</b></p>`);
  rows.push(`<p class="center">Số: ${esc(d.contractNumber)}</p>`);
  rows.push(`<h1>HỢP ĐỒNG LAO ĐỘNG</h1>`);

  // ── Bên A (Người sử dụng lao động) ──
  rows.push(`<p>Chúng tôi, một bên là <b>${esc(repTitle)}</b>: <b>${esc(COMPANY_INFO.representative)}</b></p>`);
  rows.push(`<p>Quốc tịch: Việt Nam</p>`);
  rows.push(`<p>Chức vụ: ${esc(COMPANY_INFO.representativeTitle)}</p>`);
  rows.push(`<p>Đại diện cho: <b>${esc(COMPANY_INFO.name)} (${esc(COMPANY_INFO.shortName)})</b></p>`);
  rows.push(`<p>Địa chỉ: ${esc(COMPANY_INFO.address)}</p>`);
  rows.push(`<p>Điện thoại: ${esc(COMPANY_INFO.phone)}</p>`);

  // ── Bên B (Người lao động) ──
  rows.push(`<p>Và một bên là <b>${esc(empTitle)}</b>: <b>${esc(d.employee.fullName)}</b></p>`);
  rows.push(`<p>Sinh ngày: ${dmy(d.employee.dateOfBirth)}　　Quốc tịch: ${esc(nationality)}</p>`);
  rows.push(`<p>Số CMND/Thẻ căn cước: ${esc(d.employee.idNumber || "………………")}　　Cấp ngày: ${d.employee.idIssueDate ? dmy(d.employee.idIssueDate) : "………………"}</p>`);
  rows.push(`<p>Nơi cấp: ${esc(d.employee.idIssuePlace || "………………")}</p>`);
  rows.push(`<p>Trình độ chuyên môn: ${esc(d.employee.qualification || "………………")}</p>`);
  rows.push(`<p>Nghề nghiệp: ${esc(d.jobTitle || "………………")}</p>`);
  rows.push(`<p>Nơi đăng ký HKTT: ${esc(d.employee.address || "………………")}</p>`);

  rows.push(`<p><i>Thoả thuận cùng ký hợp đồng lao động và cam kết làm đúng những điều khoản sau đây:</i></p>`);

  // ── Điều 1: Thời hạn, công việc, địa điểm ──
  rows.push(`<p><b>Điều 1. Thời hạn hợp đồng, công việc và địa điểm làm việc:</b></p>`);
  rows.push(`<p>Loại hợp đồng: <b>${esc(termLabel)}</b></p>`);
  rows.push(`<p>${esc(termSentence)}</p>`);
  rows.push(`<p>Chức danh chuyên môn: <b>${esc(d.jobTitle || "")}</b> - Thuộc đơn vị: ${esc(d.employee.departmentName || "")}</p>`);
  rows.push(`<p>Công việc phải làm: Nhiệm vụ cụ thể do ông Trưởng Bộ phận quản lý trực tiếp người lao động phân công và được thể hiện trong Bản mô tả công việc.</p>`);
  rows.push(`<p>Địa điểm làm việc: ${esc(wl)}</p>`);

  // ── Điều 2: Thời giờ làm việc ──
  rows.push(`<p><b>Điều 2. Thời giờ làm việc, thời giờ nghỉ ngơi, chế độ làm thêm giờ:</b></p>`);
  rows.push(`<p>Thực hiện theo đúng quy định hiện hành của Bộ luật lao động và quy định của Công ty.</p>`);
  rows.push(`<p>Thời gian làm việc: Từ thứ 2 đến thứ 7: Sáng từ 7h30 đến 11h30; Chiều từ 13h đến 17 giờ.</p>`);
  rows.push(`<p>Thời giờ làm việc bình thường 08 giờ trong 01 ngày, 48 giờ trong 01 tuần. Số ngày công được tính theo số ngày làm việc thực tế trong 01 tháng.</p>`);
  rows.push(`<p>Thời giờ nghỉ ngơi: Nghỉ phép năm, nghỉ các ngày lễ tết và các ngày theo quy định công ty.</p>`);
  rows.push(`<p>Chế độ làm thêm giờ: Tiền làm thêm giờ được tính theo quy định của Luật lao động. Số giờ làm thêm được tính sau khi Người lao động đảm bảo làm đủ tổng số thời giờ làm việc bình thường trong tháng quy định tại khoản 2 điều này.</p>`);

  // ── Điều 3: Trang bị bảo hộ ──
  rows.push(`<p><b>Điều 3. Trang bị bảo hộ lao động cho người lao động:</b></p>`);
  rows.push(`<p>Được cấp phát trang thiết bị bảo hộ lao động cho từng chức danh công việc cụ thể theo quy định của Công ty.</p>`);
  rows.push(`<p>Khi người lao động không tiếp tục làm việc tại Công ty phải hoàn trả lại trang thiết bị bảo hộ lao động đã cấp phát cho công ty.</p>`);

  // ── Điều 4: Quyền lợi và nghĩa vụ NLĐ ──
  rows.push(`<p><b>Điều 4. Quyền lợi và nghĩa vụ của người lao động:</b></p>`);
  rows.push(`<p><b>4.1. Quyền lợi</b></p>`);
  rows.push(`<p>Tổng thu nhập: <b>${vnd(total)}</b>/tháng, bao gồm:</p>`);
  rows.push(`<p>+ Mức lương chính: <b>${vnd(d.baseSalary)}</b>/tháng.</p>`);
  rows.push(`<p>+ Các khoản phụ cấp, hỗ trợ lương khác: <b>${vnd((d.allowance || 0) + (d.kpi || 0))}</b>/tháng (Bao gồm: xăng xe điện thoại, nhà ở, KPI)</p>`);
  rows.push(`<p>Hình thức trả lương: Trả lương theo thời gian tương ứng với số ngày làm việc thực tế bằng tiền mặt hoặc chuyển khoản</p>`);
  rows.push(`<p>Chu kỳ tính lương từ ngày 01 đến ngày cuối cùng của tháng.</p>`);
  rows.push(`<p>Thời gian trả lương: trả 01 lần trong tháng, từ ngày 10 đến ngày 15 của tháng kế tiếp. Trường hợp ngày trả lương trùng vào ngày nghỉ tuần hoặc nghỉ lễ thì ngày trả lương sẽ là ngày trở lại làm việc đầu tiên sau ngày nghỉ. Trường hợp có thay đổi thời gian trả lương, Công ty sẽ có thông báo cụ thể.</p>`);
  rows.push(`<p>Chế độ nâng lương: theo quy định của Công ty.</p>`);
  rows.push(`<p>Tiền thưởng: Lương tháng 13 và các khoản thưởng, phúc lợi khác trong năm theo hiệu quả làm việc của công nhân viên và tùy theo hiệu quả sản xuất và tình hình kinh doanh thực tế của Công ty ở từng thời điểm.</p>`);
  rows.push(`<p>Bảo hiểm xã hội, y tế, thất nghiệp: Thực hiện theo quy định hiện hành của Bộ luật lao động và luật bảo hiểm xã hội hiện hành. Mức lương chính theo quy định của Công ty là cơ sở để đóng BHXH, BHYT, BHTN.</p>`);
  rows.push(`<p>Thuế Thu nhập cá nhân: Thực hiện theo Quy định của pháp luật.</p>`);
  rows.push(`<p>Chế độ đào tạo, bồi dưỡng, nâng cao trình độ tay nghề: Theo Quy định của Công ty</p>`);

  rows.push(`<p><b>4.2. Nghĩa vụ</b></p>`);
  rows.push(`<p><b>4.2.1. Nghĩa vụ hợp đồng:</b></p>`);
  rows.push(`<p>Hoàn thành những công việc đã cam kết trong hợp đồng lao động.</p>`);
  rows.push(`<p>Chấp hành điều lệnh sản xuất kinh doanh, Nội quy lao động, Nội quy an toàn lao động…</p>`);
  rows.push(`<p>Chấp hành sự điều động, phân công công tác của người sử dụng lao động;</p>`);
  rows.push(`<p><b>4.2.2. Nghĩa vụ cung cấp và bảo mật thông tin:</b></p>`);
  rows.push(`<p>Người lao động cam kết toàn bộ chứng chỉ, bằng cấp và hồ sơ cá nhân cung cấp cho IBS HI trong quá trình tuyển dụng và làm việc là hoàn toàn chính xác và hợp pháp. IBS HI có quyền điều tra, tìm hiểu các thông tin trên. Nếu IBS HI phát hiện các chứng chỉ, bằng cấp và hồ sơ của Người lao động cung cấp là giả mạo thì đó được coi là căn cứ để IBS HI xử lý sa thải Người lao động.</p>`);
  rows.push(`<p>Người lao động cam kết giữ bí mật tất cả thông tin có được trong thời gian làm việc tại Công ty Cổ phần Công nghiệp nặng IBS trong vòng 05 (năm) năm kể từ khi nghỉ việc và không công bố, không tiết lộ, không phổ biến bằng bất kỳ hình thức nào, tới bất kỳ cá nhân, tổ chức nào và vì bất kỳ lý do hay mục đích gì mà chưa được sự đồng ý của Công ty.</p>`);
  rows.push(`<p>Người lao động đồng ý rằng các thông tin bí mật quy định tại Điểm 4.2.2 của Hợp đồng này là tài sản của Công ty cổ phần Công nghiệp nặng IBS. Khi kết thúc làm việc, Người lao động có nghĩa vụ hoàn lại cho IBS HI tất cả các tài liệu, hồ sơ hay các thông tin thuộc bất kỳ dạng nào liên quan đến các thông tin bí mật.</p>`);
  rows.push(`<p><b>Thông tin bí mật:</b></p>`);
  rows.push(`<p>Thông tin bí mật đề cập tại Hợp đồng này gồm tất cả thông tin chưa được IBS HI hay các Công ty liên kết trực tiếp hay gián tiếp của IBS HI công bố, hoặc các thông tin người lao động có được hay được tiết lộ trong quá trình làm việc với IBS HI hoặc bất kỳ thông tin nào liên quan đến IBS HI, các nhà cung cấp hay khách hàng của IBS HI, bao gồm không hạn chế những thông tin sau:</p>`);
  rows.push(`<p>Tất cả bí mật thương mại như: các thông tin kỹ thuật, tài chính, tiếp thị hay các thông tin khác mà không phải là kiến thức thông thường đối với các tổ chức, cá nhân, đối thủ cạnh tranh, các kết quả nghiên cứu và phát triển, các nghiên cứu và phân tích khoa học, hợp đồng và giấy phép, chương trình mua bán, hệ thống kế toán, hệ thống kinh doanh hoặc chương trình máy tính.</p>`);
  rows.push(`<p>Bất kỳ thông tin nào chưa được công bố, hoặc không được phép công bố, bao gồm: các thông tin liên quan đến nhân sự, lương, các thông tin về khách hàng, thiết bị, quy trình, giá cả, hoạt động và hệ thống của IBS HI trong quá khứ, hiện tại hoặc kế hoạch trong tương lai, những kiến thức và dữ liệu liên quan đến hồ sơ của IBS HI hoặc kế hoạch kinh doanh, thông tin tiếp thị và bán hàng do IBS HI tạo ra, sở hữu, kiểm soát hoặc chiếm hữu.</p>`);
  rows.push(`<p>Các thông tin liên quan đến việc kiện tụng và nguy cơ kiện tụng liên quan tới hoặc ảnh hưởng đến IBS HI. Các thông tin bí mật đó có thể bao gồm văn bản, ấn phẩm, phim ảnh, micro phim, băng video, băng từ hoặc đĩa hay bất kỳ phương tiện điện tử nào khác bao gồm băng đĩa quang hay đĩa laser, nội dung mail hoặc các hình thức lưu trữ khác trên máy vi tính.</p>`);
  rows.push(`<p>Các thông tin khác được IBS HI xác định là thông tin bí mật.</p>`);
  rows.push(`<p><b>4.2.3. Bồi thường thiệt hại và trách nhiệm vật chất:</b></p>`);
  rows.push(`<p>Trong trường hợp Người lao động tiết lộ các thông tin bí mật quy định tại Điểm 4.2.2 của Hợp đồng này, Người lao động đồng ý và cam kết bồi thường cho IBS HI bất kỳ thiệt hại nào (bao gồm không giới hạn các chi phí pháp lý) do IBS HI gánh chịu phát sinh từ việc Người lao động vi phạm điều khoản về bảo mật được quy định trong bản cam kết này.</p>`);
  rows.push(`<p>Người lao động vi phạm nghĩa vụ bảo mật tại Hợp đồng này trong thời gian làm việc cho IBS HI sẽ được xem là cơ sở cho việc IBS HI xem xét xử lý kỷ luật bằng hình thức sa thải.</p>`);
  rows.push(`<p>Trong trường hợp được cử đi đào tạo. Nếu Người lao động nghỉ việc trước thời hạn theo cam kết đào tạo, Người lao động sẽ phải bồi hoàn chi phí đào tạo theo quy định của Công ty.</p>`);

  // ── Điều 5: Nghĩa vụ và quyền lợi NSDLĐ ──
  rows.push(`<p><b>Điều 5. Nghĩa vụ và quyền lợi của người sử dụng lao động</b></p>`);
  rows.push(`<p><b>5.1 Nghĩa vụ:</b></p>`);
  rows.push(`<p>Bảo đảm việc làm và thực hiện đầy đủ những điều đã cam kết trong hợp đồng lao động.</p>`);
  rows.push(`<p>Thanh toán đầy đủ, đúng thời hạn các chế độ và quyền lợi cho người lao động theo hợp đồng lao động, thoả ước lao động tập thể (nếu có).</p>`);
  rows.push(`<p><b>5.2 Quyền hạn:</b></p>`);
  rows.push(`<p>Điều hành người lao động hoàn thành công việc theo hợp đồng (bố trí, điều chuyển và tạm ngưng việc…)</p>`);
  rows.push(`<p>Tạm hoãn, chấm dứt hợp đồng lao động, kỷ luật người lao động theo quy định của pháp luật, thoả ước lao động tập thể (nếu có) và nội quy lao động của doanh nghiệp.</p>`);

  // ── Điều 6: Điều khoản thi hành ──
  rows.push(`<p><b>Điều 6. Điều khoản thi hành</b></p>`);
  rows.push(`<p>Những vấn đề về lao động không ghi trong hợp đồng lao động này thì áp dụng quy định của thỏa ước lao động tập thể, trường hợp chưa có thỏa ước tập thể thì áp dụng quy định của pháp luật lao động.</p>`);
  rows.push(`<p>Hợp đồng lao động làm thành 02 (hai) bản có giá trị ngang nhau, Người sử dụng lao động giữ 01 (một) bản, Người lao động giữ 01 (một) bản và có hiệu lực từ ngày ${dmy(d.startDate)}. Khi hai bên ký kết phụ lục hợp đồng lao động thì nội dung của phụ lục hợp đồng lao động cũng có giá trị như các nội dung của bản hợp đồng này.</p>`);
  rows.push(`<p>Hợp đồng này làm tại Công ty Cổ phần Công nghiệp nặng IBS từ ngày ${dmy(d.startDate)}./.</p>`);

  // ── Điều khoản tuỳ chỉnh (nếu có) ──
  if (d.terms && d.terms.trim()) {
    rows.push(`<p><b>Điều khoản bổ sung:</b></p>`);
    rows.push(`<p>${esc(d.terms)}</p>`);
  }

  // ── Chữ ký 2 bên ──
  rows.push(`<p>&nbsp;</p>`);
  rows.push(`<p class="sign"><b>Người lao động</b>　　　　　　　　　　　　<b>Người sử dụng lao động</b></p>`);
  rows.push(`<p class="sign"><i>(Ký tên)</i>　　　　　　　　　　　　　　　　${esc(COMPANY_INFO.representativeTitle)}</p>`);
  rows.push(`<p>&nbsp;</p>`);
  rows.push(`<p>&nbsp;</p>`);
  rows.push(`<p class="sign"><b>${esc(d.employee.fullName)}</b>　　　　　　　　　　　　<b>${esc(COMPANY_INFO.representative)}</b></p>`);

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
