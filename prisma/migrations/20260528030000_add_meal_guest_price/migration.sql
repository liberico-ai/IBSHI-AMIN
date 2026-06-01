-- Thêm đơn giá suất ăn cho Khách (nhập tay)
ALTER TABLE "MealRegistration" ADD COLUMN "guestUnitPrice" INTEGER NOT NULL DEFAULT 0;
