import prisma from "@/lib/prisma";
import { MEAL_UNIT_PRICE, MEAL_CUTOFF_HOUR, MEAL_MAX_PAST_DAYS } from "@/lib/constants";

// Chốt đăng ký suất ăn THƯỜNG (giờ VN, UTC+7 để đúng bất kể múi giờ server):
//   - Ngày tương lai: cho đăng ký.
//   - Hôm nay: trước 9h ai cũng đăng ký được; từ 9h trở đi KHÓA.
//   - Quá khứ: CHO PHÉP bổ sung tối đa MEAL_MAX_PAST_DAYS ngày trước (vd Thứ 4 → tới Thứ 2);
//     xa hơn → KHÓA, phải chuyển sang Đăng ký bổ sung.
export function isAfterMealCutoff(dateStr: string): boolean {
  const nowVN = new Date(Date.now() + 7 * 3600 * 1000);
  const todayVN = Date.UTC(nowVN.getUTCFullYear(), nowVN.getUTCMonth(), nowVN.getUTCDate());
  const target = new Date(dateStr);
  const targetVN = Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), target.getUTCDate());
  const diffDays = Math.round((targetVN - todayVN) / 86400000); // <0 quá khứ, 0 hôm nay, >0 tương lai
  if (diffDays > 0) return false;                                  // tương lai → cho phép
  if (diffDays === 0) return nowVN.getUTCHours() >= MEAL_CUTOFF_HOUR; // hôm nay: từ 9h khóa
  return diffDays < -MEAL_MAX_PAST_DAYS;                            // quá khứ: -1..-2 cho phép; ≤ -3 khóa
}

// Sentinel dùng ở dropdown "Phòng ban" của form đăng ký suất ăn: chọn "Thầu phụ"
// thay vì một phòng ban thật. Backend ánh xạ sang phòng ban ẩn "Thầu phụ".
export const SUBCONTRACTOR_DEPT_SENTINEL = "SUBCONTRACTOR";
export const SUBCONTRACTOR_DEPT_CODE = "THAUPHU";

// Lấy id phòng ban ẩn "Thầu phụ" — nơi gom các suất ăn của nhà thầu phụ.
// isActive=false → KHÔNG xuất hiện ở các dropdown phòng ban khác (chỉ dùng nội bộ M10 nhà ăn).
export async function getSubcontractorDepartmentId(): Promise<string> {
  const dept = await prisma.department.upsert({
    where: { code: SUBCONTRACTOR_DEPT_CODE },
    create: { code: SUBCONTRACTOR_DEPT_CODE, name: "Thầu phụ", headcount: 0, isActive: false, sortOrder: 999 },
    update: {},
    select: { id: true },
  });
  return dept.id;
}

export async function registerMeals(data: {
  departmentId: string;
  date: string;
  lunchCount: number;
  dinnerCount?: number;
  guestCount?: number;
  specialNote?: string | null;
  registeredBy: string;
}) {
  const { departmentId, date, lunchCount, dinnerCount = 0, guestCount = 0, specialNote, registeredBy } = data;
  return prisma.mealRegistration.upsert({
    where: { departmentId_date: { departmentId, date: new Date(date) } },
    create: { departmentId, date: new Date(date), lunchCount, dinnerCount, guestCount, specialNote, registeredBy },
    update: { lunchCount, dinnerCount, guestCount, specialNote },
    include: { department: { select: { id: true, name: true } } },
  });
}

export async function getCostReport(month: number, year: number) {
  const startOfMonth = new Date(year, month - 1, 1);
  const endOfMonth = new Date(year, month, 0, 23, 59, 59);

  const regs = await prisma.mealRegistration.findMany({
    where: { date: { gte: startOfMonth, lte: endOfMonth } },
    include: { department: { select: { id: true, name: true } } },
  });

  const deptMap: Record<string, { name: string; lunchCount: number; dinnerCount: number; guestCount: number }> = {};
  for (const r of regs) {
    if (!deptMap[r.departmentId]) {
      deptMap[r.departmentId] = { name: r.department.name, lunchCount: 0, dinnerCount: 0, guestCount: 0 };
    }
    deptMap[r.departmentId].lunchCount += r.lunchCount;
    deptMap[r.departmentId].dinnerCount += r.dinnerCount;
    deptMap[r.departmentId].guestCount += r.guestCount;
  }

  return Object.entries(deptMap).map(([deptId, d]) => {
    const totalMeals = d.lunchCount + d.dinnerCount + d.guestCount;
    return {
      departmentId: deptId,
      departmentName: d.name,
      lunchCount: d.lunchCount,
      dinnerCount: d.dinnerCount,
      guestCount: d.guestCount,
      totalMeals,
      totalCost: totalMeals * MEAL_UNIT_PRICE,
      unitPrice: MEAL_UNIT_PRICE,
    };
  });
}

export async function getMenuForWeek(weekNumber: number, year: number) {
  return prisma.weeklyMenu.findMany({
    where: { weekNumber, year },
    orderBy: { dayOfWeek: "asc" },
  });
}
