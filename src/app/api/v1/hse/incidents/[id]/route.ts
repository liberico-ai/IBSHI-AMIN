import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canDo } from "@/lib/permissions";
import { z } from "zod";

const UpdateSchema = z.object({
  investigation: z.string().optional().nullable(),
  correctiveAction: z.string().optional().nullable(),
  status: z.enum(["REPORTED", "INVESTIGATING", "RESOLVED", "CLOSED"]).optional(),
  closedAt: z.string().optional().nullable(),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const userRole = (session.user as any).role;
  if (!canDo(userRole, "hse", "create")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const { id } = await params;
  const incident = await prisma.hSEIncident.findUnique({ where: { id } });
  if (!incident) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });

  const body = await request.json();
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", issues: parsed.error.issues } }, { status: 422 });
  }

  const updateData: any = { ...parsed.data };
  if (parsed.data.closedAt) updateData.closedAt = new Date(parsed.data.closedAt);
  // Auto-set closedAt when status → CLOSED
  if (parsed.data.status === "CLOSED" && !incident.closedAt) {
    updateData.closedAt = new Date();
  }

  const updated = await prisma.hSEIncident.update({
    where: { id },
    data: updateData,
    include: { reporter: { select: { id: true, code: true, fullName: true } } },
  });
  return NextResponse.json({ data: updated });
}
