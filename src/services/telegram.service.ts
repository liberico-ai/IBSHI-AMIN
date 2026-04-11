const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

/**
 * Send a Telegram message to a chat ID.
 * Silently no-ops if no token or chatId is set.
 */
export async function sendTelegramMessage(chatId: string, text: string): Promise<void> {
  if (!BOT_TOKEN || !chatId) return;
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
    });
  } catch {
    // Telegram push is best-effort — never throw
  }
}
