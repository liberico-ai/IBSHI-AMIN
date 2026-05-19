import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";

const Schema = z.object({ rsvp: z.enum(["ACCEPTED", "DECLINED"]) });

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const userId = (session.user as any).id;
  const me = await prisma.employee.findFirst({ where: { user: { id: userId } }, select: { id: true } });
  if (!me) return NextResponse.json({ error: { code: "NO_EMPLOYEE" } }, { status: 400 });

  const { id } = await params;
  const body = Schema.parse(await request.json());
  const attendee = await prisma.bookingAttendee.findUnique({
    where: { bookingId_employeeId: { bookingId: id, employeeId: me.id } },
  });
  if (!attendee) return NextResponse.json({ error: { code: "NOT_INVITED", message: "Bạn không được mời" } }, { status: 403 });

  const data = await prisma.bookingAttendee.update({
    where: { id: attendee.id },
    data: { rsvp: body.rsvp, respondedAt: new Date() },
  });
  return NextResponse.json({ data });
}
