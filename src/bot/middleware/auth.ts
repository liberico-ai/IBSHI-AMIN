import { Context, NextFunction } from "grammy";
import prisma from "@/lib/prisma";

export interface IBSContext extends Context {
  ibsEmployee?: {
    id: string;
    code: string;
    fullName: string;
    departmentId: string;
    userId: string;
    userRole: string;
  };
}

export async function verifyIBSEmployee(ctx: IBSContext, next: NextFunction) {
  const chatId = String(ctx.from?.id);
  if (!chatId) {
    await ctx.reply("❌ Không xác định được tài khoản Telegram.");
    return;
  }

  const user = await prisma.user.findFirst({
    where: { telegramChatId: chatId, isActive: true },
    include: {
      employee: {
        select: { id: true, code: true, fullName: true, departmentId: true },
      },
    },
  });

  if (!user || !user.employee) {
    await ctx.reply(
      "❌ Tài khoản Telegram chưa được liên kết với IBS.\n" +
      "Vui lòng liên hệ Phòng HCNS để được hỗ trợ."
    );
    return;
  }

  ctx.ibsEmployee = {
    id: user.employee.id,
    code: user.employee.code,
    fullName: user.employee.fullName,
    departmentId: user.employee.departmentId,
    userId: user.id,
    userRole: user.role,
  };

  return next();
}
