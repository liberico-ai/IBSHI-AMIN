# IBS ONE Platform — Spec Compliance Gap Remediation Plan

> **Generated**: 2026-04-10  
> **Objective**: Close the remaining ~5% gap to reach full spec compliance  
> **Mode**: Direct (no git remote configured)  
> **Baseline**: System at ~95% spec compliance after adversarial review corrected false positives  

---

## Audit Summary

| Category | Score | Notes |
|---|---|---|
| API Routes | 94% | 71/75 endpoints |
| UI Pages / Tabs | 95% | 21/22 required pages |
| Business Logic | 93% | 14/15 critical rules |
| End-to-end UAT Flows | 90% | 9/10 scenarios pass |
| **Overall** | **~93%** | |

### Already Implemented — Do NOT modify
- ✅ RBAC, Auth, Session (NextAuth.js)
- ✅ All employee lifecycle (CRUD, contracts, certs, work history, leave, OT)
- ✅ Leave overlap validation, seniority bonus
- ✅ Payroll: `grade × coeff × 730,000`, BHXH cap 36M, 7-tier TNCN
- ✅ KPI quality_rate = `(headcount − NCRs) / headcount × 100`
- ✅ Vehicle bookings, fuel logs, cleaning (schedule/log/issue), visitors (badge/QR/check-in/out)
- ✅ Events/NCR (auto-OVERDUE), HSE (incidents/briefings/inductions), safety briefing <85% alert
- ✅ Telegram Bot (6 commands)
- ✅ Reports page (`/bao-cao`): weekly-hr, monthly-hr, finance-summary with Excel export via exceljs
- ✅ Salary slip page: "In / Xuất PDF" via `window.print()` with print CSS
- ✅ Mobile sidebar collapse: dashboard-shell.tsx with `sidebarOpen` state + hamburger
- ✅ Notifications system, Dashboard (stat cards, attendance chart, quick actions)
- ✅ MinIO file upload API

---

## Gap 1 — Vehicle Maintenance Records

**Priority**: P1  
**Spec reference**: TASK 7.2, Section 5.6 `MaintenanceRecord`, DoD: "Tab Bảo trì: CRUD, alert bảo dưỡng định kỳ"

### Context Brief
The spec defines `MaintenanceRecord` model and requires `GET/POST /api/v1/vehicles/:id/maintenance` plus a "Bảo trì" tab in the xe page. Currently: no schema model, no API, no UI tab for maintenance.

The xe page (`src/app/(dashboard)/hanh-chinh/xe/page.tsx`) already has tabs: "Đặt xe" | "Danh sách xe" | "Nhiên liệu". Need to add "Bảo trì" tab.

### Schema Addition
Add to `prisma/schema.prisma` inside the `Vehicle` model:
```
maintenanceRecords MaintenanceRecord[]
```

Add new model after `FuelLog`:
```prisma
model MaintenanceRecord {
  id          String    @id @default(uuid())
  vehicleId   String
  type        String    // "Thay dầu", "Thay lốp", "Sửa chữa lớn"
  description String
  cost        Int       // VND
  startDate   DateTime
  endDate     DateTime?
  createdAt   DateTime  @default(now())
  vehicle     Vehicle   @relation(fields: [vehicleId], references: [id], onDelete: Cascade)
  @@index([vehicleId])
  @@index([startDate])
}
```

Then run: `npx prisma migrate dev --name add_maintenance_records`

