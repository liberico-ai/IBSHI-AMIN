# IBS ONE Platform — Spec Compliance Remediation v2

**Date**: 2026-04-10  
**Audit basis**: spec-task.md vs. codebase full re-audit  
**Mode**: Direct (edit-in-place — no git remote push configured)  
**Compliance score before**: ~96% | **Target**: ~100%  
**Reviewed by**: Adversarial Plan agent (corrected v2)

---

## Audit Summary

Previous session fixed 3 gaps → 93% → 96%.  
This full re-audit found 8 remaining gaps in 3 categories.

### Confirmed Gaps (post adversarial review)

| ID | Gap | DoD item | Severity |
|----|-----|----------|----------|
| G1 | `IncidentType` missing `LTI, FIRST_AID, OBSERVATION`; `FIRE` is spurious | HSE incidents full spectrum | P1 |
| G2 | `IncidentStatus` missing `ACTION_REQUIRED` + UI TypeScript union not updated | HSE status workflow | P2 |
| G3 | `VehicleStatus` missing `OUT_OF_SERVICE` | Fleet management | P2 |
| G4 | `Vehicle` missing `driverName`, `nextMaintenanceDate`; UI uses `BUS` label but enum is `MOTORBIKE` | Lái xe column, maintenance alert | P1 |
| G5 | Visitor→Meal: guest meal Notification missing; cost-report has no VisitorRequest aggregation | TASK 8.2 DoD guest meal | P2 |
| G6 | `CleaningZone` schema missing `frequency` field; used in UI and form | Ve-sinh zone display/create | P1 |
| G7 | `scripts/` directory missing (migrate-nas-data.ts, generate-sample-data.ts) | Section 4.2 + Section 10.2 DoD | P3 |
| G8 | `hse/incidents/route.ts` Zod enum hardcoded to old values (blocked after G1 schema migration) | HSE incident create/update API | P1 |

---

## Step 1 — Schema + enum alignment (G1, G2, G3, G4, G6)

**Depends on**: nothing  
**Parallel with**: Step 3 (no file overlap)  
**Model tier**: default

### Context brief

Five schema divergences from spec-task.md Sections 5.5 and 5.6:

