import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";

const CreateSchema = z.object({
  roomId: z.string().uuid(),
  startTime: z.string(),
  endTime: z.string(),
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  priorityNote: z.string().optional().nullable(),
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

  let where: any = { status: { in: ["APPROVED"] } };

  if (roomId && date) {
    const day = new Date(date);
    const dayEnd = new Date(day); dayEnd.setDate(dayEnd.getDate() + 1);
    where = { roomId, status: "APPROVED", startTime: { gte: day, lt: dayEnd } };
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

  // Check trùng — không cho tạo nếu đã có booking APPROVED/PENDING overlapping
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

  // Không cần duyệt — booking APPROVED ngay khi tạo.
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
