import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canUser } from "@/lib/permission-catalog";
import { canDo } from "@/lib/permissions";
import { resolveScope, applyScope, canActOnDeptScope } from "@/lib/data-scope.server";
import { z } from "zod";

const CreateSchema = z.object({
  title: z.string().min(2),
  type: z.enum(["SAFETY", "TECHNICAL", "QUALITY", "MANAGEMENT", "ONBOARDING"]),
  departmentId: z.string().uuid().optional().nullable(),
  scheduledDate: z.string(),
  trainer: z.string().min(2),
  maxParticipants: z.number().int().min(1).default(30),
  description: z.string().optional().nullable(),
  materialUrl: z.string().optional().nullable(),
});

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") || "";
  const status = searchParams.get("status") || "";
  const departmentId = searchParams.get("departmentId") || "";

  const where: any = {};
  if (type) where.type = type;
  if (status) where.status = status;
  if (departmentId) where.departmentId = departmentId;

  // Phạm vi dữ liệu (Kế hoạch đào tạo): thấy KH của phòng trong phạm vi + KH toàn công ty (không gắn phòng)
  //  + KH mình có tham gia. HR = tất cả. NV thường mặc định = phòng mình + toàn công ty.
  const userId = (session.user as any).id;
  const userRole = (session.user as any).role;
  const scope = await resolveScope(userId, userRole, "m5.daotao");
  if (!("all" in scope)) {
    let deptIds = scope.deptIds;
    if (deptIds.length === 0) {
      const me = await prisma.employee.findFirst({ where: { userId }, select: { departmentId: true } });
      if (me?.departmentId) deptIds = [me.departmentId];
    }
    const or: any[] = [{ departmentId: null }];
    if (deptIds.length) or.push({ departmentId: { in: deptIds } });
    if (scope.selfEmpId) or.push({ records: { some: { employeeId: scope.selfEmpId } } });
    applyScope(where, { OR: or });
  }

  const data = await prisma.trainingPlan.findMany({
    where,
    include: {
      department: true,
      records: { select: { id: true, attended: true, employeeId: true } },
    },
    orderBy: { scheduledDate: "desc" },
  });

  return NextResponse.json({ data });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const userRole = (session.user as any).role;
  if (!canUser(session.user as any, "m5.daotao:create")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const body = await request.json();
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", issues: parsed.error.issues } }, { status: 422 });
  }
  // PHẠM VI: kế hoạch gắn phòng → phòng phải trong phạm vi (m5.daotao). Không gắn phòng = toàn cty (giữ nguyên).
  if (parsed.data.departmentId && !(await canActOnDeptScope((session.user as any).id, userRole, "m5.daotao", parsed.data.departmentId))) {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Phòng ban này ngoài phạm vi được cấp" } }, { status: 403 });
  }

  const plan = await prisma.trainingPlan.create({
    data: {
      ...parsed.data,
      scheduledDate: new Date(parsed.data.scheduledDate),
      status: "PLANNING",
    },
    include: { department: true },
  });

  return NextResponse.json({ data: plan }, { status: 201 });
}
