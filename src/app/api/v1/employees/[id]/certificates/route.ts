import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { checkPermission } from "@/lib/permissions";
import { z } from "zod";

const createCertificateSchema = z.object({
  name: z.string().min(1, "Tên chứng chỉ không được để trống"),
  issuer: z.string().min(1, "Đơn vị cấp không được để trống"),
  issueDate: z.string().min(1, "Ngày cấp không được để trống"),
  expiryDate: z.string().optional().nullable(),
  fileUrl: z.string().optional().nullable(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }

  const userRole = (session.user as any).role;
  if (!checkPermission(userRole, "HR_ADMIN")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const { id: employeeId } = await params;

  const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!employee) {
    return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  }

  const body = await req.json();
  const parsed = createCertificateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", issues: parsed.error.issues } },
      { status: 422 }
    );
  }

  const { name, issuer, issueDate, expiryDate, fileUrl } = parsed.data;

  const certificate = await prisma.certificate.create({
    data: {
      employeeId,
      name,
      issuer,
      issueDate: new Date(issueDate),
      expiryDate: expiryDate ? new Date(expiryDate) : null,
      fileUrl: fileUrl || null,
      status: "VALID",
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: (session.user as any).id,
      action: "CREATE",
      entityType: "Certificate",
      entityId: certificate.id,
      newValue: JSON.stringify({ name, issuer, issueDate }),
    },
  });

  return NextResponse.json({ data: certificate }, { status: 201 });
}
