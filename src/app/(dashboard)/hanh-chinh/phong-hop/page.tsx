import { PageTitle } from "@/components/layout/page-title";
import { ComingSoon } from "@/components/shared/coming-soon";

export default function PhongHopPage() {
  return (
    <div>
      <PageTitle
        title="Đặt phòng họp"
        description="Quản lý lịch sử dụng phòng họp, kiểm tra trùng và đặt thiết bị kèm theo"
      />
      <ComingSoon
        title="Module Đặt phòng họp"
        description="Owner: Tùng — đang chờ cấu hình danh mục phòng + thiết bị"
        features={[
          "Đặt phòng họp theo ngày / giờ, kiểm tra trùng lịch tự động",
          "Đặt thiết bị kèm theo (máy chiếu, TV, polycom, micro)",
          "Workflow: NV đặt → TP duyệt (nếu hơn 1 ngày)",
          "Notification Telegram cho người tham dự",
          "View calendar tuần / tháng theo phòng",
          "Cancel / dời lịch trước giờ họp",
        ]}
        dataNeeded={[
          "Danh sách phòng họp (mã, tên, sức chứa, vị trí, ảnh)",
          "Danh mục thiết bị có thể đặt kèm",
          "Quy định giờ làm việc + ngày nghỉ công ty",
          "Quy tắc duyệt: ai duyệt? Cần duyệt khi nào (>X giờ)?",
          "Có giới hạn số lần đặt / NV / tuần không?",
        ]}
      />
    </div>
  );
}
