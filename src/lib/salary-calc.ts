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
  standardDays: number;      // CC = ngày trong tháng − số CN − số Lễ ngày thường
  workDaysActual: number;    // số ngày đi làm thực (present + nửa ngày)
  leaveDays: number;         // phép + lễ (hưởng theo Lương BHXH/CC)
  unpaidWeekdayDays?: number;// số ngày NK rơi ngày thường (T2-T7 không lễ) — mục tiêu bù công
  ot: OTHours;
  dependentsCount: number;
  bonusAllowance?: number;   // Bổ sung lương (trách nhiệm + nhà xa) — số phẳng, cộng vào Gross/Net
  pieceRate?: number;        // Lương sản phẩm/khoán (nhập theo kỳ) — chịu thuế
  adjustment?: number;       // Điều chỉnh/bổ sung tay theo kỳ (có thể âm) — chịu thuế
}

export interface SalaryOutput {
  standardDays: number;
  workDaysActual: number;
  leaveDays: number;
  effectiveDays: number;     // đi làm + phép + lễ (mốc xét 14 công + bù)
  otHoursTotal: number;
  otConvertedHours: number;  // Σ giờ OT × hệ số (quy đổi thuần, để báo cáo)
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
  otTaxExempt: number;       // phần OT miễn thuế (chênh vượt trên mức lương thường)
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

  // bonusAllowance (PC trách nhiệm + PC nhà xa) là SỐ PHẲNG — không chia theo công.
  // → Đơn giá ngày làm + giờ OT phải trừ phần này ra khỏi totalIncome trước khi chia CC.
  const bonusAllowanceForBase = input.bonusAllowance || 0;
  const workIncomeBase = input.totalIncome - bonusAllowanceForBase;

  const dailyRateFull = workIncomeBase / CC;
  const dailyRateInsurance = input.insuranceSalary / CC;
  const hourlyRateFull = workIncomeBase / CC / 8;

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
  // Quy đổi thuần (báo cáo): mọi giờ OT × hệ số, không liên quan logic bù công
  const otConvertedHours = otTypes.reduce((s, o) => s + o.hours * o.rate, 0);

  const effectiveDays = input.workDaysActual + input.leaveDays;

  // BÙ CÔNG (chốt 2026-06-04 — khớp bảng kế toán mới):
  //   Mục tiêu = số ngày NK rơi ngày thường (unpaidWeekdayDays).
  //   Lấy giờ OT từ hệ số CAO NHẤT trước → kéo xuống 1× → bù NK.
  //   Phần OT dôi còn lại mới được nhân hệ số.
  const fillTarget = Math.max(0, input.unpaidWeekdayDays || 0) * 8; // ngày × 8h
  let remainingFill = Math.min(fillTarget, otHoursTotal);
  const otFillHours = remainingFill;

  let otPayMultiplied = 0;
  let otPaidHours = 0;
  // Duyệt theo thứ tự hệ số GIẢM DẦN: lễ đêm → lễ → CN đêm → đêm thường → CN → thường.
  // Mỗi loại: lấy đến hết remainingFill (tính 1×), phần còn lại tính hệ số.
  for (const o of otTypes) {
    if (o.hours <= 0) continue;
    const fillFromThis = Math.min(o.hours, remainingFill);
    const paidFromThis = o.hours - fillFromThis;
    otPayMultiplied += fillFromThis * hourlyRateFull * 1
                     + paidFromThis * hourlyRateFull * o.rate;
    otPaidHours += paidFromThis;
    remainingFill -= fillFromThis;
  }

  // Các khoản nhập tay theo kỳ + bổ sung — số phẳng, cộng vào thu nhập (chịu thuế)
  const bonusAllowance = input.bonusAllowance || 0;   // trách nhiệm + nhà xa
  const pieceRate = input.pieceRate || 0;             // lương sản phẩm/khoán
  const adjustment = input.adjustment || 0;           // điều chỉnh tay (có thể âm)

  // Các khoản tiền (làm tròn từng khoản về đồng)
  const salaryWorkActual = Math.round(input.workDaysActual * dailyRateFull);
  const leavePay = Math.round(input.leaveDays * dailyRateInsurance);
  const fillPay = 0; // không còn bù-công
  const salaryOT = Math.round(otPayMultiplied);
  const grossSalary = salaryWorkActual + leavePay + salaryOT + bonusAllowance + pieceRate + adjustment;

  // BHXH — chỉ trừ khi đủ ≥14 công (gồm phép + lễ)
  const bhxhBase = Math.min(input.insuranceSalary, SALARY_CONFIG.INSURANCE_SALARY_CAP);
  const eligibleBHXH = effectiveDays >= SALARY_CONFIG.BHXH_MIN_DAYS; // ≥14 công
  const bhxhEmployee = eligibleBHXH ? Math.round(bhxhBase * INSURANCE_RATES.EMPLOYEE_TOTAL) : 0;
  const bhxhEmployer = eligibleBHXH ? Math.round(bhxhBase * INSURANCE_RATES.EMPLOYER_TOTAL) : 0;

  // TNCN — chỉ miễn PHẦN VƯỢT của OT (theo luật): chênh trên mức lương giờ thường.
  // Mỗi giờ OT hưởng hệ số: phần 1× (= giờ × đơn giá giờ) vẫn chịu thuế, chỉ phần (hệ số − 1) được miễn.
  // Giờ OT dùng để bù (1×) không có phần vượt → không miễn.
  const otPaidBase = Math.round(otPaidHours * hourlyRateFull); // phần 1× của giờ OT đã nhân hệ số (chịu thuế)
  const otTaxExempt = Math.max(0, salaryOT - otPaidBase);      // phần vượt → miễn thuế
  const taxableIncome = Math.max(0, grossSalary - otTaxExempt);
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
    otConvertedHours,
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
    otTaxExempt,
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