### API
Create `src/app/api/v1/vehicles/[id]/maintenance/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { checkPermission } from "@/lib/permissions";
import { z } from "zod";

const MaintenanceSchema = z.object({
  type: z.string().min(1),
  description: z.string().min(1),
  cost: z.number().int().min(0),
  startDate: z.string(),
  endDate: z.string().optional().nullable(),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const { id: vehicleId } = await params;
  const records = await prisma.maintenanceRecord.findMany({
    where: { vehicleId },
    orderBy: { startDate: "desc" },
  });

  const totalCost = records.reduce((s, r) => s + r.cost, 0);
  return NextResponse.json({ data: records, meta: { totalCost, count: records.length } });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const userRole = (session.user as any).role;
  if (!checkPermission(userRole, "HR_ADMIN")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const { id: vehicleId } = await params;
  const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId } });
  if (!vehicle) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });

  const body = await request.json();
  const parsed = MaintenanceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", issues: parsed.error.issues } }, { status: 422 });
  }

  const record = await prisma.maintenanceRecord.create({
    data: {
      vehicleId,
      type: parsed.data.type,
      description: parsed.data.description,
      cost: parsed.data.cost,
      startDate: new Date(parsed.data.startDate),
      endDate: parsed.data.endDate ? new Date(parsed.data.endDate) : null,
    },
  });

  return NextResponse.json({ data: record }, { status: 201 });
}
```

### UI
In `src/app/(dashboard)/hanh-chinh/xe/page.tsx`:
- Add `"maintenance"` to the `Tab` union type
- Add "Bảo trì" to the tabs array
- Add state: `maintenanceRecords`, `maintenanceMeta`, `showNewMaintenance`
- Add `fetchMaintenance(vehicleId)` function (same pattern as `fetchFuelLogs`)
- Add "Bảo trì" tab content: vehicle selector, meta stats (total cost), table (type | description | cost | startDate | endDate | duration), "+ Thêm" button
- Add `NewMaintenanceModal` with: vehicle dropdown, type (text), description (textarea), cost (number), startDate (date), endDate (date, optional)

### Verification
```bash
npx prisma migrate dev --name add_maintenance_records
npx tsc --noEmit   # 0 errors
# GET /api/v1/vehicles/:id/maintenance → { data: [], meta: { totalCost: 0, count: 0 } }
# POST /api/v1/vehicles/:id/maintenance → { data: {...} } status 201
```

### Exit Criteria
- `MaintenanceRecord` in schema, migrated
- API GET + POST return correct responses
- "Bảo trì" tab renders in xe page with table + modal
- `tsc --noEmit` passes

---

## Gap 2 — Meal Cost Report API + UI

**Priority**: P2  
**Spec reference**: TASK 7.3 DoD: "Báo cáo chi phí tổng hợp theo PB/tháng (bar chart)"

### Context Brief
No `MealCostReport` persistent model needed — the spec's `MealCostReport` can be computed on-demand by aggregating `MealRegistration` records grouped by department × `MEAL_UNIT_PRICE=35000`. The `/hanh-chinh/nha-an` page currently has: "Đăng ký" | "Thực đơn" | "Đánh giá" tabs. The spec shows a bar chart at the bottom: "Tổng hợp suất ăn theo phòng ban - Tháng MM/YYYY".

### API Endpoint
Add to `src/app/api/v1/meals/route.ts` (inside GET handler, before existing code):

When `searchParams.get("type") === "cost-report"`:
```typescript
const month = parseInt(searchParams.get("month") || String(new Date().getMonth() + 1));
const year = parseInt(searchParams.get("year") || String(new Date().getFullYear()));
const startOfMonth = new Date(year, month - 1, 1);
const endOfMonth = new Date(year, month, 0, 23, 59, 59);

const byDept = await prisma.mealRegistration.groupBy({
  by: ["employeeId"],
  where: { date: { gte: startOfMonth, lte: endOfMonth } },
  _count: { id: true },
});

// Join with employee.departmentId
const employees = await prisma.employee.findMany({
  where: { id: { in: byDept.map(b => b.employeeId) } },
  select: { id: true, departmentId: true, department: { select: { name: true } } },
});

// Aggregate by department
const deptMap: Record<string, { name: string; totalMeals: number }> = {};
for (const b of byDept) {
  const emp = employees.find(e => e.id === b.employeeId);
  if (!emp) continue;
  if (!deptMap[emp.departmentId]) deptMap[emp.departmentId] = { name: emp.department.name, totalMeals: 0 };
  deptMap[emp.departmentId].totalMeals += b._count.id;
}

const UNIT_PRICE = 35000;
const data = Object.entries(deptMap).map(([deptId, d]) => ({
  departmentId: deptId,
  departmentName: d.name,
  totalMeals: d.totalMeals,
  totalCost: d.totalMeals * UNIT_PRICE,
  unitPrice: UNIT_PRICE,
})).sort((a, b) => b.totalCost - a.totalCost);

const grandTotal = data.reduce((s, d) => s + d.totalCost, 0);
return NextResponse.json({ data, meta: { grandTotal, unitPrice: UNIT_PRICE, month, year } });
```

