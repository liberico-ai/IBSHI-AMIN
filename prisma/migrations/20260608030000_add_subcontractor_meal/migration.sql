-- Đăng ký suất ăn thầu phụ theo từng nhà thầu / ngày.
CREATE TABLE "SubcontractorMeal" (
    "id" TEXT NOT NULL,
    "subcontractorId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "lunchCount" INTEGER NOT NULL DEFAULT 0,
    "dinnerCount" INTEGER NOT NULL DEFAULT 0,
    "specialNote" TEXT,
    "registeredBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubcontractorMeal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SubcontractorMeal_subcontractorId_date_key" ON "SubcontractorMeal"("subcontractorId", "date");
CREATE INDEX "SubcontractorMeal_date_idx" ON "SubcontractorMeal"("date");

ALTER TABLE "SubcontractorMeal" ADD CONSTRAINT "SubcontractorMeal_subcontractorId_fkey"
    FOREIGN KEY ("subcontractorId") REFERENCES "Subcontractor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
