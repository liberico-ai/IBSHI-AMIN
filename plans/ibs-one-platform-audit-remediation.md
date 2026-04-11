# IBS ONE Platform — Audit Remediation Plan
**Nguồn:** IBS_Admin_Platform_Audit_Report.docx (Audit ngày 11/04/2026)  
**Auditor:** AI System Audit  
**Tổng thể hiện tại:** ~72% | Business Logic: ~55%  
**Mục tiêu:** Go-live Phase 1 Q2/2026

---

## P0 — CRITICAL (Làm ngay, chặn go-live)

### P0-1: Payroll Calculation Engine (M7)
**File:** `src/services/salary.service.ts`, `src/app/api/v1/payroll/[id]/route.ts`  
**Vấn đề:** `salary.service.ts` chỉ có retrieval, không có logic tính gross/net. `PUT /payroll/:id` không tính gì cả dù đã có constants BHXH=8%, BHYT=1.5%, BHTN=1%, OT rates trong `.env`.  
**Tasks:**
- [ ] Implement `calculateSalary(employeeId, periodId)` trong `salary.service.ts`:
  - Lấy `baseSalary` từ Employee
  - Tính `grossSalary` = baseSalary + OT pay + allowances
  - Tính `bhxh` = grossSalary × 8%, `bhyt` = × 1.5%, `bhtn` = × 1%
  - Tính TNCN theo lũy tiến (biểu thuế VN 2024)
  - Tính `netSalary` = grossSalary − BHXH − BHYT − BHTN − TNCN + meal/transport allowance
- [ ] Wire `calculateSalary()` vào `PUT /payroll/:id` route
- [ ] Đọc constants từ `process.env` (OT_RATE_WEEKDAY, BHXH_RATE, v.v.) không hardcode
- [ ] Test với seed data: chạy calculate cho 1 employee, verify net > 0 và hợp lý

---

### P0-2: Leave Balance Validation (M3.1)
**File:** `src/app/api/v1/leave-requests/[id]/approve/route.ts`  
**Vấn đề:** `approveLeave()` không check `remainingDays` trước khi duyệt. Chỉ ANNUAL type cập nhật balance, các loại khác (SICK, PERSONAL, MATERNITY...) không trừ.  
**Tasks:**
- [ ] Trước khi approve: lấy `leaveBalance` của employee cho năm hiện tại
- [ ] Check `remainingDays >= totalDays` của request — nếu không đủ: trả 400 với message rõ ràng
- [ ] Sau khi approve: trừ balance cho **tất cả** leave types (không chỉ ANNUAL)
  - Tạo hoặc update `LeaveBalance` record cho loại phép tương ứng
- [ ] Khi reject: không trừ (và nếu đã trừ nhầm thì rollback)

---

### P0-3: Vehicle Booking Fallback Logic (M10.1)
**File:** `src/bot/commands/dat-xe.ts`, `src/app/api/v1/vehicles/bookings/route.ts`  
**Vấn đề:** Khi không có xe AVAILABLE, bot dùng `findFirst({ select: { id: true } })` — tức là book xe đầu tiên trong DB dù đang IN_USE/MAINTENANCE.  
**Tasks:**
- [ ] Trong `dat-xe.ts`: nếu `vehicle == null` → trả lỗi "Hiện không có xe khả dụng, vui lòng liên hệ HCNS" thay vì fallback
- [ ] Trong API `POST /vehicles/bookings`: thêm overlap detection — check không có booking APPROVED/PENDING nào trùng `[startDate, endDate]` với cùng vehicleId
- [ ] Validate `startDate` không phải ngày trong quá khứ (bot cũng check)

---

## P1 — HIGH (Sprint tiếp theo, trước go-live)

### P1-1: Multi-level Approval Workflow
**Vấn đề:** Hiện tại chỉ có 1-level approve. Spec yêu cầu: NV → Trưởng phòng → HC → BOM.  
**Tasks:**
- [ ] Thiết kế bảng `ApprovalStep` (hoặc extend trạng thái hiện có):
  - `PENDING_TEAM_LEAD` → `PENDING_HR` → `PENDING_BOM` → `APPROVED`
- [ ] Áp dụng cho **Leave Request**: TEAM_LEAD duyệt trước → HR_ADMIN confirm
- [ ] Áp dụng cho **Vehicle Booking**: TEAM_LEAD/MANAGER duyệt trước → HR_ADMIN assign xe
- [ ] Áp dụng cho **Visitor Registration**: HC duyệt trước khi check-in được
- [ ] Áp dụng cho **OT Request**: MANAGER → HR_ADMIN
- [ ] Mỗi bước chuyển trạng thái: ghi `AuditLog` + tạo `Notification` cho người tiếp theo

---

