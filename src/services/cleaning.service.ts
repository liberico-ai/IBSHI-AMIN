import prisma from "@/lib/prisma";

export async function getZones() {
  return prisma.cleaningZone.findMany({
    where: { isActive: true },
    include: { schedules: { orderBy: { scheduledDate: "desc" }, take: 5 } },
    orderBy: { name: "asc" },
  });
}

export async function getSchedules(date?: string) {
  const where: any = {};
  if (date) {
    const d = new Date(date);
    where.scheduledDate = {
      gte: new Date(new Date(d).setHours(0, 0, 0, 0)),
      lte: new Date(new Date(d).setHours(23, 59, 59, 999)),
    };
  }
  return prisma.cleaningSchedule.findMany({
    where,
    include: { zone: true },
    orderBy: { scheduledDate: "asc" },
  });
}

export async function createIssue(data: {
  reportedBy: string;
  zoneName: string;
  description: string;
}) {
  return prisma.cleaningIssue.create({ data: { ...data, status: "REPORTED" } });
}
