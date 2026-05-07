import { PageTitle } from "@/components/layout/page-title";
import { ComingSoon } from "@/components/shared/coming-soon";

export default function DoiSoatPage() {
  return (
    <div>
      <PageTitle
        title="Đối soát chấm công"
        description="So sánh phiếu kê khai tổ trưởng vs dữ liệu máy chấm công thực tế"
      />
      <ComingSoon
        title="Đối soát Tổ trưởng khai vs Máy ghi nhận"
        description="Phát hiện lệch tự động — HR chốt số liệu cuối cho bảng tổng hợp tháng"
        features={[
          "Bảng 3 cột: Tổ trưởng khai | Máy chấm vân tay/khuôn mặt | Chênh lệch",
          "Highlight đỏ những row lệch >30 phút (cấu hình được)",
          "Filter theo: ngày / tổ / NV / mức lệch",
          "Auto-alert Telegram cho TP khi có lệch lớn",
          "HR ghi chú lý do + chốt số liệu cuối (lấy theo cái nào)",
          "Export báo cáo đối soát Excel cho kế toán",
          "Lịch sử đối soát + audit trail mọi điều chỉnh",
        ]}
        dataNeeded={[
          "Format file export máy chấm vân tay (CSV/Excel) hiện tại",
          "Format file export máy chấm khuôn mặt (nếu có) — vendor nào?",
          'Quy tắc xử lý khi lệch: "lấy theo tổ trưởng khai" hay "lấy theo máy"?',
          "Threshold lệch (30 phút? 1 giờ?) để alert tự động",
          "Quy trình duyệt khi tổ trưởng và máy lệch >X giờ",
          "Có cần API real-time với máy chấm không, hay import file thủ công?",
        ]}
      />
    </div>
  );
}