### P1-2: Data Validation Layer
**Vấn đề:** Thiếu validate cross-field và business rules ở API layer.  
**Tasks:**
- [ ] **Date range**: `endDate >= startDate` cho Leave, OT, VehicleBooking, Events
- [ ] **Future date**: Leave/OT/VehicleBooking phải có ngày bắt đầu >= hôm nay
- [ ] **Overlap detection**: Leave không trùng với leave khác của cùng employee; VehicleBooking không trùng xe
- [ ] **Duplicate employee code**: `POST /employees` phải check unique trước khi create
- [ ] Tập trung logic vào validation helpers trong `src/lib/validation.ts` để tái dùng

---

### P1-3: Telegram Push Notifications
**Vấn đề:** Notification chỉ lưu DB, không push thực. `User` model đã có `telegramChatId`.  
**Tasks:**
- [ ] Tạo `src/services/telegram.service.ts` với hàm `sendTelegramMessage(chatId, text)`
- [ ] Gọi `sendTelegramMessage` khi:
  - Leave/OT/VehicleBooking được approve hoặc reject
  - Khách đến cần xử lý (host notification)
  - Có EXPIRY_WARNING (hợp đồng, chứng chỉ sắp hết hạn)
  - NCR chuyển OVERDUE
- [ ] Bot outbound: khi có approval cần TEAM_LEAD/MANAGER xử lý, push message kèm inline keyboard Duyệt/Từ chối

---

### P1-4: Extended RBAC — Resource & Field Level
**Vấn đề:** `permissions.ts` chỉ có role hierarchy. Thiếu: ai được làm gì ở module nào, và resource-level (Trưởng phòng chỉ duyệt phòng mình).  
**Tasks:**
- [ ] Tạo permission matrix trong `src/lib/permissions.ts`:
  - EMPLOYEE: xem/đề xuất các module liên quan bản thân
  - TEAM_LEAD: xem + duyệt cấp 1 cho nhân viên trong phòng
  - MANAGER: full phòng mình + approve cấp 2
  - HR_ADMIN: full tất cả module trừ tài chính
  - BOM: toàn quyền
- [ ] Resource-level: khi MANAGER approve leave, verify `employee.departmentId == manager.departmentId` (đã có một phần ở leave approve, nhân rộng sang OT, Vehicle)
- [ ] Field-level: salary slip — EMPLOYEE chỉ xem của mình, HR_ADMIN xem tất cả

---

## P2 — MEDIUM (Trước go-live, có thể parallel)

### P2-1: Calendar Views
**Các module thiếu:** Vehicle Booking, Visitor Schedule, Event Calendar  
**Tasks:**
- [ ] Thêm calendar tab/view cho `/hanh-chinh/xe` — hiển thị booking theo tháng (dùng thư viện `react-big-calendar` hoặc custom grid)
- [ ] Thêm calendar view cho `/hanh-chinh/khach` — lịch khách sắp tới
- [ ] Thêm calendar view cho `/hanh-chinh/su-kien` — events + audit schedule
- [ ] Shared `CalendarView` component tái dùng được

---

### P2-2: QR Code Generation cho VisitorBadge
**File:** `src/app/api/v1/visitors/[id]/badge/route.ts` (hoặc tạo mới)  
**Vấn đề:** `VisitorBadge.qrData` field có nhưng trống, badge chỉ là số.  
**Tasks:**
- [ ] Cài `qrcode` npm package
- [ ] Khi tạo badge: generate QR code chứa `{ visitorId, badgeId, visitDate }` → lưu vào `qrData` (base64 PNG hoặc SVG string)
- [ ] Frontend badge view: hiển thị QR image + thông tin khách để in hoặc scan

---

### P2-3: Report Optimization
**Vấn đề:** `/reports/route.ts` là 1 endpoint 431 dòng, không có caching, chạy expensive queries mỗi request.  
**Tasks:**
- [ ] Tách thành các route riêng: `/reports/payroll`, `/reports/attendance`, `/reports/kpi`, `/reports/audit`
- [ ] Thêm `Cache-Control` header hoặc in-memory cache 5 phút cho dashboard-kpi
- [ ] Dùng `SELECT` chỉ lấy fields cần thiết, tránh include toàn bộ relations

---

### P2-4: Telegram Bot Security
**Vấn đề:** Webhook không có signature verification, không rate limiting.  
**Tasks:**
- [ ] Thêm `X-Telegram-Bot-Api-Secret-Token` header verification trong `src/app/api/v1/bot/webhook/route.ts`
- [ ] Thêm rate limiting: tối đa 10 message/phút/chatId (dùng in-memory counter hoặc Redis nếu có)
- [ ] Idempotency: kiểm tra `update_id` đã xử lý chưa trước khi process

---

### P2-5: 5S Audit Integration (M10.3 ↔ M9)
**Tasks:**
- [ ] `CleaningLog` có `score` (1-5) → ánh xạ sang 5S scoring trong HSE module
- [ ] Tạo API endpoint `/api/v1/hse/5s-audit` aggregate từ CleaningLog + HSE inspection data
- [ ] Frontend HSE: tab "5S Audit" hiển thị điểm theo zone/tháng

---

## P3 — LOW (Post go-live / Sprint sau)

