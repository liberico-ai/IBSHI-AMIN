import prisma from "@/lib/prisma";
import { calculateSalary, type SalaryInput } from "@/lib/salary-calc";
import { leaveCodeBase, leaveQty, COMPANY_PAID_LEAVE, BHXH_LEAVE, UNPAID_NO_OFFSET } from "@/lib/attendance-codes";
import { standardWorkDays, isHoliday, isCompensatoryHoliday } from "@/lib/holidays";
import { computeBhxh, SALARY_CONFIG } from "@/lib/constants";

// ⚠️⚠️ CỜ TẠM THỜI — gate "Nghỉ / Tăng ca phải có ĐƠN DUYỆT mới được tính lương".
//   true  = BẬT gate (chuẩn nghiệp vụ: mã nghỉ đặc biệt + OT ngày thường chỉ tính khi có đơn duyệt).
//   false = TẮT gate (dùng khi IMPORT bảng công/lương THÁNG CŨ chưa có đơn — để mã nghỉ + giờ OT
//           trong file được tính như lịch sử; ngày vắng KL thật (không mã) VẪN là KL). Chủ Nhật/Lễ vốn không cần đơn.
//   ➜ IMPORT XONG NHỚ ĐỔI LẠI THÀNH true.
const REQUIRE_APPROVAL_FOR_LEAVE_OT = false;

