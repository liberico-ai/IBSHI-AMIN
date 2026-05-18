import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// POST /api/v1/cron/contract-expiring
// Alert HCNS + NV + TP của họ khi HĐ sắp hết hạn 45 ngày.
// Chạy daily (gợi ý 07:00 sáng).
export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-cron-secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }

  const now = new Date();
  const thresholdDate = new Date();
  thresholdDate.setDate(thresholdDate.getDate() + 45);

  const expiring = await prisma.contract.findMany({
    where: {
      status: "ACTIVE",
      endDate: { lte: thresholdDate, gt: now },
      expiringAlertSentAt: null, // chưa gửi alert lần nào
    },
    include: {
      employee: {
        select: {
          id: true, code: true, fullName: true, userId: true, departmentId: true,
        },
      },
    },
  });

  if (expiring.length === 0) {
    return NextResponse.json({ data: { alerted: 0 } });
  }

  // Tất cả HCNS (HR_ADMIN) — gửi alert
  const hrUsers = await prisma.user.findMany({
    where: { role: "HR_ADMIN", isActive: true },
    select: { id: true },
  });
  const hrUserIds = hrUsers.map((u) => u.id);

  let alerted = 0;
  for (const c of expiring) {
    if (!c.endDate) continue;
    const daysLeft = Math.ceil((c.endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    const recipients = new Set<string>(hrUserIds);

    // Gửi NV
    if (c.employee.userId) recipients.add(c.employee.userId);

    // Gửi TP (MANAGER) của phòng ban NV
    if (c.employee.departmentId) {
      const managers = await prisma.employee.findMany({
        where: {
          departmentId: c.employee.departmentId,
          status: "ACTIVE",
          user: { role: "MANAGER" },
        },
        select: { userId: true },
      });
      managers.forEach((m) => { if (m.userId) recipients.add(m.userId); });
    }

    if (recipients.size > 0) {
      await prisma.notification.createMany({
        data: Array.from(recipients).map((userId) => ({
          userId,
          title: `HĐLĐ sắp hết hạn (${daysLeft} ngày)`,
          message: `HĐLĐ số ${c.contractNumber} của NV ${c.employee.fullName} (${c.employee.code}) sẽ hết hạn ngày ${c.endDate?.toLocaleDateString("vi-VN")}. Cần xử lý gia hạn / tái ký.`,
          type: "EXPIRY_WARNING",
          referenceType: "contract",
          referenceId: c.id,
        })),
      });
    }

    await prisma.contract.update({
      where: { id: c.id },
      data: { expiringAlertSentAt: now },
    });

    alerted++;
  }

  return NextResponse.json({ data: { alerted, total: expiring.length } });
}
