# Danh sách tính năng bàn giao — Hệ thống IBSHI-AMIN

> Bản ghi nhận các module/tính năng đã hoàn thành và bàn giao cho IBS Heavy Industry.
> Ngày cập nhật: 2026-06-01

---

## M1 — Hồ sơ nhân sự

### 1.1 Danh sách CBNV
- Hiển thị danh sách 796 NV (paginated, search theo tên/mã NV)
- 3 tab phân loại: **Tất cả · Chưa cập nhật thông tin · Sắp hết hạn HĐ (≤45 ngày)**
- Bộ lọc theo: phòng ban, trạng thái (Đang làm/Thử việc/Đã nghỉ/Sa thải)
- Export Excel toàn bộ danh sách
- Cảnh báo NV thiếu thông tin cơ bản (CCCD/MST/địa chỉ/BHXH)

### 1.2 Hồ sơ chi tiết nhân viên
4 tab: Thông tin cá nhân · Hợp đồng · Chứng chỉ · Lịch sử công tác

#### Thông tin cá nhân
- Đầy đủ thông tin: cá nhân + công việc + ngân hàng + người phụ thuộc
- Sửa thông tin từng tab
- Tính tự động: tuổi, thâm niên
- Hiển thị quỹ phép năm còn lại (chỉ NV Đang làm)

#### Hợp đồng
- Danh sách HĐ với cảnh báo "còn N ngày" khi sắp hết hạn
- **Ký HĐ mới (gia hạn)**: chỉ sáng khi HĐ hiện tại còn ≤45 ngày
  - Trình soạn Word inline (B/I/List)
  - Thời hạn tự tăng 1 bậc: Thử việc → 12M → 24M → Không XĐ
  - Chức vụ là dropdown (Trưởng phòng / Tổ trưởng / Nhân viên) — chọn TP/TT tự cộng 2.6M PC trách nhiệm
  - Số HĐ tự sinh `<mã NV>/<năm>/HĐLĐ/IBS HI`
  - HĐ cũ tự chuyển trạng thái "Đã gia hạn"
- **Xem HĐ**: modal hiển thị nội dung + bản scan inline (img/PDF) + tải Word/PDF
- **Soạn phụ lục HĐ** (chỉ HĐ ACTIVE):
  - 5 trường có thể điều chỉnh: Chức vụ · Vị trí công việc · Lương cơ bản · 4 thành phần phụ cấp (nhà xa/KPI/chức vụ) · Ngày hiệu lực
  - Workflow: Phát hành → TP HCNS duyệt → Xác nhận đã ký + upload scan → tự áp giá trị mới vào HĐ gốc + hồ sơ NV
  - Xem nội dung phụ lục + tải Word/PDF + scan inline

#### Chứng chỉ
- CRUD chứng chỉ (tên, đơn vị cấp, ngày cấp, hạn, file scan)
- Cảnh báo chứng chỉ sắp hết hạn

#### Lịch sử công tác
- Timeline các sự kiện (Gia nhập / Thăng chức / Điều chuyển / Tăng lương...)

### 1.3 Thêm nhân viên thủ công
- Form đầy đủ thông tin cơ bản + phòng ban + chức vụ
- Tự sinh email công ty (`<tên><chữ đầu họ+đệm>@ibs.com.vn`)
- Tự sinh mã NV `190xxx`

---

## M3 — Chấm công

### 3.1 Đơn nghỉ phép
- **Tạo đơn**: chọn loại nghỉ (8 loại: AL/ML/SL/MT/CL/WL/UL/HT) + ngày + lý do
- **Phân quyền**: NV thấy đơn của mình · MANAGER thấy phòng mình · HR_ADMIN/BOM thấy tất cả
- **Duyệt/Từ chối** (TP phòng): từ chối yêu cầu lý do
- **Phép năm cộng dồn theo tháng**: đến tháng N tối đa N ngày (với quota 12 ngày/năm)
- **Chặn phép năm cho NV thử việc** (chưa có quỹ)
- **Quy tắc tính ngày**: tính cả 2 đầu mút, không tính Chủ Nhật (T7 vẫn làm)
- Hiển thị mã chấm công trên đơn (AL/ML/SL...)
- Export Excel danh sách
- Notification: tạo đơn → manager, duyệt/từ chối → NV

