// IBS ONE Platform — Shared TypeScript types
// These mirror the Prisma models for use in client components and hooks.

export type Employee = {
  id: string;
  code: string;
  fullName: string;
  gender: "MALE" | "FEMALE";
  phone: string;
  address: string;
  departmentId: string;
  positionId: string;
  startDate: string;
  status: "ACTIVE" | "PROBATION" | "ON_LEAVE" | "RESIGNED" | "TERMINATED";
  salaryGrade?: number | null;
  salaryCoefficient?: number | null;
  dependents: number;
  department?: { id: string; name: string; code: string };
  position?: { id: string; name: string };
};

export type Department = {
  id: string;
  code: string;
  name: string;
  nameEn?: string | null;
  headcount: number;
  isActive: boolean;
  sortOrder: number;
};

export type LeaveRequest = {
  id: string;
  employeeId: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  reason: string;
  status: "DRAFT" | "PENDING" | "APPROVED" | "REJECTED" | "COMPLETED" | "CANCELLED";
  approvedBy?: string | null;
  approvedAt?: string | null;
  rejectedReason?: string | null;
  employee?: Pick<Employee, "code" | "fullName" | "department">;
};

export type Notification = {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: "APPROVAL_REQUIRED" | "APPROVED" | "REJECTED" | "EXPIRY_WARNING" | "HSE_ALERT" | "SYSTEM";
  referenceType: string;
  referenceId: string;
  isRead: boolean;
  createdAt: string;
};

export type Vehicle = {
  id: string;
  licensePlate: string;
  model: string;
  type: "CAR" | "VAN" | "TRUCK" | "MOTORBIKE";
  seats: number;
  driverName?: string | null;
  status: "AVAILABLE" | "IN_USE" | "MAINTENANCE" | "OUT_OF_SERVICE";
  nextMaintenanceDate?: string | null;
  isActive: boolean;
};

export type VehicleBooking = {
  id: string;
  vehicleId: string;
  requestedBy: string;
  startDate: string;
  endDate: string;
  destination: string;
  purpose: string;
  passengers: number;
  status: "PENDING" | "APPROVED" | "REJECTED" | "COMPLETED" | "CANCELLED";
  vehicle?: Pick<Vehicle, "licensePlate" | "model">;
};

export type HSEIncident = {
  id: string;
  type: "INJURY" | "LTI" | "NEAR_MISS" | "FIRST_AID" | "PROPERTY_DAMAGE" | "OBSERVATION" | "ENVIRONMENTAL";
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  status: "REPORTED" | "INVESTIGATING" | "ACTION_REQUIRED" | "RESOLVED" | "CLOSED";
  location: string;
  description: string;
  incidentDate: string;
  reportedBy: string;
};

export type MealRegistration = {
  id: string;
  departmentId: string;
  date: string;
  lunchCount: number;
  dinnerCount: number;
  guestCount: number;
  specialNote?: string | null;
  registeredBy: string;
  department?: Pick<Department, "id" | "name">;
};

export type MealCostReport = {
  id: string;
  departmentId: string;
  month: number;
  year: number;
  totalMeals: number;
  unitPrice: number;
  totalCost: number;
};

export type PayrollRecord = {
  id: string;
  periodId: string;
  employeeId: string;
  workDays: number;
  baseSalary: number;
  grossSalary: number;
  netSalary: number;
  bhxh: number;
  bhyt: number;
  bhtn: number;
  tncn: number;
  employee?: Pick<Employee, "code" | "fullName" | "department">;
};

export type AttendanceSummary = {
  departmentId: string;
  departmentName: string;
  present: number;
  total: number;
  rate: number;
  hasData: boolean;
};

export type VisitorRequest = {
  id: string;
  visitorName: string;
  visitorCompany?: string | null;
  visitorPhone: string;
  hostEmployeeId: string;
  visitDate: string;
  purpose: string;
  visitorCount: number;
  needsMeal: boolean;
  mealCount: number;
  status: "PENDING" | "CHECKED_IN" | "CHECKED_OUT" | "REJECTED";
  checkedInAt?: string | null;
  checkedOutAt?: string | null;
};

export type CleaningZone = {
  id: string;
  name: string;
  location?: string | null;
  frequency: string;
  isActive: boolean;
};

export type CompanyEvent = {
  id: string;
  title: string;
  type: string;
  startDate: string;
  endDate?: string | null;
  location?: string | null;
  organizer: string;
  status: "PLANNING" | "PREPARING" | "READY" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
};
