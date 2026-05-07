// IBS ONE — Constants
// Departments, Production Teams, Leave Quotas, Insurance Rates

export const DEPARTMENTS = [
  { code: "BOM", name: "Ban Giám đốc", nameEn: "Board of Management", headcount: 5, sortOrder: 0 },
  { code: "SX", name: "P. Sản xuất", nameEn: "Production Dept.", headcount: 80, sortOrder: 1 },
  { code: "QLDA", name: "P. QLDA", nameEn: "Project Management Dept.", headcount: 12, sortOrder: 2 },
  { code: "KT", name: "P. Kỹ thuật", nameEn: "Engineering Dept.", headcount: 15, sortOrder: 3 },
  { code: "QAQC", name: "P. QAQC", nameEn: "QAQC Dept.", headcount: 8, sortOrder: 4 },
  { code: "HCNS", name: "P. HCNS", nameEn: "HR & Admin Dept.", headcount: 5, sortOrder: 5 },
  { code: "KETOAN", name: "P. Kế toán", nameEn: "Accounting Dept.", headcount: 6, sortOrder: 6 },
  { code: "KD", name: "P. Kinh doanh", nameEn: "Sales Dept.", headcount: 10, sortOrder: 7 },
  { code: "TM", name: "P. Thương mại", nameEn: "Commercial Dept.", headcount: 8, sortOrder: 8 },
  { code: "TB", name: "P. Thiết bị", nameEn: "Equipment Dept.", headcount: 6, sortOrder: 9 },
] as const;

export const PRODUCTION_TEAMS = [
  { name: "Gá lắp 1", type: "GA_LAP" as const, memberCount: 7 },
  { name: "Gá lắp 2", type: "GA_LAP" as const, memberCount: 7 },
  { name: "Gá lắp 3", type: "GA_LAP" as const, memberCount: 7 },
  { name: "Gá lắp 4", type: "GA_LAP" as const, memberCount: 7 },
  { name: "Gá lắp 5", type: "GA_LAP" as const, memberCount: 7 },
  { name: "Hàn 1", type: "HAN" as const, memberCount: 9 },
  { name: "Hàn 2", type: "HAN" as const, memberCount: 9 },
  { name: "Pha cắt 2", type: "PHA_CAT" as const, memberCount: 6 },
  { name: "Pha cắt 3", type: "PHA_CAT" as const, memberCount: 6 },
  { name: "GCCK", type: "GCCK" as const, memberCount: 6 },
  { name: "Sơn", type: "SON" as const, memberCount: 5 },
  { name: "Tổng hợp", type: "TONG_HOP" as const, memberCount: 4 },
] as const;

export const DIRECTORATES = [
  { name: "Commercial Director", nameVi: "Giám đốc Thương mại", departments: ["KD", "TM", "KETOAN"] },
  { name: "COO", nameVi: "Giám đốc Vận hành", departments: ["QAQC", "QLDA", "HCNS"] },
  { name: "Production Director", nameVi: "Giám đốc Sản xuất", departments: ["SX", "KT", "TB"] },
] as const;

export const LEAVE_QUOTA = {
  ANNUAL: 12,
  WEDDING: 3,
  FUNERAL: 3,
  PATERNITY: 5,
  SENIORITY_BONUS: 1, // +1 ngày/5 năm thâm niên
} as const;

export const INSURANCE_RATES = {
  SOCIAL: 0.08,       // BHXH 8%
  HEALTH: 0.015,      // BHYT 1.5%
  UNEMPLOYMENT: 0.01, // BHTN 1%
} as const;

export const MEAL_UNIT_PRICE = 35000; // VND/suất

