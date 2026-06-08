-- Thực xuất thực phẩm: lượng bếp thực sự nấu trong ngày (trừ tồn kho theo FIFO).
CREATE TABLE "FoodIssue" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'Kg',
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FoodIssue_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FoodIssue_date_idx" ON "FoodIssue"("date");
