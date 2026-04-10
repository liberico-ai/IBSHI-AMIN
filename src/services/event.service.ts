import prisma from "@/lib/prisma";

export async function getEvents(filters: { status?: string; type?: string } = {}) {
  const where: any = {};
  if (filters.status) where.status = filters.status;
  if (filters.type) where.type = filters.type;
  return prisma.companyEvent.findMany({
    where,
    include: { checklist: { orderBy: { sortOrder: "asc" } } },
    orderBy: { startDate: "desc" },
  });
}

export async function createEvent(data: {
  title: string;
  type?: string;
  startDate: string;
  endDate?: string;
  location?: string;
  organizer: string;
  description?: string;
}) {
  return prisma.companyEvent.create({
    data: {
      title: data.title,
      type: (data.type as any) ?? "OTHER",
      startDate: new Date(data.startDate),
      endDate: data.endDate ? new Date(data.endDate) : null,
      location: data.location,
      organizer: data.organizer,
      description: data.description,
      status: "PLANNING",
    },
  });
}

export async function toggleChecklist(itemId: string, isCompleted: boolean) {
  return prisma.auditChecklist.update({
    where: { id: itemId },
    data: { isCompleted, completedAt: isCompleted ? new Date() : null },
  });
}
