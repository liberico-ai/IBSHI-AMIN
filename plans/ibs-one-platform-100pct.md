# IBS ONE Platform — 100% Spec Compliance Plan
**Baseline:** ~90% (v4 audit, 2026-04-10)
**Target:** 100% — all spec-task.md DoD Tier 1–5 items satisfied
**Mode:** Direct edits (no git/GitHub CLI)

---

## Compliance Delta to 100%

| Category | Current | Gap Count | Target |
|----------|---------|-----------|--------|
| v4 plan items (already designed) | ~90% | 10 | Execute v4 plan |
| Critical bugs (fake data) | — | 2 | Fix |
| RBAC precision | — | 2 | Fix |
| Business logic (NCR, notifications) | — | 2 | Fix |
| FE completions (mockup, print) | — | 3 | Fix |
| Config & Seed | — | 2 | Fix |
| **Total new items** | | **21** | **100%** |

---

## PHASE A — Critical Bug Fixes
**Do these first — they corrupt real data display**

---

### A-1: Dashboard fake attendance fallback

**File:** `src/app/(dashboard)/page.tsx`

**Problem:** Lines 102 and 125 still use a fake 95-96% fallback when no attendance records exist:
```typescript
// Line 102 (global stat):
const presentToday = presentTodayCount > 0 ? presentTodayCount : Math.round(totalEmployees * 0.96);

// Line 125 (per-department bar):
present: present > 0 ? present : Math.round(total * 0.95),
```

These lines were supposed to be removed in v3 (the attendance API was fixed) but the dashboard page itself was not updated.

**Fix line 102:**
```typescript
// Remove fake fallback — show real count
const presentToday = presentTodayCount;
const presentRate = totalEmployees > 0 ? ((presentToday / totalEmployees) * 100).toFixed(1) : "0.0";
```

**Fix line 125 (inside `attendanceSummary` map):**
```typescript
return {
  name: dept.name,
  present,   // real count — 0 if no data recorded yet
  total,
  hasData: present > 0,
};
```

Also update `AttendanceBar` component (lines 57–74) to show a "Chưa có dữ liệu" label when `hasData === false` instead of a 95% bar.

**Verification:**
```bash
# In a fresh DB with no attendance records, dashboard should show 0% not 95%
npx tsc --noEmit  # 0 errors
```

---

### A-2: Dashboard module status cards — update hardcoded Phase percentages

**File:** `src/app/(dashboard)/page.tsx` lines 302–320

**Problem:** Module status section hardcodes `pct: 85, 70, 65, 0, 0` for modules that are now fully implemented across all phases.

**Fix:** Replace the static module grid with a simple "all phases launched" summary, or update percentages to reflect actual implementation state. At minimum, remove `pct: 0` for M4 and M7 since they are fully implemented.

```typescript
// Update to reflect actual implementation state:
{ icon: "👤", name: "M1 Hồ sơ NV",   pct: 100, status: "Hoàn thiện",   href: "/ho-so" },
{ icon: "🏢", name: "M2 Sơ đồ TC",   pct: 100, status: "Hoàn thiện",   href: "/so-do" },
{ icon: "📅", name: "M3 Chấm công",  pct: 100, status: "Hoàn thiện",   href: "/cham-cong" },
{ icon: "👥", name: "M4 Tuyển dụng", pct: 100, status: "Hoàn thiện",   href: "/tuyen-dung" },
{ icon: "💰", name: "M7 Lương",      pct: 100, status: "Hoàn thiện",   href: "/luong" },
```

---

## PHASE B — Execute v4 Plan
**Reference: `plans/ibs-one-platform-spec-compliance-v4.md`**

Execute all 4 steps in the v4 plan in order. Do not skip adversarial fixes:

