import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// POST /api/v1/cron/cleaning-schedules
// Auto-generate CleaningSchedule records for active zones based on their frequency.
// Schedule: "0 6 * * *" (daily at 06:00)
// DAILY zones → 1 schedule per day
// TWICE_DAILY zones → 2 schedules per day (06:00 + 14:00)
// WEEKLY zones → 1 schedule on Monday only
// Secured with CRON_SECRET header.
export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-cron-secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }

  const zones = await prisma.cleaningZone.findMany({
    where: { isActive: true },
    select: { id: true, frequency: true },
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dayOfWeek = today.getDay(); // 0=Sun, 1=Mon ... 6=Sat

  let created = 0;
  let skipped = 0;

  await Promise.all(
    zones.map(async (zone) => {
      // WEEKLY zones only generate on Monday
      if (zone.frequency === "WEEKLY" && dayOfWeek !== 1) {
        skipped++;
        return;
      }

      // Check if schedule already exists for today
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const existing = await prisma.cleaningSchedule.findFirst({
        where: { zoneId: zone.id, scheduledDate: { gte: today, lt: tomorrow } },
      });
      if (existing) { skipped++; return; }

      if (zone.frequency === "TWICE_DAILY") {
        // Morning slot: 06:00
        const morning = new Date(today);
        morning.setHours(6, 0, 0, 0);
        // Afternoon slot: 14:00
        const afternoon = new Date(today);
        afternoon.setHours(14, 0, 0, 0);
        await prisma.cleaningSchedule.createMany({
          data: [
            { zoneId: zone.id, scheduledDate: morning },
            { zoneId: zone.id, scheduledDate: afternoon },
          ],
        });
        created += 2;
      } else {
        // DAILY or WEEKLY: one slot at 07:00
        const slot = new Date(today);
        slot.setHours(7, 0, 0, 0);
        await prisma.cleaningSchedule.create({
          data: { zoneId: zone.id, scheduledDate: slot },
        });
        created++;
      }
    })
  );

  return NextResponse.json({
    data: { date: today.toISOString().slice(0, 10), created, skipped, zones: zones.length },
  });
}
