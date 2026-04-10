import { Bot } from "grammy";
import { IBSContext } from "../middleware/auth";
import prisma from "@/lib/prisma";

const sessions: Record<string, { step: string }> = {};

export function registerSuatAn(bot: Bot<IBSContext>) {
  bot.command("suatan", async (ctx) => {
    const chatId = String(ctx.from?.id);
    const emp = ctx.ibsEmployee!;

    // Fetch department name for display
    const dept = await prisma.department.findUnique({
      where: { id: emp.departmentId },
      select: { name: true },
    });

    sessions[chatId] = { step: "count" };
    await ctx.reply(
      `🍱 *Đăng ký suất ăn*\n\nPhòng ban: *${dept?.name ?? emp.departmentId}*\n\nSố suất trưa hôm nay (0-200):`,
      { parse_mode: "Markdown" }
    );
  });

  bot.on("message:text", async (ctx, next) => {
    const chatId = String(ctx.from?.id);
    const session = sessions[chatId];
    if (!session || session.step !== "count") return next();

    const count = parseInt(ctx.message.text.trim());
    if (isNaN(count) || count < 0 || count > 200) {
      await ctx.reply("❌ Số suất không hợp lệ (0-200). Nhập lại:");
      return;
    }

    const emp = ctx.ibsEmployee!;
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Check existing registration for this department today
      const existing = await prisma.mealRegistration.findUnique({
        where: { departmentId_date: { departmentId: emp.departmentId, date: today } },
      });

      if (existing) {
        delete sessions[chatId];
        await ctx.reply(
          `⚠️ Phòng ban đã đăng ký *${existing.lunchCount}* suất trưa hôm nay rồi.\n` +
          `Vui lòng liên hệ HCNS để cập nhật.`,
          { parse_mode: "Markdown" }
        );
        return;
      }

      await prisma.mealRegistration.create({
        data: {
          departmentId: emp.departmentId,
          date: today,
          lunchCount: count,
          dinnerCount: 0,
          guestCount: 0,
          registeredBy: emp.userId,
        },
      });

      delete sessions[chatId];
      await ctx.reply(
        `✅ *Đăng ký thành công!*\n\nĐã đăng ký *${count} suất trưa* cho phòng ban hôm nay.`,
        { parse_mode: "Markdown" }
      );
    } catch {
      delete sessions[chatId];
      await ctx.reply("❌ Có lỗi xảy ra. Vui lòng thử lại sau.");
    }
  });
}
