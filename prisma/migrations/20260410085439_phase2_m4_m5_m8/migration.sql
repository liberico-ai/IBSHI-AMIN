-- CreateEnum
CREATE TYPE "CandidateStatus" AS ENUM ('NEW', 'SCREENING', 'INTERVIEW', 'INTERVIEWED', 'OFFERED', 'ACCEPTED', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "TrainingType" AS ENUM ('SAFETY', 'TECHNICAL', 'QUALITY', 'MANAGEMENT', 'ONBOARDING');

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('PLANNING', 'PREPARING', 'READY', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RegulationCategory" AS ENUM ('GATE_SECURITY', 'DISCIPLINE', 'EQUIPMENT', 'SEAL', 'UNIFORM', 'GENERAL');

-- CreateEnum
CREATE TYPE "DisciplinaryStatus" AS ENUM ('PENDING', 'ISSUED', 'APPEALED', 'CLOSED');

-- CreateTable
CREATE TABLE "RecruitmentRequest" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "positionName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "reason" TEXT NOT NULL,
    "requirements" TEXT NOT NULL DEFAULT '',
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "requestedBy" TEXT NOT NULL,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecruitmentRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Candidate" (
    "id" TEXT NOT NULL,
    "recruitmentId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "resumeUrl" TEXT,
    "referredBy" TEXT,
    "status" "CandidateStatus" NOT NULL DEFAULT 'NEW',
    "interviewDate" TIMESTAMP(3),
    "interviewNote" TEXT,
    "interviewScore" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Candidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingPlan" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" "TrainingType" NOT NULL,
    "departmentId" TEXT,
    "scheduledDate" TIMESTAMP(3) NOT NULL,
    "trainer" TEXT NOT NULL,
    "maxParticipants" INTEGER NOT NULL DEFAULT 30,
    "status" "EventStatus" NOT NULL DEFAULT 'PLANNING',
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrainingPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingRecord" (
    "id" TEXT NOT NULL,
    "trainingId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "attended" BOOLEAN NOT NULL DEFAULT false,
    "score" INTEGER,
    "certificateId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrainingRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Regulation" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" "RegulationCategory" NOT NULL DEFAULT 'GENERAL',
    "content" TEXT NOT NULL DEFAULT '',
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "fileUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Regulation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DisciplinaryAction" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "violationType" TEXT NOT NULL,
    "regulationId" TEXT,
    "description" TEXT NOT NULL,
    "penalty" TEXT NOT NULL,
    "decisionNumber" TEXT,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "status" "DisciplinaryStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DisciplinaryAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RecruitmentRequest_departmentId_idx" ON "RecruitmentRequest"("departmentId");

-- CreateIndex
CREATE INDEX "RecruitmentRequest_status_idx" ON "RecruitmentRequest"("status");

-- CreateIndex
CREATE INDEX "Candidate_recruitmentId_idx" ON "Candidate"("recruitmentId");

-- CreateIndex
CREATE INDEX "Candidate_status_idx" ON "Candidate"("status");

-- CreateIndex
CREATE INDEX "TrainingPlan_departmentId_idx" ON "TrainingPlan"("departmentId");

-- CreateIndex
CREATE INDEX "TrainingPlan_scheduledDate_idx" ON "TrainingPlan"("scheduledDate");

-- CreateIndex
CREATE INDEX "TrainingRecord_employeeId_idx" ON "TrainingRecord"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingRecord_trainingId_employeeId_key" ON "TrainingRecord"("trainingId", "employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "Regulation_code_key" ON "Regulation"("code");

-- CreateIndex
CREATE INDEX "Regulation_category_idx" ON "Regulation"("category");

-- CreateIndex
CREATE INDEX "Regulation_isActive_idx" ON "Regulation"("isActive");

-- CreateIndex
CREATE INDEX "DisciplinaryAction_employeeId_idx" ON "DisciplinaryAction"("employeeId");

-- CreateIndex
CREATE INDEX "DisciplinaryAction_status_idx" ON "DisciplinaryAction"("status");

-- AddForeignKey
ALTER TABLE "RecruitmentRequest" ADD CONSTRAINT "RecruitmentRequest_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Candidate" ADD CONSTRAINT "Candidate_recruitmentId_fkey" FOREIGN KEY ("recruitmentId") REFERENCES "RecruitmentRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingPlan" ADD CONSTRAINT "TrainingPlan_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingRecord" ADD CONSTRAINT "TrainingRecord_trainingId_fkey" FOREIGN KEY ("trainingId") REFERENCES "TrainingPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingRecord" ADD CONSTRAINT "TrainingRecord_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisciplinaryAction" ADD CONSTRAINT "DisciplinaryAction_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisciplinaryAction" ADD CONSTRAINT "DisciplinaryAction_regulationId_fkey" FOREIGN KEY ("regulationId") REFERENCES "Regulation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