| v4 Step | Content | Key risk |
|---------|---------|----------|
| Step 2 (schema) | VehiclePurpose enum, VisitorPurpose enum, HSEInduction fields, CompanyEvent fields | Fix bot first, then migrate |
| Step 1 (salary slips) | GET /salary/slips, POST /salary/calculate, print CSS | Independent |
| Step 3 (path aliases) | /visitors/today, vehicle-bookings/[id]/approve/reject/complete | Depends on Step 2 |
| Step 4 (minor endpoints) | /reports?type=dashboard-kpi, /attendance/summary | Independent |

**Critical sequencing from v4 adversarial review:**
1. Fix `dat-xe.ts` (PURPOSE_LABELS → purposeKey enum key) BEFORE schema migration
2. Use `prisma migrate dev --name spec_v4_schema_gaps` NOT `db push`
3. Include SQL data coercion steps in migration for String→enum columns

---

## PHASE C — RBAC Precision

---

### C-1: Meal registration — allow MANAGER+ to register for own department

**File:** `src/app/api/v1/meals/route.ts`

**Problem:** POST and DELETE require HR_ADMIN (level 4). Spec RBAC table says "Đăng ký suất ăn (phòng)" is allowed for MANAGER (level 3) and above.

**Fix POST handler (around line 100):**
```typescript
// Before:
if (!checkPermission(userRole, "HR_ADMIN")) {
  return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
}

// After:
if (!checkPermission(userRole, "MANAGER")) {
  return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
}
// For MANAGER role: enforce they can only register for their own department
if (userRole === "MANAGER") {
  const userEmployee = await prisma.employee.findFirst({
    where: { userId: (session.user as any).id },
    select: { departmentId: true },
  });
  if (!userEmployee || parsed.data.departmentId !== userEmployee.departmentId) {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Chỉ được đăng ký suất ăn cho phòng ban của mình" } }, { status: 403 });
  }
}
```

Apply same fix to DELETE handler (line 128).

Also update `src/app/(dashboard)/hanh-chinh/nha-an/page.tsx`: the "Đăng ký suất ăn" button should be visible to MANAGER role, not only HR_ADMIN. Read the page to find where role check is done and update it.

**Verification:**
- MANAGER role can POST to /meals with own departmentId → 200
- MANAGER role POSTing with different departmentId → 403
- EMPLOYEE role POSTing → 403

---

### C-2: Leave approval — department scope for MANAGER role

**File:** `src/services/leave.service.ts` + `src/app/api/v1/leave-requests/[id]/approve/route.ts`

**Problem:** Spec says "Duyệt nghỉ phép → MANAGER (PB)" — MANAGER can only approve leave for employees in their own department. Current implementation allows any MANAGER to approve any leave request.

**Fix in `leave-requests/[id]/approve/route.ts`:**
```typescript
// After auth + MANAGER permission check, add department scope:
const { id } = await params;
const leaveReq = await prisma.leaveRequest.findUnique({
  where: { id },
  include: { employee: { select: { departmentId: true } } },
});
if (!leaveReq) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });

if (userRole === "MANAGER") {
  const approver = await prisma.employee.findFirst({
    where: { userId: (session.user as any).id },
    select: { departmentId: true },
  });
  if (!approver || approver.departmentId !== leaveReq.employee.departmentId) {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Chỉ được duyệt phép cho nhân viên trong phòng ban của mình" } }, { status: 403 });
  }
}
// Then call approveLeave(id, ...)
```

Apply same fix to `leave-requests/[id]/reject/route.ts`.

---

## PHASE D — Business Logic Completions

---

### D-1: Contract & certificate expiry auto-notifications

**Problem:** `/alerts/expiring` route correctly updates contract/cert statuses to `EXPIRING_SOON`/`EXPIRED` but creates **no notifications** for HR_ADMIN users. Spec requires notification to be created so HR admins see an alert in their bell.

**File:** `src/app/api/v1/alerts/expiring/route.ts`

After the status update blocks (lines 54–84), add notification creation:

