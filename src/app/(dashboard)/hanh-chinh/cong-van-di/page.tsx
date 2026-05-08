import { PageTitle } from "@/components/layout/page-title";
import { ComingSoon } from "@/components/shared/coming-soon";

export default function CongVanDiPage() {
  return (
    <div>
      <PageTitle
        title="Tiếp nhận công văn đi"
        description="Soạn tự động theo mẫu IBSHI, đánh số tự động, ký số và gửi đi"
      />
      <ComingSoon
        title="Module Công văn đi"
        description="Owner: HCNS — soạn tự động theo template IBSHI"
        features={[
          "Soạn auto: chọn loại công văn → pre-fill template (logo, header, footer)",
          'Đánh số tự động: format "{số}/{năm}/IBS-{phòng}" tăng tuần tự',
          "Editor inline: HR điền nội dung động (số, ngày, người ký, body)",
          "Workflow 3 cấp: Soạn → TP duyệt nội dung → BGĐ ký số",
          "Xuất PDF có ký số (digital signature)",
          "Lưu kèm bản scan ký giấy (sau khi ký tay)",
          "Email gửi tự động cho đối tác (nếu có địa chỉ)",
          "Sổ công văn đi tổng hợp theo năm + xuất Excel",
        ]}
        dataNeeded={[
          "Template công văn IBSHI (.docx hoặc .html) — bao nhiêu loại?",
          "Logo công ty file vector (.svg) độ phân giải cao",
          "Quy tắc đánh số công văn đi (format chính xác, tăng theo năm/phòng)",
          "Danh sách BGĐ + chữ ký số + ai ký loại công văn nào?",
          "Quy trình duyệt hiện tại (ai → ai → ai)",
          "Có yêu cầu PKI / chữ ký số chuẩn quốc gia không?",
          "Mẫu các loại công văn đi đã có (5-10 mẫu thực tế)",
          "Có cần đóng dấu treo / dấu giáp lai trong PDF không?",
        ]}
      />
    </div>
  );
}
