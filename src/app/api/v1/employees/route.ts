import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canDo } from "@/lib/permissions";
import { z } from "zod";
import { hashSync } from "bcryptjs";

const CreateEmployeeSchema = z.object({
  fullName: z.string().min(2).max(100),
  gender: z.enum(["MALE", "FEMALE"]),
  dateOfBirth: z.string().transform((s) => new Date(s)),
  idNumber: z.string().regex(/^\d{9,12}$/, "Số CCCD phải có 9-12 chữ số"),
  phone: z.string().regex(/^0\d{9}$/, "Số điện thoại phải có 10 chữ số bắt đầu bằng 0"),
  address: z.string().min(5),
  currentAddress: z.string().optional(),
  departmentId: z.string().uuid(),
  positionId: z.string().uuid(),
  teamId: z.string().uuid().optional(),
  startDate: z.string().transform((s) => new Date(s)),
  salaryGrade: z.number().int().min(1).max(7).optional(),
  salaryCoefficient: z.number().min(1.0).max(10.0).optional(),
  bankAccount: z.string().optional(),
  bankName: z.string().optional(),
  insuranceNumber: z.string().optional(),
  emergencyContact: z.string().optional(),
  emergencyPhone: z.string().optional(),
});

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Chưa đăng nhập" } }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get("page") || "1");
  const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 100);
  const search = searchParams.get("search") || "";
  const departmentId = searchParams.get("departmentId") || "";
  const status = searchParams.get("status") || "";

  const userRole = (session.user as any).role;
  const userId = (session.user as any).id;

  // Build where clause based on role
  const where: Record<string, unknown> = {};

  if (userRole === "EMPLOYEE" || userRole === "TEAM_LEAD") {
    // Can only see themselves
    where.userId = userId;
  } else if (userRole === "MANAGER") {
    // Can see their department
    const manager = await prisma.employee.findFirst({ where: { userId } });
    if (manager) where.departmentId = manager.departmentId;
  }
  // HR_ADMIN and BOM can see all

  if (search) {
    where.OR = [
      { fullName: { contains: search, mode: "insensitive" } },
      { code: { contains: search, mode: "insensitive" } },
    ];
  }
  if (departmentId) where.departmentId = departmentId;
  if (status) where.status = status;

  const [data, total] = await Promise.all([
    prisma.employee.findMany({
      where,
      include: {
        department: true,
        position: true,
        team: true,
        contracts: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
      orderBy: { code: "asc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.employee.count({ where }),
  ]);

  return NextResponse.json({ data, total, page, limit });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }
  const userRole = (session.user as any).role;
  if (!canDo(userRole, "employees", "readAll")) {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Không có quyền tạo nhân viên" } }, { status: 403 });
  }

  const body = await request.json();
  const parsed = CreateEmployeeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Dữ liệu không hợp lệ", details: parsed.error.issues } },
      { status: 400 }
    );
  }

  const data = parsed.data;

  // Check idNumber uniqueness
  const existingById = await prisma.employee.findFirst({ where: { idNumber: data.idNumber } });
  if (existingById) {
    return NextResponse.json(
      { error: { code: "DUPLICATE", message: "Số CCCD/Passport đã tồn tại trong hệ thống" } },
      { status: 409 }
    );
  }

  // Get last employee code
  const lastEmployee = await prisma.employee.findFirst({ orderBy: { code: "desc" } });
  const lastCode = lastEmployee?.code || "IBS-000";
  const num = parseInt(lastCode.replace("IBS-", ""), 10);
  const newCode = `IBS-${String(num + 1).padStart(3, "0")}`;

  // Generate email from name
  const nameParts = data.fullName.toLowerCase().split(" ");
  const emailBase = nameParts[nameParts.length - 1] + "." + nameParts[0].charAt(0);
  const email = `${emailBase}@ibs.com.vn`;

  // Default password = last 6 digits of ID
  const defaultPassword = data.idNumber.slice(-6);
  const passwordHash = hashSync(defaultPassword, 10);

  const user = await prisma.user.create({
    data: {
      employeeCode: newCode,
      email,
      passwordHash,
      role: "EMPLOYEE",
      isActive: true,
    },
  });

  const employee = await prisma.employee.create({
    data: {
      userId: user.id,
      code: newCode,
      fullName: data.fullName,
      gender: data.gender,
      dateOfBirth: data.dateOfBirth,
      idNumber: data.idNumber,
      phone: data.phone,
      address: data.address,
      currentAddress: data.currentAddress,
      departmentId: data.departmentId,
      positionId: data.positionId,
      teamId: data.teamId,
      startDate: data.startDate,
      salaryGrade: data.salaryGrade,
      salaryCoefficient: data.salaryCoefficient,
      bankAccount: data.bankAccount,
      bankName: data.bankName,
      insuranceNumber: data.insuranceNumber,
      emergencyContact: data.emergencyContact,
      emergencyPhone: data.emergencyPhone,
      status: "ACTIVE",
    },
    include: { department: true, position: true },
  });

  // Work history - JOINED
  await prisma.workHistory.create({
    data: {
      employeeId: employee.id,
      eventType: "JOINED",
      toDepartment: employee.department.name,
      toPosition: employee.position.name,
      effectiveDate: data.startDate,
      note: "Gia nhập IBS Heavy Industry JSC",
    },
  });

  // Leave balance — 12 ngày cơ bản + 1 ngày/5 năm thâm niên (LEAVE_QUOTA.SENIORITY_BONUS)
  const now = new Date();
  const startDateObj = new Date(data.startDate);
  const yearsOfService = Math.floor(
    (now.getTime() - startDateObj.getTime()) / (365.25 * 24 * 60 * 60 * 1000)
  );
  const seniorityBonus = Math.floor(yearsOfService / 5); // +1 ngày mỗi 5 năm
  const totalLeaveDays = 12 + seniorityBonus;
  await prisma.leaveBalance.create({
    data: {
      employeeId: employee.id,
      year: now.getFullYear(),
      totalDays: totalLeaveDays,
      usedDays: 0,
      remainingDays: totalLeaveDays,
    },
  });

  // HSE Induction — auto-create PENDING record for new employee
  await prisma.hSEInduction.create({
    data: {
      employeeId: employee.id,
      personType: "EMPLOYEE",
      inductionDate: data.startDate,
      passed: false,
      status: "PENDING",
    },
  });

  // Audit log
  await prisma.auditLog.create({
    data: {
      userId: (session.user as any).id,
      action: "CREATE",
      entityType: "Employee",
      entityId: employee.id,
      newValue: JSON.stringify({ code: newCode, fullName: data.fullName }),
    },
  });

  return NextResponse.json({ data: employee }, { status: 201 });
}
