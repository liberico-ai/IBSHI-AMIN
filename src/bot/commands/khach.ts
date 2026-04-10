import { Bot } from "grammy";
import { IBSContext } from "../middleware/auth";
import prisma from "@/lib/prisma";

interface KhachSession {
  step: string;
  name?: string;
  company?: string;
  date?: string;
  purpose?: string;
}

const sessions: Record<string, KhachSession> = {};

const PURPOSE_MAP: Record<string, string> = {
  "1": "SURVEY",
  "2": "AUDIT",
  "3": "BUSINESS",
  "4": "FACTORY_TOUR",
  "5": "DELIVERY",
  "6": "OTHER",
};
const PURPOSE_LABELS: Record<string, string> = {
  SURVEY: "Khảo sát", AUDIT: "Audit", BUSINESS: "Họp kinh doanh",
  FACTORY_TOUR: "Thăm nhà máy", DELIVERY: "Giao nhận hàng", OTHER: "Khác",
};

export function registerKhach(bot: Bot<IBSContext>) {
  bot.command("khach", async (ctx) => {
    const chatId = String(ctx.from?.id);
    sessions[chatId] = { step: "name" };
    await ctx.reply(
      `👥 *Đăng ký khách*\n\nTên khách / đoàn:`,
      { parse_mode: "Markdown" }
    );
  });

  bot.on("message:text", async (ctx, next) => {
    const chatId = String(ctx.from?.id);
    const session = sessions[chatId];
    if (!session) return next();

    const text = ctx.message.text.trim();

    if (session.step === "name") {
      session.name = text;
      session.step = "company";
      await ctx.reply("🏢 Công ty / Tổ chức:");

    } else if (session.step === "company") {
      session.company = text;
      session.step = "date";
      await ctx.reply("📅 Ngày đến (dd/mm/yyyy, nhập 'today' cho hôm nay):");

    } else if (session.step === "date") {
      let dateStr: string;
      if (text.toLowerCase() === "today") {
        dateStr = new Date().toISOString().split("T")[0];
      } else {
        const parts = text.split("/");
        if (parts.length !== 3) {
          await ctx.reply("❌ Định dạng ngày không đúng. Nhập lại (dd/mm/yyyy):");
          return;
        }
        dateStr = `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
      }
      session.date = dateStr;
      session.step = "purpose";
      await ctx.reply(
        "🎯 Mục đích:\n1. Khảo sát\n2. Audit\n3. Họp kinh doanh\n4. Thăm nhà máy\n5. Giao nhận hàng\n6. Khác\n\nNhập số:"
      );

    } else if (session.step === "purpose") {
      const purposeKey = PURPOSE_MAP[text];
      if (!purposeKey) {
        await ctx.reply("❌ Nhập số từ 1-6:");
        return;
      }

      const emp = ctx.ibsEmployee!;
      try {
        await prisma.visitorRequest.create({
          data: {
            visitorName: session.name!,
            visitorCompany: session.company,
            visitorPhone: "",
            hostEmployeeId: emp.id,
            visitDate: new Date(session.date!),
            purpose: purposeKey as any,
            visitorCount: 1,
            status: "PENDING",
          },
        });

        delete sessions[chatId];
        await ctx.reply(
          `✅ *Đăng ký khách thành công!*\n\n` +
          `👤 Khách: ${session.name}\n` +
          `🏢 Công ty: ${session.company}\n` +
          `📅 Ngày: ${session.date}\n` +
          `🎯 Mục đích: ${PURPOSE_LABELS[purposeKey]}\n\n` +
          `Phòng HCNS sẽ duyệt và thông báo bảo vệ.`,
          { parse_mode: "Markdown" }
        );
      } catch {
        delete sessions[chatId];
        await ctx.reply("❌ Có lỗi xảy ra. Vui lòng thử lại sau.");
      }
    }
  });
}
