import { ROLE_HIERARCHY } from "@/lib/constants";

// ─── Hierarchy-based check ──────────────────────────────────────────────────

export function checkPermission(userRole: string, requiredRole: string): boolean {
  const userLevel = ROLE_HIERARCHY[userRole] || 0;
  const requiredLevel = ROLE_HIERARCHY[requiredRole] || 0;
  return userLevel >= requiredLevel;
}

export function hasRole(userRole: string, roles: string[]): boolean {
  return roles.includes(userRole);
}

// ─── Module × Action permission matrix ─────────────────────────────────────
//
// Spec: NV (view/submit own), TP (approve level-1), HC (manage), BOM (full)
//
// Each entry is the MINIMUM role required for that action.
// Use checkPermission(userRole, MODULE_PERMISSIONS[module][action]) in routes.

export const MODULE_PERMISSIONS = {
  // M1
  employees: {
    readOwn: "EMPLOYEE",    // view own profile
    readDept: "MANAGER",    // view department roster
    readAll: "HR_ADMIN",
    create: "HR_ADMIN",
    update: "HR_ADMIN",
    delete: "BOM",
    softDelete: "HR_ADMIN",
  },
  // M3
  attendance: {
    readOwn: "EMPLOYEE",
    readDept: "MANAGER",
    readAll: "HR_ADMIN",
    bulkUpsert: "HR_ADMIN",
  },
  leaveRequests: {
    create: "EMPLOYEE",
    approve1: "MANAGER",   // PENDING → PENDING_HR
    approve2: "HR_ADMIN",  // PENDING_HR → APPROVED
    reject: "MANAGER",
    viewOwn: "EMPLOYEE",
    viewDept: "MANAGER",
    viewAll: "HR_ADMIN",
  },
  otRequests: {
    create: "EMPLOYEE",
    approveTeam: "TEAM_LEAD", // TEAM_LEAD can approve OT for their own team members
    approve1: "MANAGER",
    approve2: "HR_ADMIN",
    reject: "MANAGER",
  },
  // M4
  recruitment: {
    read: "MANAGER",
    create: "HR_ADMIN",
    update: "HR_ADMIN",
    delete: "BOM",
  },
  // M5
  training: {
    read: "EMPLOYEE",
    create: "HR_ADMIN",
    update: "HR_ADMIN",
    enrollOwn: "EMPLOYEE",
  },
  // M6
  kpi: {
    readOwn: "EMPLOYEE",
    readDept: "MANAGER",
    readAll: "HR_ADMIN",
    calculate: "HR_ADMIN",
  },
  // M7
  payroll: {
    readOwn: "EMPLOYEE",    // own salary slip
    readAll: "HR_ADMIN",
    calculate: "HR_ADMIN",
    approve: "BOM",
  },
  // M8
  discipline: {
    read: "MANAGER",
    create: "HR_ADMIN",
    update: "HR_ADMIN",
    delete: "BOM",
  },
  regulations: {
    read: "EMPLOYEE",
    create: "HR_ADMIN",
    update: "HR_ADMIN",
    delete: "BOM",
  },
  // M9
  hse: {
    read: "EMPLOYEE",
    create: "HR_ADMIN",
    update: "HR_ADMIN",
    closeIncident: "MANAGER",
  },
  // M10
  vehicleBookings: {
    create: "EMPLOYEE",
    approve1: "MANAGER",
    approve2: "HR_ADMIN",
    reject: "MANAGER",
    readAll: "HR_ADMIN",
    logFuel: "HR_ADMIN",
    logMaintenance: "HR_ADMIN",
  },
  meals: {
    register: "MANAGER",    // register on behalf of dept (was HR_ADMIN, lowered)
    readAll: "HR_ADMIN",
    manageCosts: "HR_ADMIN",
  },
  cleaning: {
    report: "EMPLOYEE",
    read: "MANAGER",
    manage: "HR_ADMIN",
  },
  visitors: {
    register: "EMPLOYEE",
    approve: "HR_ADMIN",
    checkIn: "HR_ADMIN",
    readAll: "HR_ADMIN",
  },
  events: {
    read: "EMPLOYEE",
    create: "HR_ADMIN",
    update: "HR_ADMIN",
  },
  // M10.5 — NCR (dedicated module, không dùng 'events')
  ncr: {
    read: "EMPLOYEE",    // mọi NV xem được NCR
    create: "HR_ADMIN",  // HC/BOM tạo NCR
    update: "MANAGER",   // TP+ cập nhật tiến độ
    close: "HR_ADMIN",   // HC đóng NCR
  },
  // M1 — contracts
  contracts: {
    update: "HR_ADMIN",
    delete: "BOM",
  },
  // System
  reports: {
    read: "MANAGER",
    readAll: "HR_ADMIN",
  },
  settings: {
    read: "HR_ADMIN",
    update: "BOM",
  },
} as const;

type ModuleKey = keyof typeof MODULE_PERMISSIONS;
type ActionKey<M extends ModuleKey> = keyof (typeof MODULE_PERMISSIONS)[M];

/**
 * Check if a role can perform an action on a module.
 * Usage: canDo("MANAGER", "leaveRequests", "approve1")
 */
export function canDo<M extends ModuleKey>(
  userRole: string,
  module: M,
  action: ActionKey<M>
): boolean {
  const required = MODULE_PERMISSIONS[module][action] as string;
  return checkPermission(userRole, required);
}
