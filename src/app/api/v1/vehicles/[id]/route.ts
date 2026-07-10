import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canUser } from "@/lib/permission-catalog";
import { z } from "zod";

// Sửa thông tin xe trong Đội xe — CHỈ Quản trị hệ thống (ADMIN).
const UpdateSchema = z.object({
  licensePlate: z.string().min(5).optional(),          // biển số
  model: z.string().min(1).optional(),
  type: z.enum(["CAR", "VAN", "TRUCK", "MOTORBIKE", "PICKUP_TRUCK", "CONTAINER", "FORKLIFT"]).optional(),
  seats: z.number().int().min(1).optional(),
  owner: z.string().nullable().optional(),             // chủ sở hữu
  driverName: z.string().nullable().optional(),
  status: z.enum(["AVAILABLE", "IN_USE", "MAINTENANCE", "OUT_OF_SERVICE"]).optional(), // trạng thái
  currentMileage: z.number().int().min(0).optional(),  // km hiện tại
  nextMaintenanceDate: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  // Quyền sửa xe = ma trận "m10.xe:edit" (ADMIN = superset; fallback gói mẫu).
  if (!canUser(session.user as any, "m10.xe:edit")) {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Không có quyền sửa xe" } }, { status: 403 });
  }

  const { id } = await params;
  const parsed = UpdateSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", issues: parsed.error.issues } }, { status: 422 });
  }

  const veh = await prisma.vehicle.findUnique({ where: { id } });
  if (!veh) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });

  // Đổi biển số → kiểm tra trùng (bỏ qua chính nó).
  if (parsed.data.licensePlate && parsed.data.licensePlate !== veh.licensePlate) {
    const dup = await prisma.vehicle.findUnique({ where: { licensePlate: parsed.data.licensePlate } });
    if (dup) return NextResponse.json({ error: { code: "DUPLICATE", message: "Biển số đã tồn tại" } }, { status: 409 });
  }

  const { nextMaintenanceDate, ...rest } = parsed.data;
  const updated = await prisma.vehicle.update({
    where: { id },
    data: {
      ...rest,
      ...(nextMaintenanceDate !== undefined
        ? { nextMaintenanceDate: nextMaintenanceDate ? new Date(nextMaintenanceDate) : null }
        : {}),
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: (session.user as any).id,
      action: "UPDATE",
      entityType: "Vehicle",
      entityId: id,
      newValue: JSON.stringify(parsed.data),
    },
  });

  return NextResponse.json({ data: updated });
}
