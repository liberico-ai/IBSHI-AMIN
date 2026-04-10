-- CreateEnum
CREATE TYPE "NCRStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'PENDING_REVIEW', 'CLOSED', 'OVERDUE');

-- CreateTable
CREATE TABLE "NCR" (
    "id" TEXT NOT NULL,
    "ncrNumber" TEXT NOT NULL,
    "sourceEventId" TEXT,
    "description" TEXT NOT NULL,
    "responsibleDept" TEXT NOT NULL,
    "assignedToId" TEXT,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "status" "NCRStatus" NOT NULL DEFAULT 'OPEN',
    "rootCause" TEXT,
    "correctiveAction" TEXT,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NCR_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeeklyMenu" (
    "id" TEXT NOT NULL,
    "weekNumber" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "mainDish" TEXT NOT NULL,
    "sideDish" TEXT NOT NULL,
    "soup" TEXT NOT NULL,
    "dessert" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeeklyMenu_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NCR_ncrNumber_key" ON "NCR"("ncrNumber");

-- CreateIndex
CREATE INDEX "NCR_status_idx" ON "NCR"("status");

-- CreateIndex
CREATE INDEX "NCR_dueDate_idx" ON "NCR"("dueDate");

-- CreateIndex
CREATE INDEX "WeeklyMenu_weekNumber_year_idx" ON "WeeklyMenu"("weekNumber", "year");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyMenu_weekNumber_year_dayOfWeek_key" ON "WeeklyMenu"("weekNumber", "year", "dayOfWeek");

-- AddForeignKey
ALTER TABLE "NCR" ADD CONSTRAINT "NCR_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
