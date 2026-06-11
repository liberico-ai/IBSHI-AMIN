-- Người phụ thuộc: giấy tờ hợp lệ, khai báo (>18 tuổi), ngày đăng ký + ngày dừng.
ALTER TABLE "Dependent" ADD COLUMN "documentUrls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Dependent" ADD COLUMN "declaration" TEXT;
ALTER TABLE "Dependent" ADD COLUMN "registeredAt" TIMESTAMP(3);
ALTER TABLE "Dependent" ADD COLUMN "stoppedAt" TIMESTAMP(3);
