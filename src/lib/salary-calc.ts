// IBS ONE — Salary Calculator (theo spec IBSHI Lương khoán)
// Tham chiếu: bảng tính Excel của HR — mục 4 → 20

import { SALARY_CONFIG, TAX_BRACKETS, INSURANCE_RATES } from "./constants";

// ============================================================================
// INPUT — dữ liệu cần để tính lương 1 NV trong 1 tháng
// ============================================================================
export interface SalaryInput {
  // ── A. Thông tin HĐ ──
  baseSalary: number;              // 2.1 Lương chính (đóng BH)
  // 2.2 Phụ cấp (theo HĐ)
  phoneAllowance: number;
  fuelAllowance: number;
  housingAllowance: number;
  kpiAllowance: number;
  // 3. Bổ sung
  responsibilityAllowance: number; // 3.1
  // Cho 3.2 — Phụ cấp xăng nhà trọ
  distanceToOfficeKm: number;      // Số km từ nhà
  isOutOfProvince: boolean;        // Ngoại tỉnh
  // Người phụ thuộc (cho TNCN)
  dependentsCount: number;

  // ── B1. Số công ──
  workDaysHC: number;              // 4 — Công hành chính (= 4.1 + 4.2)
  otHoursWeekday: number;          // 5.1
  otHoursWeekdayNight: number;     // 5.2
  otHoursSunday: number;           // 5.3
  otHoursSundayNight: number;      // 5.4
  otHoursHoliday: number;          // 5.5
  otHoursHolidayNight: number;     // 5.6
  workDaysPolicy: number;          // 6 — Phép/Lễ/Tai nạn LĐ
  workDaysUnpaid: number;          // 7.1 — Nghỉ không lương
  workDaysLate: number;            // 7.2 — Đi muộn/về sớm (quy ra ngày)

  // ── Lương khoán (10) — tính bên ngoài, truyền vào ──
  pieceRateSalary: number;         // Mục 10 — từ bảng riêng theo tổ × dự án

  // ── Cấu hình bữa ăn ──
  companyServesMealOnSunday?: boolean; // Nếu TRUE và CN có làm OT → KHÔNG tính ăn ca thêm
}

// ============================================================================
// OUTPUT — kết quả tính lương đầy đủ (mục 4 → 20 theo spec)
// ============================================================================
export interface SalaryOutput {
  // ── B1. Số công quy đổi ──
  otConvertedDays: number;         // 5 — Công OT quy đổi sang ngày

  // ── B2. Tổng thu nhập ──
  salaryHC: number;                // 8 — Lương HC
  salaryOT: number;                // 9 — Lương OT
  pieceRateSalary: number;         // 10 — Lương khoán
  policyAllowance: number;         // 11 — PC chế độ (phép/lễ)
  overtimeMealAllow: number;       // 12 — Ăn ca thêm giờ
  fuelHousingAllow: number;        // 3.2 — Phụ cấp xăng nhà trọ
  lateDeduction: number;           // ((2)/26 × 7.2) — Trừ đi muộn
  grossSalary: number;             // B2 — Tổng thu nhập

  // ── B3. BHXH ──
  bhxhEmployer: number;            // 13 — BHXH công ty đóng (21.5% × 2.1)
  bhxhEmployee: number;            // 14 — BHXH NLĐ đóng (10.5% × 2.1)

  // ── B4. TNCN ──
  personalDeduction: number;       // 15 — Giảm trừ gia cảnh
  taxableIncome: number;           // 16 — Thu nhập chịu thuế
  taxableIncomeAfter: number;      // 17 — Thu nhập tính thuế
  tncn: number;                    // 18 — Thuế TNCN

  // ── B5. Tổng kết ──
  netSalary: number;               // 19 — Thực lĩnh
  companyTotalCost: number;        // 20 — Chi phí công ty

  // ── Internal — debug/audit ──
  totalAllowance: number;          // 2.2 = phone + fuel + housing + kpi
  totalSalaryAgreed: number;       // 2 = 2.1 + 2.2
  dailyRateFull: number;           // (2)/26
  dailyRateBaseOnly: number;       // (2.1)/26
}

