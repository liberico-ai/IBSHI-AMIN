import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canDo } from "@/lib/permissions";
import { canViewPayroll } from "@/lib/access";
import { canUser } from "@/lib/permission-catalog";
import { z } from "zod";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }

  const { id } = await params;
  const userRole = (session.user as any).role;
  const userId = (session.user as any).id;

  const employee = await prisma.employee.findUnique({
    where: { id },
    include: {
      department: true,
      position: true,
      team: true,
      user: { select: { email: true, isActive: true } },
      contracts: { orderBy: { startDate: "desc" }, include: { addendums: { orderBy: { createdAt: "desc" } } } },
      certificates: { orderBy: { expiryDate: "asc" } },
      workHistory: { orderBy: { effectiveDate: "desc" } },
      leaveBalances: { where: { year: new Date().getFullYear() } },
      dependentsList: { orderBy: { createdAt: "asc" } },
      children: { orderBy: { dateOfBirth: "asc" } },
    },
  });

  // Ẩn nhân sự đã XÓA MỀM (mã "#DEL#…") — coi như không tồn tại.
  if (!employee || employee.code.startsWith("#DEL#")) {
    return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  }

  // RBAC check
  if (userRole === "EMPLOYEE" || userRole === "TEAM_LEAD") {
    if (employee.userId !== userId) {
      return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
    }
  } else if (userRole === "MANAGER") {
    const manager = await prisma.employee.findFirst({ where: { userId } });
    if (manager && employee.departmentId !== manager.departmentId) {
      return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
    }
  }

  // Tab Hợp đồng (lương trên HĐ) — ẩn với người không có quyền xem lương/HĐ (ma trận m1.hopdong:view).
  if (!canUser(session.user as any, "m1.hopdong:view")) {
    (employee as any).contracts = [];
  }

  return NextResponse.json({ data: employee });
}

