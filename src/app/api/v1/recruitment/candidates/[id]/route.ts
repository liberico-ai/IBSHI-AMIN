import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canDo } from "@/lib/permissions";
import { hash } from "bcryptjs";
import { z } from "zod";

const UpdateSchema = z.object({
  status: z.enum(["NEW","SCREENING","INTERVIEW","INTERVIEWED","OFFERED","ACCEPTED","REJECTED","WITHDRAWN"]).optional(),
  interviewDate: z.string().optional().nullable(),
  interviewNote: z.string().optional().nullable(),
  interviewScore: z.number().int().min(1).max(10).optional().nullable(),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const userRole = (session.user as any).role;
  if (!canDo(userRole, "recruitment", "create")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const { id } = await params;
  const candidate = await prisma.candidate.findUnique({
    where: { id },
    include: { recruitment: { include: { department: true } } },
  });
  if (!candidate) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });

  const body = await request.json();
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", issues: parsed.error.issues } }, { status: 422 });
  }

  const updateData: any = { ...parsed.data };
  if (parsed.data.interviewDate) updateData.interviewDate = new Date(parsed.data.interviewDate);

  const updated = await prisma.candidate.update({ where: { id }, data: updateData });

  // ── Auto-create Employee + User when ACCEPTED ──────────────────────────
  if (parsed.data.status === "ACCEPTED" && candidate.status !== "ACCEPTED") {
    try {
      // Generate next employee code
      const lastEmployee = await prisma.employee.findFirst({
        orderBy: { code: "desc" },
        select: { code: true },
      });
      const lastNum = lastEmployee ? parseInt(lastEmployee.code.replace("IBS-", ""), 10) : 0;
      const newCode = `IBS-${String(lastNum + 1).padStart(3, "0")}`;

      // Find or create a default "WORKER" position in the target department
      let defaultPosition = await prisma.position.findFirst({
        where: {
          departmentId: candidate.recruitment.departmentId,
          level: "WORKER",
        },
      });
      if (!defaultPosition) {
        // Fall back to any position in that department
        defaultPosition = await prisma.position.findFirst({
          where: { departmentId: candidate.recruitment.departmentId },
        });
      }
      if (!defaultPosition) {
        // Last resort: any position in the system
        defaultPosition = await prisma.position.findFirst();
      }
      if (!defaultPosition) {
        return NextResponse.json({
          error: { code: "SETUP_ERROR", message: "Không tìm thấy chức vụ nào. Vui lòng tạo chức vụ trước." },
        }, { status: 409 });
      }

      // Create User with temp password (123456, force change on first login)
      const tempPasswordHash = await hash("123456", 10);
      const candidateEmail = candidate.email ?? `${newCode.toLowerCase().replace("-", "")}@ibs.vn`;

      // Check email uniqueness
      const existingUser = await prisma.user.findFirst({ where: { email: candidateEmail } });
      const finalEmail = existingUser
        ? `${newCode.toLowerCase().replace("-", "")}${Date.now()}@ibs.vn`
        : candidateEmail;

      const newUser = await prisma.user.create({
        data: {
          employeeCode: newCode,
          email: finalEmail,
          passwordHash: tempPasswordHash,
          role: "EMPLOYEE",
          isActive: true,
          forcePasswordChange: true,
        },
      });

      // Create Employee record
      const newEmployee = await prisma.employee.create({
        data: {
          userId: newUser.id,
          code: newCode,
          fullName: candidate.fullName,
          gender: "MALE", // Default — HR will update later
          dateOfBirth: new Date("1990-01-01"), // Placeholder
          idNumber: "000000000000",           // Placeholder
          phone: candidate.phone || "",
          address: "",
          departmentId: candidate.recruitment.departmentId,
          positionId: defaultPosition.id,
          startDate: new Date(),
          status: "PROBATION",
          dependents: 0,
        },
      });

      // Create initial WorkHistory record
      await prisma.workHistory.create({
        data: {
          employeeId: newEmployee.id,
          eventType: "JOINED",
          toDepartment: candidate.recruitment.department.name,
          toPosition: defaultPosition.name,
          effectiveDate: new Date(),
          note: `Tuyển dụng từ ứng viên #${candidate.id}. Mật khẩu tạm: 123456`,
        },
      });

      // Create leave balance — new hire = 0 years seniority, starts with 12 days
      await prisma.leaveBalance.create({
        data: {
          employeeId: newEmployee.id,
          year: new Date().getFullYear(),
          totalDays: 12,
          usedDays: 0,
          remainingDays: 12,
        },
      });

      // HSE Induction — auto-create PENDING record for onboarding
      await prisma.hSEInduction.create({
        data: {
          employeeId: newEmployee.id,
          personType: "EMPLOYEE",
          inductionDate: new Date(),
          passed: false,
          status: "PENDING",
        },
      });

      // Notify HR_ADMIN users
      const hrAdmins = await prisma.user.findMany({
        where: { role: { in: ["HR_ADMIN", "BOM"] }, isActive: true },
        select: { id: true },
      });
      if (hrAdmins.length > 0) {
        await prisma.notification.createMany({
          data: hrAdmins.map((u) => ({
            userId: u.id,
            title: "Nhân viên mới đã được tạo",
            message: `Ứng viên ${candidate.fullName} đã được chấp nhận và tạo tài khoản ${newCode}. Vui lòng cập nhật đầy đủ hồ sơ.`,
            type: "SYSTEM" as const,
            referenceType: "employee",
            referenceId: newEmployee.id,
          })),
        });
      }

      return NextResponse.json({
        data: {
          ...updated,
          createdEmployee: {
            id: newEmployee.id,
            code: newCode,
            email: finalEmail,
            tempPassword: "123456",
          },
        },
      });
    } catch (err) {
      console.error("Auto-create employee failed:", err);
      // Don't fail the candidate status update — return it with a warning
      return NextResponse.json({
        data: updated,
        warning: "Cập nhật trạng thái thành công nhưng tạo tài khoản NV thất bại. Vui lòng tạo thủ công.",
      });
    }
  }

  return NextResponse.json({ data: updated });
}
