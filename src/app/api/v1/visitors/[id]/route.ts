import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canDo } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import QRCode from "qrcode";
import { sendTelegramMessage } from "@/services/telegram.service";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const { id } = await params;
  const visitor = await prisma.visitorRequest.findUnique({
    where: { id },
    include: {
      host: { select: { id: true, code: true, fullName: true, departmentId: true } },
      badge: true,
    },
  });
  if (!visitor) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  return NextResponse.json({ data: visitor });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const userRole = (session.user as any).role;
  if (!canDo(userRole, "visitors", "approve")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const { id } = await params;
  const visitor = await prisma.visitorRequest.findUnique({
    where: { id },
    include: { host: { select: { id: true, departmentId: true } } },
  });
  if (!visitor) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });

  const body = await request.json();
  const { action } = body;

  // ── CHECK IN ──────────────────────────────────────────────────────────
  if (action === "CHECK_IN") {
    // Require HC/BOM approval before check-in
    if (visitor.status !== "APPROVED") {
      return NextResponse.json({
        error: { code: "NOT_APPROVED", message: "Khách chưa được HC/BOM duyệt. Vui lòng duyệt trước khi check-in." },
      }, { status: 422 });
    }
    // 1. Generate sequential badge number
    const badgeCount = await prisma.visitorBadge.count();
    const year = new Date().getFullYear();
    const badgeNumber = `V-${year}-${String(badgeCount + 1).padStart(4, "0")}`;

    // 2. Determine allowed zones by purpose
    const purposeZoneMap: Record<string, string[]> = {
      FACTORY_TOUR: ["Bay 1-2", "Bay 3-4", "QAQC Lab"],
      AUDIT: ["Office", "Bay 1-2", "Bay 3-4", "QAQC Lab", "Warehouse"],
      SURVEY: ["Bay 1-2", "Bay 3-4"],
      BUSINESS: ["Office", "Meeting Room"],
      DELIVERY: ["Gate", "Warehouse"],
      OTHER: ["Office"],
    };
    const allowedZones = purposeZoneMap[visitor.purpose] ?? ["Office"];

    // 3. Create HSEInductionRecord with status PENDING (must be signed off by HSE officer)
    const induction = await prisma.hSEInduction.create({
      data: {
        visitorRegId: id,
        personType: "VISITOR",
        inductionDate: new Date(),
        status: "PENDING",
        expiryDate: new Date(Date.now() + 24 * 60 * 60 * 1000), // 1 day
        passed: false,
      },
    });

    // 4. Generate QR code (SVG string) and create VisitorBadge
    const qrPayload = JSON.stringify({
      regId: id,
      badgeNumber,
      visitDate: visitor.visitDate,
      allowedZones,
      inductionId: induction.id,
    });
    // Generate as SVG data URL for easy embedding in print/badge view
    const qrSvg = await QRCode.toString(qrPayload, { type: "svg", width: 200, margin: 1 });
    const qrDataUrl = `data:image/svg+xml;base64,${Buffer.from(qrSvg).toString("base64")}`;

    await prisma.visitorBadge.create({
      data: {
        registrationId: id,
        badgeNumber,
        qrData: qrDataUrl,
        allowedZones,
        inductionId: induction.id,
      },
    });

    // 5. If needsMeal → update guestCount on the department's meal registration for today
    if (visitor.needsMeal && visitor.mealCount > 0 && visitor.host?.departmentId) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const deptId = visitor.host.departmentId;
      const existing = await prisma.mealRegistration.findUnique({
        where: { departmentId_date: { departmentId: deptId, date: today } },
      });
      if (existing) {
        await prisma.mealRegistration.update({
          where: { departmentId_date: { departmentId: deptId, date: today } },
          data: { guestCount: { increment: visitor.mealCount } },
        });
      } else {
        // No registration yet — create one with guest count only; HR can update lunch/dinner later
        await prisma.mealRegistration.create({
          data: {
            departmentId: deptId,
            date: today,
            lunchCount: 0,
            dinnerCount: 0,
            guestCount: visitor.mealCount,
            specialNote: `Auto-created: khách ${visitor.visitorName} check-in`,
            registeredBy: (session.user as any).id,
          },
        }).catch(() => {}); // ignore if concurrent request already created it
      }
    }

    // 6. Notify HR_ADMIN if visitor needs meals
    if (visitor.needsMeal && visitor.mealCount > 0) {
      const hrAdmins = await prisma.user.findMany({ where: { role: "HR_ADMIN", isActive: true } });
      await Promise.all(hrAdmins.map((u) =>
        prisma.notification.create({
          data: {
            userId: u.id,
            title: "Khách cần suất ăn",
            message: `${visitor.visitorName} check-in — cần ${visitor.mealCount} suất ăn`,
            type: "SYSTEM",
            referenceType: "visitor",
            referenceId: id,
          },
        })
      ));
    }

    // 7. Update visitor status
    const updated = await prisma.visitorRequest.update({
      where: { id },
      data: {
        status: "CHECKED_IN",
        checkedInAt: new Date(),
        badgeNumber,
      },
      include: { badge: true },
    });

    // 8. Telegram push to host employee
    if (visitor.host) {
      const hostUser = await prisma.user.findFirst({
        where: { employee: { id: visitor.host.id } },
        select: { telegramChatId: true },
      });
      if (hostUser?.telegramChatId) {
        const visitDateStr = visitor.visitDate.toLocaleDateString("vi-VN");
        await sendTelegramMessage(
          hostUser.telegramChatId,
          `✅ <b>Khách vừa check-in</b>\n👤 ${visitor.visitorName}${visitor.visitorCompany ? ` (${visitor.visitorCompany})` : ""}\n📅 ${visitDateStr}\n🏷 Badge: ${badgeNumber}`
        );
      }
    }

    return NextResponse.json({ data: updated });
  }

  // ── CHECK OUT ─────────────────────────────────────────────────────────
  if (action === "CHECK_OUT") {
    const updated = await prisma.visitorRequest.update({
      where: { id },
      data: {
        status: "CHECKED_OUT",
        checkedOutAt: new Date(),
      },
    });
    return NextResponse.json({ data: updated });
  }

  // ── APPROVE ───────────────────────────────────────────────────────────
  if (action === "APPROVE") {
    if (visitor.status !== "PENDING") {
      return NextResponse.json({ error: { code: "ALREADY_PROCESSED" } }, { status: 409 });
    }
    const updated = await prisma.visitorRequest.update({
      where: { id },
      data: { status: "APPROVED" },
    });
    // Notify host employee (in-app + Telegram)
    const hostUser = visitor.host
      ? await prisma.user.findFirst({ where: { employee: { id: visitor.host.id } }, select: { id: true, telegramChatId: true } })
      : null;
    if (hostUser) {
      const visitDateStr = visitor.visitDate.toLocaleDateString("vi-VN");
      await prisma.notification.create({
        data: {
          userId: hostUser.id,
          title: "Khách được duyệt",
          message: `Khách ${visitor.visitorName} (${visitor.visitorCompany ?? "—"}) đã được HC duyệt, dự kiến ngày ${visitDateStr}.`,
          type: "APPROVED",
          referenceType: "visitor",
          referenceId: id,
        },
      });
      if (hostUser.telegramChatId) {
        await sendTelegramMessage(
          hostUser.telegramChatId,
          `🟢 <b>Khách của bạn đã được duyệt</b>\n👤 ${visitor.visitorName}${visitor.visitorCompany ? ` (${visitor.visitorCompany})` : ""}\n📅 Dự kiến: ${visitDateStr}\n📋 Mục đích: ${visitor.purpose}`
        );
      }
    }
    logAudit({
      userId: (session.user as any).id,
      action: "APPROVE",
      entityType: "VisitorRequest",
      entityId: id,
      oldValue: { status: "PENDING" },
      newValue: { status: "APPROVED" },
    });

    return NextResponse.json({ data: updated });
  }

  // ── REJECT ────────────────────────────────────────────────────────────
  if (action === "REJECT") {
    const updated = await prisma.visitorRequest.update({
      where: { id },
      data: { status: "REJECTED" },
    });
    return NextResponse.json({ data: updated });
  }

  // Generic field update
  const updated = await prisma.visitorRequest.update({
    where: { id },
    data: body,
  });
  return NextResponse.json({ data: updated });
}