const UpdateEmployeeSchema = z.object({
  code: z.string().min(1).optional(),   // Mã nhân viên (unique) — chỉ HR sửa
  // Thông tin cơ bản
  fullName: z.string().min(1).optional(),
  photo: z.string().optional().nullable(),
  gender: z.enum(["MALE", "FEMALE"]).optional(),
  dateOfBirth: z.string().optional(),
  idNumber: z.string().optional(),
  phone: z.string().regex(/^0\d{9}$/).optional(),
  currentAddress: z.string().optional(),
  address: z.string().optional(),
  // Thông tin công việc
  departmentId: z.string().uuid().optional(),
  teamId: z.string().uuid().nullable().optional(),
  jobRole: z.string().optional(),
  jobPosition: z.string().optional(),
  skillLevel: z.string().optional(),
  startDate: z.string().optional(),
  // HR khác
  bankAccount: z.string().optional(),
  bankName: z.string().optional(),
  bankAccounts: z.array(z.object({ bank: z.string(), accountNumber: z.string() })).max(5).optional(),
  taxCode: z.string().optional(),
  insuranceNumber: z.string().optional(),
  emergencyContact: z.string().optional(),
  emergencyPhone: z.string().optional(),
  status: z.enum(["ACTIVE", "PROBATION", "ON_LEAVE", "RESIGNED", "TERMINATED"]).optional(),
  resignedDate: z.string().nullable().optional(),   // ngày bắt đầu nghỉ việc (RESIGNED)
  suspendedFrom: z.string().nullable().optional(),  // tạm nghỉ từ (ON_LEAVE)
  suspendedTo: z.string().nullable().optional(),    // tạm nghỉ đến (ON_LEAVE)
});

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }

  const userRole = (session.user as any).role;
  const userId = (session.user as any).id;
  const { id } = await params;

  const employee = await prisma.employee.findUnique({ where: { id } });
  if (!employee) {
    return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  }

  // Tự sửa thông tin của mình luôn được; sửa hồ sơ người KHÁC cần quyền ma trận m1.hoso:edit.
  if (employee.userId !== userId && !canUser(session.user as any, "m1.hoso:edit")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const body = await request.json();
  const parsed = UpdateEmployeeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", details: parsed.error.issues } },
      { status: 400 }
    );
  }

  // Non-HR_ADMIN cannot change status
  const { dateOfBirth, startDate, resignedDate, suspendedFrom, suspendedTo, ...rest } = parsed.data;
  const updateData: any = { ...rest };
  if (dateOfBirth) updateData.dateOfBirth = new Date(dateOfBirth);
  if (startDate) updateData.startDate = new Date(startDate);
  if (!canUser(session.user as any, "m1.hoso:edit") && updateData.status) {
    delete updateData.status;
  }
  // Ngày nghỉ việc / tạm nghỉ — chỉ gắn khi NGƯỜI CÓ QUYỀN đổi trạng thái (status còn trong updateData).
  if (updateData.status !== undefined) {
    if (updateData.status === "ON_LEAVE") {
      if (!suspendedFrom || !suspendedTo) {
        return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Tạm nghỉ cần cả ngày bắt đầu và ngày kết thúc" } }, { status: 400 });
      }
      const f = new Date(suspendedFrom), t = new Date(suspendedTo);
      if (t < f) {
        return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Ngày kết thúc tạm nghỉ phải sau ngày bắt đầu" } }, { status: 400 });
      }
      updateData.suspendedFrom = f;
      updateData.suspendedTo = t;
      updateData.resignedDate = null;
    } else if (updateData.status === "RESIGNED" || updateData.status === "TERMINATED") {
      updateData.resignedDate = resignedDate ? new Date(resignedDate) : null;
      updateData.suspendedFrom = null;
      updateData.suspendedTo = null;
    } else {
      // ACTIVE / PROBATION → xoá hết ngày nghỉ/tạm nghỉ
      updateData.resignedDate = null;
      updateData.suspendedFrom = null;
      updateData.suspendedTo = null;
    }
  }
  // Tài khoản ngân hàng (tối đa 5): lọc TK hợp lệ + đồng bộ TK chính vào field cũ.
  if (updateData.bankAccounts !== undefined) {
    const cleaned = (updateData.bankAccounts || [])
      .map((a: any) => ({ bank: (a?.bank || "").trim(), accountNumber: (a?.accountNumber || "").trim() }))
      .filter((a: any) => a.bank && a.accountNumber)
      .slice(0, 5);
    updateData.bankAccounts = cleaned;
    updateData.bankAccount = cleaned[0]?.accountNumber ?? null;
    updateData.bankName = cleaned[0]?.bank ?? null;
  }

  // Sửa MÃ NHÂN VIÊN — chỉ người có quyền sửa hồ sơ; kiểm tra trùng (bỏ qua chính mình + bản #DEL#).
  if (updateData.code !== undefined) {
    if (!canUser(session.user as any, "m1.hoso:edit")) {
      delete updateData.code; // không đủ quyền → bỏ qua, không đổi mã
    } else {
      const newCode = String(updateData.code).trim();
      if (!newCode || newCode === employee.code) {
        delete updateData.code;
      } else {
        const dup = await prisma.employee.findFirst({ where: { code: newCode, id: { not: id } }, select: { id: true } });
        if (dup) return NextResponse.json({ error: { code: "DUPLICATE", message: `Mã nhân viên "${newCode}" đã tồn tại` } }, { status: 409 });
        updateData.code = newCode;
      }
    }
  }

  const updated = await prisma.employee.update({
    where: { id },
    data: { ...updateData, updatedAt: new Date() },
    include: { department: true, position: true },
  });

  await prisma.auditLog.create({
    data: {
      userId: (session.user as any).id,
      action: "UPDATE",
      entityType: "Employee",
      entityId: id,
      newValue: JSON.stringify(updateData),
    },
  });

  return NextResponse.json({ data: updated });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }

  if (!canUser(session.user as any, "m1.hoso:delete")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const { id } = await params;
  const employee = await prisma.employee.findUnique({
    where: { id },
    include: { user: true },
  });
  if (!employee) {
    return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  }

  // Soft delete
  await prisma.$transaction([
    prisma.employee.update({
      where: { id },
      data: { status: "RESIGNED" },
    }),
    prisma.user.update({
      where: { id: employee.userId },
      data: { isActive: false },
    }),
  ]);

  await prisma.auditLog.create({
    data: {
      userId: (session.user as any).id,
      action: "DELETE",
      entityType: "Employee",
      entityId: id,
      newValue: JSON.stringify({ status: "RESIGNED", isActive: false }),
    },
  });

  return NextResponse.json({ data: { success: true } });
}
