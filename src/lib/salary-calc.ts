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

import { SALARY_CONFIG, TAX_BRACKETS } from "./constants";

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
  nightShift?: { weekday: number; sunday: number; holiday: number }; // GIỜ ca đêm (HC Đ) theo loại ngày — lương ×1.3/2.7/3.9
  dependentsCount: number;
  bonusAllowance?: number;   // Phụ cấp THỰC TRẢ (trách nhiệm + nhà xa nếu đủ điều kiện) — cộng vào Gross
  bonusAllowanceFull?: number; // Phụ cấp ĐẦY ĐỦ (gồm cả phụ cấp có điều kiện) — dùng TRỪ khỏi đơn giá ngày (mặc định = bonusAllowance)
  pieceRate?: number;        // Lương sản phẩm/khoán (nhập theo kỳ) — chịu thuế
  adjustment?: number;       // Điều chỉnh/bổ sung tay theo kỳ (có thể âm) — chịu thuế
  mealOT?: number;           // Tiền ăn tăng giờ (tự tính từ chấm công) — số phẳng, cộng vào Gross, CHỊU thuế
  priorOtHours?: number;     // Tổng giờ OT đã cộng dồn từ tháng 1 → hết tháng TRƯỚC kỳ này (cho cap 200h miễn thuế)
  otTaxExemptRatio?: number; // Tỉ lệ tiền OT được MIỄN thuế (tính theo THỨ TỰ NGÀY + đúng hệ số ở service). Có → dùng thẳng; không → fallback tỉ lệ giờ thô.
  importedBhxhEmployee?: number; // BHXH NLĐ (8%+1.5%+1%) HCNS tính NGOÀI rồi import — khoản TRỪ (hệ thống không tự tính)
  importedBhxhEmployer?: number; // BHXH công ty 21.5% (import — chỉ để báo cáo chi phí)
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
  nightShiftPay: number;     // lương ca đêm (HC Đ) = Σ giờ × đơn giá giờ × hệ số (1.3/2.7/3.9)
  mealOT: number;            // tiền ăn tăng giờ (tự tính từ chấm công)
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

  // PC trách nhiệm + nhà xa là SỐ PHẲNG — không chia theo công → TRỪ khỏi totalIncome trước khi chia CC.
  // Dùng phụ cấp ĐẦY ĐỦ (full) để trừ — dù phụ cấp có điều kiện không được trả thì đơn giá ngày vẫn không đổi.
  const bonusAllowanceForBase = input.bonusAllowanceFull ?? input.bonusAllowance ?? 0;
  const workIncomeBase = input.totalIncome - bonusAllowanceForBase;

  // Đơn giá SỐ THẬT (KHÔNG làm tròn — chốt 2026-06-19, khớp Excel kế toán không làm tròn).
  const dailyRateFull = workIncomeBase / CC;
  const dailyRateInsurance = input.insuranceSalary / CC;
  const hourlyRateFull = workIncomeBase / CC / 8;

  // Công + giờ OT giữ số thật (không làm tròn).
  const workDaysActual = input.workDaysActual;
  const leaveDays = input.leaveDays;
  const otInput = {
    weekday: input.ot.weekday,
    weekdayNight: input.ot.weekdayNight,
    sunday: input.ot.sunday,
    sundayNight: input.ot.sundayNight,
    holiday: input.ot.holiday,
    holidayNight: input.ot.holidayNight,
  };

  // Danh sách OT xếp hệ số GIẢM DẦN (để bù lấy hệ số cao nhất trước)
  const otTypes = [
    { rate: SALARY_CONFIG.OT_RATE_HOLIDAY_NIGHT, hours: otInput.holidayNight },
    { rate: SALARY_CONFIG.OT_RATE_HOLIDAY, hours: otInput.holiday },
    { rate: SALARY_CONFIG.OT_RATE_SUNDAY_NIGHT, hours: otInput.sundayNight },
    { rate: SALARY_CONFIG.OT_RATE_WEEKDAY_NIGHT, hours: otInput.weekdayNight },
    { rate: SALARY_CONFIG.OT_RATE_SUNDAY, hours: otInput.sunday },
    { rate: SALARY_CONFIG.OT_RATE_WEEKDAY, hours: otInput.weekday },
  ];
  const otHoursTotal = otTypes.reduce((s, o) => s + o.hours, 0);
  // Quy đổi thuần (báo cáo): mọi giờ OT × hệ số, không liên quan logic bù công
  const otConvertedHours = otTypes.reduce((s, o) => s + o.hours * o.rate, 0);

  const effectiveDays = workDaysActual + leaveDays;

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
  const mealOT = input.mealOT || 0; // tiền ăn tăng giờ (tự tính + bổ sung); có thể ÂM khi truy thu

  // Lương CA ĐÊM (HC Đ — làm đêm là chính): mỗi giờ × đơn giá giờ × hệ số (đêm thường 1.3 / CN 2.7 / lễ 3.9).
  const ns = input.nightShift || { weekday: 0, sunday: 0, holiday: 0 };
  const nightShiftPay = ns.weekday * hourlyRateFull * SALARY_CONFIG.NIGHT_SHIFT_WEEKDAY
                      + ns.sunday * hourlyRateFull * SALARY_CONFIG.NIGHT_SHIFT_SUNDAY
                      + ns.holiday * hourlyRateFull * SALARY_CONFIG.NIGHT_SHIFT_HOLIDAY;

  // Các khoản tiền GIỮ SỐ THẬT (KHÔNG làm tròn — chỉ làm tròn ở TNCN + Net).
  const salaryWorkActual = workDaysActual * dailyRateFull;  // workDaysActual = công CA NGÀY (ca đêm tính riêng ở nightShiftPay)
  const leavePay = leaveDays * dailyRateInsurance;
  const fillPay = 0; // không còn bù-công
  const salaryOT = otPayMultiplied;
  const grossSalary = salaryWorkActual + leavePay + salaryOT + nightShiftPay + bonusAllowance + pieceRate + adjustment + mealOT;

  // BHXH — KHÔNG tự tính nữa (bỏ rule ≥14 công + tự nhân hệ số).
  // Lấy thẳng từ file HCNS đã tính ngoài rồi import vào. NLĐ là khoản TRỪ; phần công ty chỉ để báo cáo.
  const bhxhEmployee = Math.max(0, Math.round(input.importedBhxhEmployee || 0));
  const bhxhEmployer = Math.max(0, Math.round(input.importedBhxhEmployer || 0));

  // TNCN — MIỄN THUẾ tiền OT theo cap 200h CỘNG DỒN cả năm (chốt 2026-06-17, theo HR):
  //   - Tổng giờ OT (cộng dồn từ T1) ≤ 200h → MIỄN TOÀN BỘ tiền OT của phần giờ trong 200h.
  //   - Phần giờ OT VƯỢT 200h → tiền OT của phần đó CHỊU thuế.
  //   - Trong tháng vượt ngưỡng: miễn theo THỨ TỰ NGÀY + ĐÚNG hệ số từng giờ (tỉ lệ tính ở service, chốt 2026-07-03).
  //     Fallback (khi không truyền ratio): tách theo tỉ lệ giờ THÔ trong/ngoài 200h.
  const priorOt = Math.max(0, input.priorOtHours || 0);
  const otExemptRatio = input.otTaxExemptRatio !== undefined
    ? input.otTaxExemptRatio
    : (otHoursTotal > 0 ? Math.max(0, Math.min(otHoursTotal, SALARY_CONFIG.OT_TAX_FREE_HOURS_YEAR - priorOt)) / otHoursTotal : 0);
  const otTaxExempt = salaryOT * otExemptRatio; // tiền OT của số giờ trong 200h → miễn (số thật)
  const taxableIncome = Math.max(0, grossSalary - otTaxExempt);
  const personalDeduction =
    SALARY_CONFIG.PERSONAL_DEDUCTION + input.dependentsCount * SALARY_CONFIG.DEPENDENT_DEDUCTION;
  // Làm tròn thu nhập tính thuế về ĐỒNG trước khi tính TNCN — triệt tiêu sai số dấu phẩy động
  //   (vd 1.179.989,9999999963 thay vì 1.179.990) khiến thuế 58.999,5 bị rơi xuống 58.999 khi Math.round.
  const taxableIncomeAfter = Math.round(Math.max(0, taxableIncome - personalDeduction - bhxhEmployee));
  const tncn = calcTNCN(taxableIncomeAfter);

  // Net = làm tròn CHUẨN về số nguyên đồng (≥0.5 lên, <0.5 xuống).
  const netSalary = Math.round(grossSalary - bhxhEmployee - tncn);
  const companyTotalCost = grossSalary + bhxhEmployer;

  return {
    standardDays: CC,
    workDaysActual,    // đã round 2 chữ số
    leaveDays,         // đã round 2 chữ số
    effectiveDays,
    otHoursTotal,
    otConvertedHours,
    otFillHours,
    otPaidHours,
    salaryWorkActual,
    leavePay,
    fillPay,
    salaryOT,
    nightShiftPay,
    mealOT,
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
