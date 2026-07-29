import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canUser } from "@/lib/permission-catalog";
import { canDo } from "@/lib/permissions";
import { resolveScope, scopeWhere, applyScope, canActOnEmployeeScope } from "@/lib/data-scope.server";
import { z } from "zod";

const CreateCertificateSchema = z.object({
  employeeId: z.string().min(1),
  name: z.string().min(1),
  issuer: z.string().min(1),
  issueDate: z.string(),
  expiryDate: z.string().nullable().optional(),
  fileUrl: z.string().nullable().optional(),
});

// GET /api/v1/certificates — list certificates (with optional ?employeeId= filter)
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const userRole = (session.user as any).role;
  const userId = (session.user as any).id;
  const { searchParams } = new URL(request.url);
  const employeeId = searchParams.get("employeeId") || "";
  const expiringOnly = searchParams.get("expiring") === "true";

  const where: Record<string, unknown> = {};

  // Phạm vi dữ liệu (Chứng chỉ): mặc định NV = của mình, TP = phòng mình, HR = tất cả.
  const scope = await resolveScope(userId, userRole, "m5.chungchi");
  applyScope(where, scopeWhere(scope, {
    deptPath: (ids) => ({ employee: { departmentId: { in: ids } } }),
    selfPath: (empId) => ({ employeeId: empId }),
  }));
  // Người có quyền Sửa (HR) có thể lọc theo 1 NV cụ thể.
  if (employeeId && canUser(session.user as any, "m5.chungchi:edit")) where.employeeId = employeeId;

  if (expiringOnly) {
    const thirtyDays = new Date();
    thirtyDays.setDate(thirtyDays.getDate() + 30);
    where.status = { in: ["VALID", "EXPIRING_SOON"] };
    where.expiryDate = { lte: thirtyDays };
  }

  const certs = await prisma.certificate.findMany({
    where,
    include: {
      employee: {
        select: { id: true, code: true, fullName: true, department: { select: { name: true } } },
      },
    },
    orderBy: { issueDate: "desc" },
  });

  return NextResponse.json({ data: certs });
}

// POST /api/v1/certificates — create a new certificate (HR_ADMIN+)
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const userRole = (session.user as any).role;
  if (!canUser(session.user as any, "m5.chungchi:edit")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const body = await request.json();
  const parsed = CreateCertificateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", issues: parsed.error.issues } }, { status: 422 });
  }

  const employee = await prisma.employee.findUnique({ where: { id: parsed.data.employeeId } });
  if (!employee) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "Nhân viên không tồn tại" } }, { status: 404 });
  }
  // PHẠM VI: chỉ thêm chứng chỉ cho NV trong phạm vi được cấp (m5.chungchi).
  if (!(await canActOnEmployeeScope((session.user as any).id, userRole, "m5.chungchi", parsed.data.employeeId))) {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Nhân viên này ngoài phạm vi được cấp" } }, { status: 403 });
  }

  const cert = await prisma.certificate.create({
    data: {
      employeeId: parsed.data.employeeId,
      name: parsed.data.name,
      issuer: parsed.data.issuer,
      issueDate: new Date(parsed.data.issueDate),
      expiryDate: parsed.data.expiryDate ? new Date(parsed.data.expiryDate) : null,
      fileUrl: parsed.data.fileUrl ?? null,
      status: "VALID",
    },
    include: {
      employee: {
        select: { id: true, code: true, fullName: true, department: { select: { name: true } } },
      },
    },
  });

  return NextResponse.json({ data: cert }, { status: 201 });
}
