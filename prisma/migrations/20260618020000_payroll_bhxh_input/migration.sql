-- BHXH import (HCNS tính ngoài rồi import). Hệ thống không tự tính BHXH nữa.
CREATE TABLE IF NOT EXISTS "PayrollBhxhInput" (
  "id"           TEXT NOT NULL,
  "employeeId"   TEXT NOT NULL,
  "month"        INTEGER NOT NULL,
  "year"         INTEGER NOT NULL,
  "bhxh8"        INTEGER NOT NULL DEFAULT 0,
  "bhyt15"       INTEGER NOT NULL DEFAULT 0,
  "bhtn1"        INTEGER NOT NULL DEFAULT 0,
  "bhxhEmployer" INTEGER NOT NULL DEFAULT 0,
  "note"         TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PayrollBhxhInput_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PayrollBhxhInput_employeeId_month_year_key"
  ON "PayrollBhxhInput"("employeeId", "month", "year");
CREATE INDEX IF NOT EXISTS "PayrollBhxhInput_month_year_idx"
  ON "PayrollBhxhInput"("month", "year");

DO $$ BEGIN
  ALTER TABLE "PayrollBhxhInput"
    ADD CONSTRAINT "PayrollBhxhInput_employeeId_fkey"
    FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