```typescript
// After updating contract statuses:
if (expiringContractIds.length > 0) {
  const hrAdmins = await prisma.user.findMany({ where: { role: "HR_ADMIN", isActive: true } });
  for (const contract of expiringContracts) {
    const daysLeft = Math.ceil(
      (contract.endDate!.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    );
    await Promise.all(hrAdmins.map((u) =>
      prisma.notification.upsert({
        where: {
          // Avoid duplicate notifications — use composite where not supported natively
          // Use createMany with skipDuplicates via a unique check
          id: `contract-expiry-${contract.id}`, // placeholder — use findFirst + create pattern
        },
        create: {
          userId: u.id,
          title: "Hợp đồng sắp hết hạn",
          message: `${contract.employee.fullName} — HĐ hết hạn sau ${daysLeft} ngày (${contract.endDate!.toLocaleDateString("vi-VN")})`,
          type: "EXPIRY_WARNING",
          referenceType: "contract",
          referenceId: contract.id,
        },
        update: {},
      }).catch(() => {})
    ));
  }
}
```

**Better implementation:** Use `findFirst + createIfNotExists` pattern to avoid duplicate notifications:
```typescript
async function notifyIfNew(userId: string, referenceType: string, referenceId: string, title: string, message: string) {
  const existing = await prisma.notification.findFirst({
    where: { userId, referenceType, referenceId, type: "EXPIRY_WARNING" },
  });
  if (!existing) {
    await prisma.notification.create({
      data: { userId, title, message, type: "EXPIRY_WARNING", referenceType, referenceId },
    });
  }
}
```

Call `notifyIfNew` for each expiring contract and certificate after status update.

**Verification:**
- Call `GET /alerts/expiring` → HR_ADMIN user gets notifications for each expiring item
- Second call → no duplicate notifications created

---

### D-2: NCR status auto-OVERDUE when due date passes

**Problem:** `NCR.status` has enum value `OVERDUE` but no code ever sets it. Spec: "NCR quá hạn: auto status OVERDUE, alert".

**File:** `src/app/api/v1/ncrs/[id]/route.ts`

In the PUT handler, before returning the NCR, add auto-OVERDUE check for all open NCRs:

**Better: add it to the NCR list GET route** (`src/app/api/v1/ncrs/route.ts`) so every time NCRs are fetched, overdue ones are updated:

```typescript
// In GET /ncrs, after fetching records, auto-update overdue status:
const now = new Date();
const overdueNcrs = await prisma.nCR.findMany({
  where: {
    dueDate: { lt: now },
    status: { in: ["OPEN", "IN_PROGRESS"] },
  },
  select: { id: true },
});
if (overdueNcrs.length > 0) {
  await prisma.nCR.updateMany({
    where: { id: { in: overdueNcrs.map((n) => n.id) } },
    data: { status: "OVERDUE" },
  });
  // Notify HR_ADMIN about overdue NCRs
  const hrAdmins = await prisma.user.findMany({ where: { role: "HR_ADMIN", isActive: true } });
  for (const ncr of overdueNcrs) {
    for (const u of hrAdmins) {
      await prisma.notification.create({
        data: {
          userId: u.id,
          title: "NCR quá hạn đóng",
          message: `NCR ${ncr.id.slice(0, 8)} đã quá hạn — cần xử lý khẩn`,
          type: "EXPIRY_WARNING",
          referenceType: "ncr",
          referenceId: ncr.id,
        },
      }).catch(() => {});
    }
  }
}
```

Also in the FE `hanh-chinh/su-kien/page.tsx`, the NCR table rows where `status === "OVERDUE"` should have danger color for the due date cell. Check if this exists and add if missing.

**Verification:**
- Create NCR with `dueDate` in the past, status OPEN
- Call `GET /ncrs` → that NCR's status is now OVERDUE
- HR_ADMIN has a notification for it

---

## PHASE E — FE Completions

---

### E-1: Salary slip page — proper print CSS for clean PDF output

**File:** `src/app/(dashboard)/luong/slip/[id]/page.tsx`

**Problem:** The Printer button triggers `window.print()` but the dashboard layout (sidebar, header, action buttons) would all appear in the print output.

