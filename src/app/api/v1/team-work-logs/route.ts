import { NextRequest, NextResponse } from "next/server";
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
const CreateSchema = z.object({
  date: z.string().transform((s) => new Date(s)),
  departmentId: z.string().uuid(),
  submit: z.boolean().optional(),           // true = gửi duyệt (PENDING); mặc định = lưu nháp (DRAFT)
  entries: z.array(EntrySchema).min(1, "Cần ít nhất 1 dòng kê khai"),
});

// GET — danh sách phiếu. Người có quyền Duyệt xem tất cả; còn lại xem phiếu MÌNH tạo.
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (!canUser(session.user as any, "m3.phieuto:view")) return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  const userId = (session.user as any).id;

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") || "";
  const from = searchParams.get("from") || "";
  const to = searchParams.get("to") || "";

  const where: any = {};
  // HR/BGĐ/ADMIN xem tất cả phiếu; còn lại (tổ trưởng) xem phiếu MÌNH tạo.
  const role = (session.user as any).role;
  if (!["HR_ADMIN", "BOM", "ADMIN"].includes(role)) where.createdById = userId;
  if (status) where.status = status;
  if (from || to) {
    where.date = {
      ...(from && { gte: new Date(new Date(from).setHours(0, 0, 0, 0)) }),
      ...(to && { lte: new Date(new Date(to).setHours(23, 59, 59, 999)) }),
    };
  }

  const data = await prisma.teamWorkLog.findMany({
    where,
    include: { entries: true },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: 100,
  });
  return NextResponse.json({ data });
}

// POST — tạo phiếu (nháp hoặc gửi duyệt).
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (!canUser(session.user as any, "m3.phieuto:create")) return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  const userId = (session.user as any).id;
  const role = (session.user as any).role;

  const parsed = CreateSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", issues: parsed.error.issues } }, { status: 422 });
  }
  const { date, departmentId, submit, entries } = parsed.data;

  const dept = await prisma.department.findUnique({ where: { id: departmentId }, select: { name: true } });
  if (!dept) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Phòng ban không tồn tại" } }, { status: 404 });

  // PHẠM VI: chỉ khai báo cho phòng/tổ trong phạm vi (m3.bangcong). Tổ trưởng mặc định = phòng mình
  //   (canActOnDeptScope fallback về phòng của chính mình khi chưa cấu hình); đầu mối = các phòng được cấp.
  if (!(await canActOnDeptScope(userId, role, "m3.bangcong", departmentId))) {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Phòng ban này ngoài phạm vi được cấp" } }, { status: 403 });
  }

  const log = await prisma.teamWorkLog.create({
    data: {
      date,
      departmentId,
      departmentName: dept.name,
      createdById: userId,
      status: submit ? "PENDING" : "DRAFT",
      entries: {
        create: entries.map((e) => ({
          employeeId: e.employeeId,
          employeeName: e.employeeName || "",
          employeeCode: e.employeeCode || null,
          projectCode: e.projectCode,
          hours: e.hours,
          workCode: e.workCode || null,
          categoryCode: e.categoryCode || null,
          reinforce: e.reinforce || null,
          category: e.category || "",
        })),
      },
    },
    include: { entries: true },
  });

  // Kê khai (submit) → tự SO KHỚP với chấm công; lệch thì đẩy sang tab Đối soát.
  if (submit) {
    await generateReconcileForLog({
      date, departmentId, departmentName: dept.name,
      entries: entries.map((e) => ({ employeeId: e.employeeId, employeeName: e.employeeName || "", hours: e.hours })),
    });
  }
  return NextResponse.json({ data: log }, { status: 201 });
}