### 3.2 Bảng công
- Import file Excel bảng công (gián tiếp + trực tiếp)
- Hiển thị bảng công theo tháng với mã chấm công

---

## M4 — Tuyển dụng

### 4.1 Tab Thư mời (Offer Letter)
- Soạn thư mời với: lương cơ bản + 3 phụ cấp (nhà xa/KPI/chức vụ) → tự tổng + 85% thử việc
- Duyệt qua HR (TP HCNS/BGĐ) → sinh PDF + gửi email kèm
- Mark UV chấp nhận → tạo tài khoản NV (status Thử việc)

### 4.2 Tab Onboard
- **Nút "Tạo HĐ thử việc"**: chọn NV → trình soạn Word (lương 85%, thời hạn 2 tháng) → Phát hành (PENDING_APPROVAL)
- **Khối "HĐ thử việc chờ duyệt"**: TP HCNS Duyệt / Từ chối
- **Tạo onboarding**: chỉ list NV đã duyệt HĐ thử việc → tạo checklist (Lý lịch / CCCD / Vân tay)
- Sau khi onboarding xong: NV chuyển sang Đang làm
- Cấu hình bằng cấp theo vị trí (yêu cầu chứng chỉ riêng cho từng vị trí)

### 4.3 Tab Đánh giá thử việc
- **Tạo đánh giá**: chỉ NV đã duyệt HĐ thử việc + còn ≤7 ngày hết hạn thử việc
- Form đánh giá 8 tiêu chí PROBATION_CRITERIA + đề xuất loại HĐ chính thức
- TP HCNS phê duyệt → BGĐ duyệt cuối → soạn HĐ chính thức (Word) → phát hành → ký scan
- Khi ký HĐ chính thức: HĐ thử việc tự thành "Hết hạn"

---

## M7 — Lương

### 7.1 Tính lương
- Engine M7 mới theo HĐ + bảng công
- Ngày OT quy đổi (6 loại hệ số: 1.5/2/2/2.7/3/3.9)
- Phép/lễ theo lương BHXH
- BHXH NLĐ 10.5% · BHXH Công ty 21.5% · TNCN 5 bậc
- Giảm trừ NPT 6.2M/người
- Phụ cấp trách nhiệm (TP/TT 2.6M) tự cộng theo chức vụ

### 7.2 Phiếu lương
- Xem chi tiết phiếu lương (modal) + tải PDF
- Phiếu lương hiển thị: lương chính + 3 phụ cấp + OT (giờ quy đổi → ngày) + BHXH + TNCN + thực nhận

### 7.3 Import lương sản phẩm
- Import Excel lương sản phẩm theo tháng/NV
- Cộng vào tổng lương khi tính

---

## M10 — Hành chính

### 10.1 Đặt phòng họp
- Lịch tuần / tháng, slot 30 phút
- Đặt phòng + mời đồng nghiệp (tuỳ chọn)
- Tự bỏ slot bận khi chọn khung giờ
- Huỷ phiếu

### 10.2 Quản lý xe
- Quản lý đội xe (đăng kiểm, bảo trì)
- Đặt xe + điểm đi/điểm đến + người sử dụng
- Lịch tháng hiển thị các chuyến

### 10.3 Văn phòng phẩm (VPP)
- 3 tab: Danh sách VPP · Danh sách yêu cầu VPP (cộng dồn) · Phiếu xuất VPP
- NV tạo yêu cầu (modal 2-pane: chọn VPP + nhập số lượng)
- HCNS cấp phát: chọn lọc (checkbox + SL cấp) hoặc cấp toàn bộ
- Lịch sử cấp phát gom theo ngày

### 10.4 Nhà ăn
- **5 tab**: Đăng ký suất ăn · Đăng ký bổ sung · Khảo sát chất lượng · Chi phí mua thực phẩm · Chi phí
- **Đăng ký suất ăn** (chốt 9h sáng): theo phòng ban, đối tượng (CBNV/Khách/Thầu phụ), bữa trưa/tối OT
  - Khách: nhập đơn giá tay; Thầu phụ: nhập tên + 28k cố định; CBNV: 20k cố định