// ============================================================================
// HELPER — Tính thuế TNCN lũy tiến 5 bậc theo bảng VN chuẩn
// ============================================================================
export function calcTNCN(taxableMonthly: number): number {
  if (taxableMonthly <= 0) return 0;

  let tax = 0;
  let remaining = taxableMonthly;
  let prevLimit = 0;

  for (const bracket of TAX_BRACKETS) {
    if (remaining <= 0) break;
    const slice = Math.min(remaining, bracket.upTo - prevLimit);
    tax += slice * bracket.rate;
    remaining -= slice;
    prevLimit = bracket.upTo;
  }

  return Math.round(tax);
}

// ============================================================================
// HELPER — Phụ cấp ăn ca thêm giờ (CỘNG DỒN theo giờ)
// Spec IBSHI:
//   - 2 giờ đầu: 15.000đ/giờ
//   - Từ giờ thứ 3 trở đi: 20.000đ/giờ
//   Vd: OT 5h = 2×15K + 3×20K = 30K + 60K = 90K
//       OT 2h = 2×15K + 0      = 30K
//       OT 4h = 2×15K + 2×20K  = 70K
// Loại trừ: nếu cty nấu ăn vào CN → bỏ phần OT-CN khỏi tính ăn ca
// ============================================================================
export function calcOvertimeMealAllow(
  otHoursWeekday: number,
  otHoursSunday: number,
  otHoursHoliday: number,
  companyServesMealOnSunday: boolean,
): number {
  let totalOtForMeal = otHoursWeekday + otHoursHoliday;
  if (!companyServesMealOnSunday) {
    totalOtForMeal += otHoursSunday;
  }

  if (totalOtForMeal <= 0) return 0;

  const firstTier = Math.min(totalOtForMeal, 2);                         // 2 giờ đầu
  const secondTier = Math.max(0, totalOtForMeal - 2);                    // từ giờ 3 trở đi
  return Math.round(firstTier * SALARY_CONFIG.OVERTIME_MEAL_2H + secondTier * SALARY_CONFIG.OVERTIME_MEAL_4H);
}

// ============================================================================
// HELPER — Phụ cấp xăng nhà trọ (3.2)
// 200K cố định / NV / tháng nếu (≥20km HOẶC ngoại tỉnh) VÀ ≥14 ngày công
// ============================================================================
export function calcFuelHousingAllow(input: {
  distanceToOfficeKm: number;
  isOutOfProvince: boolean;
  workDaysHC: number;
}): number {
  const farEnough =
    input.distanceToOfficeKm >= SALARY_CONFIG.FUEL_HOUSING_KM_THRESHOLD ||
    input.isOutOfProvince;
  const enoughDays =
    input.workDaysHC >= SALARY_CONFIG.FUEL_HOUSING_DAYS_THRESHOLD;

  return farEnough && enoughDays ? SALARY_CONFIG.FUEL_HOUSING_ALLOW : 0;
}

// ============================================================================
// HELPER — Quy đổi giờ OT thành ngày công OT (mục 5)
// Công thức spec: (5.1×1.5 + 5.2×2 + 5.3×2 + 5.4×2.7 + 5.5×3 + 5.6×3.9) / 8
// ============================================================================
export function convertOtHoursToDays(input: {
  otHoursWeekday: number;
  otHoursWeekdayNight: number;
  otHoursSunday: number;
  otHoursSundayNight: number;
  otHoursHoliday: number;
  otHoursHolidayNight: number;
}): number {
  const total =
    input.otHoursWeekday * SALARY_CONFIG.OT_RATE_WEEKDAY +
    input.otHoursWeekdayNight * SALARY_CONFIG.OT_RATE_WEEKDAY_NIGHT +
    input.otHoursSunday * SALARY_CONFIG.OT_RATE_SUNDAY +
    input.otHoursSundayNight * SALARY_CONFIG.OT_RATE_SUNDAY_NIGHT +
    input.otHoursHoliday * SALARY_CONFIG.OT_RATE_HOLIDAY +
    input.otHoursHolidayNight * SALARY_CONFIG.OT_RATE_HOLIDAY_NIGHT;

  return total / 8;
}

