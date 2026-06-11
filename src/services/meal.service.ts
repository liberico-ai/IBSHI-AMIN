import prisma from "@/lib/prisma";
import { MEAL_UNIT_PRICE, MEAL_CUTOFF_HOUR } from "@/lib/constants";

// Chốt giờ đăng ký suất ăn THƯỜNG: trước 9h (giờ VN) ai cũng đăng ký được; từ 9h (cùng ngày)
// hoặc ngày đã qua → KHÓA với TẤT CẢ (kể cả HCNS), phải chuyển sang Đăng ký bổ sung.
// Tính theo UTC+7 để đúng giờ VN bất kể múi giờ server. Ngày tương lai vẫn cho đăng ký.
export function isAfterMealCutoff(dateStr: string): boolean {
  const nowVN = new Date(Date.now() + 7 * 3600 * 1000);
  const todayNum = nowVN.getUTCFullYear() * 10000 + nowVN.getUTCMonth() * 100 + nowVN.getUTCDate();
  const target = new Date(dateStr);
  const targetNum = target.getUTCFullYear() * 10000 + target.getUTCMonth() * 100 + target.getUTCDate();
  if (targetNum < todayNum) return true;   // ngày đã qua
  if (targetNum > todayNum) return false;  // ngày tương lai → cho phép
  return nowVN.getUTCHours() >= MEAL_CUTOFF_HOUR; // hôm nay: từ 9h trở đi
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
