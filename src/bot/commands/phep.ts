import { Bot } from "grammy";
import { IBSContext } from "../middleware/auth";
import prisma from "@/lib/prisma";

export function registerPhep(bot: Bot<IBSContext>) {
  bot.command("phep", async (ctx) => {
    const emp = ctx.ibsEmployee!;
    const year = new Date().getFullYear();

    const balance = await prisma.leaveBalance.findFirst({
      where: { employeeId: emp.id, year },
    });

    if (!balance) {
      await ctx.reply(
        `📋 *Phép năm ${year}*\n\nChưa có dữ liệu phép năm ${year}.\nVui lòng liên hệ Phòng HCNS.`,
        { parse_mode: "Markdown" }
      );
      return;
    }

    // Count pending leave requests this year
    const pendingCount = await prisma.leaveRequest.count({
      where: { employeeId: emp.id, status: "PENDING" },
    });

    await ctx.reply(
      `📋 *Phép năm ${year} — ${emp.fullName}*\n\n` +
      `✅ Tổng phép: *${balance.totalDays} ngày*\n` +
      `📤 Đã dùng: *${balance.usedDays} ngày*\n` +
      `💚 Còn lại: *${balance.remainingDays} ngày*\n` +
      (pendingCount > 0 ? `\n⏳ Đang chờ duyệt: ${pendingCount} đơn` : ""),
      { parse_mode: "Markdown" }
    );
  });
}
