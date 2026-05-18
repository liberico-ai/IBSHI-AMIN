-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "fuelHousingEligible" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Contract" ADD COLUMN     "allowances" JSONB,
ADD COLUMN     "expiringAlertSentAt" TIMESTAMP(3),
ADD COLUMN     "insuranceSalary" INTEGER,
ADD COLUMN     "position" TEXT;

-- AlterTable
ALTER TABLE "OfferLetter" DROP COLUMN "allowances",
DROP COLUMN "baseSalary",
ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedBy" TEXT,
ADD COLUMN     "benefits" TEXT,
ADD COLUMN     "candidateNote" TEXT,
ADD COLUMN     "declinedAt" TIMESTAMP(3),
ADD COLUMN     "departmentName" TEXT,
ADD COLUMN     "letterNumber" TEXT NOT NULL,
ADD COLUMN     "officialSalary" DECIMAL(65,30) NOT NULL,
ADD COLUMN     "pdfUrl" TEXT,
ADD COLUMN     "probationDays" INTEGER NOT NULL DEFAULT 60,
ADD COLUMN     "probationEndDate" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "probationarySalary" DECIMAL(65,30) NOT NULL,
ADD COLUMN     "rejectComments" TEXT,
ADD COLUMN     "rejectedAt" TIMESTAMP(3),
ADD COLUMN     "rejectedBy" TEXT,
ADD COLUMN     "sentToEmail" TEXT,
ADD COLUMN     "submittedAt" TIMESTAMP(3),
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "workLocation" TEXT NOT NULL DEFAULT 'Km 6 Quốc lộ 5, Phường Hồng Bàng, Thành phố Hải Phòng, Việt Nam';

-- AlterTable
ALTER TABLE "OnboardingChecklist" ADD COLUMN     "dueDate" TIMESTAMP(3),
ADD COLUMN     "extendedUntil" TIMESTAMP(3),
ADD COLUMN     "extensionDocUrl" TEXT,
ADD COLUMN     "extensionGrantedAt" TIMESTAMP(3),
ADD COLUMN     "extensionReason" TEXT,
ADD COLUMN     "isExtended" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "ProbationEvaluation" DROP COLUMN "contractType",
ADD COLUMN     "contractEndDate" TIMESTAMP(3),
ADD COLUMN     "contractStartDate" TIMESTAMP(3),
ADD COLUMN     "directorComments" TEXT,
ADD COLUMN     "directorRejectedAt" TIMESTAMP(3),
ADD COLUMN     "selectedTier" TEXT,
ADD COLUMN     "signedContractId" TEXT,
ADD COLUMN     "signedContractUrl" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "status" SET DEFAULT 'PENDING_DIRECTOR';

-- CreateTable
CREATE TABLE "Dependent" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "dateOfBirth" TIMESTAMP(3),
    "taxCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Dependent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollKpiOverride" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "kpi" INTEGER NOT NULL DEFAULT 0,
    "responsibility" INTEGER NOT NULL DEFAULT 0,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollKpiOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PositionRequirement" (
    "id" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PositionRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Dependent_employeeId_idx" ON "Dependent"("employeeId");

-- CreateIndex
CREATE INDEX "PayrollKpiOverride_month_year_idx" ON "PayrollKpiOverride"("month", "year");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollKpiOverride_employeeId_month_year_key" ON "PayrollKpiOverride"("employeeId", "month", "year");

-- CreateIndex
CREATE INDEX "PositionRequirement_positionId_idx" ON "PositionRequirement"("positionId");

-- CreateIndex
CREATE UNIQUE INDEX "OfferLetter_letterNumber_key" ON "OfferLetter"("letterNumber");

-- CreateIndex
CREATE INDEX "OfferLetter_candidateId_idx" ON "OfferLetter"("candidateId");

-- CreateIndex
CREATE INDEX "OfferLetter_status_idx" ON "OfferLetter"("status");

-- CreateIndex
CREATE INDEX "ProbationEvaluation_employeeId_idx" ON "ProbationEvaluation"("employeeId");

-- CreateIndex
CREATE INDEX "ProbationEvaluation_status_idx" ON "ProbationEvaluation"("status");

-- AddForeignKey
ALTER TABLE "Dependent" ADD CONSTRAINT "Dependent_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollKpiOverride" ADD CONSTRAINT "PayrollKpiOverride_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfferLetter" ADD CONSTRAINT "OfferLetter_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingChecklist" ADD CONSTRAINT "OnboardingChecklist_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PositionRequirement" ADD CONSTRAINT "PositionRequirement_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProbationEvaluation" ADD CONSTRAINT "ProbationEvaluation_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

