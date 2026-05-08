import { PageTitle } from "@/components/layout/page-title";
import { ComingSoon } from "@/components/shared/coming-soon";

export default function DanhGiaThuViecPage() {
  return (
    <div>
      <PageTitle
        title="Đánh giá thử việc → Ký HĐ chính thức"
        description="Workflow 2 cấp: GĐ khối phê duyệt → HCNS ký HĐ tier 1 năm / 2 năm / không thời hạn"
      />
      <ComingSoon
        title="Đánh giá kết thúc thử việc 2 tháng"
        description="Thực hiện sau khi NV hoàn thành Onboarding 5/5 mục + đủ 2 tháng thử việc"
        features={[
          "Auto-trigger sau khi NV vào trạng thái PROBATION đủ 2 tháng",
          "Bảng đánh giá: TP đánh giá theo bộ tiêu chí (kỹ năng + thái độ + KPI thử việc)",
          'Đề xuất loại HĐ: 1 năm / 2 năm / Không thời hạn',
          "GĐ khối phê duyệt (cấp 1)",
          "HCNS ký HĐ chính thức (cấp 2) → tự cập nhật M1.Contract",
          "Notification: gửi mời ký HĐ cho NV qua email + Telegram",
          "In HĐ PDF từ template + ký số / ký giấy",
          "Reject flow: BGĐ trả về với lý do → TP đánh giá lại",
        ]}
        dataNeeded={[
          "Bộ tiêu chí đánh giá thử việc (số tiêu chí, thang điểm, trọng số)",
          "Template HĐ lao động chính thức (3 loại: 1y / 2y / không thời hạn)",
          "Quy tắc đề xuất tier HĐ (vd: điểm > 8 → 2 năm, > 9 → không thời hạn)",
          "Ai là GĐ khối phụ trách phê duyệt cho từng phòng (mapping)",
          "Có cần ký HĐ điện tử (eContract) hay vẫn ký giấy?",
          "Quy trình lưu HĐ gốc + scan trong MinIO (số năm lưu trữ?)",
          "Có cảnh báo HĐ sắp hết hạn (1y/2y) trước X ngày để gia hạn?",
        ]}
      />
    </div>
  );
}
