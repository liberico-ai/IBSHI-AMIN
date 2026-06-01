// Helper: tạo Employee + User + side effects (WorkHistory, LeaveBalance, HSE Induction)
// từ 1 Candidate. Được dùng ở 2 chỗ:
//   - offer-letters/[id]/mark-result (khi UV ACCEPTED) — đường chính
//   - candidates/[id] PUT (backward-compat, không dùng từ UI nữa)
// LUÔN gọi trong scope `prisma.$transaction(async (tx) => ...)` để đảm bảo atomic.

import { hash } from "bcryptjs";
import type { Prisma } from "@prisma/client";
import { uniqueCompanyEmail } from "@/lib/email-gen";

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

  // Mã NV kế tiếp — theo dãy 190xxx (erpCode), lấy MAX của các mã dạng 19xxxx rồi +1.
  const allEmps = await tx.employee.findMany({ select: { code: true } });
  let maxNum = 0;
  for (const e of allEmps) {
    if (/^19\d{4}$/.test(e.code)) {
      const n = parseInt(e.code, 10);
      if (n > maxNum) maxNum = n;
    }
  }
  const newCode = maxNum > 0 ? String(maxNum + 1) : "190001";

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

  // Email công ty theo tên (<tên><chữ đầu họ+đệm>@ibs.com.vn) + temp password
  const tempPassword = "123456";
  const tempHash = await hash(tempPassword, 10);
  const finalEmail = await uniqueCompanyEmail(candidate.fullName, async (email) => {
    return !!(await tx.user.findFirst({ where: { email } }));
  });

  // User
  const newUser = await tx.user.create({
    data: {
      employeeCode: newCode,
      erpCode: newCode, // = mã 190xxx để chấm công M3 import khớp đúng NV
      email: finalEmail,
      passwordHash: tempHash,
      role: "EMPLOYEE",
      isActive: true,
      forcePasswordChange: true,
    },
  });

  // Lấy Thư mời mới nhất của UV để biết Chức vụ (jobRole) + Vị trí làm việc (jobPosition)
  const offer = await tx.offerLetter.findFirst({
    where: { candidateId },
    orderBy: { createdAt: "desc" },
    select: { jobRole: true, position: true, probationarySalary: true, probationEndDate: true, startDate: true },
  });
  const jobPosition = offer?.position || candidate.recruitment.positionName || null; // vd "Kỹ sư kỹ thuật"
  const jobRole = offer?.jobRole || "Nhân viên";                                     // chức vụ (mặc định Nhân viên)

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
      jobRole,           // Chức vụ: Nhân viên / Tổ trưởng / Trưởng phòng...
      jobPosition,       // Vị trí làm việc: theo vị trí tuyển
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
      toPosition: jobPosition || defaultPosition.name, // vị trí tuyển (vd "Kỹ sư kỹ thuật")
      effectiveDate: new Date(),
    },
  });

  // HĐ thử việc KHÔNG tạo tự động ở đây — HCNS bấm "Tạo HĐ thử việc" ở tab Onboard để soạn,
  // rồi TP HCNS duyệt (xem flow probation contract).

  // NV mới vào ở trạng thái THỬ VIỆC → chưa có phép năm. Quỹ phép sẽ được cấp khi
  // chuyển sang Đang làm (cron leave-balance-init / khi xác nhận ký HĐ chính thức).

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
