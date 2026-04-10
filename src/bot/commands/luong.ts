import { Bot } from "grammy";
import { IBSContext } from "../middleware/auth";
import prisma from "@/lib/prisma";

function fmt(n: number) {
  return new Intl.NumberFormat("vi-VN").format(n) + "đ";
}

export function registerLuong(bot: Bot<IBSContext>) {
  bot.command("luong", async (ctx) => {
    const emp = ctx.ibsEmployee!;

    const latestRecord = await prisma.payrollRecord.findFirst({
      where: { employeeId: emp.id },
      include: {
        period: { select: { month: true, year: true, status: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!latestRecord) {
      await ctx.reply(
        `💰 Chưa có dữ liệu lương. Vui lòng liên hệ Phòng Kế toán.`
      );
      return;
    }

    const p = latestRecord.period;
    const statusLabel: Record<string, string> = {
      DRAFT: "Bản nháp", PROCESSING: "Đang xử lý",
      APPROVED: "Đã duyệt", PAID: "Đã thanh toán",
    };

    await ctx.reply(
      `💰 *Lương T${p.month}/${p.year} — ${emp.fullName}*\n` +
      `Trạng thái: ${statusLabel[p.status] || p.status}\n\n` +
      `📅 Số công: *${latestRecord.workDays}/${latestRecord.standardDays} ngày*\n\n` +
      `*Thu nhập:*\n` +
      `• Lương cơ bản: ${fmt(latestRecord.baseSalary)}\n` +
      (latestRecord.pieceRateSalary > 0 ? `• Lương khoán: ${fmt(latestRecord.pieceRateSalary)}\n` : "") +
      (latestRecord.hazardAllowance > 0 ? `• PC độc hại: ${fmt(latestRecord.hazardAllowance)}\n` : "") +
      (latestRecord.responsibilityAllow > 0 ? `• PC trách nhiệm: ${fmt(latestRecord.responsibilityAllow)}\n` : "") +
      `• PC ăn trưa: ${fmt(latestRecord.mealAllowance)}\n` +
      (latestRecord.otPay > 0 ? `• Tiền OT: ${fmt(latestRecord.otPay)}\n` : "") +
      `➡️ Tổng TN: *${fmt(latestRecord.grossSalary)}*\n\n` +
      `*Khấu trừ:*\n` +
      `• BHXH+BHYT+BHTN: ${fmt(latestRecord.bhxh + latestRecord.bhyt + latestRecord.bhtn)}\n` +
      `• Thuế TNCN: ${fmt(latestRecord.tncn)}\n` +
      `➡️ Tổng KT: *${fmt(latestRecord.bhxh + latestRecord.bhyt + latestRecord.bhtn + latestRecord.tncn)}*\n\n` +
      `💚 *Thực lĩnh: ${fmt(latestRecord.netSalary)}*`,
      { parse_mode: "Markdown" }
    );
  });
}
