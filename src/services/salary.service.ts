import prisma from "@/lib/prisma";
import { calculateSalary, type SalaryInput } from "@/lib/salary-calc";
import { leaveCodeBase, leaveQty, COMPANY_PAID_LEAVE, BHXH_LEAVE } from "@/lib/attendance-codes";
import { standardWorkDays, isHoliday, isCompensatoryHoliday } from "@/lib/holidays";

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
  let attendanceData = await prisma.attendanceRecord.findMany({
    where: { date: { gte: startDate, lte: endDate } },
    select: { employeeId: true, status: true, workHours: true, otHours: true, nightHours: true, otNightHours: true, date: true, paidLeaveDays: true, leaveCode: true },
  });

  // ── TẠM NGHỈ (ON_LEAVE): ẩn các ngày trong khoảng tạm nghỉ — KHÔNG tính lương ngày đó (chốt 2026-06-26).
  //   NV tạm nghỉ cả kỳ → bị loại hết công → tự rớt khỏi danh sách tính lương (coi như ẩn đi).
  const dStr = (d: Date | string) => new Date(d).toISOString().slice(0, 10);
  const attIdsRaw = Array.from(new Set(attendanceData.map((a) => a.employeeId)));
  if (attIdsRaw.length > 0) {
    const suspended = await prisma.employee.findMany({
      where: { id: { in: attIdsRaw }, status: "ON_LEAVE", suspendedFrom: { not: null }, suspendedTo: { not: null } },
      select: { id: true, suspendedFrom: true, suspendedTo: true },
    });
    if (suspended.length > 0) {
      const win: Record<string, { from: string; to: string }> = {};
      for (const s of suspended) win[s.id] = { from: dStr(s.suspendedFrom!), to: dStr(s.suspendedTo!) };
      attendanceData = attendanceData.filter((a) => {
        const w = win[a.employeeId];
        if (!w) return true;
        const ds = dStr(a.date);
        return ds < w.from || ds > w.to; // chỉ giữ ngày NGOÀI khoảng tạm nghỉ
      });
    }
  }

  // CHỈ tính lương cho NV CÓ DỮ LIỆU CHẤM CÔNG trong tháng (sau khi đã ẩn ngày tạm nghỉ)
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
      // Tính lương cho MỌI NV CÓ CÔNG trong tháng — KỂ CẢ đã nghỉ việc (RESIGNED/TERMINATED/ON_LEAVE).
      // VD: NV làm hết T4, nghỉ từ T5; làm bảng công T5 thì trạng thái đã là "Đã nghỉ" nhưng vẫn
      // phát sinh công T4 → vẫn phải trả lương T4 (chốt 2026-06-25). Lọc theo CÓ chấm công là đủ.
      id: { in: employeeIdsWithAttendance },
    },
    include: {
      // Lấy TẤT CẢ HĐ chưa chấm dứt (mới nhất trước) → chọn HĐ áp dụng cho kỳ ở pickContract() (có fallback).
      contracts: {
        where: { status: { notIn: ["TERMINATED", "REJECTED", "PENDING_APPROVAL"] } },
        orderBy: { startDate: "desc" },
      },
      user: { select: { role: true } },
      team: { select: { id: true } },
    },
  });

  // Chọn HĐ áp dụng cho KỲ tính lương (chốt 2026-06-29). cs đã orderBy startDate DESC + đã loại
  // TERMINATED/REJECTED/PENDING_APPROVAL (chỉ giữ HĐ có hiệu lực thật).
  //   (1) Ưu tiên HĐ PHỦ kỳ [đầu kỳ, cuối kỳ] — HĐ có hiệu lực trong chính kỳ tính.
  //       VD: tăng lương từ T5 (HĐ mới start 01/05) nhưng tính lương T4 → HĐ T5 CHƯA phủ T4
  //       → tự rơi xuống HĐ cũ phủ T4 (lấy ĐÚNG mức lương cũ, KHÔNG lấy mức mới T5).
  //   (2) Không có HĐ phủ kỳ (thử việc đã hết / HĐ cũ hết hạn chưa ký tiếp) → HĐ GẦN NHẤT đã BẮT ĐẦU
  //       trước/trong kỳ. KHÔNG lấy HĐ tương lai → tránh lấy mức lương MỚI để tính cho tháng CŨ.
  //   (3) NV chưa có HĐ nào bắt đầu trước kỳ (hiếm) → lấy HĐ sớm nhất.
  const pickContract = (emp: (typeof employees)[number]) => {
    const cs = emp.contracts;
    const covering = cs.find((c) => c.startDate <= endDate && (!c.endDate || c.endDate >= startDate));
    if (covering) return covering;
    const lastStarted = cs.find((c) => c.startDate <= endDate);
    if (lastStarted) return lastStarted;
    return cs[cs.length - 1] ?? null;
  };

  // Đầu vào nhập tay theo kỳ: lương sản phẩm + điều chỉnh
  const manualInputs = await prisma.payrollManualInput.findMany({
    where: { month: period.month, year: period.year },
    select: { employeeId: true, pieceRate: true, adjustment: true, mealBonus: true, note: true },
  });
  const manualMap: Record<string, { pieceRate: number; adjustment: number; mealBonus: number; note: string | null }> = {};
  for (const m of manualInputs) manualMap[m.employeeId] = { pieceRate: m.pieceRate, adjustment: m.adjustment, mealBonus: m.mealBonus, note: m.note };

  // BHXH HCNS tính NGOÀI rồi import (hệ thống KHÔNG tự tính). NLĐ = 8%+1.5%+1% (khoản trừ); employer = 21.5% (báo cáo).
  const bhxhInputs = await prisma.payrollBhxhInput.findMany({ where: { month: period.month, year: period.year } });
  const bhxhMap: Record<string, { bhxh8: number; bhyt15: number; bhtn1: number; employer: number; employee: number }> = {};
  for (const b of bhxhInputs) {
    bhxhMap[b.employeeId] = { bhxh8: b.bhxh8, bhyt15: b.bhyt15, bhtn1: b.bhtn1, employer: b.bhxhEmployer, employee: b.bhxh8 + b.bhyt15 + b.bhtn1 };
  }

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
        select: { employeeId: true, date: true, workHours: true, otHours: true, otNightHours: true },
      }),
      prisma.oTRequest.findMany({
        where: { date: { gte: yearStart, lt: startDate }, status: "APPROVED" },
        select: { employeeId: true, hours: true },
      }),
    ]);
    for (const a of priorAtt) {
      const d = new Date(a.date); const wh = a.workHours || 0, oh = a.otHours || 0, onh = (a as any).otNightHours || 0;
      // CN/Lễ: toàn bộ giờ làm ngày + OT đêm tính OT; ngày thường: chỉ giờ OT (ngày + đêm). (HC Đ là ca đêm, không phải OT.)
      const h = (isHoliday(d) || d.getUTCDay() === 0) ? wh + oh + onh : oh + onh;
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
  // CL (ma chay) + WL (tai nạn LĐ) + ML (đám cưới) — CÔNG TY trả lương (như AL). Đếm để cộng leaveDays.
  //   (AL xử lý qua paidLeaveDays; L lễ qua lịch lễ — không tính lại ở đây.)
  const companyExtraLeaveMap: Record<string, number> = {};
  // SL (ốm) + MT (thai sản) — BHXH chi trả: CHỈ ĐẾM để hiển thị cột "nghỉ hưởng lương", KHÔNG cộng lương công ty.
  const bhxhLeaveDaysMap: Record<string, number> = {};
  // L (nghỉ lễ) — CHỈ đếm khi ô ngày CÓ chữ "L". NV không có "L" (vào sau lễ / nghỉ cả tháng / thai sản) → KHÔNG có lương lễ.
  const holidayCodeMap: Record<string, number> = {};
  const unpaidWeekdayMap: Record<string, number> = {};   // NK ngày thường (mục tiêu bù công)
  const otMap: Record<string, { weekday: number; weekdayNight: number; sunday: number; sundayNight: number; holiday: number; holidayNight: number }> = {};
  const ensureOt = (id: string) => (otMap[id] ||= { weekday: 0, weekdayNight: 0, sunday: 0, sundayNight: 0, holiday: 0, holidayNight: 0 });
  // Ca đêm (HC Đ) — công đêm theo loại ngày (lương ×1.3/2.7/3.9). KHÁC OT đêm.
  const nightMap: Record<string, { weekday: number; sunday: number; holiday: number }> = {};
  const ensureNight = (id: string) => (nightMap[id] ||= { weekday: 0, sunday: 0, holiday: 0 });

  for (const a of attendanceData) {
    const d = new Date(a.date);
    const wh = a.workHours || 0;
    const oh = a.otHours || 0;
    const nh = (a as any).nightHours || 0;       // HC Đ — công ca đêm
    const onh = (a as any).otNightHours || 0;    // Thêm giờ Đ — OT ca đêm
    // Nghỉ phép CÓ LƯƠNG (AL) lấy thẳng từ chấm công (dòng "nghỉ"), áp dụng mọi ngày.
    if ((a.paidLeaveDays || 0) > 0) {
      alDaysFromAttendance[a.employeeId] = (alDaysFromAttendance[a.employeeId] || 0) + (a.paidLeaveDays || 0);
    }
    // Phân loại mã nghỉ (gồm nửa ngày "0.5XX"):
    const lvBase = leaveCodeBase(a.leaveCode);
    if (lvBase === "CL" || lvBase === "WL" || lvBase === "ML") {           // công ty trả → leaveDays
      companyExtraLeaveMap[a.employeeId] = (companyExtraLeaveMap[a.employeeId] || 0) + leaveQty(a.leaveCode);
    } else if (lvBase === "SL" || lvBase === "MT") {                        // BHXH trả → chỉ hiển thị
      bhxhLeaveDaysMap[a.employeeId] = (bhxhLeaveDaysMap[a.employeeId] || 0) + leaveQty(a.leaveCode);
    } else if (lvBase === "L") {                                            // Nghỉ Lễ — CHỈ ô có "L" mới được công lễ
      holidayCodeMap[a.employeeId] = (holidayCodeMap[a.employeeId] || 0) + leaveQty(a.leaveCode);
    }
    if (isHoliday(d)) {
      // Lễ — wh+oh → OT × hệ số (chốt 2026-06-08).
      //   - Comp Holiday → ×2 (HR coi như CN)
      //   - Lễ thường/Lễ rơi CN → ×3
      const compH = isCompensatoryHoliday(d);
      if (wh + oh > 0) (compH ? (ensureOt(a.employeeId).sunday += wh + oh) : (ensureOt(a.employeeId).holiday += wh + oh));
      if (nh > 0) (compH ? (ensureNight(a.employeeId).sunday += nh) : (ensureNight(a.employeeId).holiday += nh));
      if (onh > 0) (compH ? (ensureOt(a.employeeId).sundayNight += onh) : (ensureOt(a.employeeId).holidayNight += onh));
    } else if (d.getUTCDay() === 0) {
      if (wh + oh > 0) ensureOt(a.employeeId).sunday += wh + oh;
      if (nh > 0) ensureNight(a.employeeId).sunday += nh;
      if (onh > 0) ensureOt(a.employeeId).sundayNight += onh;
    } else {
      // Ngày thường — đếm công theo workHours/8 (chốt 2026-06-15):
      //   PRESENT, LATE, HALF_DAY → workHours / 8 (tính theo GIỜ THỰC, kể cả nửa ngày)
      //   BUSINESS_TRIP → 1 cố định (đi công tác tính tròn 1 công)
      //   ABSENT_UNAPPROVED → mục tiêu bù công (NK ngày thường)
      if (a.status === "PRESENT" || a.status === "LATE" || a.status === "HALF_DAY") {
        // Công = workHours / 8, GIỮ SỐ THẬT (không làm tròn — chốt 2026-06-19).
        //   23 ngày × 7.5h → 23×7.5/8 = 21.5625 (hiển thị 21.56).
        workDaysMap[a.employeeId] = (workDaysMap[a.employeeId] || 0) + wh / 8;
      } else if (a.status === "BUSINESS_TRIP") {
        workDaysMap[a.employeeId] = (workDaysMap[a.employeeId] || 0) + 1;
      } else if (a.status === "ABSENT_UNAPPROVED") {
        // KL (vắng không lương → mục tiêu bù công bằng OT) = nghỉ KHÔNG lương (UL) + vắng không mã.
        // LOẠI TRỪ (không phải KL): mọi mã CÓ HƯỞNG — công ty trả (AL/L/CL/WL/ML) hoặc BHXH (SL/MT).
        const code = leaveCodeBase(a.leaveCode);
        if (![...COMPANY_PAID_LEAVE, ...BHXH_LEAVE].includes(code)) {
          unpaidWeekdayMap[a.employeeId] = (unpaidWeekdayMap[a.employeeId] || 0) + 1;
        }
      }
      // Nửa ngày KHÔNG lương (vd "0.5UL"): NV làm nửa ngày (HALF_DAY ở trên đã cộng công
      // phần làm) + nửa còn lại nghỉ không lương → tính phần nghỉ đó là KL để bù (như UL).
      const ulHalf = (a.leaveCode || "").toUpperCase().replace(",", ".").match(/^(\d*\.?\d+)UL$/);
      if (ulHalf && a.status === "HALF_DAY") {
        unpaidWeekdayMap[a.employeeId] = (unpaidWeekdayMap[a.employeeId] || 0) + parseFloat(ulHalf[1]);
      }
      // Nửa ngày phép (vd "0.5AL") mà KHÔNG đi làm phần còn lại → phần còn lại = KL (bù OT như ngày KL).
      //   HC=4 + 0.5AL  → status HALF_DAY (đã có đi làm) → phần kia là công làm, KHÔNG tính KL.
      //   HC trống + 0.5AL → status ABSENT_APPROVED_HALF (không đi làm) → (1 − số ngày phép) = KL.
      if (a.status === "ABSENT_APPROVED_HALF") {
        const gap = Math.max(0, 1 - (a.paidLeaveDays || 0));
        if (gap > 0) unpaidWeekdayMap[a.employeeId] = (unpaidWeekdayMap[a.employeeId] || 0) + gap;
      }
      // Nghỉ phép có lương: đã cộng từ paidLeaveDays ở trên (không suy từ status nữa).
      if (oh > 0) ensureOt(a.employeeId).weekday += oh;                 // OT ngày thường (Thêm giờ N)
      if (nh > 0) ensureNight(a.employeeId).weekday += nh;             // ca đêm ngày thường (HC Đ) → ×1.3
      if (onh > 0) ensureOt(a.employeeId).weekdayNight += onh;          // OT đêm ngày thường (Thêm giờ Đ) → ×2.0
    }
  }

  // ── TIỀN ĂN TĂNG GIỜ (chốt 2026-06-19; GỘP OT ngày+đêm 2026-06-26; BỎ tiền ăn lễ 2026-06-28) ──
  // Tự tính từ chấm công, theo GIỜ OT THỰC TẾ (CHƯA bù trừ — dùng giờ gốc, KHÁC lương OT).
  //   CHỈ NGÀY THƯỜNG (T2–T7, KHÔNG lễ) mới có tiền ăn OT: CỘNG tổng OT ca ngày + OT ca đêm trong NGÀY:
  //     2h ≤ tổng OT < 4h → 15.000đ; tổng OT ≥ 4h → 20.000đ; < 2h → 0.
  //     (vd 1 ngày 3h OT ngày + 2h OT đêm = tổng 5h → 20k; 1 ngày chỉ 3h OT đêm → 15k.)
  //   CHỦ NHẬT + NGÀY LỄ (gồm nghỉ bù): 0 — công ty CÓ NẤU CƠM nên không tính tiền ăn OT.
  const mealByOt = (h: number) => (h >= 4 ? 20000 : h >= 2 ? 15000 : 0);
  const mealOTMap: Record<string, number> = {};
  for (const a of attendanceData) {
    const d = new Date(a.date);
    let meal = 0;
    if (d.getUTCDay() === 0 || isHoliday(d)) {
      meal = 0; // Chủ nhật + lễ (kể cả nghỉ bù) → có nấu cơm → KHÔNG tiền ăn OT
    } else {
      meal = mealByOt((a.otHours || 0) + (a.otNightHours || 0)); // ngày thường: gộp OT ngày + đêm
    }
    if (meal > 0) mealOTMap[a.employeeId] = (mealOTMap[a.employeeId] || 0) + meal;
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

  // Nghỉ lễ (chốt 2026-06-26): CHỈ NV có mã "L" trên ô ngày lễ mới được +1 công lễ hưởng lương.
  //   → NV vào sau ngày lễ / nghỉ nguyên tháng / nghỉ thai sản (không có "L") KHÔNG được lương lễ.
  //   Đi làm vào lễ vẫn được cộng OT theo hệ số (xử lý ở vòng trên), độc lập với công lễ này.
  const holidayRestMap: Record<string, number> = {};
  for (const [empId, n] of Object.entries(holidayCodeMap)) {
    if (n > 0) holidayRestMap[empId] = n;
  }

  // Công chuẩn (CC) = số ngày trong tháng − số Chủ Nhật
  const CC = standardWorkDays(period.year, period.month);

  // Helper: dựng workDaysActual + otAfter (sau bù công) cho 1 NV — dùng chung pre-pass & vòng chính.
  const buildWorkOt = (empId: string) => {
    const workDaysActualRaw = workDaysMap[empId] || 0;
    const ot = otMap[empId] || { weekday: 0, weekdayNight: 0, sunday: 0, sundayNight: 0, holiday: 0, holidayNight: 0 };
    const klHours = (unpaidWeekdayMap[empId] || 0) * 8;
    // Bù công dùng TẤT CẢ OT (ca ngày + ca đêm) — tiêu OT HỆ SỐ CAO trước (chốt 2026-06-26).
    //   Thứ tự hệ số giảm dần: lễ đêm 3.9 > lễ 3.0 > CN đêm 2.7 > CN 2.0 = đêm thường 2.0 > thường 1.5.
    const otTotal = (ot.weekday || 0) + (ot.weekdayNight || 0) + (ot.sunday || 0) + (ot.sundayNight || 0) + (ot.holiday || 0) + (ot.holidayNight || 0);
    const buHours = Math.min(klHours, otTotal);
    const workDaysActual = workDaysActualRaw + buHours / 8; // công ca ngày + giờ OT (ngày/đêm) đã quy về 1× để bù
    let remainBu = buHours;
    const otAfter = {
      weekday: ot.weekday || 0, weekdayNight: ot.weekdayNight || 0,
      sunday: ot.sunday || 0, sundayNight: ot.sundayNight || 0,
      holiday: ot.holiday || 0, holidayNight: ot.holidayNight || 0,
    };
    for (const k of ["holidayNight", "holiday", "sundayNight", "sunday", "weekdayNight", "weekday"] as const) {
      const take = Math.min(otAfter[k], remainBu); otAfter[k] -= take; remainBu -= take;
    }
    return { workDaysActual, otAfter };
  };

  // ── LƯƠNG KHOÁN (chia khoán theo tổ — chốt 2026-06-22) ──
  // Công thức: Lương SP của NV = (Khoán tổ − Σ lương-thời-gian-OT tổ) ÷ Σ công-quy-đổi tổ × công-quy-đổi NV.
  //   - lương-thời-gian-OT = lương ngày công đi làm + tiền OT (KHÔNG gồm phụ cấp/phép).
  //   - công-quy-đổi = công thường + OT quy đổi (otConvertedHours/8).
  //   - Phần chênh có thể ÂM (tổ làm theo giờ vượt khoán) → trừ vào lương.
  // PASS 1: tính lương thời gian + công quy đổi từng NV.
  const timeInfo: Record<string, { timeSalary: number; cong: number }> = {};
  for (const emp of employees) {
    const c0 = pickContract(emp);
    const insuranceSalary = c0?.insuranceSalary ?? c0?.baseSalary ?? 0;
    const allowance = c0?.allowance ?? 0;
    const { workDaysActual, otAfter } = buildWorkOt(emp.id);
    const nightShift = nightMap[emp.id] || { weekday: 0, sunday: 0, holiday: 0 };
    const nightCong = (nightShift.weekday + nightShift.sunday + nightShift.holiday) / 8;
    const o = calculateSalary({
      totalIncome: insuranceSalary + allowance, insuranceSalary, standardDays: CC,
      workDaysActual, leaveDays: 0, unpaidWeekdayDays: 0,
      ot: { weekday: otAfter.weekday, weekdayNight: otAfter.weekdayNight, sunday: otAfter.sunday, sundayNight: otAfter.sundayNight, holiday: otAfter.holiday, holidayNight: otAfter.holidayNight },
      nightShift,
      dependentsCount: 0, bonusAllowance: ((emp as any).responsibilityAllowance || 0) + ((emp as any).farAllowance || 0),
      pieceRate: 0, adjustment: 0, mealOT: 0, priorOtHours: 0, importedBhxhEmployee: 0, importedBhxhEmployer: 0,
    });
    // Trong KHOÁN: ca đêm tính ở mức 1× (cơ bản) — premium ca đêm (×0.3/1.7/2.9) trả RIÊNG,
    // KHÔNG trừ vào phần chia khoán (chốt 2026-06-28). nightBase = công đêm × ĐÚNG đơn giá ngày
    // (o.dailyRateFull — đã loại phụ cấp trách nhiệm, GIỐNG lương ngày công thường). KHÔNG dùng
    // (lương+phụ cấp)/CC (cao hơn vì gồm PC trách nhiệm) → trước đây làm lệch rate khoán (chốt 2026-06-29).
    const nightBase = nightCong * o.dailyRateFull;
    timeInfo[emp.id] = { timeSalary: o.salaryWorkActual + o.salaryOT + nightBase, cong: o.workDaysActual + nightCong + o.otConvertedHours / 8 };
  }
  // Khoán theo tổ kỳ này (cộng dồn nếu nhiều dòng/dự án cùng tổ).
  const khoanRecords = await prisma.pieceRateRecord.findMany({ where: { month: period.month, year: period.year } });
  const khoanByTeam: Record<string, number> = {};
  for (const r of khoanRecords) khoanByTeam[r.teamId] = (khoanByTeam[r.teamId] || 0) + r.totalAmount;
  // PASS 2: chia khoán cho từng NV trong tổ.
  const luongKhoanMap: Record<string, number> = {};
  for (const [teamId, khoan] of Object.entries(khoanByTeam)) {
    const members = employees.filter((e) => (e as any).team?.id === teamId && timeInfo[e.id]);
    const sumTime = members.reduce((s, e) => s + timeInfo[e.id].timeSalary, 0);
    const sumCong = members.reduce((s, e) => s + timeInfo[e.id].cong, 0);
    if (sumCong <= 0) continue;
    for (const e of members) luongKhoanMap[e.id] = ((khoan - sumTime) / sumCong) * timeInfo[e.id].cong;
  }

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
    const contract = pickContract(emp);

    // Gốc lương từ HĐ: Lương đóng BHXH (lương chính) + Phụ cấp = Tổng thu nhập
    const insuranceSalary = contract?.insuranceSalary ?? contract?.baseSalary ?? 0;
    const allowance = contract?.allowance ?? 0;
    const totalIncome = insuranceSalary + allowance;

    if (totalIncome > 0) {
      withContractEmployees.push({ code: emp.code, fullName: emp.fullName, baseSalary: insuranceSalary });
    } else {
      missingContractEmployees.push({ code: emp.code, fullName: emp.fullName });
    }

    // Nghỉ CÔNG TY trả = AL (leavePaidMap) + Lễ (holidayRestMap) + CL/WL/ML (companyExtraLeaveMap).
    const leaveDays = (leavePaidMap[emp.id] || 0) + (holidayRestMap[emp.id] || 0) + (companyExtraLeaveMap[emp.id] || 0);
    // workDaysActual + otAfter (sau bù công) — xem buildWorkOt phía trên.
    const { workDaysActual, otAfter } = buildWorkOt(emp.id);
    // Lương SP = nhập tay (nếu có) + phần chia từ khoán tổ (có thể âm).
    const luongKhoan = luongKhoanMap[emp.id] || 0;
    const pieceRateTotal = (manualMap[emp.id]?.pieceRate || 0) + luongKhoan;

    // Công ca đêm (HC Đ) — cộng vào TỔNG CÔNG (chốt 2026-06-23): ảnh hưởng mốc ≥14 + cột Công.
    const nightShift = nightMap[emp.id] || { weekday: 0, sunday: 0, holiday: 0 };
    const nightCong = (nightShift.weekday + nightShift.sunday + nightShift.holiday) / 8;
    const totalCong = workDaysActual + nightCong; // công ca ngày + công ca đêm

    // Phụ cấp: trách nhiệm trả luôn; PC NHÀ XA chỉ trả khi CÔNG ≥ 14 (tính cả ca đêm — chốt 2026-06-23)
    // VÀ chỉ cho NV CHÍNH THỨC (HĐ không phải Thử việc) — chốt 2026-06-25. NV thử việc KHÔNG nhận nhà xa.
    const respAllow = (emp as any).responsibilityAllowance || 0;
    const farAllow = (emp as any).farAllowance || 0;
    const isProbation = contract?.contractType === "PROBATION";
    const farPaid = totalCong >= 14 && !isProbation ? farAllow : 0;
    const bonusPaid = respAllow + farPaid;          // thực trả → cộng vào Gross
    const bonusFull = respAllow + farAllow;         // đầy đủ → trừ khỏi đơn giá ngày

    const input: SalaryInput = {
      totalIncome,
      insuranceSalary,
      standardDays: CC,
      workDaysActual,   // CÔNG CA NGÀY (ca đêm tính riêng qua nightShift)
      leaveDays,
      // Bù đã cộng vào workDaysActual + đã tiêu hao OT trong otAfter → unpaidWeekdayDays = 0.
      unpaidWeekdayDays: 0,
      ot: {
        weekday: otAfter.weekday,
        weekdayNight: otAfter.weekdayNight,
        sunday: otAfter.sunday,
        sundayNight: otAfter.sundayNight,
        holiday: otAfter.holiday,
        holidayNight: otAfter.holidayNight,
      },
      nightShift,   // giờ ca đêm (HC Đ) theo loại ngày → lương ×1.3/2.7/3.9
      dependentsCount: emp.dependents || 0,
      bonusAllowance: bonusPaid,        // thực trả (PC nhà xa chỉ khi công ≥ 14)
      bonusAllowanceFull: bonusFull,    // đầy đủ — trừ khỏi đơn giá ngày
      pieceRate: pieceRateTotal,
      adjustment: manualMap[emp.id]?.adjustment || 0,
      mealOT: (mealOTMap[emp.id] || 0) + (manualMap[emp.id]?.mealBonus || 0), // tiền ăn tăng giờ: tự tính + bổ sung import (chịu thuế)
      priorOtHours: priorOtMap[emp.id] || 0, // OT cộng dồn từ đầu năm → cap 200h miễn thuế
      importedBhxhEmployee: bhxhMap[emp.id]?.employee || 0, // BHXH NLĐ import (khoản trừ)
      importedBhxhEmployer: bhxhMap[emp.id]?.employer || 0, // BHXH công ty 21.5% import (báo cáo)
    };

    const out = calculateSalary(input);

    // Map → PayrollRecord. BHXH NLĐ tách 8% / 1.5% / 1% — LẤY TỪ FILE IMPORT (không tự tính).
    const bhxh8 = bhxhMap[emp.id]?.bhxh8 || 0;
    const bhyt15 = bhxhMap[emp.id]?.bhyt15 || 0;
    const bhtn1 = bhxhMap[emp.id]?.bhtn1 || 0;

    // Snapshot chi tiết cho phiếu lương — khớp tuyệt đối với số đã tính kỳ này
    const detail = {
      // Gốc lương từ HĐ
      insuranceSalary, allowance, totalIncome,
      dependentsCount: emp.dependents || 0,
      // Bổ sung lương: trách nhiệm + nhà xa (đã cộng vào Gross)
      responsibilityAllow: respAllow,
      farAllowance: farPaid,            // PC nhà xa thực trả (0 nếu công < 14)
      bonusTotal: bonusPaid,            // thực trả (vào cột "Lương trách nhiệm + phụ cấp")
      bonusFull,                        // đầy đủ (resp + nhà xa full) — để trừ khỏi cột KPI (far KHÔNG nằm trong KPI)
      // Lương sản phẩm/khoán (đã cộng vào Gross) = nhập tay + chia từ khoán tổ
      pieceRate: pieceRateTotal,
      pieceRateManual: manualMap[emp.id]?.pieceRate || 0,
      luongKhoan,                                    // phần chia từ khoán tổ (có thể âm)
      adjustment: manualMap[emp.id]?.adjustment || 0,
      adjustmentNote: manualMap[emp.id]?.note || "",   // lý do truy thu/bổ sung (hiện ở phiếu lương chi tiết)
      // Công
      standardDays: CC,
      workDays: totalCong,            // TỔNG công = ca ngày + ca đêm (cột "Công" hiển thị)
      nightWorkDays: nightCong,       // công ca đêm (để tách khỏi cột Lương ca ngày)
      leaveDays: input.leaveDays,     // phép/lễ CÔNG TY trả (AL + Lễ) — dùng tính lương chế độ
      bhxhLeaveDays: bhxhLeaveDaysMap[emp.id] || 0, // SL+MT do BHXH trả — CHỈ hiển thị cột "nghỉ hưởng lương", không vào lương
      // OT giờ tách theo loại (sau khi đã tiêu hao phần bù công — khớp OT quy đổi)
      otWeekday: otAfter.weekday, otWeekdayNight: otAfter.weekdayNight,
      otSunday: otAfter.sunday, otSundayNight: otAfter.sundayNight,
      otHoliday: otAfter.holiday, otHolidayNight: otAfter.holidayNight,
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
      nightShiftPay: out.nightShiftPay,              // lương ca đêm (HC Đ) ×1.3/2.7/3.9
      mealOT: out.mealOT,                            // tiền ăn tăng giờ (tự tính)
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
      workDays: totalCong,
      otHours: out.otHoursTotal,
      otConvertedHours: out.otConvertedHours,
      baseSalary: insuranceSalary,
      pieceRateSalary: pieceRateTotal,
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
  // Đánh dấu kỳ đã import khoán theo tổ (có ít nhất 1 dòng PieceRateRecord).
  const khoan = await prisma.pieceRateRecord.groupBy({ by: ["month", "year"], _count: true });
  const khoanSet = new Set(khoan.map((m) => `${m.month}-${m.year}`));
  return periods.map((p) => ({ ...p, pieceRateImported: khoanSet.has(`${p.month}-${p.year}`) }));
}
