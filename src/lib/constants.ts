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

export const MEAL_UNIT_PRICE = 35000; // VND/suất (mặc định cũ, dùng fallback)
// Đơn giá suất ăn theo đối tượng
export const MEAL_PRICE_EMPLOYEE = 20000;      // Cán bộ nhân viên
export const MEAL_PRICE_SUBCONTRACTOR = 20000; // Thầu phụ
// Khách: nhập tay đơn giá khi đăng ký (guestUnitPrice trên từng phiếu)

// Chi phí suất ăn KHÁCH của 1 bản ghi đăng ký thường (MealRegistration).
// Ưu tiên guestByPrice (khách theo TỪNG đơn giá: {"20000":5,"60000":6}); nếu chưa có (bản ghi
// cũ) → fallback guestCount × guestUnitPrice.
export function guestMealCost(r: { guestCount: number; guestUnitPrice: number; guestByPrice?: unknown }): number {
  const gbp = r.guestByPrice as Record<string, number> | null | undefined;
  if (gbp && typeof gbp === "object" && Object.keys(gbp).length > 0) {
    return Object.entries(gbp).reduce((s, [price, count]) => s + Number(price) * Number(count), 0);
  }
  return (r.guestCount || 0) * (r.guestUnitPrice || MEAL_UNIT_PRICE);
}

// Chốt giờ đăng ký suất ăn (giờ VN). Thường: trước 9h. Bổ sung: trước 10h30 —
// sau mốc này (và các ngày đã qua) chỉ P. HCNS (HR_ADMIN/BOM) được thêm/sửa.
export const MEAL_CUTOFF_HOUR = 9;
export const MEAL_SUPP_CUTOFF_HOUR = 10;
export const MEAL_SUPP_CUTOFF_MINUTE = 30;

// Danh sách lái xe — người duyệt chỉ định lái xe khi duyệt phiếu đặt xe. Cập nhật khi cần.
export const VEHICLE_DRIVERS = [
  "Nguyễn Ngọc Toàn",
  "Lê Ngọc Khanh",
];

export const SALARY_CONFIG = {
  STANDARD_WORK_DAYS: 26,
  BHXH_MIN_DAYS: 14,                // ≥14 công (đi làm + phép + lễ) mới đóng/trừ BHXH
  INSURANCE_SALARY_CAP: 36000000,   // 36M VND — mức trần đóng BH
  // ── Giảm trừ gia cảnh (Nghị quyết mới 2025) ──
  PERSONAL_DEDUCTION: 15500000,     // Giảm trừ bản thân
  DEPENDENT_DEDUCTION: 6200000,     // Giảm trừ / 1 người phụ thuộc
  OT_TAX_FREE_HOURS_YEAR: 200,      // Tiền OT miễn thuế cho ≤200h OT cộng dồn/năm; phần vượt chịu thuế
  // ── Hệ số OT (6 loại theo spec IBSHI) ──
  OT_RATE_WEEKDAY: 1.5,             // 5.1 ngày thường
  OT_RATE_WEEKDAY_NIGHT: 2.0,       // 5.2 đêm ngày thường
  OT_RATE_SUNDAY: 2.0,              // 5.3 chủ nhật
  OT_RATE_SUNDAY_NIGHT: 2.7,        // 5.4 đêm chủ nhật
  OT_RATE_HOLIDAY: 3.0,             // 5.5 ngày lễ
  OT_RATE_HOLIDAY_NIGHT: 3.9,       // 5.6 đêm ngày lễ
  // ── Hệ số CA ĐÊM (HC Đ — làm đêm là chính, KHÁC OT đêm) ──
  //   Đêm ngày thường = ĐG ngày thường + 30% phụ cấp đêm = ×1.3
  //   Đêm chủ nhật = ×2.7 ; Đêm ngày lễ = ×3.9
  NIGHT_SHIFT_WEEKDAY: 1.3,
  NIGHT_SHIFT_SUNDAY: 2.7,
  NIGHT_SHIFT_HOLIDAY: 3.9,
  // ── Phụ cấp cố định (theo vai trò/chức vụ) ──
  HAZARD_ALLOWANCE: 1200000,
  TEAM_LEAD_ALLOWANCE: 800000,
  MANAGER_ALLOWANCE: 1500000,
  MEAL_ALLOWANCE_PER_DAY: 35000,
  // ── Ăn ca thêm giờ (CỘNG DỒN theo giờ) ──
  OVERTIME_MEAL_2H: 15000,          // 2 giờ đầu: 15K/giờ
  OVERTIME_MEAL_4H: 20000,          // Từ giờ thứ 3 trở đi: 20K/giờ
  // Vd: OT 5h = 2×15K + 3×20K = 90K
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
      { icon: "Banknote", label: "M7 - Lương & BHXH", href: "/luong", badge: null },
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
      { icon: "Wrench", label: "Yêu cầu cấp phát, sửa chữa thiết bị VP", href: "/hanh-chinh/sua-chua", badge: null },
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
  ADMIN: 6, // Quản trị hệ thống — cao nhất, vượt mọi quyền nghiệp vụ
};

export const ROLE_LABELS: Record<string, string> = {
  EMPLOYEE: "Nhân viên",
  TEAM_LEAD: "Tổ trưởng",
  MANAGER: "Trưởng phòng",
  HR_ADMIN: "HC Nhân sự",
  BOM: "Ban Giám đốc",
  ADMIN: "Quản trị hệ thống",
};
