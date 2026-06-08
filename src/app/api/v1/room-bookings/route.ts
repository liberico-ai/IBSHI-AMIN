import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { randomUUID } from "crypto";
import { generateDates, applyTimeToDate } from "@/lib/recurrence";

const CreateSchema = z.object({
  roomId: z.string().uuid(),
  startTime: z.string(),
  endTime: z.string(),
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  priorityNote: z.string().optional().nullable(),
  recurrence: z.object({
    // 1=T2..6=T7 (KHÔNG cho phép CN=0)
    daysOfWeek: z.array(z.number().int().min(1).max(6)).min(1),
    until: z.string().optional(),
  }).optional(),
});

// GET: list bookings — params:
//   ?roomId=X&date=YYYY-MM-DD — bookings của phòng X trong ngày (cho slot picker)
//   (default) tất cả booking APPROVED gần đây — mọi NV đều thấy
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const userId = (session.user as any).id;
  const me = await prisma.employee.findFirst({ where: { user: { id: userId } }, select: { id: true } });

  const { searchParams } = new URL(request.url);
  const roomId = searchParams.get("roomId");
  const date = searchParams.get("date");

  // Khi pick slot (có roomId+date): chỉ xem APPROVED + PENDING_APPROVAL để chặn slot bận.
  // Khi list tổng (không params): xem tất cả status để approver có thể duyệt + user thấy phiếu mình.
  let where: any = { status: { in: ["APPROVED", "PENDING_APPROVAL", "REJECTED", "CANCELLED"] } };

  if (roomId && date) {
    const day = new Date(date);
    const dayEnd = new Date(day); dayEnd.setDate(dayEnd.getDate() + 1);
    where = { roomId, status: { in: ["APPROVED", "PENDING_APPROVAL"] }, startTime: { gte: day, lt: dayEnd } };
  }

  const data = await prisma.roomBooking.findMany({
    where,
    orderBy: { startTime: "desc" },
    include: {
      room: { select: { id: true, name: true, code: true, capacity: true } },
      requester: { select: { id: true, code: true, fullName: true } },
    },
    take: roomId && date ? 200 : 100,
  });

  return NextResponse.json({ data, myEmployeeId: me?.id ?? null });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const userId = (session.user as any).id;
  const me = await prisma.employee.findFirst({ where: { user: { id: userId } }, select: { id: true } });
  if (!me) return NextResponse.json({ error: { code: "NO_EMPLOYEE", message: "User chưa có hồ sơ NV" } }, { status: 400 });

  const body = CreateSchema.parse(await request.json());
  const startTime = new Date(body.startTime);
  const endTime = new Date(body.endTime);
  if (endTime <= startTime) return NextResponse.json({ error: { code: "INVALID_TIME", message: "Giờ kết thúc phải sau giờ bắt đầu" } }, { status: 400 });

  // ── Lịch lặp lại (series) ──────────────────────────────────────────────────
  // KHÔNG check conflict — push lên duyệt, approver xử lý từng phiếu khi duyệt series.
  if (body.recurrence) {
    // Không có "đến ngày" → dùng cap 365 ngày từ ngày bắt đầu.
    const until = body.recurrence.until
      ? new Date(body.recurrence.until + "T23:59:59")
      : new Date(startTime.getTime() + 365 * 86400_000);
    if (until <= startTime) {
      return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Ngày kết thúc lặp phải sau ngày bắt đầu" } }, { status: 400 });
    }
    const dates = generateDates(startTime, until, body.recurrence.daysOfWeek);
    if (dates.length === 0) {
      return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Không có ngày nào phù hợp với kiểu lặp" } }, { status: 400 });
    }
    if (dates.length > 365) {
      return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Tối đa 365 phiếu / series" } }, { status: 400 });
    }
    const seriesId = randomUUID();
    try {
      // Dùng createMany — nhanh hơn 365 lần create + tránh transaction timeout.
      // Không cần ID trả về cho từng phiếu (chỉ cần seriesId + count).
      const result = await prisma.roomBooking.createMany({
        data: dates.map((d) => ({
          roomId: body.roomId,
          requesterId: me.id,
          startTime: applyTimeToDate(d, startTime),
          endTime: applyTimeToDate(d, endTime),
          title: body.title.trim(),
          description: body.description?.trim() || null,
          priorityNote: body.priorityNote?.trim() || null,
          status: "PENDING_APPROVAL" as const,
          seriesId,
        })),
      });
      return NextResponse.json({ data: { seriesId, count: result.count } }, { status: 201 });
    } catch (e: any) {
      console.error("[room-bookings series create] error:", e);
      return NextResponse.json({ error: { code: "CREATE_FAILED", message: e?.message || "Tạo series thất bại" } }, { status: 500 });
    }
  }

  // ── Đặt 1 lần (như cũ) — check conflict ──────────────────────────────────
  const conflicts = await prisma.roomBooking.findMany({
    where: {
      roomId: body.roomId,
      status: { in: ["APPROVED", "PENDING_APPROVAL"] },
      startTime: { lt: endTime },
      endTime: { gt: startTime },
    },
    select: { id: true, title: true, requester: { select: { fullName: true } } },
  });
  if (conflicts.length > 0) {
    return NextResponse.json({
      error: {
        code: "CONFLICT",
        message: `Phòng đã có booking trong khung giờ này: "${conflicts[0].title}" (${conflicts[0].requester.fullName})`,
      },
    }, { status: 409 });
  }

  const booking = await prisma.roomBooking.create({
    data: {
      roomId: body.roomId,
      requesterId: me.id,
      startTime, endTime,
      title: body.title.trim(),
      description: body.description?.trim() || null,
      priorityNote: body.priorityNote?.trim() || null,
      status: "APPROVED",
    },
  });
  return NextResponse.json({ data: booking }, { status: 201 });
}
