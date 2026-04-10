/*
  Warnings:

  - You are about to drop the column `allowances` on the `PayrollRecord` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "EvaluatorRelationship" AS ENUM ('SELF', 'MANAGER', 'PEER', 'SUBORDINATE');

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "dependents" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "HSEInduction" ADD COLUMN     "expiryDate" TIMESTAMP(3),
ADD COLUMN     "personType" TEXT NOT NULL DEFAULT 'EMPLOYEE',
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "visitorRegId" TEXT,
ALTER COLUMN "employeeId" DROP NOT NULL,
ALTER COLUMN "conductedBy" DROP NOT NULL;

-- AlterTable
ALTER TABLE "PayrollRecord" DROP COLUMN "allowances",
ADD COLUMN     "hazardAllowance" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "mealAllowance" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "otherIncome" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "pieceRateSalary" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "responsibilityAllow" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "VisitorRequest" ADD COLUMN     "mealCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "needsMeal" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "visitorCount" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "PieceRateRecord" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "projectCode" TEXT NOT NULL,
    "totalHours" DOUBLE PRECISION NOT NULL,
    "unitPrice" INTEGER NOT NULL,
    "completionRate" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "totalAmount" INTEGER NOT NULL,
    "memberCount" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PieceRateRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisitorBadge" (
    "id" TEXT NOT NULL,
    "registrationId" TEXT NOT NULL,
    "badgeNumber" TEXT NOT NULL,
    "qrData" TEXT NOT NULL,
    "allowedZones" TEXT[],
    "inductionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VisitorBadge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KPIScore" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "quarter" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "attendanceRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "productivityRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "qualityRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "safetyRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "overallScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "trend" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KPIScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Evaluation360" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "evaluatorId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "relationship" "EvaluatorRelationship" NOT NULL,
    "scores" JSONB NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Evaluation360_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_teamMembers" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_teamMembers_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "PieceRateRecord_teamId_idx" ON "PieceRateRecord"("teamId");

-- CreateIndex
CREATE INDEX "PieceRateRecord_month_year_idx" ON "PieceRateRecord"("month", "year");

-- CreateIndex
CREATE UNIQUE INDEX "VisitorBadge_registrationId_key" ON "VisitorBadge"("registrationId");

-- CreateIndex
CREATE UNIQUE INDEX "VisitorBadge_badgeNumber_key" ON "VisitorBadge"("badgeNumber");

-- CreateIndex
CREATE INDEX "VisitorBadge_badgeNumber_idx" ON "VisitorBadge"("badgeNumber");

-- CreateIndex
CREATE INDEX "KPIScore_quarter_year_idx" ON "KPIScore"("quarter", "year");

-- CreateIndex
CREATE UNIQUE INDEX "KPIScore_departmentId_quarter_year_key" ON "KPIScore"("departmentId", "quarter", "year");

-- CreateIndex
CREATE INDEX "Evaluation360_employeeId_period_idx" ON "Evaluation360"("employeeId", "period");

-- CreateIndex
CREATE UNIQUE INDEX "Evaluation360_employeeId_evaluatorId_period_key" ON "Evaluation360"("employeeId", "evaluatorId", "period");

-- CreateIndex
CREATE INDEX "_teamMembers_B_index" ON "_teamMembers"("B");

-- CreateIndex
CREATE INDEX "HSEInduction_visitorRegId_idx" ON "HSEInduction"("visitorRegId");

-- AddForeignKey
ALTER TABLE "PieceRateRecord" ADD CONSTRAINT "PieceRateRecord_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "ProductionTeam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitorBadge" ADD CONSTRAINT "VisitorBadge_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "VisitorRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KPIScore" ADD CONSTRAINT "KPIScore_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evaluation360" ADD CONSTRAINT "Evaluation360_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evaluation360" ADD CONSTRAINT "Evaluation360_evaluatorId_fkey" FOREIGN KEY ("evaluatorId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_teamMembers" ADD CONSTRAINT "_teamMembers_A_fkey" FOREIGN KEY ("A") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_teamMembers" ADD CONSTRAINT "_teamMembers_B_fkey" FOREIGN KEY ("B") REFERENCES "PieceRateRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
