// IBS ONE — Salary Calculator M7 (mô hình mới, chốt 2026-05-26)
// Gốc: Hợp đồng (Tổng thu nhập / Lương đóng BHXH / Phụ cấp) + bảng công M3.
// Spec chi tiết: memory/project_m7_salary_formula.md
//
// Quy tắc:
//  - CC (công chuẩn) = số ngày trong tháng − số Chủ Nhật.
//  - Ngày đi làm thực: đơn giá = Tổng thu nhập / CC.
//  - Ngày phép + lễ: đơn giá = Lương đóng BHXH / CC (thấp hơn).
//  - Bù công: nếu (đi làm + phép + lễ) < CC → dùng giờ OT bù cho đủ CC (tính 1×),
//    ƯU TIÊN trừ giờ hệ số CAO NHẤT trước. Phần OT dôi mới × hệ số.
//  - Đơn giá OT = Tổng thu nhập / CC / 8.
//  - BHXH 10,5% × Lương đóng BHXH — CHỈ khi (đi làm + phép + lễ) ≥ 14 công.
//  - TNCN: 5 bậc + giảm trừ; phần OT (đã nhân hệ số) được miễn thuế.

import { SALARY_CONFIG, TAX_BRACKETS, INSURANCE_RATES } from "./constants";

// 6 loại OT + hệ số (xếp giảm dần để áp quy tắc "bù lấy hệ số cao nhất trước")
export interface OTHours {
  weekday: number;       // ngày thường ×1.5
  weekdayNight: number;  // đêm ngày thường ×2 (chờ máy chấm công)
  sunday: number;        // chủ nhật ×2
  sundayNight: number;   // đêm chủ nhật ×2.7 (chờ máy chấm công)
  holiday: number;       // ngày lễ ×3
  holidayNight: number;  // đêm ngày lễ ×3.9 (chờ máy chấm công)
}

export interface SalaryInput {
  totalIncome: number;       // Tổng thu nhập đủ tháng = Lương BHXH + Phụ cấp
  insuranceSalary: number;   // Lương đóng BHXH (= lương chính)
  standardDays: number;      // CC = ngày trong tháng − số CN
  workDaysActual: number;    // số ngày đi làm thực (present + nửa ngày)
  leaveDays: number;         // phép + lễ (hưởng theo Lương BHXH/CC)
  ot: OTHours;
  dependentsCount: number;
}

export interface SalaryOutput {
  standardDays: number;
  workDaysActual: number;
  leaveDays: number;
  effectiveDays: number;     // đi làm + phép + lễ (mốc xét 14 công + bù)
  otHoursTotal: number;
  otFillHours: number;       // giờ OT dùng để bù cho đủ CC (1×)
  otPaidHours: number;       // giờ OT được nhân hệ số (dôi ra)
  // Các khoản tiền
  salaryWorkActual: number;  // lương ngày đi làm thực
  leavePay: number;          // lương phép + lễ
  fillPay: number;           // lương giờ OT bù (1×)
  salaryOT: number;          // lương OT đã nhân hệ số
  grossSalary: number;       // tổng thu nhập thực tế tháng
  // Khấu trừ
  bhxhEmployee: number;      // 10,5% × Lương BHXH (nếu ≥14 công)
  bhxhEmployer: number;      // phần công ty đóng (audit)
  personalDeduction: number;
  taxableIncome: number;
  taxableIncomeAfter: number;
  tncn: number;
  netSalary: number;         // thực lĩnh
  companyTotalCost: number;
  // Audit
  dailyRateFull: number;     // Tổng TN / CC
  dailyRateInsurance: number;// Lương BHXH / CC
  hourlyRateFull: number;    // Tổng TN / CC / 8
}

// TNCN lũy tiến 5 bậc
export function calcTNCN(taxableMonthly: number): number {
  if (taxableMonthly <= 0) return 0;
  let tax = 0, remaining = taxableMonthly, prev = 0;
  for (const b of TAX_BRACKETS) {
    if (remaining <= 0) break;
    const slice = Math.min(remaining, b.upTo - prev);
    tax += slice * b.rate;
    remaining -= slice;
    prev = b.upTo;
  }
  return Math.round(tax);
}

