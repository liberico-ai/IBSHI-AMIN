import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { checkPermission } from "@/lib/permissions";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }

  const userRole = (session.user as any).role;
  if (!checkPermission(userRole, "MANAGER")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const thirtyDaysOut = new Date(today);
  thirtyDaysOut.setDate(thirtyDaysOut.getDate() + 30);

  const [expiringContracts, expiredContracts, expiringCerts, expiredCerts] = await Promise.all([
    prisma.contract.findMany({
      where: {
        endDate: { gte: today, lte: thirtyDaysOut },
        status: { notIn: ["TERMINATED", "EXPIRED"] },
      },
      include: { employee: { include: { department: true } } },
      orderBy: { endDate: "asc" },
    }),
    prisma.contract.findMany({
      where: { endDate: { lt: today }, status: { notIn: ["TERMINATED", "EXPIRED", "RENEWED"] } },
      include: { employee: { include: { department: true } } },
      orderBy: { endDate: "asc" },
      take: 20,
    }),
    prisma.certificate.findMany({
      where: {
        expiryDate: { gte: today, lte: thirtyDaysOut },
        status: { notIn: ["REVOKED", "EXPIRED"] },
      },
      include: { employee: { include: { department: true } } },
      orderBy: { expiryDate: "asc" },
    }),
    prisma.certificate.findMany({
      where: { expiryDate: { lt: today }, status: { notIn: ["REVOKED"] } },
      include: { employee: { include: { department: true } } },
      orderBy: { expiryDate: "asc" },
      take: 20,
    }),
  ]);

  // Auto-update statuses
  const contractExpiredIds = expiredContracts.map((c) => c.id);
  if (contractExpiredIds.length > 0) {
    await prisma.contract.updateMany({
      where: { id: { in: contractExpiredIds } },
      data: { status: "EXPIRED" },
    });
  }

  const certExpiredIds = expiredCerts.map((c) => c.id);
  if (certExpiredIds.length > 0) {
    await prisma.certificate.updateMany({
      where: { id: { in: certExpiredIds } },
      data: { status: "EXPIRED" },
    });
  }

  const expiringContractIds = expiringContracts.map((c) => c.id);
  if (expiringContractIds.length > 0) {
    await prisma.contract.updateMany({
      where: { id: { in: expiringContractIds } },
      data: { status: "EXPIRING_SOON" },
    });
  }

  const expiringCertIds = expiringCerts.map((c) => c.id);
  if (expiringCertIds.length > 0) {
    await prisma.certificate.updateMany({
      where: { id: { in: expiringCertIds } },
      data: { status: "EXPIRING_SOON" },
    });
  }

  // Send notifications to HR_ADMIN for newly expiring items (avoid duplicates)
  const hrAdmins = await prisma.user.findMany({ where: { role: { in: ["HR_ADMIN", "BOM"] }, isActive: true }, select: { id: true } });
  if (hrAdmins.length > 0) {
    const hrIds = hrAdmins.map((u) => u.id);

    // Contracts expiring soon — check for existing notifications
    for (const c of expiringContracts) {
      const existing = await prisma.notification.findFirst({
        where: { referenceType: "contract", referenceId: c.id, type: "EXPIRY_WARNING", userId: { in: hrIds } },
      });
      if (!existing) {
        const daysLeft = Math.ceil((c.endDate!.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        await prisma.notification.createMany({
          data: hrIds.map((userId) => ({
            userId,
            title: "Hợp đồng sắp hết hạn",
            message: `Hợp đồng của ${c.employee.fullName} hết hạn sau ${daysLeft} ngày (${c.endDate!.toISOString().slice(0, 10)})`,
            type: "EXPIRY_WARNING",
            referenceType: "contract",
            referenceId: c.id,
          })),
        });
      }
    }

    // Certificates expiring soon
    for (const cert of expiringCerts) {
      const existing = await prisma.notification.findFirst({
        where: { referenceType: "certificate", referenceId: cert.id, type: "EXPIRY_WARNING", userId: { in: hrIds } },
      });
      if (!existing) {
        const daysLeft = Math.ceil((cert.expiryDate!.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        await prisma.notification.createMany({
          data: hrIds.map((userId) => ({
            userId,
            title: "Chứng chỉ sắp hết hạn",
            message: `Chứng chỉ "${cert.name}" của ${cert.employee.fullName} hết hạn sau ${daysLeft} ngày (${cert.expiryDate!.toISOString().slice(0, 10)})`,
            type: "EXPIRY_WARNING",
            referenceType: "certificate",
            referenceId: cert.id,
          })),
        });
      }
    }
  }

  return NextResponse.json({
    data: {
      expiringContracts,
      expiredContracts,
      expiringCerts,
      expiredCerts,
      summary: {
        expiringContractsCount: expiringContracts.length,
        expiredContractsCount: expiredContracts.length,
        expiringCertsCount: expiringCerts.length,
        expiredCertsCount: expiredCerts.length,
      },
    },
  });
}
