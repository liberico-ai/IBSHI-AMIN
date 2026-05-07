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
  // Phần NLĐ đóng (tổng 10.5%) — chi tiết
  SOCIAL: 0.08,       // BHXH 8%
  HEALTH: 0.015,      // BHYT 1.5%
  UNEMPLOYMENT: 0.01, // BHTN 1%
  // Tổng hợp theo spec IBSHI
  EMPLOYEE_TOTAL: 0.105, // BHXH NLĐ tổng = 10.5% × Lương chính
  EMPLOYER_TOTAL: 0.215, // BHXH cty đóng = 21.5% × Lương chính
} as const;

export const MEAL_UNIT_PRICE = 35000; // VND/suất

export const SALARY_CONFIG = {
  STANDARD_WORK_DAYS: 26,
  INSURANCE_SALARY_CAP: 36000000,   // 36M VND — mức trần đóng BH
  // ── Giảm trừ gia cảnh (Nghị quyết mới 2025) ──
  PERSONAL_DEDUCTION: 15500000,     // Giảm trừ bản thân
  DEPENDENT_DEDUCTION: 6200000,     // Giảm trừ / 1 người phụ thuộc
  // ── Hệ số OT (6 loại theo spec IBSHI) ──
  OT_RATE_WEEKDAY: 1.5,             // 5.1 ngày thường
  OT_RATE_WEEKDAY_NIGHT: 2.0,       // 5.2 đêm ngày thường
  OT_RATE_SUNDAY: 2.0,              // 5.3 chủ nhật
  OT_RATE_SUNDAY_NIGHT: 2.7,        // 5.4 đêm chủ nhật
  OT_RATE_HOLIDAY: 3.0,             // 5.5 ngày lễ
  OT_RATE_HOLIDAY_NIGHT: 3.9,       // 5.6 đêm ngày lễ
  // ── Phụ cấp cố định (theo vai trò/chức vụ) ──
  HAZARD_ALLOWANCE: 1200000,
  TEAM_LEAD_ALLOWANCE: 800000,
  MANAGER_ALLOWANCE: 1500000,
  MEAL_ALLOWANCE_PER_DAY: 35000,
  // ── Ăn ca thêm giờ (theo spec) ──
  OVERTIME_MEAL_2H: 15000,          // OT >= 2h: thêm 15K
  OVERTIME_MEAL_4H: 20000,          // OT >= 4h: thêm 20K (thay thế 15K, không cộng dồn)
  // ── Phụ cấp xăng nhà trọ (3.2) ──
  FUEL_HOUSING_ALLOW: 200000,       // 200K/người/tháng cố định
  FUEL_HOUSING_KM_THRESHOLD: 20,    // ≥ 20km HOẶC ngoại tỉnh
  FUEL_HOUSING_DAYS_THRESHOLD: 14,  // VÀ ≥ 14 công
} as const;

// ──────────────────────────────────────────────────────────────────
// Bảng thuế TNCN — 5 bậc lũy tiến (Luật thuế VN, áp dụng theo tháng)
// ──────────────────────────────────────────────────────────────────
export const TAX_BRACKETS = [
  { upTo: 10_000_000,  rate: 0.05 },  // Bậc 1: ≤ 10M
  { upTo: 30_000_000,  rate: 0.10 },  // Bậc 2: 10M < x ≤ 30M
  { upTo: 60_000_000,  rate: 0.20 },  // Bậc 3: 30M < x ≤ 60M
  { upTo: 100_000_000, rate: 0.30 },  // Bậc 4: 60M < x ≤ 100M
  { upTo: Infinity,    rate: 0.35 },  // Bậc 5: > 100M
] as const;

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
