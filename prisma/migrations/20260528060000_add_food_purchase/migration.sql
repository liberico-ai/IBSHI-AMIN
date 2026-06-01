-- Sổ chi phí mua thực phẩm theo ngày
CREATE TABLE "FoodPurchase" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'Kg',
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unitPrice" INTEGER NOT NULL DEFAULT 0,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FoodPurchase_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "FoodPurchase_date_idx" ON "FoodPurchase"("date");