// ============================================================================
// MAIN — Tính lương 1 NV / 1 tháng
// ============================================================================
export function calculateSalary(input: SalaryInput): SalaryOutput {
  // ── 2. Lương thoả thuận ──
  const totalAllowance =
    input.phoneAllowance +
    input.fuelAllowance +
    input.housingAllowance +
    input.kpiAllowance; // 2.2 không gồm phụ cấp trách nhiệm/xăng nhà trọ

  const totalSalaryAgreed = input.baseSalary + totalAllowance; // 2 = 2.1 + 2.2
  const dailyRateFull = totalSalaryAgreed / SALARY_CONFIG.STANDARD_WORK_DAYS;       // (2)/26
  const dailyRateBaseOnly = input.baseSalary / SALARY_CONFIG.STANDARD_WORK_DAYS;     // (2.1)/26

  // ── 5. Công OT quy đổi ──
  const otConvertedDays = convertOtHoursToDays(input);

  // ── 8. Lương HC = (2)/26 × 4 ──
  const salaryHC = Math.round(dailyRateFull * input.workDaysHC);

  // ── 9. Lương OT = (2)/26 × (5 − 7.1)
  // Bù trừ ngày nghỉ không lương (UL) vào giờ OT trước khi tính
  const otAfterUnpaid = Math.max(0, otConvertedDays - input.workDaysUnpaid);
  const salaryOT = Math.round(dailyRateFull * otAfterUnpaid);

  // ── 10. Lương khoán (truyền vào) ──
  const pieceRateSalary = input.pieceRateSalary;

  // ── 11. PC chế độ = (2.1)/26 × 6 (chỉ trên Lương chính) ──
  const policyAllowance = Math.round(dailyRateBaseOnly * input.workDaysPolicy);

  // ── 12. Ăn ca thêm giờ ──
  const overtimeMealAllow = calcOvertimeMealAllow(
    input.otHoursWeekday + input.otHoursWeekdayNight,
    input.otHoursSunday + input.otHoursSundayNight,
    input.otHoursHoliday + input.otHoursHolidayNight,
    input.companyServesMealOnSunday ?? false,
  );

  // ── 3.2 Phụ cấp xăng nhà trọ ──
  const fuelHousingAllow = calcFuelHousingAllow(input);

  // ── Trừ đi muộn = (2)/26 × 7.2 ──
  const lateDeduction = Math.round(dailyRateFull * input.workDaysLate);

  // ── B2. Tổng thu nhập = 8+9+10+11+12 - đi muộn (cộng cả phụ cấp xăng nhà trọ + trách nhiệm) ──
  const grossSalary =
    salaryHC +
    salaryOT +
    pieceRateSalary +
    policyAllowance +
    overtimeMealAllow +
    fuelHousingAllow +
    input.responsibilityAllowance -
    lateDeduction;

  // ── B3. BHXH (chỉ tính trên Lương chính 2.1) ──
  const bhxhBase = Math.min(input.baseSalary, SALARY_CONFIG.INSURANCE_SALARY_CAP);
  const bhxhEmployer = Math.round(bhxhBase * INSURANCE_RATES.EMPLOYER_TOTAL);
  const bhxhEmployee = Math.round(bhxhBase * INSURANCE_RATES.EMPLOYEE_TOTAL);

  // ── B4. TNCN ──
  // 16. Thu nhập chịu thuế = B2 - 9 (đơn giản hoá theo spec — trừ toàn bộ Lương OT)
  const taxableIncome = Math.max(0, grossSalary - salaryOT);

  // 15. Giảm trừ gia cảnh
  const personalDeduction =
    SALARY_CONFIG.PERSONAL_DEDUCTION +
    input.dependentsCount * SALARY_CONFIG.DEPENDENT_DEDUCTION;

  // 17. Thu nhập tính thuế = 16 − 15 − 14 (giảm trừ + BHXH NLĐ)
  const taxableIncomeAfter = Math.max(0, taxableIncome - personalDeduction - bhxhEmployee);

  // 18. Thuế TNCN — bậc thang lũy tiến 5 bậc
  const tncn = calcTNCN(taxableIncomeAfter);

  // ── B5. Tổng kết ──
  // 19. Thực lĩnh = B2 − 14 − 18 (đã sửa typo theo confirm của user)
  const netSalary = grossSalary - bhxhEmployee - tncn;

  // 20. Chi phí công ty = B2 + 13 (đã sửa typo)
  const companyTotalCost = grossSalary + bhxhEmployer;

  return {
    otConvertedDays,
    salaryHC,
    salaryOT,
    pieceRateSalary,
    policyAllowance,
    overtimeMealAllow,
    fuelHousingAllow,
    lateDeduction,
    grossSalary,
    bhxhEmployer,
    bhxhEmployee,
    personalDeduction,
    taxableIncome,
    taxableIncomeAfter,
    tncn,
    netSalary,
    companyTotalCost,
    totalAllowance,
    totalSalaryAgreed,
    dailyRateFull,
    dailyRateBaseOnly,
  };
}
