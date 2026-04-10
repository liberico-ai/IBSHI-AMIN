import { Bot } from "grammy";
import { IBSContext } from "../middleware/auth";
import prisma from "@/lib/prisma";

interface Session { step: string; zone?: string }
const sessions: Record<string, Session> = {};

export function registerBaoVeSinh(bot: Bot<IBSContext>) {
  bot.command("baovesinh", async (ctx) => {
    const chatId = String(ctx.from?.id);
    sessions[chatId] = { step: "zone" };
    await ctx.reply(
      `🧹 *Báo phản ánh vệ sinh*\n\nKhu vực cần báo (vd: Nhà xưởng SX, Văn phòng, Nhà ăn, Nhà vệ sinh):`,
      { parse_mode: "Markdown" }
    );
  });

  bot.on("message:text", async (ctx, next) => {
    const chatId = String(ctx.from?.id);
    const session = sessions[chatId];
    if (!session) return next();

    const text = ctx.message.text.trim();

    if (session.step === "zone") {
      session.zone = text;
      session.step = "description";
      await ctx.reply("📝 Mô tả vấn đề:");

    } else if (session.step === "description") {
      const emp = ctx.ibsEmployee!;
      try {
        const issue = await prisma.cleaningIssue.create({
          data: {
            reportedBy: emp.id,
            zoneName: session.zone!,
            description: text,
            status: "REPORTED",
          },
        });

        // Notify HCNS managers
        const managers = await prisma.user.findMany({
          where: { role: { in: ["HR_ADMIN", "MANAGER"] }, isActive: true },
          select: { id: true },
        });
        if (managers.length > 0) {
          await prisma.notification.createMany({
            data: managers.map((u) => ({
              userId: u.id,
              title: "Phản ánh vệ sinh mới",
              message: `${emp.fullName} báo cáo vấn đề tại "${session.zone}": ${text}`,
              type: "SYSTEM" as const,
              referenceType: "cleaning_issue",
              referenceId: issue.id,
            })),
          });
        }

        delete sessions[chatId];
        await ctx.reply(
          `✅ *Đã ghi nhận phản ánh!*\n\n` +
          `📍 Khu vực: ${session.zone}\n` +
          `📝 Mô tả: ${text}\n\n` +
          `Phòng HCNS sẽ xử lý và phản hồi sớm nhất.`,
          { parse_mode: "Markdown" }
        );
      } catch {
        delete sessions[chatId];
        await ctx.reply("❌ Có lỗi xảy ra. Vui lòng thử lại sau.");
      }
    }
  });
}
