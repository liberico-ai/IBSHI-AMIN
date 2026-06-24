-- Ca đêm: thêm giờ công hành chính đêm (HC Đ) + giờ tăng ca đêm (Thêm giờ Đ) cho file chấm công mới.
ALTER TABLE "AttendanceRecord" ADD COLUMN IF NOT EXISTS "nightHours" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "AttendanceRecord" ADD COLUMN IF NOT EXISTS "otNightHours" DOUBLE PRECISION NOT NULL DEFAULT 0;
