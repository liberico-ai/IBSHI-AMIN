import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashSync } from "bcryptjs";
import "dotenv/config";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("🌱 Seeding database...");

  // ==================== DIRECTORATES ====================
  const directorates = await Promise.all([
    prisma.directorate.create({
      data: { name: "Commercial Director", nameVi: "Giám đốc Thương mại" },
    }),
    prisma.directorate.create({
      data: { name: "COO", nameVi: "Giám đốc Vận hành" },
    }),
    prisma.directorate.create({
      data: { name: "Production Director", nameVi: "Giám đốc Sản xuất" },
    }),
  ]);

  console.log(`✅ Created ${directorates.length} directorates`);

  // ==================== DEPARTMENTS ====================
  const deptData = [
    { code: "BOM", name: "Ban Giám đốc", nameEn: "Board of Management", headcount: 5, sortOrder: 0, directorateId: null },
    { code: "SX", name: "P. Sản xuất", nameEn: "Production Dept.", headcount: 80, sortOrder: 1, directorateId: directorates[2].id },
    { code: "QLDA", name: "P. QLDA", nameEn: "Project Management Dept.", headcount: 12, sortOrder: 2, directorateId: directorates[1].id },
    { code: "KT", name: "P. Kỹ thuật", nameEn: "Engineering Dept.", headcount: 15, sortOrder: 3, directorateId: directorates[2].id },
    { code: "QAQC", name: "P. QAQC", nameEn: "QAQC Dept.", headcount: 8, sortOrder: 4, directorateId: directorates[1].id },
    { code: "HCNS", name: "P. HCNS", nameEn: "HR & Admin Dept.", headcount: 5, sortOrder: 5, directorateId: directorates[1].id },
    { code: "KETOAN", name: "P. Kế toán", nameEn: "Accounting Dept.", headcount: 6, sortOrder: 6, directorateId: directorates[0].id },
    { code: "KD", name: "P. Kinh doanh", nameEn: "Sales Dept.", headcount: 10, sortOrder: 7, directorateId: directorates[2].id },
    { code: "TM", name: "P. Thương mại", nameEn: "Commercial Dept.", headcount: 8, sortOrder: 8, directorateId: directorates[0].id },
    { code: "TB", name: "P. Thiết bị", nameEn: "Equipment Dept.", headcount: 6, sortOrder: 9, directorateId: directorates[2].id },
  ];

  const departments: Record<string, any> = {};
  for (const d of deptData) {
    departments[d.code] = await prisma.department.create({ data: d });
  }
  console.log(`✅ Created ${Object.keys(departments).length} departments`);

  // ==================== POSITIONS ====================
  const posData = [
    { name: "Chairman", level: "C_LEVEL" as const, departmentId: departments.BOM.id },
    { name: "CEO", level: "C_LEVEL" as const, departmentId: departments.BOM.id },
    { name: "Commercial Director", level: "C_LEVEL" as const, departmentId: departments.BOM.id },
    { name: "COO", level: "C_LEVEL" as const, departmentId: departments.BOM.id },
    { name: "Production Director", level: "C_LEVEL" as const, departmentId: departments.BOM.id },
    { name: "Trưởng phòng", level: "MANAGER" as const, departmentId: departments.SX.id },
    { name: "Tổ trưởng Hàn 1", level: "TEAM_LEAD" as const, departmentId: departments.SX.id },
    { name: "Thợ hàn bậc 5", level: "WORKER" as const, departmentId: departments.SX.id },
    { name: "Kế toán viên", level: "SPECIALIST" as const, departmentId: departments.KETOAN.id },
    { name: "QC Inspector", level: "SPECIALIST" as const, departmentId: departments.QAQC.id },
    { name: "Kỹ sư thiết kế", level: "SPECIALIST" as const, departmentId: departments.KT.id },
    { name: "Trưởng phòng QLDA", level: "MANAGER" as const, departmentId: departments.QLDA.id },
    { name: "Trưởng phòng HCNS", level: "MANAGER" as const, departmentId: departments.HCNS.id },
  ];

  const positions: Record<string, any> = {};
  for (const p of posData) {
    positions[p.name] = await prisma.position.create({ data: p });
  }
  console.log(`✅ Created ${Object.keys(positions).length} positions`);

  // ==================== PRODUCTION TEAMS ====================
  const teamData = [
    { name: "Gá lắp 1", teamType: "GA_LAP" as const, memberCount: 7 },
    { name: "Gá lắp 2", teamType: "GA_LAP" as const, memberCount: 7 },
    { name: "Gá lắp 3", teamType: "GA_LAP" as const, memberCount: 7 },
    { name: "Gá lắp 4", teamType: "GA_LAP" as const, memberCount: 7 },
    { name: "Gá lắp 5", teamType: "GA_LAP" as const, memberCount: 7 },
    { name: "Hàn 1", teamType: "HAN" as const, memberCount: 9 },
    { name: "Hàn 2", teamType: "HAN" as const, memberCount: 9 },
    { name: "Pha cắt 2", teamType: "PHA_CAT" as const, memberCount: 6 },
    { name: "Pha cắt 3", teamType: "PHA_CAT" as const, memberCount: 6 },
    { name: "GCCK", teamType: "GCCK" as const, memberCount: 6 },
    { name: "Sơn", teamType: "SON" as const, memberCount: 5 },
    { name: "Tổng hợp", teamType: "TONG_HOP" as const, memberCount: 4 },
  ];

  const teams: Record<string, any> = {};
  for (const t of teamData) {
    teams[t.name] = await prisma.productionTeam.create({
      data: { ...t, departmentId: departments.SX.id },
    });
  }
  console.log(`✅ Created ${Object.keys(teams).length} production teams`);

  // ==================== EMPLOYEES + USERS ====================
  const passwordHash = hashSync("admin123", 10);

  const employees = [
    {
      code: "IBS-001",
      fullName: "Lê Duy Huyên",
      gender: "MALE" as const,
      email: "huyen.ld@ibs.com.vn",
      role: "BOM" as const,
      dob: new Date("1970-01-15"),
      idNumber: "012345678901",
      phone: "0901234001",
      address: "Hải Phòng",
      departmentCode: "BOM",
      positionName: "Chairman",
      startDate: new Date("2015-01-01"),
      salaryGrade: 7,
      salaryCoefficient: 8.0,
      contractType: "INDEFINITE" as const,
      baseSalary: 50000000,
    },
    {
      code: "IBS-005",
      fullName: "Andrew Mak",
      gender: "MALE" as const,
      email: "andrew.mak@ibs.com.vn",
      role: "BOM" as const,
      dob: new Date("1975-06-20"),
      idNumber: "012345678902",
      phone: "0901234005",
      address: "Hải Phòng",
      departmentCode: "BOM",
      positionName: "CEO",
      startDate: new Date("2016-03-01"),
      salaryGrade: 7,
      salaryCoefficient: 7.5,
      contractType: "INDEFINITE" as const,
      baseSalary: 45000000,
    },
    {
      code: "IBS-012",
      fullName: "Nguyễn Văn An",
      gender: "MALE" as const,
      email: "an.nv@ibs.com.vn",
      role: "MANAGER" as const,
      dob: new Date("1980-03-10"),
      idNumber: "012345678903",
      phone: "0901234012",
      address: "Hải Phòng",
      departmentCode: "SX",
      positionName: "Trưởng phòng",
      startDate: new Date("2018-05-15"),
      salaryGrade: 6,
      salaryCoefficient: 5.5,
      contractType: "DEFINITE_12M" as const,
      baseSalary: 18000000,
      contractEnd: new Date("2027-05-15"),
    },
    {
      code: "IBS-023",
      fullName: "Trần Minh Tuấn",
      gender: "MALE" as const,
      email: "tuan.tm@ibs.com.vn",
      role: "TEAM_LEAD" as const,
      dob: new Date("1985-08-22"),
      idNumber: "012345678904",
      phone: "0901234023",
      address: "Hải Phòng",
      departmentCode: "SX",
      positionName: "Tổ trưởng Hàn 1",
      teamName: "Hàn 1",
      startDate: new Date("2019-01-10"),
      salaryGrade: 5,
      salaryCoefficient: 3.2,
      contractType: "DEFINITE_12M" as const,
      baseSalary: 12480000,
      contractEnd: new Date("2027-01-10"),
    },
    {
      code: "IBS-045",
      fullName: "Phạm Đức Mạnh",
      gender: "MALE" as const,
      email: "manh.pd@ibs.com.vn",
      role: "EMPLOYEE" as const,
      dob: new Date("1990-12-05"),
      idNumber: "012345678905",
      phone: "0901234045",
      address: "Hải Phòng",
      departmentCode: "SX",
      positionName: "Thợ hàn bậc 5",
      teamName: "Hàn 1",
      startDate: new Date("2020-06-01"),
      salaryGrade: 5,
      salaryCoefficient: 2.8,
      contractType: "DEFINITE_12M" as const,
      baseSalary: 10500000,
      contractEnd: new Date("2026-06-01"),
      certName: "Chứng chỉ hàn AWS D1.1",
      certIssuer: "AWS - American Welding Society",
      certExpiry: new Date("2026-04-20"),
    },
    {
      code: "IBS-056",
      fullName: "Lê Thị Hoa",
      gender: "FEMALE" as const,
      email: "hoa.lt@ibs.com.vn",
      role: "EMPLOYEE" as const,
      dob: new Date("1992-04-18"),
      idNumber: "012345678906",
      phone: "0901234056",
      address: "Hải Phòng",
      departmentCode: "KETOAN",
      positionName: "Kế toán viên",
      startDate: new Date("2021-02-01"),
      salaryGrade: 4,
      salaryCoefficient: 2.5,
      contractType: "DEFINITE_12M" as const,
      baseSalary: 9500000,
      contractEnd: new Date("2026-04-15"),
    },
    {
      code: "IBS-078",
      fullName: "Võ Thanh Tùng",
      gender: "MALE" as const,
      email: "tung.vt@ibs.com.vn",
      role: "EMPLOYEE" as const,
      dob: new Date("1988-09-30"),
      idNumber: "012345678907",
      phone: "0901234078",
      address: "Hải Phòng",
      departmentCode: "QAQC",
      positionName: "QC Inspector",
      startDate: new Date("2020-08-01"),
      salaryGrade: 4,
      salaryCoefficient: 2.8,
      contractType: "DEFINITE_24M" as const,
      baseSalary: 11000000,
      contractEnd: new Date("2027-08-01"),
    },
    {
      code: "IBS-089",
      fullName: "Hoàng Văn Sơn",
      gender: "MALE" as const,
      email: "son.hv@ibs.com.vn",
      role: "EMPLOYEE" as const,
      dob: new Date("1993-11-12"),
      idNumber: "012345678908",
      phone: "0901234089",
      address: "Hải Phòng",
      departmentCode: "KT",
      positionName: "Kỹ sư thiết kế",
      startDate: new Date("2022-01-15"),
      salaryGrade: 3,
      salaryCoefficient: 2.3,
      contractType: "DEFINITE_12M" as const,
      baseSalary: 10000000,
      contractEnd: new Date("2027-01-15"),
    },
  ];

  for (const emp of employees) {
    const user = await prisma.user.create({
      data: {
        employeeCode: emp.code,
        email: emp.email,
        passwordHash,
        role: emp.role,
        isActive: true,
      },
    });

    const employee = await prisma.employee.create({
      data: {
        userId: user.id,
        code: emp.code,
        fullName: emp.fullName,
        gender: emp.gender,
        dateOfBirth: emp.dob,
        idNumber: emp.idNumber,
        phone: emp.phone,
        address: emp.address,
        departmentId: departments[emp.departmentCode].id,
        positionId: positions[emp.positionName].id,
        teamId: emp.teamName ? teams[emp.teamName]?.id : undefined,
        startDate: emp.startDate,
        salaryGrade: emp.salaryGrade,
        salaryCoefficient: emp.salaryCoefficient,
        status: "ACTIVE",
      },
    });

    // Contract
    const contractEnd = (emp as any).contractEnd;
    const now = new Date();
    let contractStatus: "ACTIVE" | "EXPIRING_SOON" | "EXPIRED" = "ACTIVE";
    if (contractEnd) {
      const daysUntilExpiry = Math.floor((contractEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      if (daysUntilExpiry <= 0) contractStatus = "EXPIRED";
      else if (daysUntilExpiry <= 30) contractStatus = "EXPIRING_SOON";
    }

    await prisma.contract.create({
      data: {
        employeeId: employee.id,
        contractNumber: `HD-${emp.code.replace("IBS-", "")}`,
        contractType: emp.contractType,
        startDate: emp.startDate,
        endDate: contractEnd || null,
        baseSalary: emp.baseSalary,
        status: contractStatus,
      },
    });

    // Certificate (if any)
    if ((emp as any).certName) {
      const certExpiry = (emp as any).certExpiry;
      let certStatus: "VALID" | "EXPIRING_SOON" | "EXPIRED" = "VALID";
      if (certExpiry) {
        const daysUntil = Math.floor((certExpiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        if (daysUntil <= 0) certStatus = "EXPIRED";
        else if (daysUntil <= 30) certStatus = "EXPIRING_SOON";
      }

      await prisma.certificate.create({
        data: {
          employeeId: employee.id,
          name: (emp as any).certName,
          issuer: (emp as any).certIssuer,
          issueDate: new Date("2023-04-20"),
          expiryDate: certExpiry,
          status: certStatus,
        },
      });
    }

    // Work History - JOINED
    await prisma.workHistory.create({
      data: {
        employeeId: employee.id,
        eventType: "JOINED",
        toDepartment: departments[emp.departmentCode].name,
        toPosition: emp.positionName,
        effectiveDate: emp.startDate,
        note: "Gia nhập IBS Heavy Industry JSC",
      },
    });

    // Leave Balance 2026
    await prisma.leaveBalance.create({
      data: {
        employeeId: employee.id,
        year: 2026,
        totalDays: 12,
        usedDays: emp.code === "IBS-045" ? 4 : 0,
        remainingDays: emp.code === "IBS-045" ? 8 : 12,
      },
    });
  }

  console.log(`✅ Created ${employees.length} employees with users, contracts, and leave balances`);

  // ==================== SAMPLE NOTIFICATIONS ====================
  const adminUser = await prisma.user.findUnique({ where: { employeeCode: "IBS-001" } });
  if (adminUser) {
    const notifications = [
      {
        userId: adminUser.id,
        title: "Đơn nghỉ phép chờ duyệt",
        message: "Nguyễn Văn An đã gửi đơn nghỉ phép 3 ngày (14-16/04/2026)",
        type: "APPROVAL_REQUIRED" as const,
        referenceType: "leave_request",
        referenceId: "sample-1",
      },
      {
        userId: adminUser.id,
        title: "HĐ lao động sắp hết hạn",
        message: "HĐ của Lê Thị Hoa hết hạn ngày 15/04/2026",
        type: "EXPIRY_WARNING" as const,
        referenceType: "contract",
        referenceId: "sample-2",
      },
    ];

    for (const n of notifications) {
      await prisma.notification.create({ data: n });
    }
    console.log(`✅ Created ${notifications.length} sample notifications`);
  }

  console.log("🎉 Seeding complete!");
}

main()
  .catch((e) => {
    console.error("❌ Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