### UI
In `src/app/(dashboard)/hanh-chinh/nha-an/page.tsx`:
- Add `"cost"` to Tab union
- Add "Chi phí" tab label
- Add state: `costData`, `costMeta`, `costMonth`, `costYear`
- Fetch `GET /api/v1/meals?type=cost-report&month=X&year=Y` on tab open
- Render:
  - Month/year selectors
  - Horizontal bar chart (recharts `BarChart` with `layout="vertical"`) — dept name on Y axis, cost VND on X axis
  - Summary table: PB | Số suất | Đơn giá | Thành tiền
  - Bold grand total row

### Verification
```bash
npx tsc --noEmit
# GET /api/v1/meals?type=cost-report&month=4&year=2026 → { data: [...], meta: { grandTotal, unitPrice: 35000 } }
```

### Exit Criteria
- API returns cost aggregation by department
- "Chi phí" tab visible in nha-an page with bar chart
- Numbers internally consistent (chart matches table matches grandTotal)

---

## Gap 3 — Nginx Production Config

**Priority**: P3  
**Spec reference**: Section 4.1 Tech Stack, Section 4.2 project structure `nginx/nginx.conf`

### Context Brief
`docker-compose.yml` exists but no `nginx/` directory. Required for production deployment.

### Files to Create

`nginx/nginx.conf`:
```nginx
events {
  worker_connections 1024;
}

http {
  gzip on;
  gzip_types text/plain application/json application/javascript text/css application/vnd.ms-excel application/pdf;
  gzip_min_length 1024;

  upstream nextjs {
    server app:3000;
  }

  server {
    listen 80;
    server_name _;
    client_max_body_size 15M;

    location /_next/static/ {
      proxy_pass http://nextjs;
      proxy_cache_valid 200 1y;
      add_header Cache-Control "public, immutable";
    }

    location / {
      proxy_pass http://nextjs;
      proxy_http_version 1.1;
      proxy_set_header Upgrade $http_upgrade;
      proxy_set_header Connection "upgrade";
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_cache_bypass $http_upgrade;
    }
  }
}
```

Update `docker-compose.yml` to add nginx service after the app service:
```yaml
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
    depends_on:
      - app
    restart: unless-stopped
```

### Verification
```bash
ls nginx/nginx.conf
docker compose config   # no parse errors
```

### Exit Criteria
- `nginx/nginx.conf` created with gzip + proxy config
- `docker-compose.yml` includes nginx service
- `docker compose config` parses without errors

---

## Execution Order

All 3 gaps are independent and can be done in any order:

```
Gap 1 (Vehicle Maintenance)   — schema change required, run migration first
Gap 2 (Meal Cost Report)      — API + UI only, no schema change
Gap 3 (Nginx)                 — config files only
```

Run `npx tsc --noEmit` after completing Gaps 1 and 2.

---

## Final Compliance Estimate After Gaps Closed

| Category | Before | After |
|---|---|---|
| API Routes | 94% | 99% |
| UI Pages / Tabs | 95% | 99% |
| Business Logic | 93% | 95% |
| End-to-end UAT | 90% | 100% |
| **Overall** | **~93%** | **~98%** |

The remaining 2% gap: data migration script (`scripts/migrate-nas-data.ts`) and seed verification are ops/infra work outside application code scope.