**Fix:** Add a `<style>` tag with print media query inside the page component:

```typescript
// In the JSX, add before the main content:
<style>{`
  @media print {
    /* Hide everything except the slip */
    .dashboard-sidebar,
    .dashboard-header,
    .slip-actions,
    nav { display: none !important; }
    
    /* Reset layout for print */
    body, html { background: white !important; }
    .slip-content { 
      max-width: 100%;
      padding: 0;
      color: black !important;
    }
    
    /* Force borders/text to print */
    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    
    @page {
      size: A4 portrait;
      margin: 15mm 20mm;
    }
  }
`}</style>
```

The slip content container needs a stable className like `slip-content`. The sidebar wrapper in `dashboard-shell.tsx` should have `dashboard-sidebar` class or use `print:hidden` Tailwind utility.

**Simpler approach:** Add `className="print:hidden"` to the sidebar and header in `src/components/layout/dashboard-shell.tsx`, and `className="print:hidden"` to the slip action buttons. Add `@page { size: A4; margin: 20mm; }` in globals.css.

**Verification:** Print preview shows only the slip content, no sidebar/header.

---

### E-2: Cleaning page — add average score stat card

**File:** `src/app/(dashboard)/hanh-chinh/ve-sinh/page.tsx`

**Problem:** Spec mockup includes a "Điểm vệ sinh trung bình" stat card. Current implementation has status indicators but no average score card.

**Fix:** 
1. In the API or page, compute average score from recent `CleaningLog` records that have `score` field
2. Add a stat card to the stats row showing average score (0–10 scale)

```typescript
// Fetch average score:
const avgScoreResult = await fetch('/api/v1/cleaning?type=avg-score')
// Or compute locally from fetched logs:
const avgScore = logs.filter(l => l.score !== null).reduce((s, l) => s + l.score!, 0) / logs.filter(l => l.score !== null).length || 0;
```

Add to stats area:
```tsx
<StatCard label="Điểm VS trung bình" value={avgScore.toFixed(1)} unit="/10" color="var(--ibs-success)" />
```

---

### E-3: Cleaning page — verify ✅/⚠/⭕ status display

The cleaning page already has `LOG_STATUS` with "Đạt", "Cần cải thiện", "Bỏ sót" labels. Verify that the schedule table actually displays these as visual badges (✅/⚠/⭕), not just text. If only text is shown, wrap in colored badge components matching the spec mockup.

---

## PHASE F — Configuration & Seed

---

### F-1: Complete .env.example with all spec Section 12 parameters

**File:** `.env.example`

Current file is missing these spec-required params:

```bash
# === ADD THESE to .env.example ===

# Telegram
TELEGRAM_WEBHOOK_URL=https://your-domain.com/api/v1/telegram/webhook

# Pagination
PAGINATION_DEFAULT=20
PAGINATION_MAX=100

# File upload
FILE_MAX_SIZE_MB=10

# Alert thresholds (days before expiry to start alerting)
CONTRACT_EXPIRY_ALERT_DAYS=30
CERT_EXPIRY_ALERT_DAYS=30

# Salary calculation constants (reference — actual values in src/lib/constants.ts)
INSURANCE_SALARY_CAP=36000000
PERSONAL_DEDUCTION=11000000
DEPENDENT_DEDUCTION=4400000
STANDARD_WORK_DAYS=26
MEAL_UNIT_PRICE=35000
OT_RATE_NORMAL=1.5
OT_RATE_WEEKEND=2.0
OT_RATE_HOLIDAY=3.0
```

Note: These values are already hardcoded in `src/lib/constants.ts`. The .env.example is for documentation and operators who need to know what can be configured.

---

### F-2: Verify seed.ts runs end-to-end and creates required data

**File:** `prisma/seed.ts`

Spec Tier 1 DoD requires: "Database có đủ seed data (9 PB, 12 tổ, 8 NV mẫu)"

