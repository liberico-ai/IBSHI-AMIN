import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// ─── In-memory rate limiter ──────────────────────────────────────────────────
// Track: chatId → { count, windowStart }
const rateLimitMap = new Map<string, { count: number; windowStart: number }>();
const RATE_LIMIT = 10;       // max requests
const RATE_WINDOW_MS = 60_000; // per 60 seconds

function isRateLimited(chatId: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(chatId);
  if (!entry || now - entry.windowStart > RATE_WINDOW_MS) {
    rateLimitMap.set(chatId, { count: 1, windowStart: now });
    return false;
  }
  entry.count++;
  return entry.count > RATE_LIMIT;
}

export async function POST(request: NextRequest) {
  try {
    // ── Signature verification ─────────────────────────────────────────────
    const secretToken = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (secretToken) {
      const headerToken = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
      if (headerToken !== secretToken) {
        return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
      }
    }

    const body = await request.json();

    // ── Idempotency: skip already-processed update_id (DB-backed) ────────
    const updateId: number | undefined = body?.update_id;
    if (updateId !== undefined) {
      try {
        await prisma.telegramUpdate.create({ data: { updateId } });
      } catch {
        // Unique constraint violation → already processed
        return NextResponse.json({ ok: true, skipped: true });
      }
      // Prune records older than 7 days to keep the table small
      prisma.telegramUpdate
        .deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } } })
        .catch(() => {});
    }

    // ── Rate limiting by chatId ────────────────────────────────────────────
    const chatId = String(
      body?.message?.chat?.id ??
      body?.callback_query?.message?.chat?.id ??
      "unknown"
    );
    if (isRateLimited(chatId)) {
      return NextResponse.json({ ok: false, error: "Rate limited" }, { status: 429 });
    }

    // ── Dispatch to bot ────────────────────────────────────────────────────
    const { default: bot } = await import("@/bot");
    if (!bot) {
      return NextResponse.json({ ok: false, error: "Bot not configured" }, { status: 503 });
    }

    await bot.handleUpdate(body);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[Telegram webhook] Error:", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ status: "IBS ONE Bot VP webhook active" });
}
