import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canDo } from "@/lib/permissions";
import { z } from "zod";

const UpdateCertificateSchema = z.object({
  name: z.string().min(1).optional(),
  issuer: z.string().min(1).optional(),
  issueDate: z.string().optional(),
  expiryDate: z.string().nullable().optional(),
  status: z.enum(["VALID", "EXPIRING_SOON", "EXPIRED", "REVOKED"]).optional(),
  fileUrl: z.string().nullable().optional(),
});

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }

  const userRole = (session.user as any).role;
  if (!canDo(userRole, "contracts", "update")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const { id } = await params;
  const certificate = await prisma.certificate.findUnique({ where: { id } });
  if (!certificate) {
    return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  }

  const body = await req.json();
  const parsed = UpdateCertificateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", issues: parsed.error.issues } },
      { status: 422 }
    );
  }

  const data = parsed.data;
  const updateData: any = { ...data };
  if (data.issueDate) updateData.issueDate = new Date(data.issueDate);
  if (data.expiryDate) updateData.expiryDate = new Date(data.expiryDate);
  if (data.expiryDate === null) updateData.expiryDate = null;

  const updated = await prisma.certificate.update({ where: { id }, data: updateData });

  await prisma.auditLog.create({
    data: {
      userId: (session.user as any).id,
      action: "UPDATE",
      entityType: "Certificate",
      entityId: id,
      oldValue: JSON.stringify(certificate),
      newValue: JSON.stringify(updateData),
    },
  });

  return NextResponse.json({ data: updated });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }

  const userRole = (session.user as any).role;
  if (!canDo(userRole, "contracts", "update")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const { id } = await params;
  const certificate = await prisma.certificate.findUnique({ where: { id } });
  if (!certificate) {
    return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  }

  await prisma.certificate.update({ where: { id }, data: { status: "REVOKED" } });

  return NextResponse.json({ data: { success: true } });
}
