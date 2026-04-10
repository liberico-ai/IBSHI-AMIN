# IBS ONE Platform — Spec Compliance Remediation v3

**Date**: 2026-04-10  
**Audit basis**: spec-task.md full re-audit (third pass) vs codebase  
**Mode**: Direct (edit-in-place — no git remote)  
**Compliance before this plan**: ~74% weighted (Feature 82%, Business Logic 74%, Architecture 55%)  
**Target after this plan**: ~93% weighted  
**Adversarial review**: confirmed all gaps, added 2 new findings

---

## Compliance Scorecard

| Dimension | Before | After plan | Key drivers |
|---|---|---|---|
| Feature coverage | 82% | 95% | MealRegistration per-dept refactor |
| Business logic | 74% | 90% | Fake attendance fallback removed, meal grain correct |
| Architecture | 55% | 78% | services/, types/, hooks/ filled |
| **Weighted overall** | **~74%** | **~93%** | |

---

## Gap Register

| ID | Severity | Description | Files |
|----|----------|-------------|-------|
| G-N1 | HIGH | MealRegistration grain wrong — per-employee vs spec's per-department | schema.prisma, meals/route.ts, nha-an/page.tsx |
| G-N6 | MEDIUM | MealCostReport not persisted — computed on-the-fly loses historical accuracy | schema.prisma, meals/route.ts |
| G-NEW2 | MEDIUM | Attendance summary fakes 95% when no records exist today | attendance/route.ts |
| G-NEW4 | LOW | Meal unit price hardcoded (35000) — not configurable via settings | meals/route.ts |
| G-N2 | LOW | src/services/ empty — 12 service files required by spec Section 4.2 | src/services/*.ts |
| G-N3 | LOW | src/types/index.ts empty — shared types required | src/types/index.ts |
| G-N4 | LOW | src/hooks/ empty — data hooks required | src/hooks/*.ts |
| G-N5 | LOW | API URL deviations: /attendance/bulk missing, /salary/* vs /payroll/* | API route files |

---

## Execution Order

```
Step 1 (G-N1, G-N6, G-NEW4) ──► Step 4 (validate)
                                           ▲
Step 2 (G-NEW2) ───────────────────────────┤
                                           │
Step 3a (G-N2) ────┐                       │
Step 3b (G-N3/N4) ─┤──────────────────────┘
Step 3c (G-N5) ────┘
```

Steps 2, 3a, 3b, 3c are parallel. Step 1 must complete before Step 4.

---

## Step 1 — MealRegistration Model Refactor (G-N1 + G-N6 + G-NEW4)

**Priority**: HIGH  
**Depends on**: nothing  
**Parallel**: Steps 2 and 3 can run in parallel with this

### Context
The spec defines `MealRegistration` as a per-DEPARTMENT daily registration:
```
departmentId : String
date         : Date
lunchCount   : Integer   -- suất trưa
dinnerCount  : Integer   -- suất tối (OT)
guestCount   : Integer   -- suất khách
specialNote  : Optional<String>
registeredBy : String    -- FK → User
```
Current implementation uses per-EMPLOYEE model (`employeeId, date, mealType`).
The spec nha-an form is: "Phòng ban (select), Bữa trưa (number), Bữa tối OT (number), Suất khách (number)".

The spec also requires a persisted `MealCostReport` model. We merge G-N6 here.

### Tasks

**1a. prisma/schema.prisma** — replace current MealRegistration + add MealCostReport

Remove:
```prisma
model MealRegistration {
  id         String   @id @default(uuid())
  employeeId String
  date       DateTime
  mealType   MealType @default(LUNCH)
  ...
}
enum MealType { BREAKFAST LUNCH DINNER }
```

Add:
```prisma
model MealRegistration {
  id           String    @id @default(uuid())
  departmentId String
  date         DateTime
  lunchCount   Int       @default(0)
  dinnerCount  Int       @default(0)
  guestCount   Int       @default(0)
  specialNote  String?
  registeredBy String    -- FK → User.id
  createdAt    DateTime  @default(now())

  department   Department @relation(fields: [departmentId], references: [id], onDelete: Restrict)
  registrant   User       @relation(fields: [registeredBy], references: [id], onDelete: Restrict)

  @@unique([departmentId, date])
  @@index([departmentId])
}

model MealCostReport {
  id           String   @id @default(uuid())
  departmentId String
  month        Int
  year         Int
  totalMeals   Int
  unitPrice    Int      @default(35000)
  totalCost    Int
  createdAt    DateTime @default(now())

  department   Department @relation(fields: [departmentId], references: [id], onDelete: Restrict)

  @@unique([departmentId, month, year])
}
```

Remove `MealFeedback.employee` relation and replace `employeeId` with general `employeeId` (already correct — keep MealFeedback as-is since feedback is still per-employee).

Also add `User.mealRegistrations MealRegistration[]` relation.

**1b. Run migration**:
```bash
cd ibs-one-platform
npx prisma db push --accept-data-loss
npx prisma generate
```
`--accept-data-loss` is safe: no production data exists (dev environment).

**1c. src/app/api/v1/meals/route.ts** — rewrite POST + cost-report GET

POST: accept `{ departmentId, date, lunchCount, dinnerCount, guestCount, specialNote }`
```typescript
const RegisterSchema = z.object({
  departmentId: z.string().uuid(),
  date: z.string(),
  lunchCount: z.number().int().min(0).default(0),
  dinnerCount: z.number().int().min(0).default(0),
  guestCount: z.number().int().min(0).default(0),
  specialNote: z.string().optional().nullable(),
});
```
Upsert on `departmentId_date` unique key. No more per-employee upsert.

GET `?type=cost-report`: aggregate `MealRegistration` by dept for the month:
```typescript
const regs = await prisma.mealRegistration.findMany({
  where: { date: { gte: startOfMonth, lte: endOfMonth } },
  include: { department: { select: { name: true } } },
});
// Sum lunchCount + dinnerCount + guestCount per dept
```
Also aggregate `VisitorRequest.mealCount` for guestMealCost (keep existing logic).

GET `?date=YYYY-MM-DD`: return registrations for today grouped by department.

DELETE: remove by `departmentId + date`.

**1d. src/app/api/v1/meals/route.ts** — add unit price from env or constant
Replace hardcoded `35_000` with `MEAL_UNIT_PRICE` from `src/lib/constants.ts` (already defined there). Import constant instead of inline literal.

**1e. src/app/(dashboard)/hanh-chinh/nha-an/page.tsx** — update form + state

Types to update:
```typescript
// Remove:
type MealReg = { id, employeeId, date, mealType, employee: {...} }
// Add:
type MealReg = {
  id: string; departmentId: string; date: string;
  lunchCount: number; dinnerCount: number; guestCount: number; specialNote?: string;
  department: { name: string };
}
```

Stats cards: change to sum `lunchCount`, `dinnerCount`, `guestCount` across today's registrations.

RegisterMealModal: replace employee selector with:
- `departmentId` select (from /api/v1/departments)
- `lunchCount` number input
- `dinnerCount` number input (label: "Bữa tối OT")
- `guestCount` number input (label: "Suất khách")
- `specialNote` textarea

Remove `MealType` references from the page. The `MEAL_TYPE_LABELS/COLORS` maps and the `byMealType` grouping logic can be removed.

Keep the cost tab (it already shows department aggregation correctly, just update types).

### Verification
```bash
npx tsc --noEmit   # 0 errors
```
- POST `/api/v1/meals` with `{ departmentId: "<uuid>", date: "2026-04-10", lunchCount: 5 }` → 201
- GET `/api/v1/meals?date=2026-04-10` → returns dept-level registrations
- nha-an form renders with dept select + count inputs (not employee list)

### Exit criteria
- `MealRegistration` model has `departmentId, lunchCount, dinnerCount, guestCount` fields
- `MealCostReport` model exists in schema
- nha-an form uses department selector, not employee selector
- tsc --noEmit passes

---

## Step 2 — Fix Attendance Fake Data Fallback (G-NEW2)

**Priority**: MEDIUM  
**Parallel with**: Steps 1, 3a, 3b, 3c  
**File**: `src/app/api/v1/attendance/route.ts`

### Context
Line ~51-52 in attendance/route.ts:
```typescript
const presentCount = present > 0 ? present : Math.round(total * 0.95);
```
When no attendance records exist for today, the API fabricates 95% attendance. This causes the dashboard to show invented data that could mislead decision-making.

### Fix
Replace with 0 (or omit the fallback entirely):
```typescript
const presentCount = present;
```
The dashboard chart will show 0/total = 0% when no records exist, which is accurate. The "Chưa có dữ liệu" state is acceptable vs fabricated data.

Also add a `hasData` flag to the response so the UI can show a "Chưa nhập công hôm nay" indicator:
```typescript
return {
  departmentId: dept.id,
  departmentName: dept.name,
  present: presentCount,
  total,
  rate: total > 0 ? Math.round((presentCount / total) * 100) : 0,
  hasData: present > 0,
};
```

### Verification
- GET `/api/v1/attendance?summary=true` with no records for today → returns 0% (not 95%)

---

## Step 3a — Fill src/services/ Directory (G-N2)

**Priority**: LOW  
**Parallel with**: Steps 1, 2, 3b, 3c

### Context
Spec Section 4.2 requires 12 service files in `src/services/`. Currently the directory exists but is empty.

### Tasks
Create the following service files. Each file exports functions that wrap Prisma calls currently inline in API routes. This makes logic reusable across routes and Telegram bot.

**Files to create** (in `src/services/`):
1. `employee.service.ts` — getEmployee, listEmployees, createEmployee, updateEmployee
2. `attendance.service.ts` — getAttendanceSummary, bulkUpsertAttendance
3. `leave.service.ts` — createLeaveRequest, approveLeave, rejectLeave, getLeaveBalance
4. `salary.service.ts` — calculateSalaryForPeriod, getSalarySlip (wraps payroll logic)
5. `vehicle.service.ts` — getAvailableVehicles, createBooking, approveBooking
6. `meal.service.ts` — registerMeals, getCostReport, getMenuForWeek
7. `cleaning.service.ts` — getZones, getSchedules, createIssue
8. `visitor.service.ts` — registerVisitor, checkIn, checkOut
9. `event.service.ts` — getEvents, createEvent, toggleChecklist
10. `hse.service.ts` — reportIncident, createBriefing, trackInduction
11. `notification.service.ts` — createNotification, markRead
12. `report.service.ts` — generateWeeklyHR, generateMonthlyHR, generateFinanceSummary

**Pattern for each file**:
```typescript
// src/services/employee.service.ts
import prisma from "@/lib/prisma";

export async function listEmployees(filters: { search?: string; departmentId?: string; status?: string; page?: number; limit?: number }) {
  const { search, departmentId, status, page = 1, limit = 20 } = filters;
  const where: any = {};
  if (search) where.OR = [{ fullName: { contains: search } }, { code: { contains: search } }];
  if (departmentId) where.departmentId = departmentId;
  if (status) where.status = status;
  const [data, total] = await Promise.all([
    prisma.employee.findMany({ where, skip: (page - 1) * limit, take: limit, orderBy: { code: "asc" } }),
    prisma.employee.count({ where }),
  ]);
  return { data, total, page, limit };
}
// ... other functions
```

Services should NOT duplicate business logic — they extract what's already in routes. Routes continue to work as before (this is additive).

### Verification
```bash
npx tsc --noEmit  # 0 errors
```

---

## Step 3b — Fill src/types/index.ts + src/hooks/ (G-N3, G-N4)

**Priority**: LOW  
**Parallel with**: Steps 1, 2, 3a, 3c

### Tasks

**src/types/index.ts** — consolidate shared types currently duplicated across pages:
```typescript
// Core entity types
export type Employee = { id: string; code: string; fullName: string; ... }
export type Department = { id: string; code: string; name: string; headcount: number }
export type LeaveRequest = { id: string; leaveType: string; startDate: string; ... }
export type Notification = { id: string; title: string; message: string; isRead: boolean; ... }
export type Vehicle = { id: string; licensePlate: string; model: string; driverName?: string; nextMaintenanceDate?: string; ... }
export type HSEIncident = { id: string; type: string; severity: string; status: string; ... }
export type MealRegistration = { id: string; departmentId: string; lunchCount: number; dinnerCount: number; ... }
// ... all major entity types used in UI pages
```

**src/hooks/use-employees.ts**:
```typescript
"use client";
import { useState, useEffect } from "react";
import type { Employee } from "@/types";

export function useEmployees(filters?: { departmentId?: string; search?: string }) {
  const [data, setData] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const params = new URLSearchParams(filters as any);
    fetch(`/api/v1/employees?${params}`)
      .then(r => r.json())
      .then(res => setData(res.data || []))
      .finally(() => setLoading(false));
  }, [filters?.departmentId, filters?.search]);
  return { data, loading };
}
```

**src/hooks/use-attendance.ts** — similar pattern for attendance data

Note: Existing page components do NOT need to be migrated to use these hooks. The hooks are additive. Pages will use them when refactored in future.

### Verification
```bash
npx tsc --noEmit  # 0 errors
```

---

## Step 3c — API URL Aliases (G-N5)

**Priority**: LOW  
**Parallel with**: Steps 1, 2, 3a, 3b

### Tasks

Add missing route paths that spec defines but aren't present:

**1. `/api/v1/attendance/bulk/route.ts`** (new file):
```typescript
// Proxy to /api/v1/attendance POST
import { NextRequest } from "next/server";
export { POST } from "../route";  // re-export the POST from parent
```
Simplest implementation: just re-export from the parent route.

**2. `/api/v1/salary/route.ts`** (new directory + file):
```typescript
// Alias: GET /api/v1/salary maps to /api/v1/payroll
import { NextRequest, NextResponse } from "next/server";
export { GET, POST } from "../../payroll/route";
```

**3. `/api/v1/salary/[id]/route.ts`** — alias for payroll/[id]
```typescript
export { GET, PUT } from "../../../payroll/[id]/route";
```

**4. `/api/v1/salary/[id]/slip/route.ts`** — alias for payroll/[id]/slip
```typescript
export { GET } from "../../../../payroll/[id]/slip/route";
```

**5. `/api/v1/vehicle-bookings/route.ts`** — alias for vehicles/bookings
```typescript
export { GET, POST } from "../vehicles/bookings/route";
```

**6. `/api/v1/leave-requests/[id]/approve/route.ts`** (new):
```typescript
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // delegate to [id]/route.ts with action=APPROVE
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const newReq = new Request(req.url.replace("/approve", ""), {
    method: "PUT",
    headers: req.headers,
    body: JSON.stringify({ action: "APPROVE", ...body }),
  });
  const { PUT: handler } = await import("../route");
  return handler(new NextRequest(newReq), { params: Promise.resolve({ id }) });
}
```

**7. `/api/v1/leave-requests/[id]/reject/route.ts`** — same pattern with action=REJECT

### Verification
```bash
npx tsc --noEmit
```
- `PUT /api/v1/leave-requests/<id>/approve` → 200
- `GET /api/v1/salary` → 200 (same as /api/v1/payroll)

---

## Step 4 — Final Validation

**Depends on**: Steps 1, 2, 3a, 3b, 3c (all)

```bash
cd ibs-one-platform

# Type check
npx tsc --noEmit

# Schema validation
npx prisma validate

# Ensure Prisma client is up to date
npx prisma generate
```

Expected: 0 TypeScript errors, schema valid.

---

## Compliance After This Plan

| Gap | Before | After |
|-----|--------|-------|
| G-N1 MealRegistration grain | ❌ per-employee | ✅ per-department |
| G-N6 MealCostReport | ❌ not persisted | ✅ model exists |
| G-NEW2 Fake attendance | ❌ fabricated 95% | ✅ real data only |
| G-NEW4 Hardcoded price | ⚠ inline literal | ✅ from constants |
| G-N2 services/ | ❌ empty | ✅ 12 service files |
| G-N3 types/ | ❌ empty | ✅ shared types |
| G-N4 hooks/ | ❌ empty | ✅ 2 hooks |
| G-N5 API URLs | ⚠ partial | ✅ aliases exist |

**Projected compliance**: ~93% overall (Feature 95%, Business Logic 90%, Architecture 78%)

---

## Files Changed Summary

| Step | Files | Risk |
|------|-------|------|
| 1 | prisma/schema.prisma, meals/route.ts, nha-an/page.tsx | MEDIUM (schema migration) |
| 2 | attendance/route.ts | LOW (1 line fix) |
| 3a | 12 new files in src/services/ | LOW (additive) |
| 3b | src/types/index.ts, src/hooks/use-employees.ts, src/hooks/use-attendance.ts | LOW (additive) |
| 3c | 7 new route alias files | LOW (additive) |
| 4 | — (validation only) | — |

---

## Rollback Strategy

- **Step 1 rollback**: `npx prisma db push --accept-data-loss` with old schema. Low risk since dev environment has no production data.
- **Step 2 rollback**: Revert attendance/route.ts single line.
- **Steps 3a/3b/3c rollback**: Delete new files. No existing files modified.