export function calculateSalary(input: SalaryInput): SalaryOutput {
  const CC = input.standardDays > 0 ? input.standardDays : SALARY_CONFIG.STANDARD_WORK_DAYS;
  const dailyRateFull = input.totalIncome / CC;
  const dailyRateInsurance = input.insuranceSalary / CC;
  const hourlyRateFull = input.totalIncome / CC / 8;

  // Danh sách OT xếp hệ số GIẢM DẦN (để bù lấy hệ số cao nhất trước)
  const otTypes = [
    { rate: SALARY_CONFIG.OT_RATE_HOLIDAY_NIGHT, hours: input.ot.holidayNight },
    { rate: SALARY_CONFIG.OT_RATE_HOLIDAY, hours: input.ot.holiday },
    { rate: SALARY_CONFIG.OT_RATE_SUNDAY_NIGHT, hours: input.ot.sundayNight },
    { rate: SALARY_CONFIG.OT_RATE_WEEKDAY_NIGHT, hours: input.ot.weekdayNight },
    { rate: SALARY_CONFIG.OT_RATE_SUNDAY, hours: input.ot.sunday },
    { rate: SALARY_CONFIG.OT_RATE_WEEKDAY, hours: input.ot.weekday },
  ];
  const otHoursTotal = otTypes.reduce((s, o) => s + o.hours, 0);

  const effectiveDays = input.workDaysActual + input.leaveDays;
  const shortfallHours = Math.max(0, (CC - effectiveDays) * 8);

  // Bù: trừ shortfall từ giờ hệ số cao nhất trước; phần dôi mỗi loại × hệ số
  let fillRemaining = Math.min(shortfallHours, otHoursTotal);
  const otFillHours = fillRemaining;
  let otPayMultiplied = 0;
  for (const o of otTypes) {
    let h = o.hours;
    if (fillRemaining > 0) {
      const used = Math.min(h, fillRemaining);
      fillRemaining -= used;
      h -= used;
    }
    otPayMultiplied += h * hourlyRateFull * o.rate;
  }
  const otPaidHours = otHoursTotal - otFillHours;

  // Các khoản tiền (làm tròn từng khoản về đồng)
  const salaryWorkActual = Math.round(input.workDaysActual * dailyRateFull);
  const leavePay = Math.round(input.leaveDays * dailyRateInsurance);
  const fillPay = Math.round(otFillHours * hourlyRateFull); // 1×
  const salaryOT = Math.round(otPayMultiplied);
  const grossSalary = salaryWorkActual + leavePay + fillPay + salaryOT;

  // BHXH — chỉ trừ khi đủ ≥14 công (gồm phép + lễ)
  const bhxhBase = Math.min(input.insuranceSalary, SALARY_CONFIG.INSURANCE_SALARY_CAP);
  const eligibleBHXH = effectiveDays >= SALARY_CONFIG.BHXH_MIN_DAYS; // ≥14 công
  const bhxhEmployee = eligibleBHXH ? Math.round(bhxhBase * INSURANCE_RATES.EMPLOYEE_TOTAL) : 0;
  const bhxhEmployer = eligibleBHXH ? Math.round(bhxhBase * INSURANCE_RATES.EMPLOYER_TOTAL) : 0;

  // TNCN — miễn phần OT (đã nhân hệ số)
  const taxableIncome = Math.max(0, grossSalary - salaryOT);
  const personalDeduction =
    SALARY_CONFIG.PERSONAL_DEDUCTION + input.dependentsCount * SALARY_CONFIG.DEPENDENT_DEDUCTION;
  const taxableIncomeAfter = Math.max(0, taxableIncome - personalDeduction - bhxhEmployee);
  const tncn = calcTNCN(taxableIncomeAfter);

  const netSalary = grossSalary - bhxhEmployee - tncn;
  const companyTotalCost = grossSalary + bhxhEmployer;

  return {
    standardDays: CC,
    workDaysActual: input.workDaysActual,
    leaveDays: input.leaveDays,
    effectiveDays,
    otHoursTotal,
    otFillHours,
    otPaidHours,
    salaryWorkActual,
    leavePay,
    fillPay,
    salaryOT,
    grossSalary,
    bhxhEmployee,
    bhxhEmployer,
    personalDeduction,
    taxableIncome,
    taxableIncomeAfter,
    tncn,
    netSalary,
    companyTotalCost,
    dailyRateFull,
    dailyRateInsurance,
    hourlyRateFull,
  };
}
