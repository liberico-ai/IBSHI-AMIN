import { PageTitle } from "@/components/layout/page-title";
import { ComingSoon } from "@/components/shared/coming-soon";

export default function VppPage() {
  return (
    <div>
      <PageTitle
        title="Cấp văn phòng phẩm"
        description="Workflow 5 bước: Yêu cầu → Lập PR → Đặt mua → Nhận hàng → Phát hàng"
      />
      <ComingSoon
        title="Module Văn phòng phẩm"
        description="Owner: Tháng / Tùng — workflow 5 bước theo tháng"
        features={[
          "Bước 1: HCNS tổng hợp nhu cầu VPP các phòng (hàng tháng)",
          "Bước 2: Lập PR (Purchase Request) đặt mua",
          "Bước 3: BGĐ duyệt PR → Đặt mua từ NCC",
          "Bước 4: Nhận hàng — kiểm đếm + nhập kho",
          "Bước 5: Phát hàng theo phòng → NV ký nhận điện tử",
          "Quản lý tồn kho VPP (nếu có)",
          "Báo cáo chi tiêu VPP theo phòng / quý",
        ]}
        dataNeeded={[
          "Danh mục VPP đầy đủ (mã, tên, đơn vị, đơn giá tham khảo)",
          "Danh sách NCC VPP + thông tin liên hệ",
          "Quy trình PR hiện tại (ai duyệt, ngân sách trần)",
          "Form yêu cầu VPP của NV (template hiện đang dùng)",
          "Có quản lý tồn kho VPP không, hay chỉ quản lý theo PR?",
          "Phụ cấp VPP / phòng / tháng (nếu có giới hạn ngân sách)",
        ]}
      />
    </div>
  );
}
