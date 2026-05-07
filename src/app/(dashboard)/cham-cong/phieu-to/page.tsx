import { PageTitle } from "@/components/layout/page-title";
import { ComingSoon } from "@/components/shared/coming-soon";

export default function PhieuToPage() {
  return (
    <div>
      <PageTitle
        title="Phiếu kê khai tổ trưởng (hàng ngày)"
        description="Tổ trưởng kê khai sản xuất hàng ngày — NV × dự án × công đoạn × giờ"
      />
      <ComingSoon
        title="Phiếu theo dõi công việc hàng ngày"
        description="Form điện tử thay thế phiếu giấy hiện tại — dùng cho tổ SX (R06b)"
        features={[
          "Form bảng giống phiếu giấy: ~12 dòng / NV / ngày",
          "Cột: Mã dự án | Giờ HC (hoặc CN/nghỉ) | Tăng ca | Mã CV | Mã chủng loại | Tăng cường | Hạng mục",
          "Dropdown auto-fill: Mã dự án + Mã công việc + Mã chủng loại từ danh mục",
          "Footer: Vấn đề ảnh hưởng (thời tiết / thiết bị hỏng / sửa Rev bản vẽ / khác) + tổng giờ ảnh hưởng",
          "Submit → trạng thái SUBMITTED chờ TP duyệt",
          "Lưu nháp (DRAFT) trong ngày để hoàn thiện",
          "Auto pre-fill danh sách NV từ tổ của tổ trưởng đang đăng nhập",
        ]}
        dataNeeded={[
          "Danh mục dự án đầy đủ (mã + tên + chủ đầu tư + trạng thái)",
          "Bảng mã công việc + chủng loại đầy đủ (PC-TT, PC-TH, TH-TB, TH-KC, H, ...) — cần file legend",
          'Định nghĩa "Tăng cường" — NV được điều từ tổ khác sang?',
          "Workflow duyệt: Tổ trưởng → ai (TP/Quản đốc/Phòng KH)?",
          "Form phiếu giấy hiện tại có cần scan đính kèm không?",
          "Quy tắc tính lương khoán dựa vào phiếu này (đơn giá / công đoạn)",
        ]}
      />
    </div>
  );
}