// Làm tròn giờ 1 ca CHỈ để TÍNH LƯƠNG: >7.8 (gần đủ 8h) → 8; còn lại giữ nguyên số lẻ.
//   Áp cho HC ca ngày/đêm + tăng ca (workHours/reconciledHours/nightHours/otHours/otNightHours).
//   KHÔNG đổi Bảng chấm công (bảng công vẫn hiện số lẻ máy chấm — đây chỉ áp trong service tính lương).
const roundShiftHours = (v: number | null | undefined): number | null | undefined =>
  (v != null && v > 7.8 && v < 8 ? 8 : v);

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
    select: { employeeId: true, status: true, workHours: true, reconciledHours: true, otHours: true, nightHours: true, otNightHours: true, date: true, paidLeaveDays: true, leaveCode: true },
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

  // Làm tròn giờ >7.8 → 8 CHỈ để tính lương (bảng chấm công giữ nguyên số lẻ máy chấm).
  for (const a of attendanceData) {
    (a as any).workHours = roundShiftHours(a.workHours);
    (a as any).reconciledHours = roundShiftHours((a as any).reconciledHours);
    (a as any).otHours = roundShiftHours(a.otHours);
    (a as any).nightHours = roundShiftHours((a as any).nightHours);
    (a as any).otNightHours = roundShiftHours((a as any).otNightHours);
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
      // Lấy TẤT CẢ HĐ ĐÃ CÓ HIỆU LỰC (mới nhất trước) → chọn HĐ áp dụng cho kỳ ở pickContract() (có fallback).
      // Loại HĐ chấm dứt/từ chối/chờ duyệt + WAITING_SIGN (đợi ký — CHƯA hiệu lực, vẫn dùng HĐ cũ tính lương).
      contracts: {
        where: { status: { notIn: ["TERMINATED", "REJECTED", "PENDING_APPROVAL", "WAITING_SIGN"] } },
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

  // BHXH: hệ thống TỰ TÍNH theo Lương đóng BHXH (chốt 2026-07-01) — KHÔNG còn import.
  // Xem computeBhxh + điều kiện đóng (chính thức + ngày không lương ≤ 13) trong vòng tính từng NV.

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
        select: { employeeId: true, date: true, workHours: true, reconciledHours: true, otHours: true, otNightHours: true },
      }),
      prisma.oTRequest.findMany({
        where: { date: { gte: yearStart, lt: startDate }, status: "APPROVED" },
        select: { employeeId: true, date: true },
      }),
    ]);
    // (Pha 3) OT ngày thường các tháng trước cũng gate theo đơn duyệt (khớp cách tính kỳ này).
    const priorApprOt = new Set<string>();
    for (const o of priorOt) priorApprOt.add(`${o.employeeId}|${o.date.toISOString().slice(0, 10)}`);
    for (const a of priorAtt) {
      const d = new Date(a.date); const wh = (roundShiftHours((a as any).reconciledHours ?? a.workHours) as number) || 0, oh = (roundShiftHours(a.otHours) as number) || 0, onh = (roundShiftHours((a as any).otNightHours) as number) || 0; // ưu tiên giờ ĐÃ ĐỐI SOÁT + làm tròn >7.8→8
      // CN/Lễ: toàn bộ giờ làm ngày + OT đêm tính OT (không cần đơn). Ngày thường: OT (ngày+đêm) CHỈ khi có đơn duyệt.
      const isCnLe = isHoliday(d) || d.getUTCDay() === 0;
      const h = isCnLe ? wh + oh + onh : ((!REQUIRE_APPROVAL_FOR_LEAVE_OT || priorApprOt.has(`${a.employeeId}|${d.toISOString().slice(0, 10)}`)) ? oh + onh : 0);
      if (h > 0) priorOtMap[a.employeeId] = (priorOtMap[a.employeeId] || 0) + h;
    }
  }
  // ── GATE OT (Pha 3, chốt 2026-07-29) ──
  //   Giờ OT NGÀY THƯỜNG chỉ tính lương khi có ĐƠN TĂNG CA ĐÃ DUYỆT cho ngày đó. Đơn = ĐIỀU KIỆN;
  //   SỐ GIỜ lấy giờ THỰC trong file chấm công (KHÔNG cap theo giờ đơn). CN/Lễ: KHÔNG cần đơn.
  const apprOtDay = new Set<string>(); // "employeeId|YYYY-MM-DD" có đơn OT đã duyệt
  for (const o of otData) apprOtDay.add(`${o.employeeId}|${o.date.toISOString().slice(0, 10)}`);

  // M3: Nghỉ phép đã duyệt — phân loại có lương vs không lương
  const leaveData = await prisma.leaveRequest.findMany({
    where: {
      status: "APPROVED",
      startDate: { lte: endDate },
      endDate: { gte: startDate },
    },
    select: { employeeId: true, leaveType: true, totalDays: true, startDate: true, endDate: true },
  });

  // ── GATE nghỉ phép (chốt 2026-07-29): dựng tập NGÀY đã có ĐƠN NGHỈ DUYỆT ──
  //   Luật: mã đặc biệt (AL/CL/WL/ML/SL/MT) trên bảng công CHỈ được tính lương nếu có đơn nghỉ
  //   APPROVED phủ đúng ngày đó (duyệt là ĐIỀU KIỆN — kể cả duyệt bù cuối tháng cho ngày đầu tháng).
  //   Ngày file ghi KL nhưng có đơn duyệt → NÂNG thành nghỉ có lương (hồi tố). L (lễ) theo LỊCH,
  //   không cần đơn. UNPAID → không tạo gate.
  const BHXH_LEAVE_TYPES = new Set(["SICK", "MATERNITY", "PATERNITY"]);
  const apprLeaveDay = new Map<string, { bhxh: boolean }>(); // key: "empId|YYYY-MM-DD"
  for (const l of leaveData) {
    if (l.leaveType === "UNPAID") continue;
    const bhxh = BHXH_LEAVE_TYPES.has(l.leaveType);
    const s = new Date(l.startDate), e = new Date(l.endDate);
    let t = Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate());
    const eDay = Date.UTC(e.getUTCFullYear(), e.getUTCMonth(), e.getUTCDate());
    for (; t <= eDay; t += 86400000) {
      const dt = new Date(t);
      if (dt.getUTCDay() === 0) continue;                                                // bỏ Chủ Nhật
      if (dt.getUTCFullYear() !== period.year || dt.getUTCMonth() !== period.month - 1) continue; // chỉ trong tháng
      apprLeaveDay.set(`${l.employeeId}|${dt.toISOString().slice(0, 10)}`, { bhxh });
    }
  }

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
  // Đếm ngày có MÃ ĐẶC BIỆT (AL/CL/WL/ML/SL/MT) nhưng CHƯA có đơn duyệt → hiện dấu * + cảnh báo HCNS.
  const leaveNeedsApprovalMap: Record<string, number> = {};
  // Đếm GIỜ OT ngày thường trong file nhưng CHƯA có đơn tăng ca duyệt → dấu * + cảnh báo (OT đang KHÔNG tính).
  const otNeedsApprovalMap: Record<string, number> = {};
  const otMap: Record<string, { weekday: number; weekdayNight: number; sunday: number; sundayNight: number; holiday: number; holidayNight: number }> = {};
  const ensureOt = (id: string) => (otMap[id] ||= { weekday: 0, weekdayNight: 0, sunday: 0, sundayNight: 0, holiday: 0, holidayNight: 0 });
  // Ca đêm (HC Đ) — công đêm theo loại ngày (lương ×1.3/2.7/3.9). KHÁC OT đêm.
  const nightMap: Record<string, { weekday: number; sunday: number; holiday: number }> = {};
  const ensureNight = (id: string) => (nightMap[id] ||= { weekday: 0, sunday: 0, holiday: 0 });

  for (const a of attendanceData) {
    const d = new Date(a.date);
    const wh = ((a as any).reconciledHours ?? a.workHours) || 0; // ưu tiên giờ ĐÃ ĐỐI SOÁT (khai báo tổ)
    const oh = a.otHours || 0;
    const nh = (a as any).nightHours || 0;       // HC Đ — công ca đêm
    const onh = (a as any).otNightHours || 0;    // Thêm giờ Đ — OT ca đêm
    // GATE: ngày này có ĐƠN NGHỈ DUYỆT phủ không? (L lễ theo lịch → không cần đơn.)
    const appr = apprLeaveDay.get(`${a.employeeId}|${d.toISOString().slice(0, 10)}`);
    // GATE OT: ngày này có ĐƠN TĂNG CA DUYỆT không (TẮT gate → luôn true). Áp cho OT ngày thường + OT ĐÊM CN/Lễ.
    const hasOtReq = !REQUIRE_APPROVAL_FOR_LEAVE_OT || apprOtDay.has(`${a.employeeId}|${d.toISOString().slice(0, 10)}`);
    // Nghỉ phép CÓ LƯƠNG (AL) từ chấm công — CHỈ tính khi CÓ đơn duyệt (trừ khi TẮT gate).
    if ((a.paidLeaveDays || 0) > 0 && (appr || !REQUIRE_APPROVAL_FOR_LEAVE_OT)) {
      alDaysFromAttendance[a.employeeId] = (alDaysFromAttendance[a.employeeId] || 0) + (a.paidLeaveDays || 0);
    }
    // Phân loại mã nghỉ (gồm nửa ngày "0.5XX") — CL/WL/ML/SL/MT cũng CHỈ tính khi có đơn duyệt (trừ khi TẮT gate):
    const lvBase = leaveCodeBase(a.leaveCode);
    if ((lvBase === "CL" || lvBase === "WL" || lvBase === "ML") && (appr || !REQUIRE_APPROVAL_FOR_LEAVE_OT)) {  // công ty trả → leaveDays
      companyExtraLeaveMap[a.employeeId] = (companyExtraLeaveMap[a.employeeId] || 0) + leaveQty(a.leaveCode);
    } else if ((lvBase === "SL" || lvBase === "MT") && (appr || !REQUIRE_APPROVAL_FOR_LEAVE_OT)) {              // BHXH trả → chỉ hiển thị
      bhxhLeaveDaysMap[a.employeeId] = (bhxhLeaveDaysMap[a.employeeId] || 0) + leaveQty(a.leaveCode);
    } else if (lvBase === "L") {                                            // Nghỉ Lễ — theo LỊCH, KHÔNG cần đơn
      holidayCodeMap[a.employeeId] = (holidayCodeMap[a.employeeId] || 0) + leaveQty(a.leaveCode);
    }
    // Cảnh báo: mã đặc biệt (AL/CL/WL/ML/SL/MT) mà CHƯA có đơn duyệt → ngày này đang KHÔNG được tính lương (chỉ khi BẬT gate).
    if (((a.paidLeaveDays || 0) > 0 || ["CL", "WL", "ML", "SL", "MT"].includes(lvBase)) && !appr && REQUIRE_APPROVAL_FOR_LEAVE_OT) {
      leaveNeedsApprovalMap[a.employeeId] = (leaveNeedsApprovalMap[a.employeeId] || 0) + 1;
    }
    if (isHoliday(d)) {
      // Lễ — wh+oh → OT × hệ số (chốt 2026-06-08).
      //   - Comp Holiday → ×2 (HR coi như CN)
      //   - Lễ thường/Lễ rơi CN → ×3
      const compH = isCompensatoryHoliday(d);
      if (wh + oh > 0) (compH ? (ensureOt(a.employeeId).sunday += wh + oh) : (ensureOt(a.employeeId).holiday += wh + oh));
      if (nh > 0) (compH ? (ensureNight(a.employeeId).sunday += nh) : (ensureNight(a.employeeId).holiday += nh));
      // OT ĐÊM ngày CN/Lễ: CẦN đơn tăng ca duyệt (giống OT đêm ngày thường). Chưa đơn → không tính + cảnh báo.
      if (onh > 0 && hasOtReq) (compH ? (ensureOt(a.employeeId).sundayNight += onh) : (ensureOt(a.employeeId).holidayNight += onh));
      if (onh > 0 && !hasOtReq) otNeedsApprovalMap[a.employeeId] = (otNeedsApprovalMap[a.employeeId] || 0) + onh;
    } else if (d.getUTCDay() === 0) {
      if (wh + oh > 0) ensureOt(a.employeeId).sunday += wh + oh;
      if (nh > 0) ensureNight(a.employeeId).sunday += nh;
      if (onh > 0 && hasOtReq) ensureOt(a.employeeId).sundayNight += onh;   // OT đêm CN → cần đơn
      if (onh > 0 && !hasOtReq) otNeedsApprovalMap[a.employeeId] = (otNeedsApprovalMap[a.employeeId] || 0) + onh;
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
        const code = leaveCodeBase(a.leaveCode);
        if (UNPAID_NO_OFFSET.includes(code)) {
          // Mã "OT" = NGÀY NGHỈ không lương và KHÔNG bù trừ tăng ca (khác UL). Không cộng vào KL bù,
          //   không nâng thành có lương kể cả khi có đơn → OT được giữ nguyên cho tính lương tăng ca.
        } else {
        const isPaidCode = [...COMPANY_PAID_LEAVE, ...BHXH_LEAVE].includes(code); // AL/L/CL/WL/ML/SL/MT
        if (appr) {
          // Có đơn duyệt phủ ngày này:
          if (!isPaidCode) {
            // file ghi KL/không mã nhưng ĐƠN đã duyệt → NÂNG thành nghỉ có lương (hồi tố: nghỉ ngày 13,
            //   quên đơn → duyệt bù ngày 29 thì ngày 13 lại có lương). BHXH-type → cột nghỉ hưởng lương.
            if (appr.bhxh) bhxhLeaveDaysMap[a.employeeId] = (bhxhLeaveDaysMap[a.employeeId] || 0) + 1;
            else companyExtraLeaveMap[a.employeeId] = (companyExtraLeaveMap[a.employeeId] || 0) + 1;
          }
          // isPaidCode + appr: đã đếm ở khối phân loại mã phía trên → KHÔNG tính KL.
        } else {
          // KHÔNG có đơn duyệt:
          //  - Gate BẬT: mã đặc biệt (CL/WL/ML/SL/MT) chưa duyệt → KL (chờ duyệt mới có lương).
          //  - Gate TẮT: các mã đó ĐÃ được tính là nghỉ có lương/BHXH ở khối phân loại phía trên →
          //    KHÔNG tính KL lại (tránh double-count + bù nhầm bằng OT). Chỉ vắng KHÔNG mã / UL mới KL.
          if (REQUIRE_APPROVAL_FOR_LEAVE_OT || !isPaidCode) {
            unpaidWeekdayMap[a.employeeId] = (unpaidWeekdayMap[a.employeeId] || 0) + 1;
          }
        }
        }
      } else if (a.status === "ABSENT_APPROVED" && !appr && REQUIRE_APPROVAL_FOR_LEAVE_OT) {
        // AL cả ngày nhưng CHƯA có đơn duyệt → không lương → KL (chỉ khi BẬT gate).
        unpaidWeekdayMap[a.employeeId] = (unpaidWeekdayMap[a.employeeId] || 0) + (a.paidLeaveDays || 0);
      }
      // Nửa ngày KHÔNG lương (vd "0.5UL"): NV làm nửa ngày (HALF_DAY ở trên đã cộng công
      // phần làm) + nửa còn lại nghỉ không lương → tính phần nghỉ đó là KL để bù (như UL).
      const ulHalf = (a.leaveCode || "").toUpperCase().replace(",", ".").match(/^(\d*\.?\d+)UL$/);
      if (ulHalf && a.status === "HALF_DAY") {
        unpaidWeekdayMap[a.employeeId] = (unpaidWeekdayMap[a.employeeId] || 0) + parseFloat(ulHalf[1]);
      }
      // Nửa ngày phép AL đi kèm HALF_DAY (HC=4 + 0.5AL) mà CHƯA duyệt → nửa phép đó thành KL (chỉ khi BẬT gate).
      if (a.status === "HALF_DAY" && (a.paidLeaveDays || 0) > 0 && !appr && REQUIRE_APPROVAL_FOR_LEAVE_OT) {
        unpaidWeekdayMap[a.employeeId] = (unpaidWeekdayMap[a.employeeId] || 0) + (a.paidLeaveDays || 0);
      }
      // Nửa ngày phép (vd "0.5AL") mà KHÔNG đi làm phần còn lại → phần còn lại = KL (bù OT như ngày KL).
      //   HC=4 + 0.5AL  → status HALF_DAY (đã có đi làm) → phần kia là công làm, KHÔNG tính KL.
      //   HC trống + 0.5AL → status ABSENT_APPROVED_HALF (không đi làm) → (1 − số ngày phép) = KL.
      if (a.status === "ABSENT_APPROVED_HALF") {
        const gap = Math.max(0, 1 - (a.paidLeaveDays || 0));
        if (gap > 0) unpaidWeekdayMap[a.employeeId] = (unpaidWeekdayMap[a.employeeId] || 0) + gap;
        if (!appr && REQUIRE_APPROVAL_FOR_LEAVE_OT) unpaidWeekdayMap[a.employeeId] = (unpaidWeekdayMap[a.employeeId] || 0) + (a.paidLeaveDays || 0);
      }
      // Nghỉ phép có lương: đã cộng từ paidLeaveDays ở trên (không suy từ status nữa).
      // GATE OT ngày thường (hasOtReq tính ở đầu vòng): số giờ = giờ THỰC trong file. TẮT gate → tính hết.
      if ((oh + onh) > 0 && !hasOtReq) {
        otNeedsApprovalMap[a.employeeId] = (otNeedsApprovalMap[a.employeeId] || 0) + oh + onh; // OT chưa duyệt → cảnh báo
      }
      if (oh > 0 && hasOtReq) ensureOt(a.employeeId).weekday += oh;         // OT ngày thường (Thêm giờ N)
      if (nh > 0) ensureNight(a.employeeId).weekday += nh;                  // ca đêm ngày thường (HC Đ) → ×1.3 — KHÔNG phải OT, không gate
      if (onh > 0 && hasOtReq) ensureOt(a.employeeId).weekdayNight += onh;  // OT đêm ngày thường (Thêm giờ Đ) → ×2.0
    }
  }

  // Đăng ký suất ăn (M10 Nhà ăn) theo PHÒNG × NGÀY — để CHẶN tiền ăn OT ngày CN/Lễ:
  //   ngày CN/Lễ nếu PHÒNG của NV có đăng ký suất ăn (đã có cơm công ty) → KHÔNG trả tiền ăn OT.
  const mealRegsMonth = await prisma.mealRegistration.findMany({
    where: { date: { gte: startDate, lte: endDate } },
    select: { departmentId: true, date: true, lunchCount: true, dinnerCount: true, guestCount: true },
  });
  const mealRegSet = new Set<string>();
  for (const m of mealRegsMonth) {
    if (((m.lunchCount || 0) + (m.dinnerCount || 0) + (m.guestCount || 0)) > 0) mealRegSet.add(`${m.departmentId}|${m.date.toISOString().slice(0, 10)}`);
  }
  const empDeptMap: Record<string, string | null> = {};
  for (const e of employees) empDeptMap[e.id] = (e as any).departmentId ?? null;

  // ── TIỀN ĂN TĂNG GIỜ (chốt 2026-06-19; GỘP OT ngày+đêm 2026-06-26; sửa CN/Lễ 2026-08) ──
  // Tự tính từ chấm công, theo GIỜ THỰC TẾ trong file (giờ gốc, KHÁC lương OT). Thang: 2h≤…<4h → 15k; ≥4h → 20k; <2h → 0.
  //   NGÀY THƯỜNG (T2–T7, không lễ): tính theo tổng OT (OT ngày + OT đêm).
  //   CHỦ NHẬT + LỄ (kể cả nghỉ bù): làm là được tiền ăn (cả ngày là OT) → tính theo TỔNG GIỜ LÀM (HC+OT+đêm+OT đêm);
  //     NHƯNG nếu PHÒNG của NV có ĐĂNG KÝ SUẤT ĂN ngày đó (đã có cơm) → 0.
  const mealByOt = (h: number) => (h >= 4 ? 20000 : h >= 2 ? 15000 : 0);
  const mealOTMap: Record<string, number> = {};
  for (const a of attendanceData) {
    const d = new Date(a.date);
    let meal = 0;
    if (d.getUTCDay() === 0 || isHoliday(d)) {
      const deptId = empDeptMap[a.employeeId];
      const hasMeal = !!deptId && mealRegSet.has(`${deptId}|${d.toISOString().slice(0, 10)}`);
      if (!hasMeal) {
        const totalH = (((a as any).workHours) || 0) + (a.otHours || 0) + (((a as any).nightHours) || 0) + (((a as any).otNightHours) || 0);
        meal = mealByOt(totalH); // CN/Lễ: tổng giờ làm (cả ngày là OT)
      }
    } else {
      meal = mealByOt((a.otHours || 0) + (a.otNightHours || 0)); // ngày thường: gộp OT ngày + đêm
    }
    if (meal > 0) mealOTMap[a.employeeId] = (mealOTMap[a.employeeId] || 0) + meal;
  }

  // (Pha 3) OTRequest KHÔNG cộng giờ độc lập nữa — chỉ đóng vai trò ĐIỀU KIỆN (gate) cho OT ngày
  //   thường ở trên. SỐ GIỜ luôn lấy giờ THỰC trong file chấm công → tránh đếm 2 lần (file + đơn).

  // ── MIỄN THUẾ OT theo THỨ TỰ NGÀY (chốt 2026-07-03, theo HR) ───────────────
  // Cộng dồn giờ OT (THÔ, chưa nhân hệ số) từ ĐẦU THÁNG tới khi chạm mốc 200h/năm (đã trừ OT cộng dồn tháng trước).
  //   Phần giờ NẰM TRONG mốc → miễn thuế theo ĐÚNG hệ số của từng giờ (×1.5/×2/×2.7/×3…), KHÔNG chia đều tỉ lệ trung bình.
  //   Trả về TỈ LỆ miễn = Σ(giờ miễn × hệ số) / Σ(tất cả giờ OT × hệ số) → nhân với tiền OT để ra phần miễn.
  const OT_COEF = {
    weekday: SALARY_CONFIG.OT_RATE_WEEKDAY, weekdayNight: SALARY_CONFIG.OT_RATE_WEEKDAY_NIGHT,
    sunday: SALARY_CONFIG.OT_RATE_SUNDAY, sundayNight: SALARY_CONFIG.OT_RATE_SUNDAY_NIGHT,
    holiday: SALARY_CONFIG.OT_RATE_HOLIDAY, holidayNight: SALARY_CONFIG.OT_RATE_HOLIDAY_NIGHT,
  };
  const otEntries: Record<string, { t: number; raw: number; coef: number }[]> = {};
  const pushOt = (id: string, t: number, raw: number, coef: number) => {
    if (raw > 0) (otEntries[id] ||= []).push({ t, raw, coef });
  };
  for (const a of attendanceData) {
    const d = new Date(a.date); const t = d.getTime();
    const wh = ((a as any).reconciledHours ?? a.workHours) || 0, oh = a.otHours || 0, onh = (a as any).otNightHours || 0; // ưu tiên giờ ĐÃ ĐỐI SOÁT
    const hasOtReqT = !REQUIRE_APPROVAL_FOR_LEAVE_OT || apprOtDay.has(`${a.employeeId}|${d.toISOString().slice(0, 10)}`);
    if (isHoliday(d)) {
      const compH = isCompensatoryHoliday(d);
      pushOt(a.employeeId, t, wh + oh, compH ? OT_COEF.sunday : OT_COEF.holiday);
      if (hasOtReqT) pushOt(a.employeeId, t, onh, compH ? OT_COEF.sundayNight : OT_COEF.holidayNight); // OT đêm CN/Lễ cần đơn
    } else if (d.getUTCDay() === 0) {
      pushOt(a.employeeId, t, wh + oh, OT_COEF.sunday);
      if (hasOtReqT) pushOt(a.employeeId, t, onh, OT_COEF.sundayNight); // OT đêm CN cần đơn
    } else {
      // OT ngày thường: chỉ tính miễn thuế nếu có đơn duyệt (khớp gate lương ở trên). TẮT gate → tính hết.
      if (hasOtReqT) {
        pushOt(a.employeeId, t, oh, OT_COEF.weekday);
        pushOt(a.employeeId, t, onh, OT_COEF.weekdayNight);
      }
    }
  }
  // (Pha 3) KHÔNG push giờ OTRequest riêng — giờ OT đã lấy từ file ở trên (tránh đếm 2 lần).
  const otExemptRatioMap: Record<string, number> = {};
  for (const [id, entries] of Object.entries(otEntries)) {
    entries.sort((x, y) => x.t - y.t); // theo thứ tự NGÀY
    const totalConv = entries.reduce((s, e) => s + e.raw * e.coef, 0);
    let capRaw = Math.max(0, SALARY_CONFIG.OT_TAX_FREE_HOURS_YEAR - (priorOtMap[id] || 0)); // giờ OT còn được miễn trong năm
    let exemptConv = 0;
    for (const e of entries) {
      if (capRaw <= 0) break;
      const take = Math.min(e.raw, capRaw);  // phần giờ (thô) của mục này còn nằm trong mốc
      exemptConv += take * e.coef;           // quy đổi phần miễn theo ĐÚNG hệ số của mục
      capRaw -= take;
    }
    otExemptRatioMap[id] = totalConv > 0 ? exemptConv / totalConv : 0;
  }

  // ── AUTO-CAP PHÉP NĂM theo quỹ tích luỹ (chốt 2026-07-29, hướng B) ──
  //   Phép năm (AL) chỉ được trả lương trong QUỸ CÒN LẠI tới tháng này:
  //     accrued = floor(quota/12 × tháng)  −  AL đã dùng các THÁNG TRƯỚC (đơn ANNUAL đã duyệt).
  //   AL trong file VƯỢT quỹ còn lại → phần dư chuyển thành KL (không lương, bù OT như KL).
  //   (NV thử việc không tạo được đơn ANNUAL → không có appr → AL đã tự rớt ở gate, không tới đây.)
  const alEmpIds = Object.keys(alDaysFromAttendance).filter((id) => (alDaysFromAttendance[id] || 0) > 0);
  if (alEmpIds.length > 0) {
    const balances = await prisma.leaveBalance.findMany({
      where: { year: period.year, employeeId: { in: alEmpIds } },
      select: { employeeId: true, totalDays: true },
    });
    const quotaMap: Record<string, number> = {};
    for (const b of balances) quotaMap[b.employeeId] = b.totalDays;
    // AL đã dùng ở các THÁNG TRƯỚC trong năm (đơn ANNUAL đã duyệt, bắt đầu trước đầu tháng kỳ này).
    const priorAL = await prisma.leaveRequest.groupBy({
      by: ["employeeId"],
      where: {
        employeeId: { in: alEmpIds },
        leaveType: "ANNUAL",
        status: "APPROVED",
        startDate: { gte: new Date(period.year, 0, 1), lt: startDate },
      },
      _sum: { totalDays: true },
    });
    const priorMap: Record<string, number> = {};
    for (const p of priorAL) priorMap[p.employeeId] = p._sum.totalDays ?? 0;
    for (const empId of alEmpIds) {
      const quota = quotaMap[empId] ?? 12;
      const accrued = Math.floor((quota / 12) * period.month);
      const remaining = Math.max(0, accrued - (priorMap[empId] || 0));
      const alThis = alDaysFromAttendance[empId] || 0;
      if (alThis > remaining) {
        const excess = alThis - remaining;
        alDaysFromAttendance[empId] = remaining;                              // chỉ trả phần trong quỹ
        unpaidWeekdayMap[empId] = (unpaidWeekdayMap[empId] || 0) + excess;    // phần dư → KL
      }
    }
  }

  // 6 — Nghỉ phép có lương → hưởng theo Lương BHXH/CC.
  //   ĐƠN NGHỈ (LeaveRequest) KHÔNG cộng độc lập ở đây nữa — nó chỉ là ĐIỀU KIỆN (gate) + NÂNG ngày
  //   KL→có lương, đã xử lý trong vòng chấm công phía trên (apprLeaveDay). Ở đây chỉ gom AL (đã qua
  //   gate + cap quỹ) từ chấm công vào leavePaidMap; CL/WL/ML → companyExtraLeaveMap; SL/MT → bhxhLeaveDaysMap.
  const leavePaidMap: Record<string, number> = {};
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
  // Khoán kỳ này — cộng dồn nếu nhiều dòng/dự án cùng nhóm.
  //   • Theo TỔ (teamId): lịch sử ≤ T6/2026 (tổ SX cũ).
  //   • Theo XƯỞNG (departmentId): từ T7/2026 — Xưởng nay là phòng ban, NV không còn tổ (teamId=null).
  const khoanRecords = await prisma.pieceRateRecord.findMany({ where: { month: period.month, year: period.year } });
  const khoanByGroup: Record<string, number> = {}; // key: "dept:<id>" | "team:<id>"
  for (const r of khoanRecords) {
    const key = r.departmentId ? `dept:${r.departmentId}` : r.teamId ? `team:${r.teamId}` : null;
    if (!key) continue;
    khoanByGroup[key] = (khoanByGroup[key] || 0) + r.totalAmount;
  }
  // PASS 2: chia khoán cho từng NV trong nhóm (Xưởng hoặc Tổ).
  const luongKhoanMap: Record<string, number> = {};
  for (const [key, khoan] of Object.entries(khoanByGroup)) {
    const [type, gid] = [key.slice(0, 4), key.slice(5)];
    const members = employees.filter((e) =>
      (type === "dept" ? (e as any).departmentId === gid : (e as any).team?.id === gid) && timeInfo[e.id]);
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

    // ── BHXH TỰ TÍNH (chốt 2026-07-01, thay import) ──
    //   Đóng ĐỦ THÁNG khi: NV CHÍNH THỨC (HĐ ≠ Thử việc) VÀ số NGÀY KHÔNG LƯƠNG ≤ 13.
    //   Ngày không lương = CC − (công + phép/lễ) → tự gồm KL + ngày trước khi vào + sau khi nghỉ việc.
    const dongBhxh = (emp as any).dongBhxh !== false; // false = NV đóng BHXH nơi khác → công ty KHÔNG trừ BHXH
    const bhxhUnpaid = Math.max(0, Math.round(CC - (totalCong + leaveDays)));
    const payBhxh = dongBhxh && !isProbation && bhxhUnpaid <= 13;
    let bh = payBhxh
      ? computeBhxh(insuranceSalary)
      : { base: 0, bhxh8: 0, bhyt15: 0, bhtn1: 0, employee: 0, empSocial: 0, empHealth: 0, empUnemp: 0, employer: 0, total: 0 };

    // ── PHÁT SINH BHYT (nghỉ / tạm nghỉ báo trễ) — chốt theo yêu cầu HCNS ──
    //   Điều kiện: HR đã tích cờ (bhytPhatSinh) + tháng đó KHÔNG đủ ĐK đóng BHXH thường (payBhxh=false)
    //   NHƯNG NV CÓ đi làm (totalCong>0 → loại tháng nghỉ trọn) + tháng-kỳ nằm trong kỳ nghỉ.
    //   → Cộng BHYT 4,5% theo NGƯỜI CHỊU: NLD=NLĐ 4,5% | CTY=Cty 4,5% | SPLIT=NLĐ 1,5% + Cty 3%.
    let phatSinhParty: string | null = null;
    const bhytFlag = (emp as any).bhytPhatSinh as string | null;
    if (bhytFlag && dongBhxh && !payBhxh && totalCong > 0) {
      const rd = (emp as any).resignedDate ? new Date((emp as any).resignedDate) : null;
      const sf = (emp as any).suspendedFrom ? new Date((emp as any).suspendedFrom) : null;
      const stp = (emp as any).suspendedTo ? new Date((emp as any).suspendedTo) : null;
      const inResignMonth = !!rd && rd >= startDate && rd <= endDate;                 // nghỉ hẳn: đúng tháng nghỉ
      const inLeaveWindow = !!sf && !!stp && sf <= endDate && stp >= startDate;        // tạm nghỉ: kỳ giao khoảng nghỉ
      if (inResignMonth || inLeaveWindow) {
        const f = computeBhxh(insuranceSalary); // f.bhyt15 = BHYT 1,5% (NLĐ) · f.empHealth = BHYT 3% (Cty)
        const nldBhyt = bhytFlag === "CTY" ? 0 : bhytFlag === "SPLIT" ? f.bhyt15 : f.bhyt15 + f.empHealth;
        const ctyBhyt = bhytFlag === "NLD" ? 0 : bhytFlag === "SPLIT" ? f.empHealth : f.bhyt15 + f.empHealth;
        bh = { base: f.base, bhxh8: 0, bhyt15: nldBhyt, bhtn1: 0, employee: nldBhyt, empSocial: 0, empHealth: ctyBhyt, empUnemp: 0, employer: ctyBhyt, total: nldBhyt + ctyBhyt };
        phatSinhParty = bhytFlag;
      }
    }

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
      otTaxExemptRatio: otExemptRatioMap[emp.id], // tỉ lệ tiền OT miễn thuế (tính theo thứ tự ngày + đúng hệ số)
      importedBhxhEmployee: bh.employee, // BHXH NLĐ 10.5% (tự tính) — khoản trừ
      importedBhxhEmployer: bh.employer, // BHXH công ty 21.5% (tự tính) — báo cáo chi phí
    };

    const out = calculateSalary(input);

    // BHXH NLĐ tách 8% / 1.5% / 1% — TỰ TÍNH theo Lương đóng BHXH (0 nếu không thuộc diện đóng).
    const bhxh8 = bh.bhxh8;
    const bhyt15 = bh.bhyt15;
    const bhtn1 = bh.bhtn1;

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
      leaveNeedsApproval: leaveNeedsApprovalMap[emp.id] || 0, // số ngày mã đặc biệt CHƯA có đơn duyệt (đang bị KL) → HCNS nhắc
      otNeedsApproval: otNeedsApprovalMap[emp.id] || 0,       // số GIỜ OT ngày thường CHƯA có đơn tăng ca duyệt (đang KHÔNG tính)
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
      bhytPhatSinh: phatSinhParty,   // ≠null: kỳ này có phát sinh BHYT (NLD/CTY/SPLIT) do nghỉ báo trễ

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
