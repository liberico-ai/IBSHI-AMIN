import prisma from "@/lib/prisma";
import { sendTelegramMessage } from "@/services/telegram.service";

export async function createNotification(data: {
  userId: string;
  title: string;
  message: string;
  type: "APPROVAL_REQUIRED" | "APPROVED" | "REJECTED" | "EXPIRY_WARNING" | "HSE_ALERT" | "SYSTEM";
  referenceType: string;
  referenceId: string;
}) {
  const notification = await prisma.notification.create({ data });

  // Telegram push — best-effort, non-blocking
  const user = await prisma.user.findUnique({
    where: { id: data.userId },
    select: { telegramChatId: true },
  });
  if (user?.telegramChatId) {
    const typeIcon: Record<string, string> = {
      APPROVAL_REQUIRED: "📋",
      APPROVED: "✅",
      REJECTED: "❌",
      EXPIRY_WARNING: "⚠️",
      HSE_ALERT: "🚨",
      SYSTEM: "ℹ️",
    };
    const icon = typeIcon[data.type] ?? "🔔";
    await sendTelegramMessage(
      user.telegramChatId,
      `${icon} <b>${data.title}</b>\n${data.message}`
    );
  }

  return notification;
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

export async function getNotifications(userId: string, limit = 20) {
  return prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
