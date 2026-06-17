import prisma from "@/lib/prisma";
import { calculateSalary, type SalaryInput } from "@/lib/salary-calc";
import { SALARY_CONFIG, INSURANCE_RATES } from "@/lib/constants";
import { standardWorkDays, isHoliday, isCompensatoryHoliday, paidHolidaysInMonth } from "@/lib/holidays";

// ─── TNCN re-export (backwards compat — vẫn dùng được nơi khác) ─────────────

export { calcTNCN } from "@/lib/salary-calc";

// ─── Core calculation ──────────────────────────────────────────────────────
// Pipeline:
//   M3 (AttendanceRecord + LeaveRequest + OTRequest) ──┐
//   M1 (Contract.baseSalary)                            ├─► calculateSalary()
//   PieceRateRecord (lương khoán theo tổ × DA)         ─┘     (lib/salary-calc.ts)
//                                                              ↓
//                                                       PayrollRecord rows

export async function calculatePayrollForPeriod(periodId: string) {
  const period = await prisma.payrollPeriod.findUnique({ where: { id: periodId } });
  if (!period) throw Object.assign(new Error("Payroll period not found"), { code: "PERIOD_NOT_FOUND" });
  if (period.status === "APPROVED") throw Object.assign(new Error("Period already approved"), { code: "PERIOD_ALREADY_APPROVED" });

  const startDate = new Date(period.year, period.month - 1, 1);
  const endDate = new Date(period.year, period.month, 0, 23, 59, 59);

  // M3: Bảng chấm công đã import (vân tay khối gián tiếp + khuôn mặt khối trực tiếp)
  const attendanceData = await prisma.attendanceRecord.findMany({
    where: { date: { gte: startDate, lte: endDate } },
    select: { employeeId: true, status: true, workHours: true, otHours: true, date: true, paidLeaveDays: true, leaveCode: true },
  });

  // CHỈ tính lương cho NV CÓ DỮ LIỆU CHẤM CÔNG trong tháng
  // (theo spec: "hiển thị bảng lương của tất cả NV có chấm công đã import vào M3")
  const employeeIdsWithAttendance = Array.from(
    new Set(attendanceData.map((a) => a.employeeId))
  );

  if (employeeIdsWithAttendance.length === 0) {
    throw Object.assign(
      new Error(
        "Chưa có dữ liệu chấm công cho tháng này. Vui lòng import bảng công ở module M3 - Chấm công trước khi tính lương."
      ),
      { code: "NO_ATTENDANCE_DATA" }
    );
  }

  const employees = await prisma.employee.findMany({
    where: {
      id: { in: employeeIdsWithAttendance },
      status: { in: ["ACTIVE", "PROBATION"] },
    },
    include: {
      contracts: { where: { status: "ACTIVE" }, orderBy: { createdAt: "desc" }, take: 1 },
      user: { select: { role: true } },
      team: { select: { id: true } },
    },
  });

  // Đầu vào nhập tay theo kỳ: lương sản phẩm + điều chỉnh
  const manualInputs = await prisma.payrollManualInput.findMany({
    where: { month: period.month, year: period.year },
    select: { employeeId: true, pieceRate: true, adjustment: true, mealBonus: true },
  });
  const manualMap: Record<string, { pieceRate: number; adjustment: number; mealBonus: number }> = {};
  for (const m of manualInputs) manualMap[m.employeeId] = { pieceRate: m.pieceRate, adjustment: m.adjustment, mealBonus: m.mealBonus };

  // M3: OT đã được duyệt
  const otData = await prisma.oTRequest.findMany({
    where: { date: { gte: startDate, lte: endDate }, status: "APPROVED" },
    select: { employeeId: true, date: true, hours: true, otRate: true },
  });

  // ── OT CỘNG DỒN từ đầu năm → hết tháng TRƯỚC kỳ này (cap 200h miễn thuế OT) ──
  const yearStart = new Date(period.year, 0, 1);
  const priorOtMap: Record<string, number> = {};
  if (startDate > yearStart) {
    const [priorAtt, priorOt] = await Promise.all([
      prisma.attendanceRecord.findMany({
        where: { date: { gte: yearStart, lt: startDate } },
        select: { employeeId: true, date: true, workHours: true, otHours: true },
      }),
      prisma.oTRequest.findMany({
        where: { date: { gte: yearStart, lt: startDate }, status: "APPROVED" },
        select: { employeeId: true, hours: true },
      }),
    ]);
    for (const a of priorAtt) {
      const d = new Date(a.date); const wh = a.workHours || 0, oh = a.otHours || 0;
      // CN/Lễ: toàn bộ giờ làm tính OT; ngày thường: chỉ giờ OT.
      const h = (isHoliday(d) || d.getUTCDay() === 0) ? wh + oh : oh;
      if (h > 0) priorOtMap[a.employeeId] = (priorOtMap[a.employeeId] || 0) + h;
    }
    for (const o of priorOt) priorOtMap[o.employeeId] = (priorOtMap[o.employeeId] || 0) + (o.hours || 0);
  }
  // Build set "employeeId|YYYY-MM-DD" để service biết NV nào có OTRequest cho ngày nào.
  // Dùng để xác định: wh ngày CN/Lễ chỉ cộng vào công thường NẾU NV có OTRequest tương ứng
  // (NV không có OTRequest = NV không được nhập vào sheet "Thêm giờ" của HR → wh ngày CN/Lễ bị bỏ qua).
  const otReqDays = new Set<string>();
  for (const o of otData) {
    const ymd = o.date.toISOString().slice(0, 10);
    otReqDays.add(`${o.employeeId}|${ymd}`);
  }

  // M3: Nghỉ phép đã duyệt — phân loại có lương vs không lương
  const leaveData = await prisma.leaveRequest.findMany({
    where: {
      status: "APPROVED",
      startDate: { lte: endDate },
      endDate: { gte: startDate },
    },
    select: { employeeId: true, leaveType: true, totalDays: true },
  });


  // ── Build lookup maps ──

  // ── Phân loại theo NGÀY (chốt 2026-05-26) ──
  //   Ngày thường (T2–T7, không lễ): workHours → công thường (÷8); otHours → OT ngày thường (×1.5).
  //   Chủ Nhật (ngày nghỉ): TOÀN BỘ giờ làm (workHours + otHours) → OT Chủ Nhật (×2).
  //   Ngày Lễ: TOÀN BỘ giờ làm → OT Lễ (×3).  (Ca đêm để 0 — chờ máy chấm công.)
  //   ABSENT_APPROVED(_HALF) (phép) → leaveDays (hưởng theo Lương BHXH/CC).
  const workDaysMap: Record<string, number> = {};        // công thường (ngày làm thực, ÷8)
  const alDaysFromAttendance: Record<string, number> = {};
  const unpaidWeekdayMap: Record<string, number> = {};   // NK ngày thường (mục tiêu bù công)
  const otMap: Record<string, { weekday: number; sunday: number; holiday: number }> = {};
  const ensureOt = (id: string) => (otMap[id] ||= { weekday: 0, sunday: 0, holiday: 0 });

  for (const a of attendanceData) {
    const d = new Date(a.date);
    const wh = a.workHours || 0;
    const oh = a.otHours || 0;
    // Nghỉ phép CÓ LƯƠNG (AL) lấy thẳng từ chấm công (dòng "nghỉ"), áp dụng mọi ngày.
    if ((a.paidLeaveDays || 0) > 0) {
      alDaysFromAttendance[a.employeeId] = (alDaysFromAttendance[a.employeeId] || 0) + (a.paidLeaveDays || 0);
    }
    if (isHoliday(d)) {
      // Lễ — wh+oh → OT × hệ số (chốt 2026-06-08).
      //   - Comp Holiday → ×2 (HR coi như CN)
      //   - Lễ thường/Lễ rơi CN → ×3
      if (wh + oh > 0) {
        if (isCompensatoryHoliday(d)) {
          ensureOt(a.employeeId).sunday += wh + oh;
        } else {
          ensureOt(a.employeeId).holiday += wh + oh;
        }
      }
    } else if (d.getUTCDay() === 0) {
      if (wh + oh > 0) ensureOt(a.employeeId).sunday += wh + oh;
    } else {
      // Ngày thường — đếm công theo workHours/8 (chốt 2026-06-15):
      //   PRESENT, LATE, HALF_DAY → workHours / 8 (tính theo GIỜ THỰC, kể cả nửa ngày)
      //   BUSINESS_TRIP → 1 cố định (đi công tác tính tròn 1 công)
      //   ABSENT_UNAPPROVED → mục tiêu bù công (NK ngày thường)
      if (a.status === "PRESENT" || a.status === "LATE" || a.status === "HALF_DAY") {
        // Làm tròn 2 chữ số TRƯỚC khi cộng (chốt 2026-06-08 từ HR):
        //   23 ngày × 7.5h → mỗi ngày 0.94 → cộng = 21.62 công
        //   (KHÁC với cộng giờ trước rồi chia: 23×7.5/8 = 21.5625 → 21.56)
        workDaysMap[a.employeeId] = (workDaysMap[a.employeeId] || 0) + Math.round((wh / 8) * 100) / 100;
      } else if (a.status === "BUSINESS_TRIP") {
        workDaysMap[a.employeeId] = (workDaysMap[a.employeeId] || 0) + 1;
      } else if (a.status === "ABSENT_UNAPPROVED") {
        // KL (vắng không lương → mục tiêu bù công bằng OT) CHỈ gồm: nghỉ không lương (UL)
        // + vắng không phép thật (không mã).
        // LOẠI TRỪ (không phải KL, không bù):
        //   SL = ốm, ML = thai sản → BHXH chi trả.
        //   L  = lễ → phòng khi lịch lễ trong file lệch với lịch hệ thống.
        const code = (a.leaveCode || "").toUpperCase().replace(/[0-9.,\s]/g, "");
        if (code !== "SL" && code !== "ML" && code !== "L") {
          unpaidWeekdayMap[a.employeeId] = (unpaidWeekdayMap[a.employeeId] || 0) + 1;
        }
      }
      // Nửa ngày KHÔNG lương (vd "0.5UL"): NV làm nửa ngày (HALF_DAY ở trên đã cộng công
      // phần làm) + nửa còn lại nghỉ không lương → tính phần nghỉ đó là KL để bù (như UL).
      const ulHalf = (a.leaveCode || "").toUpperCase().replace(",", ".").match(/^(\d*\.?\d+)UL$/);
      if (ulHalf && a.status === "HALF_DAY") {
        unpaidWeekdayMap[a.employeeId] = (unpaidWeekdayMap[a.employeeId] || 0) + parseFloat(ulHalf[1]);
      }
      // Nghỉ phép có lương: đã cộng từ paidLeaveDays ở trên (không suy từ status nữa).
      if (oh > 0) ensureOt(a.employeeId).weekday += oh;                 // OT ngày thường
    }
  }

  // OTRequest đã APPROVED — phân loại theo otRate (bổ sung nếu có đơn OT riêng)
  for (const o of otData) {
    ensureOt(o.employeeId);
    if (o.otRate >= 3.0) otMap[o.employeeId].holiday += o.hours;
    else if (o.otRate >= 2.0) otMap[o.employeeId].sunday += o.hours;
    else otMap[o.employeeId].weekday += o.hours;
  }

  // 6 — Nghỉ phép có lương (LeaveRequest + mã AL bảng công) → hưởng theo Lương BHXH/CC
  const leavePaidMap: Record<string, number> = {};
  for (const l of leaveData) {
    if (l.leaveType !== "UNPAID") leavePaidMap[l.employeeId] = (leavePaidMap[l.employeeId] || 0) + l.totalDays;
  }
  for (const [empId, days] of Object.entries(alDaysFromAttendance)) {
    leavePaidMap[empId] = (leavePaidMap[empId] || 0) + days;
  }

  // Nghỉ lễ: lễ chính thức (VN_HOLIDAYS, kể cả rơi CN) → TẤT CẢ NV được +1 công nghỉ có lương
  // (đi làm vào lễ vẫn được công này, cộng thêm OT theo hệ số).
  // Nghỉ bù (COMP) KHÔNG tính → không cộng vào leaveDays.
  const paidHolidayCount = paidHolidaysInMonth(period.year, period.month).length;
  const holidayRestMap: Record<string, number> = {};
  for (const empId of employeeIdsWithAttendance) {
    if (paidHolidayCount > 0) holidayRestMap[empId] = paidHolidayCount;
  }

  // Công chuẩn (CC) = số ngày trong tháng − số Chủ Nhật
  const CC = standardWorkDays(period.year, period.month);

  // ── Tính lương cho từng NV (dùng calculateSalary từ lib/salary-calc.ts) ──

  const records: {
    periodId: string; employeeId: string; standardDays: number; workDays: number;
    otHours: number; otConvertedHours: number; baseSalary: number; pieceRateSalary: number; hazardAllowance: number;
    responsibilityAllow: number; mealAllowance: number; otherIncome: number; otPay: number;
    grossSalary: number; bhxh: number; bhyt: number; bhtn: number; bhxhEmployer: number; tncn: number;
    deductions: number; netSalary: number; detail: any;
  }[] = [];

  const missingContractEmployees: { code: string; fullName: string }[] = [];
  const withContractEmployees: { code: string; fullName: string; baseSalary: number }[] = [];

  for (const emp of employees) {
    const contract = emp.contracts[0];

    // Gốc lương từ HĐ: Lương đóng BHXH (lương chính) + Phụ cấp = Tổng thu nhập
    const insuranceSalary = contract?.insuranceSalary ?? contract?.baseSalary ?? 0;
    const allowance = contract?.allowance ?? 0;
    const totalIncome = insuranceSalary + allowance;

    if (totalIncome > 0) {
      withContractEmployees.push({ code: emp.code, fullName: emp.fullName, baseSalary: insuranceSalary });
    } else {
      missingContractEmployees.push({ code: emp.code, fullName: emp.fullName });
    }

    const workDaysActualRaw = workDaysMap[emp.id] || 0;
    const leaveDays = (leavePaidMap[emp.id] || 0) + (holidayRestMap[emp.id] || 0);
    const ot = otMap[emp.id] || { weekday: 0, sunday: 0, holiday: 0 };

    // BÙ CÔNG theo HR (chốt 2026-06-11, fix double-count):
    //   - NV có KL (ABSENT_UNAPPROVED T2-T7, KHÔNG rơi lễ/CN) → bù bằng OT.
    //   - Bù lấy giờ OT hệ số CAO NHẤT trước (Lễ → CN → thường).
    //   - Phần OT dùng bù: cộng vào workDays (NV nhận 1× dailyRate) VÀ bị TIÊU HAO
    //     khỏi OT quy đổi → KHÔNG trả thêm hệ số (tránh tính 2 lần).
    //   - Chỉ phần OT DÔI ra (sau bù) mới được × hệ số.
    const klHours = (unpaidWeekdayMap[emp.id] || 0) * 8;
    const otTotal = (ot.weekday || 0) + (ot.sunday || 0) + (ot.holiday || 0);
    const buHours = Math.min(klHours, otTotal);
    const workDaysActual = workDaysActualRaw + buHours / 8;

    // Tiêu hao buHours khỏi OT — hệ số cao nhất trước (Lễ → CN → thường).
    let remainBu = buHours;
    const otAfter = { weekday: ot.weekday || 0, sunday: ot.sunday || 0, holiday: ot.holiday || 0 };
    for (const k of ["holiday", "sunday", "weekday"] as const) {
      const take = Math.min(otAfter[k], remainBu);
      otAfter[k] -= take;
      remainBu -= take;
    }

    const input: SalaryInput = {
      totalIncome,
      insuranceSalary,
      standardDays: CC,
      workDaysActual,
      leaveDays,
      // Bù đã cộng vào workDaysActual + đã tiêu hao OT trong otAfter → unpaidWeekdayDays = 0.
      unpaidWeekdayDays: 0,
      ot: {
        weekday: otAfter.weekday,
        weekdayNight: 0,   // ca đêm chờ máy chấm công
        sunday: otAfter.sunday,
        sundayNight: 0,
        holiday: otAfter.holiday,
        holidayNight: 0,
      },
      dependentsCount: emp.dependents || 0,
      bonusAllowance: ((emp as any).responsibilityAllowance || 0) + ((emp as any).farAllowance || 0),
      pieceRate: manualMap[emp.id]?.pieceRate || 0,
      // adjustment + mealBonus cùng cộng vào Gross (cả 2 đều là số phẳng nhập tay)
      adjustment: (manualMap[emp.id]?.adjustment || 0) + (manualMap[emp.id]?.mealBonus || 0),
      priorOtHours: priorOtMap[emp.id] || 0, // OT cộng dồn từ đầu năm → cap 200h miễn thuế
    };

    const out = calculateSalary(input);

    // Map → PayrollRecord. Split BHXH NLĐ (10.5%) thành 8% / 1.5% / 1% (0 nếu chưa đủ 14 công).
    const bhxhBase = Math.min(insuranceSalary, SALARY_CONFIG.INSURANCE_SALARY_CAP);
    const hasBHXH = out.bhxhEmployee > 0;
    const bhxh8 = hasBHXH ? Math.round(bhxhBase * INSURANCE_RATES.SOCIAL) : 0;
    const bhyt15 = hasBHXH ? Math.round(bhxhBase * INSURANCE_RATES.HEALTH) : 0;
    const bhtn1 = hasBHXH ? Math.round(bhxhBase * INSURANCE_RATES.UNEMPLOYMENT) : 0;

    // Snapshot chi tiết cho phiếu lương — khớp tuyệt đối với số đã tính kỳ này
    const detail = {
      // Gốc lương từ HĐ
      insuranceSalary, allowance, totalIncome,
      dependentsCount: emp.dependents || 0,
      // Bổ sung lương: trách nhiệm + nhà xa (đã cộng vào Gross)
      responsibilityAllow: (emp as any).responsibilityAllowance || 0,
      farAllowance: (emp as any).farAllowance || 0,
      bonusTotal: ((emp as any).responsibilityAllowance || 0) + ((emp as any).farAllowance || 0),
      // Nhập tay theo kỳ (đã cộng vào Gross)
      pieceRate: manualMap[emp.id]?.pieceRate || 0,
      adjustment: manualMap[emp.id]?.adjustment || 0,
      // Công
      standardDays: CC,
      workDays: workDaysActual,
      leaveDays: input.leaveDays,
      // OT giờ tách theo loại (sau khi đã tiêu hao phần bù công — khớp OT quy đổi)
      otWeekday: otAfter.weekday, otWeekdayNight: 0,
      otSunday: otAfter.sunday, otSundayNight: 0,
      otHoliday: otAfter.holiday, otHolidayNight: 0,
      otHoursTotal: out.otHoursTotal,
      priorOtHours: priorOtMap[emp.id] || 0,         // OT cộng dồn từ T1 → hết tháng trước (cap 200h)
      otConvertedHours: out.otConvertedHours,        // giờ; /8 = ngày OT quy đổi
      otFillHours: out.otFillHours,                  // giờ OT dùng bù (1×)
      otPaidHours: out.otPaidHours,                  // giờ OT hưởng hệ số
      // Đơn giá
      dailyRateFull: out.dailyRateFull,
      dailyRateInsurance: out.dailyRateInsurance,
      hourlyRateFull: out.hourlyRateFull,
      // Các khoản tiền
      salaryWorkActual: out.salaryWorkActual,        // lương ngày đi làm
      leavePay: out.leavePay,                        // lương phép/lễ
      fillPay: out.fillPay,                          // lương OT bù (1×)
      salaryOT: out.salaryOT,                        // lương OT hệ số
      grossSalary: out.grossSalary,
      // Khấu trừ + thuế
      bhxhEmployee: out.bhxhEmployee, bhxh8, bhyt15, bhtn1,
      bhxhEmployer: out.bhxhEmployer,
      otTaxExempt: out.otTaxExempt,
      taxableIncome: out.taxableIncome,
      personalDeduction: out.personalDeduction,
      taxableIncomeAfter: out.taxableIncomeAfter,
      tncn: out.tncn,
      netSalary: out.netSalary,
      companyTotalCost: out.companyTotalCost,
    };

    records.push({
      periodId,
      employeeId: emp.id,
      standardDays: CC,
      workDays: workDaysActual,
      otHours: out.otHoursTotal,
      otConvertedHours: out.otConvertedHours,
      baseSalary: insuranceSalary,
      pieceRateSalary: manualMap[emp.id]?.pieceRate || 0,
      hazardAllowance: 0,
      responsibilityAllow: 0,
      mealAllowance: 0,
      otherIncome: out.leavePay,                           // lương phép + lễ
      otPay: out.salaryOT,                                 // lương OT (đã nhân hệ số)
      grossSalary: out.grossSalary,
      bhxh: bhxh8,    // 8%
      bhyt: bhyt15,   // 1.5%
      bhtn: bhtn1,    // 1%
      bhxhEmployer: out.bhxhEmployer,                                          // 21.5% — phần công ty đóng
      tncn: out.tncn,
      deductions: 0,
      netSalary: out.netSalary,
      detail,
    });
  }

  // ── Debug log: AttendanceRecord OT vs OTRequest ──
  const otFromAttendance = attendanceData.filter((a) => a.otHours > 0).length;
  const otFromRequest = otData.length;
  const totalOtNvs = Object.keys(otMap).length;
  const totalOtHours = Object.values(otMap).reduce((s, o) => s + o.weekday + o.sunday + o.holiday, 0);

  // Log breakdown để HR biết NV nào có HĐ vs thiếu HĐ
  console.warn(`[Payroll ${period.month}/${period.year}] ════════════════════════════════════════`);
  console.warn(`  Tổng NV có chấm công: ${employees.length}`);
  console.warn(`  ✅ Có HĐ active hoặc salaryGrade: ${withContractEmployees.length}`);
  console.warn(`  ❌ Thiếu HĐ — lương = 0: ${missingContractEmployees.length}`);
  console.warn(`  ── OT data ──`);
  console.warn(`     AttendanceRecord rows có otHours>0: ${otFromAttendance}`);
  console.warn(`     OTRequest đã APPROVED: ${otFromRequest}`);
  console.warn(`     Tổng NV có OT: ${totalOtNvs}, tổng giờ OT: ${totalOtHours}`);
  if (withContractEmployees.length > 0) {
    console.warn(`  ── Có HĐ ──`);
    withContractEmployees.slice(0, 10).forEach((e) => {
      console.warn(`    ${e.code} ${e.fullName} — baseSalary: ${e.baseSalary.toLocaleString("vi-VN")}đ`);
    });
    if (withContractEmployees.length > 10) console.warn(`    ... và ${withContractEmployees.length - 10} NV khác`);
  }
  if (missingContractEmployees.length > 0) {
    console.warn(`  ── Thiếu HĐ ──`);
    missingContractEmployees.slice(0, 10).forEach((e) => {
      console.warn(`    ${e.code} ${e.fullName}`);
    });
    if (missingContractEmployees.length > 10) console.warn(`    ... và ${missingContractEmployees.length - 10} NV khác`);
  }
  console.warn(`══════════════════════════════════════════════════════════════════════`);

  // Atomic write: xoá cũ → ghi mới → mark PROCESSING
  await prisma.$transaction(async (tx) => {
    await tx.payrollRecord.deleteMany({ where: { periodId } });
    await tx.payrollRecord.createMany({ data: records });
    await tx.payrollPeriod.update({ where: { id: periodId }, data: { status: "PROCESSING" } });
  });

  return prisma.payrollPeriod.findUnique({
    where: { id: periodId },
    include: {
      records: {
        include: {
          employee: {
            select: {
              id: true, code: true, fullName: true,
              department: { select: { name: true } },
            },
          },
        },
      },
    },
  });
}

// ─── Retrieval helpers ──────────────────────────────────────────────────────

export async function getSalarySlip(periodId: string, employeeId: string) {
  return prisma.payrollRecord.findFirst({
    where: { periodId, employeeId },
    include: {
      period: { select: { month: true, year: true, status: true } },
      employee: {
        select: {
          code: true,
          fullName: true,
          bankAccount: true,
          bankName: true,
          taxCode: true,
          department: { select: { name: true } },
          position: { select: { name: true } },
        },
      },
    },
  });
}

export async function listPayrollPeriods() {
  const periods = await prisma.payrollPeriod.findMany({
    include: { records: { select: { id: true, netSalary: true, employeeId: true } } },
    orderBy: [{ year: "desc" }, { month: "desc" }],
  });
  // Đánh dấu kỳ đã import lương sản phẩm (có ít nhất 1 dòng PayrollManualInput)
  const manual = await prisma.payrollManualInput.groupBy({ by: ["month", "year"], _count: true });
  const manualSet = new Set(manual.map((m) => `${m.month}-${m.year}`));
  return periods.map((p) => ({ ...p, pieceRateImported: manualSet.has(`${p.month}-${p.year}`) }));
}