Current seed.ts already creates:
- 10 departments ✓ (spec says 9 PB — actually has 10 including BOM, which is correct)
- 12 production teams ✓ (confirmed in seed.ts lines 71-83)
- Sample employees with IBS codes ✓ (IBS-001, IBS-005, IBS-012, IBS-023 confirmed)

**Verify seed runs cleanly:**
```bash
cd ibs-one-platform
npx prisma db push --accept-data-loss  # fresh DB
npx prisma db seed
# Expected: all console.log ✅ lines, no errors
```

**If seed fails:** fix any FK constraint errors that arise from schema changes in Phase B.

Also ensure seed creates:
- At least one admin user with email `admin@ibs.com.vn` / password `admin123` for Tier 1 smoke test
- At least 8 sample employees across different departments and roles

---

### F-3: Verify docker-compose.yml works end-to-end

**File:** `docker-compose.yml`

Spec Tier 1 DoD: "`docker compose up` khởi động thành công tất cả services (app + postgres + minio)"

**Verify:**
```bash
docker compose up --build
# Expected:
# - postgres: healthy
# - minio: healthy  
# - app: listening on :3000
# Navigate to http://localhost:3000 → login page
```

**Common issues to check:**
1. `NEXTAUTH_URL` in docker-compose env must match the container's URL
2. `DATABASE_URL` must reference the postgres service name, not `localhost`
3. MinIO bucket creation on startup — verify `ensureBucket` works on first boot
4. If build fails: check if `package.json` `build` script is correct in Dockerfile

---

## PHASE G — Final RBAC Verification

Spec Section 10.1 defines a detailed permission matrix. Verify these specific cases are enforced:

| Action | Role | Expected | File to check |
|--------|------|----------|---------------|
| Xem tất cả hồ sơ | EMPLOYEE | 403 | employees/route.ts |
| Xóa NV | HR_ADMIN | 403 | employees/[id]/route.ts |
| Xóa NV | BOM | 200 | employees/[id]/route.ts |
| Nhập bảng công | EMPLOYEE | 403 | attendance/bulk/route.ts |
| Xem/tính lương tất cả | MANAGER | 403 | payroll/route.ts |
| Duyệt đặt xe | EMPLOYEE | 403 | vehicles/bookings/[id]/route.ts |
| Cài đặt hệ thống | HR_ADMIN | 403 | settings/users/route.ts |
| Đăng ký suất ăn | EMPLOYEE | 403 | meals/route.ts |
| Đăng ký suất ăn | MANAGER (own dept) | 200 | meals/route.ts (after C-1 fix) |

For each row, write a test or manually verify the API returns the correct status code.

**Fix any missing permission checks found during this review.**

---

## PHASE H — Final Verification Checklist

Run after all phases complete:

```bash
# 1. TypeScript — must be 0 errors
npx tsc --noEmit

# 2. Prisma schema — must be valid
npx prisma validate

# 3. Seed — must run without errors
npx prisma db push --accept-data-loss
npx prisma db seed

# 4. Build — must succeed
npm run build

# 5. Spec DoD Tier 1 smoke test
docker compose up --build
# - Navigate to http://localhost:3000 → login page
# - Login as admin@ibs.com.vn / admin123 → Dashboard loads
# - Sidebar shows all modules, click through without errors
# - Dashboard: 4 stat cards visible, attendance chart shows data or "Chưa có dữ liệu" message
# - Notification bell works, dropdown opens

# 6. Tier 2 core functionality
# - Create employee → assign dept → create contract
# - Leave request → approve → verify balance decremented
# - OT request → approve → verify recorded
# - Dashboard attendance chart shows data (no 95% fake number)

# 7. Tier 3 Phase 2
# - Create recruitment request → check BOM approval flow
# - Training plan → record → verify cert tracking
# - Regulation → disciplinary action

# 8. Tier 4 Phase 3
# - Create payroll period → run CALCULATE → verify slip
# - Print slip → verify clean A4 output (no sidebar)
# - Vehicle booking → approve → complete → log km
# - Visitor pre-register → approve → check-in → HSE induction created
# - NCR → set past due date → GET /ncrs → verify OVERDUE auto-set

# 9. Tier 5 Phase 4  
# - KPI calculate for Q1/2026 → verify scores per department
# - 360 evaluation → submit → verify stored
# - Verify RBAC matrix spot-checks from Phase G
```

