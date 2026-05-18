// Helper: tạo Employee + User + side effects (WorkHistory, LeaveBalance, HSE Induction)
// từ 1 Candidate. Được dùng ở 2 chỗ:
//   - offer-letters/[id]/mark-result (khi UV ACCEPTED) — đường chính
//   - candidates/[id] PUT (backward-compat, không dùng từ UI nữa)
// LUÔN gọi trong scope `prisma.$transaction(async (tx) => ...)` để đảm bảo atomic.

import { hash } from "bcryptjs";
import type { Prisma } from "@prisma/client";

export interface CreatedEmployee {
  id: string;
  code: string;
  email: string;
  tempPassword: string;
}

export async function createEmployeeFromCandidate(
  candidateId: string,
  tx: Prisma.TransactionClient,
): Promise<CreatedEmployee> {
  const candidate = await tx.candidate.findUnique({
    where: { id: candidateId },
    include: { recruitment: { include: { department: true } } },
  });
  if (!candidate) throw new Error("Candidate not found");

  // Mã NV kế tiếp
  const lastEmp = await tx.employee.findFirst({
    orderBy: { code: "desc" },
    select: { code: true },
  });
  const lastNum = lastEmp ? parseInt(lastEmp.code.replace("IBS-", ""), 10) : 0;
  const newCode = `IBS-${String(lastNum + 1).padStart(3, "0")}`;

  // Vị trí mặc định trong phòng ban (ưu tiên WORKER, fallback any)
  let defaultPosition = await tx.position.findFirst({
    where: { departmentId: candidate.recruitment.departmentId, level: "WORKER" },
  });
  if (!defaultPosition) {
    defaultPosition = await tx.position.findFirst({
      where: { departmentId: candidate.recruitment.departmentId },
    });
  }
  if (!defaultPosition) {
    defaultPosition = await tx.position.findFirst();
  }
  if (!defaultPosition) {
    throw new Error("Không tìm thấy chức vụ nào trong hệ thống. Vui lòng tạo chức vụ trước.");
  }

  // Email + temp password
  const tempPassword = "123456";
  const tempHash = await hash(tempPassword, 10);
  const baseEmail = candidate.email ?? `${newCode.toLowerCase().replace("-", "")}@ibs.vn`;
  const existing = await tx.user.findFirst({ where: { email: baseEmail } });
  const finalEmail = existing
    ? `${newCode.toLowerCase().replace("-", "")}${Date.now()}@ibs.vn`
    : baseEmail;

  // User
  const newUser = await tx.user.create({
    data: {
      employeeCode: newCode,
      email: finalEmail,
      passwordHash: tempHash,
      role: "EMPLOYEE",
      isActive: true,
      forcePasswordChange: true,
    },
  });

  // Employee — placeholder fields, HCNS sẽ update hồ sơ sau
  const newEmp = await tx.employee.create({
    data: {
      userId: newUser.id,
      code: newCode,
      fullName: candidate.fullName,
      gender: "MALE",
      dateOfBirth: new Date("1990-01-01"),
      idNumber: "000000000000",
      phone: candidate.phone || "",
      address: "",
      departmentId: candidate.recruitment.departmentId,
      positionId: defaultPosition.id,
      startDate: new Date(),
      status: "PROBATION",
      dependents: 0,
    },
  });

  // WorkHistory
  await tx.workHistory.create({
    data: {
      employeeId: newEmp.id,
      eventType: "JOINED",
      toDepartment: candidate.recruitment.department.name,
      toPosition: defaultPosition.name,
      effectiveDate: new Date(),
      note: `Tuyển dụng từ ứng viên #${candidate.id}. Mật khẩu tạm: ${tempPassword}`,
    },
  });

  // LeaveBalance — 12 ngày phép cho NV mới
  await tx.leaveBalance.create({
    data: {
      employeeId: newEmp.id,
      year: new Date().getFullYear(),
      totalDays: 12,
      usedDays: 0,
      remainingDays: 12,
    },
  });

  // HSE Induction — PENDING (sẽ cập nhật khi NV hoàn thành khoá HSE)
  await tx.hSEInduction.create({
    data: {
      employeeId: newEmp.id,
      personType: "EMPLOYEE",
      inductionDate: new Date(),
      passed: false,
      status: "PENDING",
    },
  });

  return {
    id: newEmp.id,
    code: newCode,
    email: finalEmail,
    tempPassword,
  };
}

// Gọi outside transaction để gửi notification sau khi tạo NV thành công
export async function notifyEmployeeCreated(
  prisma: { user: any; notification: any },
  newEmployeeId: string,
  candidateName: string,
  newCode: string,
): Promise<void> {
  const hrAdmins = await prisma.user.findMany({
    where: { role: { in: ["HR_ADMIN", "BOM"] }, isActive: true },
    select: { id: true },
  });
  if (hrAdmins.length === 0) return;
  await prisma.notification.createMany({
    data: hrAdmins.map((u: { id: string }) => ({
      userId: u.id,
      title: "Nhân viên mới đã được tạo",
      message: `Ứng viên ${candidateName} đã được chấp nhận và tạo tài khoản ${newCode}. Vui lòng cập nhật đầy đủ hồ sơ.`,
      type: "SYSTEM" as const,
      referenceType: "employee",
      referenceId: newEmployeeId,
    })),
  });
}
