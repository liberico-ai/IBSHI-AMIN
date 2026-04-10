import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    // Lazy-import bot to avoid initialization errors when token is missing
    const { default: bot } = await import("@/bot");

    if (!bot) {
      return NextResponse.json({ ok: false, error: "Bot not configured" }, { status: 503 });
    }

    const body = await request.json();
    await bot.handleUpdate(body);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[Telegram webhook] Error:", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

// Verify webhook secret (optional but recommended)
export async function GET() {
  return NextResponse.json({ status: "IBS ONE Bot VP webhook active" });
}
