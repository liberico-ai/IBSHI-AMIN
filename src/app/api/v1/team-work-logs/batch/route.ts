import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canUser } from "@/lib/permission-catalog";
import { canActOnDeptScope } from "@/lib/data-scope.server";
import { generateReconcileForLog } from "@/lib/attendance-reconcile";
import { z } from "zod";

const EntrySchema = z.object({
  employeeId: z.string().min(1),
  employeeName: z.string().optional().nullable(),
  employeeCode: z.string().optional().nullable(),
  projectCode: z.string().min(1, "Chọn dự án"),
  hours: z.number().positive("Giờ phải > 0"),
  workCode: z.string().optional().nullable(),
  categoryCode: z.string().optional().nullable(),
  reinforce: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
});
const BlockSchema = z.object({
  departmentId: z.string().uuid(),
  entries: z.array(EntrySchema).min(1, "Mỗi xưởng cần ít nhất 1 dòng"),
});
const BatchSchema = z.object({
  date: z.string().transform((s) => new Date(s)),
  submit: z.boolean().optional(),
  blocks: z.array(BlockSchema).min(1, "Cần ít nhất 1 xưởng"),
});

// POST — tạo 1 ĐỢT kê khai nhiều xưởng cùng lúc; mỗi xưởng = 1 TeamWorkLog, chung batchId.
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (!canUser(session.user as any, "m3.phieuto:create")) return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  const userId = (session.user as any).id;
  const role = (session.user as any).role;

  const parsed = BatchSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: { code: "VALIDATION_ERROR", issues: parsed.error.issues } }, { status: 422 });
  const { date, submit, blocks } = parsed.data;

  // Không cho trùng xưởng trong 1 đợt.
  const depIds = blocks.map((b) => b.departmentId);
  if (new Set(depIds).size !== depIds.length) return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Trùng xưởng trong 1 đợt" } }, { status: 422 });

  // Tải tên phòng + kiểm tra phạm vi từng xưởng trước khi ghi.
  const depts = await prisma.department.findMany({ where: { id: { in: depIds } }, select: { id: true, name: true } });
  const nameById = new Map(depts.map((d) => [d.id, d.name]));
  for (const b of blocks) {
    if (!nameById.has(b.departmentId)) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Phòng ban không tồn tại" } }, { status: 404 });
    if (!(await canActOnDeptScope(userId, role, "m3.bangcong", b.departmentId)))
      return NextResponse.json({ error: { code: "FORBIDDEN", message: `Xưởng ${nameById.get(b.departmentId)} ngoài phạm vi được cấp` } }, { status: 403 });
  }

  const batchId = randomUUID();
  const created = await prisma.$transaction(
    blocks.map((b) => prisma.teamWorkLog.create({
      data: {
        date, batchId, departmentId: b.departmentId, departmentName: nameById.get(b.departmentId)!,
        createdById: userId, status: submit ? "PENDING" : "DRAFT",
        entries: {
          create: b.entries.map((e) => ({
            employeeId: e.employeeId, employeeName: e.employeeName || "", employeeCode: e.employeeCode || null,
            projectCode: e.projectCode, hours: e.hours,
            workCode: e.workCode || null, categoryCode: e.categoryCode || null, reinforce: e.reinforce || null, category: e.category || "",
          })),
        },
      },
      include: { entries: true },
    })),
  );

  // Kê khai (submit) → tự SO KHỚP chấm công cho từng xưởng.
  if (submit) {
    for (const log of created) {
      await generateReconcileForLog({
        date, departmentId: log.departmentId, departmentName: log.departmentName,
        entries: log.entries.map((e) => ({ employeeId: e.employeeId, employeeName: e.employeeName, hours: e.hours })),
      });
    }
  }
  return NextResponse.json({ data: { batchId, count: created.length } }, { status: 201 });
}
