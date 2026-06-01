CREATE TABLE "PayrollManualInput" (
  "id" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "month" INTEGER NOT NULL,
  "year" INTEGER NOT NULL,
  "pieceRate" INTEGER NOT NULL DEFAULT 0,
  "adjustment" INTEGER NOT NULL DEFAULT 0,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PayrollManualInput_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PayrollManualInput_employeeId_month_year_key" ON "PayrollManualInput"("employeeId", "month", "year");
CREATE INDEX "PayrollManualInput_month_year_idx" ON "PayrollManualInput"("month", "year");

ALTER TABLE "PayrollManualInput" ADD CONSTRAINT "PayrollManualInput_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
