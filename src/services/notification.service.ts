import prisma from "@/lib/prisma";

export async function createNotification(data: {
  userId: string;
  title: string;
  message: string;
  type: "APPROVAL_REQUIRED" | "APPROVED" | "REJECTED" | "EXPIRY_WARNING" | "HSE_ALERT" | "SYSTEM";
  referenceType: string;
  referenceId: string;
}) {
  return prisma.notification.create({ data });
}

export async function markRead(id: string) {
  return prisma.notification.update({ where: { id }, data: { isRead: true } });
}

export async function markAllRead(userId: string) {
  return prisma.notification.updateMany({ where: { userId, isRead: false }, data: { isRead: true } });
}

export async function getUnreadCount(userId: string) {
  return prisma.notification.count({ where: { userId, isRead: false } });
}
