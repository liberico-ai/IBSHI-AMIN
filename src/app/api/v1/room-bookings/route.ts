import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";

const CreateSchema = z.object({
  roomId: z.string().uuid(),
  startTime: z.string(),  // ISO
  endTime: z.string(),
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  priorityNote: z.string().optional().nullable(),
  attendeeIds: z.array(z.string().uuid()).optional().default([]),
});

// GET: list bookings — params:
//   ?view=mine   — phiếu NV tạo
//   ?view=invites — phiếu được mời
//   ?view=pending — phiếu chờ duyệt (chỉ approver)
//   ?roomId=X&date=YYYY-MM-DD — bookings của phòng X trong ngày (cho slot picker)
//   (default) all APPROVED bookings tuần này
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const userId = (session.user as any).id;
  const role = (session.user as any).role;
  const empCode = (session.user as any).employeeCode;
  const me = await prisma.employee.findFirst({ where: { user: { id: userId } }, select: { id: true } });

  const { searchParams } = new URL(request.url);
  const view = searchParams.get("view");
  const roomId = searchParams.get("roomId");
  const date = searchParams.get("date");

  let where: any = {};

  if (view === "mine") {
    where = me ? { requesterId: me.id } : { id: "__none__" };
  } else if (view === "invites") {
    where = me ? { attendees: { some: { employeeId: me.id } } } : { id: "__none__" };
  } else if (view === "pending") {
    if (role !== "HR_ADMIN" && role !== "BOM") return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
    where = { status: "PENDING_APPROVAL" };
  } else if (roomId && date) {
    const day = new Date(date);
    const dayEnd = new Date(day); dayEnd.setDate(dayEnd.getDate() + 1);
    where = {
      roomId,
      status: { in: ["APPROVED", "PENDING_APPROVAL"] },
      startTime: { gte: day, lt: dayEnd },
    };
  }

  const data = await prisma.roomBooking.findMany({
    where,
    orderBy: { startTime: "asc" },
    include: {
      room: { select: { id: true, name: true, code: true, capacity: true } },
      requester: { select: { id: true, code: true, fullName: true } },
      attendees: {
        include: { employee: { select: { id: true, code: true, fullName: true } } },
      },
    },
  });

  return NextResponse.json({ data, myEmployeeId: me?.id ?? null, role });
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

  const booking = await prisma.roomBooking.create({
    data: {
      roomId: body.roomId,
      requesterId: me.id,
      startTime, endTime,
      title: body.title.trim(),
      description: body.description?.trim() || null,
      priorityNote: body.priorityNote?.trim() || null,
      attendees: {
        create: body.attendeeIds.filter((id) => id !== me.id).map((id) => ({ employeeId: id })),
      },
    },
    include: { attendees: true },
  });
  return NextResponse.json({ data: booking }, { status: 201 });
}
