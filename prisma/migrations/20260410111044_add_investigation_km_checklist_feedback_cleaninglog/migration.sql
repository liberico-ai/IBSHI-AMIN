-- CreateEnum
CREATE TYPE "CleaningLogStatus" AS ENUM ('COMPLETED', 'NEEDS_IMPROVEMENT', 'MISSED');

-- AlterTable
ALTER TABLE "HSEIncident" ADD COLUMN     "investigation" TEXT;

-- AlterTable
ALTER TABLE "VehicleBooking" ADD COLUMN     "actualKm" INTEGER,
ADD COLUMN     "returnTime" TEXT;

-- CreateTable
CREATE TABLE "MealFeedback" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MealFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CleaningLog" (
    "id" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "status" "CleaningLogStatus" NOT NULL DEFAULT 'COMPLETED',
    "score" INTEGER,
    "photoUrls" TEXT[],
    "note" TEXT,
    "checkedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CleaningLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditChecklist" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "item" TEXT NOT NULL,
    "assignedTo" TEXT,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "note" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditChecklist_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MealFeedback_date_idx" ON "MealFeedback"("date");

-- CreateIndex
CREATE UNIQUE INDEX "MealFeedback_employeeId_date_key" ON "MealFeedback"("employeeId", "date");

-- CreateIndex
CREATE INDEX "CleaningLog_zoneId_idx" ON "CleaningLog"("zoneId");

-- CreateIndex
CREATE INDEX "CleaningLog_date_idx" ON "CleaningLog"("date");

-- CreateIndex
CREATE INDEX "AuditChecklist_eventId_idx" ON "AuditChecklist"("eventId");

-- AddForeignKey
ALTER TABLE "MealFeedback" ADD CONSTRAINT "MealFeedback_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CleaningLog" ADD CONSTRAINT "CleaningLog_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "CleaningZone"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditChecklist" ADD CONSTRAINT "AuditChecklist_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "CompanyEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
