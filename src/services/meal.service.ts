import prisma from "@/lib/prisma";
import { MEAL_UNIT_PRICE } from "@/lib/constants";

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
