import prisma from "@/lib/prisma";

export async function registerVisitor(data: {
  visitorName: string;
  visitorCompany?: string;
  visitorPhone: string;
  hostEmployeeId: string;
  visitDate: string;
  purpose: string;
  visitorCount?: number;
  needsMeal?: boolean;
  mealCount?: number;
  notes?: string;
}) {
  return prisma.visitorRequest.create({
    data: {
      ...data,
      purpose: data.purpose as any,
      visitDate: new Date(data.visitDate),
      visitorCount: data.visitorCount ?? 1,
      mealCount: data.mealCount ?? 0,
      status: "PENDING",
    },
    include: { host: { select: { fullName: true, department: { select: { name: true } } } } },
  });
}

export async function checkIn(id: string) {
  const visitor = await prisma.visitorRequest.update({
    where: { id },
    data: { status: "CHECKED_IN", checkedInAt: new Date() },
  });
  return visitor;
}

export async function checkOut(id: string) {
  return prisma.visitorRequest.update({
    where: { id },
    data: { status: "CHECKED_OUT", checkedOutAt: new Date() },
  });
}
