import { PageTitle } from "@/components/layout/page-title";
import { ComingSoon } from "@/components/shared/coming-soon";

export default function TongHopPage() {
  return (
    <div>
      <PageTitle
        title="Bảng tổng hợp công tháng"
        description="Tổng hợp công 4 nhóm: Hành chính / Thêm giờ / Nghỉ có lương / Nghỉ không lương — duyệt trước khi tính lương"
      />
      <ComingSoon
        title="Bảng tổng hợp công tháng (Master sheet)"
        description="View dùng để chốt số liệu trước khi M7 tính lương"
        features={[
          "Matrix: NV × ngày × loại công",
          "Nhóm 1 — Công hành chính (HC, OT, CN làm việc)",
          "Nhóm 2 — Công thêm giờ (có xác nhận của TP — chỉ hiện sau khi TP duyệt OT)",
          "Nhóm 3 — Công nghỉ có lương: Phép / TNLĐ-Ốm / Lễ / Hiếu hỷ",
          "Nhóm 4 — Công nghỉ không lương",
          'Source: AttendanceRecord (vân tay) + DailyTeamReport (kê khai tổ) + LeaveRequest đã duyệt + OTRequest đã duyệt',
          "Workflow: TP review → HR chốt → khoá tháng → tính lương",
          "Sau khi khoá: không sửa được, chỉ tạo bút toán điều chỉnh ở tháng sau",
          "Export Excel cho kế toán",
        ]}
        dataNeeded={[
          "Quy tắc tính công cho từng loại nghỉ (1 ngày phép = 1 công?)",
          "Quy tắc làm tròn giờ OT (làm tròn 0.5h, 1h?)",
          "Định nghĩa công ngày Lễ / Hiếu hỷ — bao nhiêu ngày, ai được hưởng?",
          'Khái niệm "công không lương" áp dụng khi nào (xin nghỉ vượt phép?)',
          "Có cần phân biệt công hành chính vs công làm thực tế (vd nửa ngày)?",
          "Quy tắc khoá tháng (HR khoá vào ngày nào hàng tháng)?",
          "Có cho NV xem bảng tổng hợp của mình trước khi chốt không?",
        ]}
      />
    </div>
  );
}