### P3-1: Consistent Audit Logging
- [ ] Rà soát tất cả CRUD routes, đảm bảo mỗi CREATE/UPDATE/DELETE ghi `AuditLog`
- [ ] Fields chuẩn: `entityType`, `entityId`, `action`, `userId`, `oldValue`, `newValue`, `timestamp`
- [ ] Module còn thiếu: Training, Recruitment, Cleaning, Events

---

### P3-2: File Upload Integration (MinIO)
- [ ] Module Discipline (`src/app/api/v1/discipline/`): upload evidence files thay vì chỉ lưu URL
- [ ] Module Training: upload tài liệu khóa học, certificate PDF
- [ ] Module HSE: upload incident photos
- [ ] Tạo shared `src/lib/upload.ts` helper cho MinIO `putObject`

---

### P3-3: Export PDF / Excel
- [ ] Salary Slip: đã có print CSS — thêm nút "Export PDF" dùng browser `window.print()` hoặc Puppeteer
- [ ] Attendance Report: export Excel (`.xlsx`) dùng `exceljs`
- [ ] Leave Summary: export cho HR
- [ ] NCR Report: export danh sách NCR theo kỳ

---

### P3-4: Mobile Responsive
- [ ] Audit tất cả trang admin trên viewport 375px (iPhone SE)
- [ ] Ưu tiên: Dashboard, Leave Request form, Attendance table, Salary Slip
- [ ] Fix overflow table: thêm `overflow-x-auto` wrapper, sticky first column nếu cần

---

## Module-specific Gaps (bổ sung)

| Module | Vấn đề | Priority |
|--------|---------|----------|
| M1 - Hồ sơ NV | Validate trùng mã NV khi tạo | P1 (đã có trong P1-2) |
| M1 - Hồ sơ NV | Soft-delete (isActive flag) thay vì hard delete | P2 |
| M1 - Hồ sơ NV | Field change history (ai sửa gì lúc nào) | P3 |
| M2 - Sơ đồ tổ chức | Visual org chart tree/graph (không chỉ list) | P2 |
| M3 - Chấm công | Validate không cho nhập ngày tương lai | P1 (P1-2) |
| M3 - Chấm công | Tích hợp leave vào attendance report | P2 |
| M4 - Tuyển dụng | Interview pipeline visual (Kanban/stage view) | P3 |
| M4 - Tuyển dụng | Offer letter generation (PDF template) | P3 |
| M5 - Đào tạo | Quản lý tài liệu khóa học | P2 |
| M5 - Đào tạo | Certificate CRUD (hiện chỉ có alert) | P2 |
| M5 - Đào tạo | Enrollment workflow (NV đăng ký → phê duyệt) | P2 |
| M6 - KPI | Employee-level KPI (không chỉ department) | P2 |
| M6 - KPI | Xóa hardcode `dept = "SX"` cho piece-rate | P1 |
| M8 - Kỷ luật | Upload file evidence thực (không chỉ URL) | P3 (P3-2) |
| M9 - HSE | Incident status workflow (OPEN→IN_PROGRESS→CLOSED) | P1 |
| M9 - HSE | Corrective action tracking per incident | P2 |
| M9 - HSE | SLA response time (ưu tiên CRITICAL ≤ 24h) | P2 |
| M10.2 - Nhà ăn | WeeklyMenu CRUD (hiện chỉ read) | P2 |
| M10.2 - Nhà ăn | Budget control (định mức chi phí / tháng) | P2 |
| M10.2 - Nhà ăn | Guest meal cost tự động cộng vào report | P2 |
| M10.3 - Vệ sinh | Issue resolution workflow (REPORTED→ASSIGNED→RESOLVED) | P2 |
| M10.4 - Khách | Pre-checkin approval step (HC/BOM duyệt) | P1 (P1-1) |
| M10.4 - Khách | Host notification khi khách đến | P1 (P1-3) |
| M10.5 - Sự kiện | NCR autoMarkOverdue dùng cron job thay vì gọi trong GET | P2 |
| M10.5 - Sự kiện | Attendee enrollment cho sự kiện nội bộ | P3 |
| M10.5 - Sự kiện | Audit-specific report (NCR trend, audit history) | P3 |
| Bot MoltBot | Sửa đăng ký suất ăn nếu đã đăng ký | P2 |
| Bot MoltBot | Validate ngày đặt xe không phải quá khứ | P0 (P0-3) |

---

## Tóm tắt theo sprint

| Sprint | Items | Kết quả dự kiến |
|--------|-------|-----------------|
| Sprint 1 (tuần này) | P0-1, P0-2, P0-3 | Fix 3 blocker CRITICAL → ~78% |
| Sprint 2 | P1-1, P1-2, P1-3, P1-4 | Multi-level approval + validation → ~85% |
| Sprint 3 | P2-1, P2-2, P2-3, P2-5, M6-piece-rate, M9-incident | Calendar + QR + HSE workflow → ~90% |
| Sprint 4 | P2-4, P3-1, P3-2, remaining M-items | Security + logging + file upload → ~95% |
| Sprint 5 | P3-3, P3-4, M4/M5 gaps | Export + mobile + recruitment → ~98% |
