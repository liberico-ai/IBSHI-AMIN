import { PageTitle } from "@/components/layout/page-title";
import { ComingSoon } from "@/components/shared/coming-soon";

export default function SuaChuaPage() {
  return (
    <div>
      <PageTitle
        title="Yêu cầu sửa chữa"
        description="Đề xuất sửa chữa cơ sở vật chất, thiết bị; phân công đội kỹ thuật và theo dõi tiến độ"
      />
      <ComingSoon
        title="Module Yêu cầu sửa chữa"
        description="Owner: Tùng — đang chờ cấu hình danh mục thiết bị + đội kỹ thuật"
        features={[
          "Tạo yêu cầu sửa chữa: mô tả + ảnh + mức độ ưu tiên",
          "Auto-phân công đến đội kỹ thuật theo loại thiết bị",
          "Theo dõi: Mới → Tiếp nhận → Đang xử lý → Hoàn thành → Đã xác nhận",
          "Đính kèm hoá đơn sửa chữa (nếu thuê ngoài)",
          "Báo cáo chi phí sửa chữa theo tháng / loại",
          "Cảnh báo nếu yêu cầu quá hạn xử lý",
        ]}
        dataNeeded={[
          "Danh mục loại thiết bị / cơ sở vật chất (điện, nước, máy, tòa nhà...)",
          "Danh sách đội kỹ thuật / nhà thầu ngoài + chuyên môn",
          "Quy tắc phân công tự động (loại nào → đội nào)",
          "SLA xử lý theo mức độ ưu tiên (low/medium/high/critical)",
          "Mẫu phiếu yêu cầu sửa chữa hiện tại của công ty",
          "Quy trình duyệt chi phí (ai duyệt nếu >X triệu?)",
        ]}
      />
    </div>
  );
}
