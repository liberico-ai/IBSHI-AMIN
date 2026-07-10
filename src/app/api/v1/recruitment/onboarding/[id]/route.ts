import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canDo } from "@/lib/permissions";
import { canUser } from "@/lib/permission-catalog";
import { z } from "zod";

const UpdateSchema = z.object({
  dueDate: z.string().datetime().optional().nullable(),
  status: z.enum(["IN_PROGRESS", "COMPLETED", "EXTENDED"]).optional(),
  markComplete: z.boolean().optional(),
});

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const userRole = (session.user as any).role;
  if (!canUser(session.user as any, "m4.tuyendung:view")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const data = await prisma.onboardingChecklist.findUnique({
    where: { id: params.id },
    include: {
      items: { orderBy: { sortOrder: "asc" } },
      employee: {
        select: {
          id: true, code: true, fullName: true, photo: true, status: true, startDate: true,
          department: { select: { id: true, name: true } },
          jobRole: true,
          position: { select: { id: true, name: true } },
        },
      },
    },
  });

  if (!data) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  return NextResponse.json({ data });
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const userRole = (session.user as any).role;
  if (!canUser(session.user as any, "m4.tuyendung:edit")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const body = await request.json();
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", issues: parsed.error.issues } }, { status: 422 });
  }

  const data: any = {};
  if (parsed.data.dueDate !== undefined) data.dueDate = parsed.data.dueDate ? new Date(parsed.data.dueDate) : null;
  if (parsed.data.status) data.status = parsed.data.status;
  if (parsed.data.markComplete) {
    data.status = "COMPLETED";
    data.completedAt = new Date();
  }

  const updated = await prisma.onboardingChecklist.update({
    where: { id: params.id },
    data,
    include: {
      items: { orderBy: { sortOrder: "asc" } },
      employee: {
        select: {
          id: true, code: true, fullName: true, photo: true, status: true, startDate: true,
          department: { select: { id: true, name: true } },
          jobRole: true,
          position: { select: { id: true, name: true } },
        },
      },
    },
  });

  return NextResponse.json({ data: updated });
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const userRole = (session.user as any).role;
  if (!canUser(session.user as any, "m4.tuyendung:delete")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  await prisma.onboardingChecklist.delete({ where: { id: params.id } });
  return NextResponse.json({ data: { ok: true } });
}