---

## Execution Order

```
Phase A (Bugs)     ─────────────────────────────────────────── Run first
Phase B (v4 plan)  ─────┬── Step 2 (schema) ──→ Step 3 (paths)
                         └── Step 1 (salary)  ──→ independent
                             Step 4 (minor)   ──→ independent
Phase C (RBAC)     ────────────────────────────────────────── After Phase B
Phase D (Logic)    ────────────────────────────────────────── After Phase B
Phase E (FE)       ────────────────────────────────────────── Independent
Phase F (Config)   ────────────────────────────────────────── Independent
Phase G (Verify)   ────────────────────────────────────────── After ALL phases
Phase H (Final)    ────────────────────────────────────────── Last
```

---

## Summary: All 21 Work Items

| # | Phase | Item | File(s) | Effort |
|---|-------|------|---------|--------|
| 1 | A-1 | Remove dashboard fake 95% attendance | dashboard/page.tsx | Small |
| 2 | A-2 | Update module status percentages | dashboard/page.tsx | Small |
| 3 | B | Execute v4 Step 2: schema + bot fix | schema.prisma, dat-xe.ts, xe/page.tsx, khach/page.tsx | Medium |
| 4 | B | Execute v4 Step 1: salary slips + calculate | salary/slips/route.ts, salary/calculate/route.ts, slip/page.tsx | Medium |
| 5 | B | Execute v4 Step 3: visitor today + vehicle aliases | visitors/today/route.ts, vehicle-bookings/[id]/\* | Small |
| 6 | B | Execute v4 Step 4: dashboard-kpi + summary | reports/route.ts, attendance/summary/route.ts | Small |
| 7 | C-1 | Meal registration: MANAGER+ permission | meals/route.ts, nha-an/page.tsx | Small |
| 8 | C-2 | Leave approval: department scope | leave-requests/[id]/approve/route.ts, reject/route.ts | Small |
| 9 | D-1 | Contract/cert expiry notifications | alerts/expiring/route.ts | Small |
| 10 | D-2 | NCR auto-OVERDUE + alert | ncrs/route.ts | Small |
| 11 | E-1 | Salary slip print CSS | luong/slip/[id]/page.tsx, dashboard-shell.tsx | Small |
| 12 | E-2 | Cleaning avg score stat card | ve-sinh/page.tsx, cleaning/route.ts | Small |
| 13 | E-3 | Cleaning status badge display | ve-sinh/page.tsx | Small |
| 14 | F-1 | Complete .env.example | .env.example | Trivial |
| 15 | F-2 | Verify seed.ts end-to-end | prisma/seed.ts | Small |
| 16 | F-3 | Verify docker-compose | docker-compose.yml | Small |
| 17 | G | RBAC spot-check — delete employee (BOM only) | employees/[id]/route.ts | Small |
| 18 | G | RBAC spot-check — settings (BOM only) | settings/users/route.ts | Small |
| 19 | G | RBAC spot-check — bulk attendance (HR_ADMIN+) | attendance/bulk/route.ts | Small |
| 20 | H | tsc --noEmit + prisma validate → 0 errors | — | Verify |
| 21 | H | Full DoD Tier 1–5 manual walkthrough | — | Verify |

---

## After Completion: Expected Compliance

| Dimension | Target |
|-----------|--------|
| Feature Coverage | 100% — all spec endpoints, all UI pages |
| Business Logic | 100% — all formulas, all workflows, all edge cases |
| Architecture | 100% — type-safe schemas, correct RBAC, clean config |
| DoD Tier 1–5 | 100% — all checklist items verified |
