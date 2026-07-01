-- Khách suất ăn theo TỪNG đơn giá trong 1 phòng/ngày (vd 5 khách 20k + 6 khách 60k).
ALTER TABLE "MealRegistration" ADD COLUMN "guestByPrice" JSONB;
