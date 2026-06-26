-- Tạm nghỉ / nghỉ việc: lưu ngày để tính lương + tự chuyển trạng thái.
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "resignedDate" TIMESTAMP(3);
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "suspendedFrom" TIMESTAMP(3);
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "suspendedTo" TIMESTAMP(3);
