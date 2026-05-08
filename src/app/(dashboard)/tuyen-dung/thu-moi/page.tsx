import { PageTitle } from "@/components/layout/page-title";
import { ComingSoon } from "@/components/shared/coming-soon";

export default function ThuMoiPage() {
  return (
    <div>
      <PageTitle
        title="Gửi thư mời (Offer Letter)"
        description="Soạn và gửi thư mời cho ứng viên trúng tuyển — auto template + tracking"
      />
      <ComingSoon
        title="Module Offer Letter"
        description="Bước 4 trong workflow tuyển dụng — sau phỏng vấn / đánh giá"
        features={[
          "Soạn thư mời từ template chuẩn IBSHI",
          "Auto fill: tên ứng viên, vị trí, ngày bắt đầu, lương, phụ cấp, địa điểm làm việc",
          "Editor inline để HR điều chỉnh phần body riêng",
          "Workflow: HR soạn → BGĐ duyệt → Gửi qua email + Telegram (nếu có)",
          "Tracking: Sent → Read → Accepted / Rejected",
          "Auto-link sang Onboarding khi ứng viên Accept",
          "Lưu trữ thư mời gửi đi (history)",
        ]}
        dataNeeded={[
          "Template thư mời IBSHI hiện tại (file .docx)",
          "Cấu trúc lương offer (cố định / fix + variable / theo bậc)",
          "Quy trình duyệt: ai duyệt nội dung trước khi gửi (TP / HR Manager / BGĐ)?",
          "SLA chấp nhận: ứng viên có bao nhiêu ngày để Accept?",
          "Có cần ký số digital cho thư mời không?",
          "Email account công ty để gửi (cấu hình SMTP)",
        ]}
      />
    </div>
  );
}
