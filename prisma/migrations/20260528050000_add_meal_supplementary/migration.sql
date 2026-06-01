-- Đăng ký suất ăn bổ sung (cần TP HCNS duyệt)
CREATE TABLE "MealSupplementaryRequest" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "mealType" TEXT NOT NULL DEFAULT 'LUNCH',
    "personType" TEXT NOT NULL DEFAULT 'EMPLOYEE',
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "guestUnitPrice" INTEGER NOT NULL DEFAULT 0,
    "subcontractorName" TEXT,
    "reason" TEXT NOT NULL,
    "specialNote" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "rejectedReason" TEXT,
    "requestedBy" TEXT NOT NULL,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MealSupplementaryRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MealSupplementaryRequest_status_idx" ON "MealSupplementaryRequest"("status");
CREATE INDEX "MealSupplementaryRequest_date_idx" ON "MealSupplementaryRequest"("date");
CREATE INDEX "MealSupplementaryRequest_departmentId_idx" ON "MealSupplementaryRequest"("departmentId");

ALTER TABLE "MealSupplementaryRequest" ADD CONSTRAINT "MealSupplementaryRequest_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MealSupplementaryRequest" ADD CONSTRAINT "MealSupplementaryRequest_requestedBy_fkey" FOREIGN KEY ("requestedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MealSupplementaryRequest" ADD CONSTRAINT "MealSupplementaryRequest_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
