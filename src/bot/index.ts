import { Bot } from "grammy";
import { IBSContext, verifyIBSEmployee } from "./middleware/auth";
import { registerDatXe } from "./commands/dat-xe";
import { registerSuatAn } from "./commands/suat-an";
import { registerKhach } from "./commands/khach";
import { registerBaoVeSinh } from "./commands/bao-ve-sinh";
import { registerPhep } from "./commands/phep";
import { registerLuong } from "./commands/luong";

const token = process.env.TELEGRAM_BOT_TOKEN;

// Return null bot if no token (bot is optional)
if (!token) {
  console.warn("[Bot] TELEGRAM_BOT_TOKEN not set — Telegram bot disabled.");
}

const bot = token ? new Bot<IBSContext>(token) : null;

if (bot) {
  // Global auth middleware for all commands except /start
  bot.use(async (ctx, next) => {
    if (ctx.message?.text?.startsWith("/start")) return next();
    return verifyIBSEmployee(ctx, next);
  });

  // /start — link account
  bot.command("start", async (ctx) => {
    const chatId = String(ctx.from?.id);
    await ctx.reply(
      `👋 Chào mừng đến với *IBS ONE Bot VP*!\n\n` +
      `Để sử dụng bot, tài khoản Telegram của bạn cần được liên kết với hệ thống IBS ONE.\n\n` +
      `Chat ID của bạn: \`${chatId}\`\n\n` +
      `Vui lòng cung cấp ID này cho Phòng HCNS để liên kết tài khoản.\n\n` +
      `Sau khi liên kết, bạn có thể dùng:\n` +
      `/datxe — Đặt xe\n` +
      `/suatan — Đăng ký suất ăn\n` +
      `/khach — Đăng ký khách\n` +
      `/baovesinh — Báo phản ánh vệ sinh\n` +
      `/phep — Xem phép còn lại\n` +
      `/luong — Xem slip lương`,
      { parse_mode: "Markdown" }
    );
  });

  // /help
  bot.command("help", async (ctx) => {
    await ctx.reply(
      `📋 *Danh sách lệnh IBS ONE:*\n\n` +
      `/datxe — 🚗 Đặt xe công vụ\n` +
      `/suatan — 🍱 Đăng ký suất ăn\n` +
      `/khach — 👥 Đăng ký khách thăm\n` +
      `/baovesinh — 🧹 Báo phản ánh vệ sinh\n` +
      `/phep — 📋 Xem phép năm còn lại\n` +
      `/luong — 💰 Xem slip lương gần nhất`,
      { parse_mode: "Markdown" }
    );
  });

  // Register all command handlers
  registerDatXe(bot);
  registerSuatAn(bot);
  registerKhach(bot);
  registerBaoVeSinh(bot);
  registerPhep(bot);
  registerLuong(bot);

  // Fallback for unknown commands
  bot.on("message:text", async (ctx) => {
    if (ctx.message.text.startsWith("/")) {
      await ctx.reply("❓ Lệnh không hợp lệ. Gõ /help để xem danh sách lệnh.");
    }
  });
}

export default bot;