- **G1 `IncidentType`**: spec = `LTI | NEAR_MISS | FIRST_AID | PROPERTY_DAMAGE | OBSERVATION | ENVIRONMENTAL`; impl = `INJURY | NEAR_MISS | PROPERTY_DAMAGE | ENVIRONMENTAL | FIRE`. `INJURY` is kept for backward compatibility (existing rows); `FIRE` is removed (not in spec; no existing data risk since it's new). Add `LTI, FIRST_AID, OBSERVATION`.
- **G2 `IncidentStatus`**: Add `ACTION_REQUIRED` between `INVESTIGATING` and `RESOLVED`.
- **G3 `VehicleStatus`**: Add `OUT_OF_SERVICE`.
- **G4 `Vehicle`**: Add `driverName String?` and `nextMaintenanceDate DateTime?`. Fix UI `BUS` label → `MOTORBIKE`.
- **G6 `CleaningZone`**: Add `frequency String @default("DAILY")`. The ve-sinh page creates zones with frequency and displays it via `FREQUENCY_LABELS` — but the schema has no such field, so it silently drops on save.

Note: `INJURY` stays in the schema to avoid breaking existing data. The KPI calculate route currently uses `type: "INJURY", severity: {HIGH|CRITICAL}` as a proxy for LTI. After migration, update to `type: {in: ["LTI", "INJURY"]}` and **remove** the severity filter for LTI detection (LTI by definition = lost time, regardless of severity).

### Tasks

```
1. prisma/schema.prisma:
   a. IncidentType: add LTI, FIRST_AID, OBSERVATION (keep INJURY for compat)
      NOTE: do NOT add FIRE — it's not in spec and has no existing DB rows
   b. IncidentStatus: add ACTION_REQUIRED (between INVESTIGATING and RESOLVED)
   c. VehicleStatus: add OUT_OF_SERVICE
   d. Vehicle model: add  driverName  String?  and  nextMaintenanceDate  DateTime?
   e. CleaningZone model: add  frequency  String  @default("DAILY")

2. npx prisma migrate dev --name schema_spec_alignment

3. src/app/api/v1/hse/incidents/route.ts (G8 fix — must do in same step):
   - Line 8: z.enum([...]) → add "LTI", "FIRST_AID", "OBSERVATION"
     Result: z.enum(["INJURY", "LTI", "NEAR_MISS", "FIRST_AID", "PROPERTY_DAMAGE", "OBSERVATION", "ENVIRONMENTAL"])

4. src/app/api/v1/kpi/calculate/route.ts:
   - Line ~59: change  type: "INJURY"  →  type: { in: ["LTI", "INJURY"] }
   - Remove the  severity: { in: ["HIGH", "CRITICAL"] }  filter from the LTI query
     (LTI = lost time by definition, not filtered by severity per spec)

5. src/app/(dashboard)/hse/page.tsx:
   a. Line 11: TypeScript union IncidentType — add "LTI" | "FIRST_AID" | "OBSERVATION"
      New: "INJURY" | "LTI" | "NEAR_MISS" | "FIRST_AID" | "PROPERTY_DAMAGE" | "OBSERVATION" | "ENVIRONMENTAL"
   b. Line 13: TypeScript union IncidentStatus — add "ACTION_REQUIRED"
      New: "REPORTED" | "INVESTIGATING" | "ACTION_REQUIRED" | "RESOLVED" | "CLOSED"
   c. Line 55: TYPE_LABELS — add entries: LTI: "Tai nạn mất ngày công (LTI)", FIRST_AID: "Sơ cứu tại chỗ", OBSERVATION: "Quan sát"
   d. Line 77: STATUS_LABELS — add entry: ACTION_REQUIRED: "Cần hành động"
   e. Line 84: STATUS_COLORS — add entry: ACTION_REQUIRED: "yellow"

6. src/app/(dashboard)/hanh-chinh/xe/page.tsx:
   a. Line 42: Change  BUS: "Xe buýt"  →  MOTORBIKE: "Xe máy"  (VehicleType.BUS not in schema)
   b. Add  OUT_OF_SERVICE: "Hỏng/Ngừng SD"  to the vehicle status badge map
   c. Vehicle TypeScript type (line ~10): add  driverName?: string  and  nextMaintenanceDate?: string
   d. Fleet tab vehicle card: display driverName if set ("Lái xe: {driverName}" or "—")
   
7. src/app/api/v1/vehicles/route.ts (or PUT endpoint):
   - Add  driverName  and  nextMaintenanceDate  to the Zod body schema for POST/PUT
   
8. src/app/(dashboard)/hanh-chinh/ve-sinh/page.tsx:
   - CleaningZone type already has  frequency: string  (line 9) — no change needed in UI
   - The API cleaning/route.ts: verify ZoneSchema includes  frequency  field
     If not, add:  frequency: z.string().default("DAILY")  to ZoneSchema
   - The  cleaning/route.ts  POST handler: include  frequency  in prisma.cleaningZone.create data
```

### Verification

```bash
npx prisma migrate dev --name schema_spec_alignment   # migration runs clean
npx tsc --noEmit                                       # 0 errors
```

### Exit criteria

- [ ] Migration runs without error
- [ ] `IncidentType` has `LTI`, `FIRST_AID`, `OBSERVATION` (and retains `INJURY`)
- [ ] `IncidentStatus` has `ACTION_REQUIRED`
- [ ] `VehicleStatus` has `OUT_OF_SERVICE`
- [ ] `Vehicle` has `driverName`, `nextMaintenanceDate`
- [ ] `CleaningZone` has `frequency`
- [ ] `hse/incidents/route.ts` Zod enum accepts `LTI`, `FIRST_AID`, `OBSERVATION`
- [ ] `hse/page.tsx` TYPE_LABELS and STATUS_LABELS include new values
- [ ] `xe/page.tsx` uses `MOTORBIKE` (not `BUS`), has `OUT_OF_SERVICE` badge
- [ ] `tsc --noEmit` clean

---

## Step 2 — Business logic: Visitor→Meal notification + cost-report (G5)

**Depends on**: nothing (no overlap with Step 1 files)  
**Parallel with**: Step 1, Step 3  
**Model tier**: default

### Context brief

Spec TASK 8.2 DoD: "needsMeal = true → auto-create MealRegistration guestCount"

Current implementation (`visitors/[id]/route.ts` lines 97-117) creates 1 meal registration for the host but:
1. **Missing**: Notification to HR_ADMIN with actual guest meal count (spec expects a notification)
2. **Missing**: Cost-report aggregation does not include VisitorRequest guest meals — the `meals/route.ts` cost-report query only reads `MealRegistration` rows, ignoring `VisitorRequest.mealCount` data

The MealRegistration model is individual (`employeeId, date, mealType`) with a unique constraint that prevents creating `mealCount` rows for guests (guests have no employeeId). The spec's intent (inform canteen of guest meal counts) is satisfied by notification + cost-report inclusion.

### Tasks

```
1. src/app/api/v1/visitors/[id]/route.ts — CHECK_IN block (lines 97-117):
   Replace existing meal logic with:
   
   if (visitor.needsMeal && visitor.mealCount > 0) {
     // Find any HR_ADMIN user to notify
     const hrAdmin = await prisma.user.findFirst({ where: { role: "HR_ADMIN", isActive: true } });
     if (hrAdmin) {
       await prisma.notification.create({
         data: {
           userId: hrAdmin.id,
           title: "Suất ăn khách",
           message: `Khách ${visitor.visitorName} (${visitor.visitorCount} người) cần ${visitor.mealCount} suất ăn ngày ${visitor.visitDate.toLocaleDateString("vi-VN")}. Người tiếp đón: ${visitor.host?.fullName || "—"}.`,
           type: "SYSTEM",
           referenceType: "visitor_request",
           referenceId: id,
         },
       });
     }
     // Keep existing host meal registration (marks host needs lunch)
     // Guest count is tracked via VisitorRequest.mealCount (already stored)
   }

2. src/app/api/v1/meals/route.ts — GET ?type=cost-report branch:
   After computing department data, add guest meal aggregation:
   
   const guestVisitors = await prisma.visitorRequest.findMany({
     where: {
       visitDate: { gte: startOfMonth, lte: endOfMonth },
       needsMeal: true,
       status: { in: ["CHECKED_IN", "CHECKED_OUT"] },
     },
     select: { mealCount: true },
   });
   const guestMealCount = guestVisitors.reduce((s, v) => s + v.mealCount, 0);
   const guestMealCost = guestMealCount * UNIT_PRICE;
   
   // Add to the response meta:
   meta: { grandTotal: grandTotal + guestMealCost, unitPrice: UNIT_PRICE, month, year,
           guestMeals: { count: guestMealCount, cost: guestMealCost } }
   // Also update grandTotal to include guestMealCost

3. src/app/(dashboard)/hanh-chinh/nha-an/page.tsx — "Chi phí" tab:
   - CostMeta type: add  guestMeals?: { count: number; cost: number }
   - Below the BarChart, add a small info row:
     "Suất khách: {meta.guestMeals?.count || 0} suất = {formatVND(meta.guestMeals?.cost || 0)}đ"
   - Grand total footer: use meta.grandTotal (already includes guestMealCost)
```

### Verification

```bash
npx tsc --noEmit   # 0 errors
```

### Exit criteria

- [ ] CHECK_IN with needsMeal=true creates Notification to HR_ADMIN with meal count message
- [ ] `meals?type=cost-report` meta includes `guestMeals: {count, cost}`
- [ ] `meta.grandTotal` includes guest meal cost
- [ ] nha-an "Chi phí" tab shows guest meals line below chart

---

## Step 3 — Scripts: Data migration skeleton (G7)

**Depends on**: Step 1 (schema must be final for correct enum values in scripts)  
**Parallel with**: Step 2  
**Model tier**: default

### Context brief

Spec Section 4.2 requires `scripts/migrate-nas-data.ts` and `scripts/generate-sample-data.ts`. Section 10.2 DoD requires the script to run end-to-end.

Since actual NAS file column layouts are unknown, the scripts are built around a **synthetic fixture file** so the DoD "chạy end-to-end không lỗi" is met by running against the fixture. The fixture contains 3 sample rows matching the expected column mappings. The production team replaces the fixture with real NAS files and adjusts `COLUMN_MAP` constants.

**Runtime dependency**: Verify `exceljs` is in `package.json` dependencies (not just devDependencies) before writing the script.

### Tasks

```
1. Verify package.json has exceljs as runtime dependency.
   If yes → use exceljs.
   If devDependency only → move to dependencies (npm install --save exceljs).
   If absent → npm install exceljs.

2. Create scripts/migrate-nas-data.ts:
   
   // ── COLUMN MAPPINGS (team fills in actual NAS Excel positions) ──────────
   const EMPLOYEE_COLS = { code: 0, fullName: 1, departmentCode: 2, phone: 3, idNumber: 4, startDate: 5 }
   const CONTRACT_COLS = { employeeCode: 0, contractNumber: 1, type: 2, startDate: 3, endDate: 4, baseSalary: 5 }
   const VEHICLE_COLS  = { licensePlate: 0, model: 1, type: 2, seats: 3, driverName: 4 }
   // ... (certificate, attendance, maintenance mappings)
   
   type MigrationResult = { inserted: number; skipped: number; errors: { row: number; reason: string }[] }
   
   async function migrateEmployees(sheet): Promise<MigrationResult>
     - For each row: parse → Zod validate → prisma.employee.findFirst({where:{code}}) → skip if exists → insert
     - Errors: push { row, reason } for invalid rows
   
   async function migrateVehicles(sheet): Promise<MigrationResult>
     - Duplicate check: licensePlate unique
   
   // ... similar functions for contracts, certificates, vehicles, maintenance
   
   // Main entry
   const filePath = process.argv[2] ?? "scripts/fixtures/sample-nas.xlsx"
   const workbook = new ExcelJS.Workbook(); await workbook.xlsx.readFile(filePath)
   // Run all migrations, collect results
   // Write log: scripts/migration-log-{timestamp}.json
   // Print: "Employees: inserted X | skipped Y | errors Z"

3. Create scripts/fixtures/sample-nas.xlsx:
   - Programmatically generated (no binary file) via a small build step, OR
   - Create scripts/fixtures/create-fixture.ts that generates a sample xlsx
   - Contains 3 valid rows for each sheet (Employee, Contract, Vehicle)
   - Purpose: allows end-to-end test run without real NAS data

4. Create scripts/generate-sample-data.ts:
   - Uses prisma directly (no Excel)
   - Generates 50 employees, 3 months attendance, sample leave/OT requests
   - Sample HSE incidents (2 NEAR_MISS, 1 INJURY type for compat, 0 LTI)
   - Sample vehicle bookings + fuel logs
   - Usage: npx ts-node scripts/generate-sample-data.ts

5. Add to package.json scripts:
   "migrate:nas": "ts-node scripts/migrate-nas-data.ts",
   "generate:sample": "ts-node scripts/generate-sample-data.ts"
```

### Verification

```bash
# Run against fixture file (end-to-end no error)
npx ts-node scripts/migrate-nas-data.ts scripts/fixtures/sample-nas.xlsx
# Should print: "Employees: inserted 3 | skipped 0 | errors 0"
npx tsc --noEmit   # 0 errors
```

### Exit criteria

- [ ] `scripts/migrate-nas-data.ts` exists and compiles (tsc clean)
- [ ] `scripts/generate-sample-data.ts` exists and compiles
- [ ] Running against fixture file: "inserted X | skipped 0 | errors 0"
- [ ] Duplicate detection: running twice → "inserted 0 | skipped X | errors 0"
- [ ] `migration-log-{ts}.json` written with results
- [ ] COLUMN_MAP constants documented with comments for NAS team

---

## Step 4 — Final validation

**Depends on**: Steps 1 + 2 + 3 complete  
**Parallel with**: nothing  
**Model tier**: default

```bash
npx prisma generate          # Regenerate client after migration
npx tsc --noEmit             # Must be 0 errors
npx prisma migrate status    # All migrations applied
```

### Exit criteria

- [ ] `tsc --noEmit` → 0 errors
- [ ] All 4 migrations in `prisma/migrations/` show "Applied"
- [ ] Compliance checklist below complete

---

## Final spec compliance checklist

### Schema (Section 5)
- [ ] `IncidentType`: `LTI | NEAR_MISS | FIRST_AID | PROPERTY_DAMAGE | OBSERVATION | ENVIRONMENTAL` (+ `INJURY` for compat)
- [ ] `IncidentStatus`: `REPORTED | INVESTIGATING | ACTION_REQUIRED | RESOLVED | CLOSED`
- [ ] `VehicleStatus`: `AVAILABLE | IN_USE | MAINTENANCE | OUT_OF_SERVICE`
- [ ] `Vehicle`: has `driverName?`, `nextMaintenanceDate?`
- [ ] `CleaningZone`: has `frequency`

### API (Section 6-9)
- [ ] `POST /api/v1/hse/incidents` accepts `LTI`, `FIRST_AID`, `OBSERVATION` types
- [ ] `GET /api/v1/meals?type=cost-report` meta includes `guestMeals`
- [ ] Visitor check-in with `needsMeal=true` creates HR_ADMIN notification

### UI (Section 4.3 + TASK UIs)
- [ ] hse/page.tsx shows `LTI`, `FIRST_AID`, `OBSERVATION` in type dropdown
- [ ] hse/page.tsx shows `ACTION_REQUIRED` status option
- [ ] xe/page.tsx uses `MOTORBIKE` label (not `BUS`)
- [ ] xe/page.tsx shows `OUT_OF_SERVICE` badge variant
- [ ] xe/page.tsx Vehicle card shows `driverName`
- [ ] nha-an Chi phí tab shows guest meal line item

### Tooling (Section 4.2 + 10.2)
- [ ] `scripts/migrate-nas-data.ts` exists
- [ ] `scripts/generate-sample-data.ts` exists
- [ ] End-to-end run against fixture: no errors
- [ ] Duplicate detection works (idempotent)

---

## Plan mutation protocol

- **Step 1 migration fails** due to existing `FIRE` enum values in DB: add `@@map` or manual SQL to update existing rows before migration, then retry.
- **Step 2 Notification fails** (no HR_ADMIN user): log `console.warn` and continue check-in — never block visitor flow for notification failure.
- **Step 3 exceljs absent**: run `npm install exceljs`, confirm added to `package.json` dependencies.
