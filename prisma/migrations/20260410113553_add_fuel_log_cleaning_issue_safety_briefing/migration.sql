-- CreateEnum
CREATE TYPE "IssueStatus" AS ENUM ('REPORTED', 'IN_PROGRESS', 'RESOLVED');

-- CreateTable
CREATE TABLE "FuelLog" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "liters" DOUBLE PRECISION NOT NULL,
    "cost" INTEGER NOT NULL,
    "odometerKm" INTEGER NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FuelLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CleaningIssue" (
    "id" TEXT NOT NULL,
    "reportedBy" TEXT NOT NULL,
    "zoneName" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "IssueStatus" NOT NULL DEFAULT 'REPORTED',
    "assignedTo" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CleaningIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SafetyBriefing" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "topic" TEXT NOT NULL,
    "presenter" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "totalAttendees" INTEGER NOT NULL DEFAULT 0,
    "totalTarget" INTEGER NOT NULL DEFAULT 1,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SafetyBriefing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FuelLog_vehicleId_idx" ON "FuelLog"("vehicleId");

-- CreateIndex
CREATE INDEX "FuelLog_date_idx" ON "FuelLog"("date");

-- CreateIndex
CREATE INDEX "CleaningIssue_status_idx" ON "CleaningIssue"("status");

-- CreateIndex
CREATE INDEX "CleaningIssue_createdAt_idx" ON "CleaningIssue"("createdAt");

-- CreateIndex
CREATE INDEX "SafetyBriefing_departmentId_idx" ON "SafetyBriefing"("departmentId");

-- CreateIndex
CREATE INDEX "SafetyBriefing_date_idx" ON "SafetyBriefing"("date");

-- AddForeignKey
ALTER TABLE "FuelLog" ADD CONSTRAINT "FuelLog_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CleaningIssue" ADD CONSTRAINT "CleaningIssue_reportedBy_fkey" FOREIGN KEY ("reportedBy") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafetyBriefing" ADD CONSTRAINT "SafetyBriefing_presenter_fkey" FOREIGN KEY ("presenter") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafetyBriefing" ADD CONSTRAINT "SafetyBriefing_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