export const SALARY_CONFIG = {
  STANDARD_WORK_DAYS: 26,
  INSURANCE_SALARY_CAP: 36000000,   // 36M VND
  PERSONAL_DEDUCTION: 11000000,     // 11M VND
  DEPENDENT_DEDUCTION: 4400000,     // 4.4M VND
  OT_RATE_NORMAL: 1.5,
  OT_RATE_WEEKEND: 2.0,
  OT_RATE_HOLIDAY: 3.0,
  HAZARD_ALLOWANCE: 1200000,       // 1.2M/tháng
  TEAM_LEAD_ALLOWANCE: 800000,     // 800K/tháng
  MANAGER_ALLOWANCE: 1500000,      // 1.5M/tháng
  MEAL_ALLOWANCE_PER_DAY: 35000,   // 35K/ngày (đồng bộ với MEAL_UNIT_PRICE)
} as const;

// Navigation items for sidebar
export const NAV_ITEMS = [
  {
    section: "Tổng quan",
    items: [
      { icon: "LayoutDashboard", label: "Dashboard", href: "/", badge: null },
    ],
  },
  {
    section: "Nhân sự (HR)",
    items: [
      { icon: "User", label: "M1 - Hồ sơ nhân sự", href: "/ho-so", badge: null },
      { icon: "Building2", label: "M2 - Sơ đồ tổ chức", href: "/so-do", badge: null },
      { icon: "CalendarDays", label: "M3 - Chấm công", href: "/cham-cong", badge: 2 },
      { icon: "Users", label: "M4 - Tuyển dụng", href: "/tuyen-dung", badge: 3, badgeType: "warn" as const },
      { icon: "GraduationCap", label: "M5 - Đào tạo", href: "/dao-tao", badge: null },
      { icon: "Trophy", label: "M6 - Đánh giá & KPI", href: "/kpi", badge: null },
      { icon: "Banknote", label: "M7 - Lương & Phúc lợi", href: "/luong", badge: null },
    ],
  },
  {
    section: "Quản trị",
    items: [
      { icon: "FileText", label: "M8 - Kỷ luật & Quy định", href: "/ky-luat", badge: null },
      { icon: "AlertTriangle", label: "M9 - HSE An toàn", href: "/hse", badge: 1 },
      { icon: "Briefcase", label: "M10 - Hành chính", href: "/hanh-chinh", badge: null },
    ],
    subItems: [
      { icon: "DoorOpen", label: "Đặt phòng họp", href: "/hanh-chinh/phong-hop", badge: null },
      { icon: "Car", label: "Quản lý xe", href: "/hanh-chinh/xe", badge: null },
      { icon: "Wrench", label: "Yêu cầu sửa chữa", href: "/hanh-chinh/sua-chua", badge: null },
      { icon: "Package", label: "Văn phòng phẩm", href: "/hanh-chinh/vpp", badge: null },
      { icon: "UtensilsCrossed", label: "Nhà ăn", href: "/hanh-chinh/nha-an", badge: null },
      { icon: "Sparkles", label: "Vệ sinh", href: "/hanh-chinh/ve-sinh", badge: null },
      { icon: "UserPlus", label: "Đăng ký khách", href: "/hanh-chinh/khach", badge: 2, badgeType: "warn" as const },
      { icon: "Calendar", label: "Sự kiện & Audit", href: "/hanh-chinh/su-kien", badge: 1 },
      { icon: "Inbox", label: "Công văn đến", href: "/hanh-chinh/cong-van-den", badge: null },
      { icon: "Send", label: "Công văn đi", href: "/hanh-chinh/cong-van-di", badge: null },
    ],
  },
  {
    section: "Hệ thống",
    items: [
      { icon: "BarChart3", label: "Báo cáo", href: "/bao-cao", badge: null },
      { icon: "Settings", label: "Cài đặt", href: "/cai-dat", badge: null },
    ],
  },
] as const;

// Role hierarchy for RBAC
export const ROLE_HIERARCHY: Record<string, number> = {
  EMPLOYEE: 1,
  TEAM_LEAD: 2,
  MANAGER: 3,
  HR_ADMIN: 4,
  BOM: 5,
};

export const ROLE_LABELS: Record<string, string> = {
  EMPLOYEE: "Nhân viên",
  TEAM_LEAD: "Tổ trưởng",
  MANAGER: "Trưởng phòng",
  HR_ADMIN: "HC Nhân sự",
  BOM: "Ban Giám đốc",
};
