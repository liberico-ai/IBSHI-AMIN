import { PageTitle } from "@/components/layout/page-title";
import { ComingSoon } from "@/components/shared/coming-soon";

export default function OnboardingPage() {
  return (
    <div>
      <PageTitle
        title="Onboarding NV thử việc"
        description="Checklist 5 mục thu hồ sơ + đào tạo cho NV mới (giai đoạn thử việc 2 tháng)"
      />
      <ComingSoon
        title="Onboarding Checklist 5 mục"
        description="Áp dụng cho NV mới trong giai đoạn thử việc 2 tháng"
        features={[
          "Auto-tạo checklist khi HR set NV trạng thái PROBATION",
          "5 item bắt buộc:",
          "  ① Lý lịch tự thuật (NV upload)",
          "  ② Bằng cấp / chứng chỉ (NV upload, HR verify)",
          "  ③ Xác minh công dân (HR upload CCCD/CMND scan)",
          "  ④ Đăng ký vân tay / khuôn mặt vào máy chấm",
          "  ⑤ Học an toàn lao động (HSE Induction — link M9)",
          "Progress bar tổng (5/5 mục hoàn thành)",
          "Notification HR khi NV upload xong từng mục",
          "Block ký HĐ chính thức nếu chưa đủ 5/5 mục",
        ]}
        dataNeeded={[
          'Mẫu "Lý lịch tự thuật" hiện tại của công ty (file Word)',
          "Danh sách bằng cấp bắt buộc theo từng vị trí (vd: thợ hàn cần chứng chỉ AWS)",
          "Quy trình verify CCCD: HR đối chiếu với thông tin nhập của NV?",
          "Quy trình đăng ký vân tay/khuôn mặt: HR thao tác trên máy chấm hay tự động?",
          "Khoá học HSE Induction: thời lượng bao lâu, có quiz cuối khoá không?",
          "Có item bổ sung tuỳ vị trí không (vd: NV sản xuất cần test sức khoẻ)?",
        ]}
      />
    </div>
  );
}
