-- Con số suất ăn thực tế bếp phục vụ theo ngày (HCNS nhập) — đối soát kế hoạch vs thực tế.
CREATE TABLE "MealActual" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "lunchActual" INTEGER NOT NULL DEFAULT 0,
    "dinnerActual" INTEGER NOT NULL DEFAULT 0,
    "guestActual" INTEGER NOT NULL DEFAULT 0,
    "subActual" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "recordedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MealActual_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MealActual_date_key" ON "MealActual"("date");
