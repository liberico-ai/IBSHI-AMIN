import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { randomUUID } from "crypto";
import { generateDates, applyTimeToDate } from "@/lib/recurrence";
import { autoCancelExpiredBookings } from "@/lib/booking-autocancel";

const VehiclePurposeEnum = z.enum(["DELIVERY", "CLIENT_PICKUP", "BUSINESS_TRIP", "PROCUREMENT", "OTHER"]);

const CreateSchema = z.object({
  vehicleId: z.string().uuid(),
  startDate: z.string(),
  endDate: z.string(),
  origin: z.string().optional().nullable(),
  destination: z.string().min(2),
  purpose: VehiclePurposeEnum,
  passengers: z.number().int().min(1).default(1),
  priority: z.enum(["NONE", "NORMAL", "PRIORITY"]).default("NORMAL"),
  notes: z.string().optional().nullable(),
  recurrence: z.object({
    // 1=T2..6=T7 (KHÔNG cho phép CN=0)
    daysOfWeek: z.array(z.number().int().min(1).max(6)).min(1),
    until: z.string().optional(),
  }).optional(),
});

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const userRole = (session.user as any).role;
  const userId = (session.user as any).id;
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") || "";
  const vehicleId = searchParams.get("vehicleId") || "";
  const from = searchParams.get("from") || "";
  const to = searchParams.get("to") || "";

  const where: any = {};
  if (status) where.status = status;
  if (vehicleId) where.vehicleId = vehicleId;
  if (from || to) {
    where.startDate = {
      ...(from && { gte: new Date(new Date(from).setHours(0, 0, 0, 0)) }),
      ...(to && { lte: new Date(new Date(to).setHours(23, 59, 59, 999)) }),
    };
  }

  // Tự động hủy phiếu chưa duyệt đã qua ngày (đảm bảo trạng thái luôn đúng khi xem).
  await autoCancelExpiredBookings();

  // MANAGER sees only their department's bookings
  if (userRole === "MANAGER") {
    const emp = await prisma.employee.findFirst({ where: { userId }, select: { departmentId: true } });
    if (emp) where.requester = { departmentId: emp.departmentId };
  } else if (userRole === "EMPLOYEE" || userRole === "TEAM_LEAD") {
    const emp = await prisma.employee.findFirst({ where: { userId }, select: { id: true } });
    if (emp) where.requestedBy = emp.id;
  }

  const data = await prisma.vehicleBooking.findMany({
    where,
    include: {
      vehicle: { select: { id: true, licensePlate: true, model: true, type: true } },
      requester: { select: { id: true, code: true, fullName: true, department: { select: { name: true } } } },
    },
    orderBy: { startDate: "desc" },
  });

  return NextResponse.json({ data });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const body = await request.json();
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", issues: parsed.error.issues } }, { status: 422 });
  }

  const emp = await prisma.employee.findFirst({ where: { userId: (session.user as any).id } });
  if (!emp) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });

  const startDate = new Date(parsed.data.startDate);
  const endDate = new Date(parsed.data.endDate);

  // Phải đặt trước tối thiểu 30 phút, không đặt giờ trong quá khứ.
  const minStart = new Date(Date.now() + 30 * 60_000);
  if (startDate.getTime() < minStart.getTime()) {
    return NextResponse.json({ error: { code: "TOO_SOON", message: "Phải đặt trước ít nhất 30 phút (không đặt giờ trong quá khứ)." } }, { status: 400 });
  }

  // ── Lịch lặp lại (series) — KHÔNG check conflict, push lên duyệt ───────────
  const rec = parsed.data.recurrence;
  if (rec) {
    // Không có "đến ngày" → dùng cap 365 ngày từ ngày bắt đầu.
    const until = rec.until
      ? new Date(rec.until + "T23:59:59")
      : new Date(startDate.getTime() + 365 * 86400_000);
    if (until <= startDate) {
      return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Ngày kết thúc lặp phải sau ngày bắt đầu" } }, { status: 400 });
    }
    const dates = generateDates(startDate, until, rec.daysOfWeek);
    if (dates.length === 0) {
      return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Không có ngày nào phù hợp với kiểu lặp" } }, { status: 400 });
    }
    if (dates.length > 365) {
      return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Tối đa 365 phiếu / series" } }, { status: 400 });
    }
    const seriesId = randomUUID();
    const adminsRec = await prisma.user.findMany({ where: { role: { in: ["HR_ADMIN"] }, isActive: true }, select: { id: true } });
    try {
      // Dùng createMany — nhanh hơn 365 lần create + tránh transaction timeout.
      const result = await prisma.vehicleBooking.createMany({
        data: dates.map((d) => ({
          vehicleId: parsed.data.vehicleId,
          origin: parsed.data.origin || null,
          destination: parsed.data.destination,
          purpose: parsed.data.purpose,
          passengers: parsed.data.passengers,
          priority: parsed.data.priority,
          notes: parsed.data.notes || null,
          startDate: applyTimeToDate(d, startDate),
          endDate: applyTimeToDate(d, endDate),
          requestedBy: emp.id,
          status: "PENDING" as const,
          seriesId,
        })),
      });
      if (adminsRec.length > 0) {
        await prisma.notification.createMany({
          data: adminsRec.map((u) => ({
            userId: u.id,
            title: "Yêu cầu đặt xe (lịch cố định)",
            message: `${emp.fullName} đặt xe đến ${parsed.data.destination} — ${result.count} phiếu (lịch cố định)`,
            type: "APPROVAL_REQUIRED",
            referenceType: "vehicle_booking_series",
            referenceId: seriesId,
          })),
        });
      }
      return NextResponse.json({ data: { seriesId, count: result.count } }, { status: 201 });
    } catch (e: any) {
      console.error("[vehicles bookings series create] error:", e);
      return NextResponse.json({ error: { code: "CREATE_FAILED", message: e?.message || "Tạo series thất bại" } }, { status: 500 });
    }
  }

  // Check vehicle availability — nêu rõ phiếu đang bận (giờ đi–về, điểm đến) để người
  // đặt biết "xe chưa về" thay vì thông báo chung chung.
  const conflict = await prisma.vehicleBooking.findFirst({
    where: {
      vehicleId: parsed.data.vehicleId,
      status: { in: ["APPROVED", "PENDING"] },
      AND: [{ startDate: { lte: endDate } }, { endDate: { gte: startDate } }],
    },
    select: { startDate: true, endDate: true, destination: true, status: true },
  });
  if (conflict) {
    // Hiển thị giờ VN cố định (Asia/Ho_Chi_Minh) — KHÔNG dùng giờ máy chủ (có thể chạy UTC) → tránh
    // in sai giờ trong thông báo trùng lịch (vd 14:00 VN bị in thành 07:00 UTC, khiến tưởng không trùng).
    const fmt = (d: Date) => {
      const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", hourCycle: "h23" }).formatToParts(new Date(d));
      const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
      return `${g("hour")}:${g("minute")} ${g("day")}/${g("month")}`;
    };
    const statusVN = conflict.status === "PENDING" ? "đang chờ duyệt" : "đã duyệt";
    const newStart = new Date(startDate);
    // "Xe chưa về": chuyến đang bận kết thúc SAU thời điểm bắt đầu chuyến mới.
    const notReturned = new Date(conflict.endDate) > newStart;
    const reason = notReturned ? "xe chưa về kịp" : "xe đã có người đặt";
    return NextResponse.json({
      error: {
        code: "CONFLICT",
        message: `Xe đang bận (${reason}): đã có chuyến đi "${conflict.destination}" từ ${fmt(conflict.startDate)} đến ${fmt(conflict.endDate)} (${statusVN}). Trùng với khung giờ bạn chọn — vui lòng đổi giờ hoặc chọn xe khác.`,
      },
    }, { status: 409 });
  }

  // Check maintenance overlap — bảo trì lưu theo NGÀY (00:00) nên phải coi là TRỌN NGÀY:
  // dùng đầu ngày của booking.start và cuối ngày của booking.end để so, tránh lọt booking
  // vào buổi chiều ngày kết thúc bảo trì (vd bảo trì hết 28/05 mà đặt 28/05 10:00 vẫn lọt).
  const bookStartDay = new Date(startDate); bookStartDay.setUTCHours(0, 0, 0, 0);
  const bookEndDay = new Date(endDate); bookEndDay.setUTCHours(23, 59, 59, 999);
  const maintenance = await prisma.maintenanceRecord.findFirst({
    where: {
      vehicleId: parsed.data.vehicleId,
      startDate: { lte: bookEndDay },
      OR: [{ endDate: null }, { endDate: { gte: bookStartDay } }],
    },
  });
  if (maintenance) {
    return NextResponse.json({
      error: { code: "MAINTENANCE_CONFLICT", message: `Xe đang có lịch bảo trì từ ${maintenance.startDate.toISOString().slice(0, 10)}${maintenance.endDate ? " đến " + maintenance.endDate.toISOString().slice(0, 10) : ""}. Vui lòng chọn ngày khác hoặc xe khác.` },
    }, { status: 409 });
  }

  // Fetch admin recipients outside the transaction to keep it short.
  const admins = await prisma.user.findMany({ where: { role: { in: ["HR_ADMIN"] }, isActive: true }, select: { id: true } });

  const booking = await prisma.$transaction(async (tx) => {
    const created = await tx.vehicleBooking.create({
      data: { ...parsed.data, startDate, endDate, requestedBy: emp.id, status: "PENDING" },
      include: { vehicle: true, requester: { select: { id: true, fullName: true } } },
    });

    if (admins.length > 0) {
      await tx.notification.createMany({
        data: admins.map((u) => ({
          userId: u.id,
          title: "Yêu cầu đặt xe",
          message: `${emp.fullName} đặt xe đến ${parsed.data.destination} (${parsed.data.startDate} → ${parsed.data.endDate})`,
          type: "APPROVAL_REQUIRED",
          referenceType: "vehicle_booking",
          referenceId: created.id,
        })),
      });
    }

    return created;
  });

  return NextResponse.json({ data: booking }, { status: 201 });
}
