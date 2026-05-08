import { PageTitle } from "@/components/layout/page-title";
import { ComingSoon } from "@/components/shared/coming-soon";

export default function GiaiTrinhPage() {
  return (
    <div>
      <PageTitle
        title="Đơn giải trình chấm công"
        description="NV nộp đơn giải trình khi máy chấm thiếu dữ liệu (Vào / Ra / Cả ngày)"
      />
      <ComingSoon
        title="Đơn giải trình + Phiếu xác nhận vân tay"
        description="Trigger khi hệ thống auto-detect thiếu punch in/out của NV"
        features={[
          "Auto-detect thiếu dữ liệu: thiếu Vào / thiếu Ra / thiếu Cả ngày",
          "Hệ thống tự gửi notification cho NV qua chuông + Telegram",
          "NV tạo đơn giải trình: chọn ngày + loại lỗi + mô tả lý do",
          'Upload "Phiếu xác nhận vân tay có mã NV" (PDF/ảnh có chữ ký TP)',
          "TP duyệt → cập nhật vào AttendanceRecord chính thức",
          "Lịch sử đơn giải trình theo NV (NV nào hay quên quẹt vân tay)",
          "Báo cáo: số đơn giải trình / phòng / tháng",
        ]}
        dataNeeded={[
          'Mẫu "Phiếu xác nhận vân tay có mã NV" hiện tại của công ty',
          "Quy trình hiện tại khi NV quên quẹt vân tay (cách handle)",
          "TP có thể tự duyệt hay cần leo lên trưởng phòng / HR?",
          "Số lượt giải trình tối đa / NV / tháng (nếu có giới hạn để tránh lạm dụng)?",
          "Notification template: nội dung gửi NV qua Telegram",
          "Hình thức upload: ảnh chụp giấy hay scan PDF?",
        ]}
      />
    </div>
  );
}
