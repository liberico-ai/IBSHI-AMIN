import { PageTitle } from "@/components/layout/page-title";
import { ComingSoon } from "@/components/shared/coming-soon";

export default function CongVanDenPage() {
  return (
    <div>
      <PageTitle
        title="Tiếp nhận công văn đến"
        description="Scan công văn, OCR đọc tự động và auto-assign về phòng phụ trách"
      />
      <ComingSoon
        title="Module Công văn đến"
        description="Owner: HCNS — sử dụng OCR Tesseract / Google Vision"
        features={[
          "Upload công văn scan (PDF/ảnh) hoặc nhập tay",
          "OCR tự đọc: số văn bản, ngày, đơn vị gửi, trích yếu",
          "Auto-assign về phòng phụ trách (rule-based theo trích yếu)",
          "Phòng phụ trách nhận thông báo qua chuông + Telegram",
          "Tracking: Đã nhận → Đã đọc → Đã xử lý → Lưu trữ",
          "Tìm kiếm công văn theo số / ngày / đơn vị / nội dung",
          "Lưu trữ điện tử + scan bản gốc trong MinIO",
        ]}
        dataNeeded={[
          "Quy tắc đánh số công văn đến của công ty",
          "Bộ rule auto-routing: từ khoá → phòng phụ trách",
          "Lựa chọn OCR engine: Tesseract (free) hay Google Vision (premium)?",
          "Mẫu công văn đến đã từng nhận (5-10 mẫu để train OCR)",
          "Quy trình xử lý hiện tại (sổ tay, Excel, hay phần mềm khác)?",
          "Thời gian lưu trữ tối thiểu công văn (5 năm? 10 năm?)",
          "Có cần ký số digital cho confirm received không?",
        ]}
      />
    </div>
  );
}
