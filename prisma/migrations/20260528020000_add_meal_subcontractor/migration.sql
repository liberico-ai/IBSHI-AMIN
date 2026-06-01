-- Thêm cột số suất ăn cho Thầu phụ
ALTER TABLE "MealRegistration" ADD COLUMN "subcontractorCount" INTEGER NOT NULL DEFAULT 0;
