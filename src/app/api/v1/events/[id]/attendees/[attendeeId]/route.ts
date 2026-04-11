import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canDo } from "@/lib/permissions";

// PATCH /api/v1/events/:id/attendees/:attendeeId — mark attended (HR_ADMIN/BOM only)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; attendeeId: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const userRole = (session.user as any).role;
  if (!canDo(userRole, "events", "create")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const { attendeeId } = await params;
  const record = await prisma.eventAttendee.findUnique({ where: { id: attendeeId } });
  if (!record) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });

  const { attended } = await request.json();
  const updated = await prisma.eventAttendee.update({
    where: { id: attendeeId },
    data: { attended: Boolean(attended) },
    include: {
      employee: {
        select: { id: true, code: true, fullName: true, department: { select: { name: true } } },
      },
    },
  });

  return NextResponse.json({ data: updated });
}

// DELETE /api/v1/events/:id/attendees/:attendeeId — unenroll
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; attendeeId: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const userId = (session.user as any).id;
  const userRole = (session.user as any).role;
  const { attendeeId } = await params;

  const record = await prisma.eventAttendee.findUnique({
    where: { id: attendeeId },
    include: { employee: { select: { userId: true } } },
  });
  if (!record) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });

  // Only the enrollee themselves, or HR_ADMIN/BOM, can delete
  const isOwner = record.employee.userId === userId;
  const isAdmin = canDo(userRole, "events", "create");
  if (!isOwner && !isAdmin) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  await prisma.eventAttendee.delete({ where: { id: attendeeId } });
  return NextResponse.json({ data: { ok: true } });
}
