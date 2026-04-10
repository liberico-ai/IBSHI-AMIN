import { Bot, InlineKeyboard } from "grammy";
import { IBSContext } from "../middleware/auth";
import prisma from "@/lib/prisma";

const sessions: Record<string, { step: string; date?: string; time?: string; destination?: string }> = {};

const PURPOSE_MAP: Record<string, string> = {
  "1": "DELIVERY",
  "2": "CLIENT_PICKUP",
  "3": "BUSINESS_TRIP",
  "4": "PROCUREMENT",
  "5": "OTHER",
};
const PURPOSE_LABELS: Record<string, string> = {
  DELIVERY: "Giao hàng",
  CLIENT_PICKUP: "Đón khách",
  BUSINESS_TRIP: "Công tác",
  PROCUREMENT: "Mua vật tư",
  OTHER: "Khác",
};

export function registerDatXe(bot: Bot<IBSContext>) {
  bot.command("datxe", async (ctx) => {
    const chatId = String(ctx.from?.id);
    sessions[chatId] = { step: "date" };
    await ctx.reply(
      `🚗 *Đặt xe nhanh*\n\nNhập ngày đi (dd/mm/yyyy):`,
      { parse_mode: "Markdown" }
    );
  });

  bot.on("message:text", async (ctx, next) => {
    const chatId = String(ctx.from?.id);
    const session = sessions[chatId];
    if (!session) return next();

    const text = ctx.message.text.trim();

    if (session.step === "date") {
      // Validate date format dd/mm/yyyy
      const parts = text.split("/");
      if (parts.length !== 3 || parts[0].length > 2 || parts[1].length > 2 || parts[2].length !== 4) {
        await ctx.reply("❌ Định dạng ngày không đúng. Nhập lại theo dd/mm/yyyy:");
        return;
      }
      session.date = `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
      session.step = "time";
      await ctx.reply("⏰ Giờ đi (vd: 08:00):");

    } else if (session.step === "time") {
      if (!/^\d{1,2}:\d{2}$/.test(text)) {
        await ctx.reply("❌ Định dạng giờ không đúng (vd: 08:00). Nhập lại:");
        return;
      }
      session.time = text;
      session.step = "destination";
      await ctx.reply("📍 Điểm đến:");

    } else if (session.step === "destination") {
      session.destination = text;
      session.step = "purpose";
      await ctx.reply(
        "🎯 Mục đích:\n1. Giao hàng\n2. Đón khách\n3. Công tác\n4. Mua vật tư\n5. Khác\n\nNhập số (1-5):"
      );

    } else if (session.step === "purpose") {
      const purposeKey = PURPOSE_MAP[text];
      if (!purposeKey) {
        await ctx.reply("❌ Nhập số từ 1-5:");
        return;
      }

      // Create booking
      const emp = ctx.ibsEmployee!;
      try {
        // Find any available vehicle
        const vehicle = await prisma.vehicle.findFirst({
          where: { status: "AVAILABLE", isActive: true },
        });

        const booking = await prisma.vehicleBooking.create({
          data: {
            vehicleId: vehicle?.id ?? (await prisma.vehicle.findFirst({ select: { id: true } }))!.id,
            requestedBy: emp.id,
            startDate: new Date(`${session.date}T${session.time}:00`),
            endDate: new Date(`${session.date}T23:59:00`),
            destination: session.destination!,
            purpose: purposeKey as any,
            passengers: 1,
            status: "PENDING",
          },
        });

        delete sessions[chatId];
        await ctx.reply(
          `✅ *Đặt xe thành công!*\n\n` +
          `📅 Ngày: ${text}\n` +
          `⏰ Giờ: ${session.time}\n` +
          `📍 Điểm đến: ${session.destination}\n` +
          `🎯 Mục đích: ${PURPOSE_LABELS[purposeKey]}\n\n` +
          `Phòng HCNS sẽ xác nhận và gán xe cho bạn.`,
          { parse_mode: "Markdown" }
        );
      } catch {
        delete sessions[chatId];
        await ctx.reply("❌ Có lỗi xảy ra. Vui lòng thử lại sau.");
      }
    }
  });
}