- **Đăng ký bổ sung** (24/7): TP HCNS duyệt → cộng vào chi phí
- **Khảo sát chất lượng**: NV đánh giá 5 sao + comment
- **Chi phí mua thực phẩm**: nhập sổ chợ theo ngày, gom nhóm theo ngày
- **Chi phí**: so sánh tổng chi phí suất ăn (thu) vs chi phí mua thực phẩm (chi)

### 10.5 Sự kiện công ty
- Tạo sự kiện + checklist + đăng ký tham gia

### 10.6 Yêu cầu sửa chữa
- Tạo phiếu yêu cầu + theo dõi trạng thái

---

## M8 — Kỷ luật & Quy định
- Quản lý nội quy/quy định
- Phiếu kỷ luật (kèm file scan)

## M9 — HSE An toàn
- HSE Induction cho NV mới
- Briefing an toàn (theo phòng ban)

## M5 — Đào tạo
- Quản lý khoá đào tạo
- Cấp chứng chỉ sau khoá

## M6 — Đánh giá & KPI
- Template KPI theo phòng ban
- Chấm KPI hàng tháng

## M2 — Sơ đồ tổ chức
- Tree view phòng ban → tổ → NV
- Click vào tổ xem danh sách NV + biên chế

---

## Hệ thống

### Đăng nhập & phân quyền
- 5 role: EMPLOYEE / TEAM_LEAD / MANAGER / HR_ADMIN / BOM
- Auth qua NextAuth + session
- Đổi mật khẩu lần đầu

### Email tự động (SMTP)
- Email công ty: `<tên><chữ đầu họ+đệm>@ibs.com.vn`
- Gửi thư mời PDF qua SMTP
- Notification trong hệ thống

### Lưu trữ file (MinIO)
- **HR_DOCUMENTS** (HĐ + phụ lục + offer scan) → MinIO riêng (bucket `ibshi` trên server `minio.lab.liberico.com.vn`)
- **CERTIFICATES / CLEANING / HSE / VISITOR PHOTOS** → MinIO local
- 21 file cũ đã migrate sang MinIO mới + 18 URL trong DB đã đồng bộ

### Số HĐ chuẩn
- Định dạng `<mã NV>/<năm ký>/HĐLĐ/IBS HI` áp dụng toàn hệ thống
- Đè tự động cho 633 HĐ cũ

### Đồng bộ file Excel HR
- Sheet 2 (MST NV) — đè 196 MST
- Sheet 3 (NPT) — thêm 13 NPT
- Sheet 5 (HOSO_NV) — import 481 NV cũ (status RESIGNED)
- Sheet 1+4 (lương + HĐ) — đồng bộ 274 HĐ + tạo 37 HĐ mới
- Sheet 7 (HOPDONG) — dựng 617 HĐ skeleton chờ scan

### Notification & Audit log
- Notification cho các sự kiện chính (HĐ chờ duyệt, đơn nghỉ phép, onboarding, đánh giá)
- Audit log lưu các thay đổi quan trọng

---

## Việc còn lại (chờ data từ phía IBS)

1. **Bản scan HĐ lịch sử**: anh sontt chuẩn bị folder scan theo cấu trúc `<mã NV>/<loại HĐ>.pdf` → em import gắn vào 617 HĐ skeleton đã dựng sẵn.
2. **Kết nối máy chấm công**: API để auto-import bảng công thay vì import file Excel.
3. **MinIO public read** (hoặc proxy auth): để hiển thị scan inline trong app.

---

**Stack kỹ thuật:**
- Next.js 14.2.35 (App Router)
- Prisma 7.7.0 + PostgreSQL (SSL)
- NextAuth + bcrypt
- MinIO (S3 compatible) — 2 instance (local + remote)
- pdfkit + docx (xuất file Word/PDF)
- ExcelJS + xlsx (import/export Excel)
- Lucide icons + Tailwind CSS
