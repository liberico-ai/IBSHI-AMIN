import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// POST /api/v1/cron/leave-balance-init
// Run annually on Jan 1 (00:05) to allocate leave balances for all active employees.
// Schedule: "5 0 1 1 *"
// Secured with CRON_SECRET header.
export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-cron-secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }

  const year = new Date().getFullYear();

  // Fetch all active employees with their start date
  const employees = await prisma.employee.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, startDate: true },
  });

  let created = 0;
  let skipped = 0;

  await Promise.all(
    employees.map(async (emp) => {
      // Skip if balance for this year already exists
      const existing = await prisma.leaveBalance.findFirst({
        where: { employeeId: emp.id, year },
      });
      if (existing) { skipped++; return; }

      // Calculate seniority bonus: +1 day per 5 full years of service
      const yearsOfService = Math.floor(
        (Date.now() - new Date(emp.startDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000)
      );
      const seniorityBonus = Math.floor(yearsOfService / 5);
      const totalDays = 12 + seniorityBonus; // LEAVE_QUOTA = 12 base days

      await prisma.leaveBalance.create({
        data: {
          employeeId: emp.id,
          year,
          totalDays,
          usedDays: 0,
          remainingDays: totalDays,
        },
      });
      created++;
    })
  );

  return NextResponse.json({
    data: { year, created, skipped, total: employees.length },
  });
}
