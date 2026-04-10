import prisma from "@/lib/prisma";

export async function getAvailableVehicles() {
  return prisma.vehicle.findMany({
    where: { status: "AVAILABLE", isActive: true },
    orderBy: { licensePlate: "asc" },
  });
}

export async function createBooking(data: {
  vehicleId: string;
  requestedBy: string;
  startDate: string;
  endDate: string;
  destination: string;
  purpose: string;
  passengers?: number;
}) {
  return prisma.vehicleBooking.create({
    data: {
      ...data,
      purpose: data.purpose as any,
      startDate: new Date(data.startDate),
      endDate: new Date(data.endDate),
      passengers: data.passengers ?? 1,
      status: "PENDING",
    },
    include: { vehicle: true },
  });
}

export async function approveBooking(id: string, approvedBy: string) {
  const booking = await prisma.vehicleBooking.update({
    where: { id },
    data: { status: "APPROVED", approvedBy, approvedAt: new Date() },
  });
  await prisma.vehicle.update({ where: { id: booking.vehicleId }, data: { status: "IN_USE" } });
  return booking;
}
