import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canUser } from "@/lib/permission-catalog";

// GET ?from=YYYY-MM-DD&to=YYYY-MM-DD — báo cáo TỔNG HỢP hoạt động (theo NV + theo module).
// Mốc ngày tính theo giờ VN (UTC+7).
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  // Xem Báo cáo hoạt động: theo ma trận (sys.baocao:view). ADMIN tự động có.
  if (!canUser(session.user as any, "sys.baocao:view")) {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Không có quyền xem Báo cáo hoạt động" } }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from") || "";
  const to = searchParams.get("to") || from;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return NextResponse.json({ error: { code: "BAD_REQUEST", message: "Thiếu from/to (YYYY-MM-DD)" } }, { status: 400 });
  }
  const start = new Date(`${from}T00:00:00+07:00`);
  const end = new Date(`${to}T23:59:59.999+07:00`);

  const logs = await prisma.auditLog.findMany({
    where: { createdAt: { gte: start, lte: end } },
    select: {
      action: true,
      entityType: true,
      entityId: true,
      createdAt: true,
      userId: true,
      user: {
        select: {
          employeeCode: true,
          email: true,
          employee: { select: { fullName: true, department: { select: { name: true } } } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  type UserAgg = {
    employeeCode: string;
    fullName: string;
    department: string;
    logins: number;
    views: number;
    actions: number; // tổng thao tác ghi (không gồm login/view)
    lastActive: string;
  };
  const byUser = new Map<string, UserAgg>();
  const moduleViews = new Map<string, { views: number; users: Set<string> }>();

  // Chi tiết "họ đã thao tác gì": gộp theo (người + hành động + đối tượng), loại VIEW (đã có ở sheet module).
  const ACTION_VI: Record<string, string> = {
    CREATE: "Tạo mới", UPDATE: "Cập nhật", DELETE: "Xóa", APPROVE: "Duyệt", REJECT: "Từ chối",
    LOGIN: "Đăng nhập", LOGOUT: "Đăng xuất", RESET_PASSWORD: "Đặt lại mật khẩu",
    IMPORT: "Nhập dữ liệu", EXPORT: "Xuất dữ liệu", RUN: "Chạy/Tính", VIEW: "Xem",
  };
  const ENTITY_VI: Record<string, string> = {
    Employee: "Hồ sơ nhân sự", Auth: "Tài khoản", User: "Người dùng", AccessGrant: "Phân quyền",
    LeaveRequest: "Đơn nghỉ phép", OTRequest: "Đăng ký tăng ca", Contract: "Hợp đồng", PayrollPeriod: "Kỳ lương",
  };
  const actionAgg = new Map<string, { employeeCode: string; fullName: string; department: string; action: string; target: string; count: number }>();

  for (const l of logs) {
    const code = l.user?.employeeCode || l.userId;
    let u = byUser.get(l.userId);
    if (!u) {
      u = {
        employeeCode: code,
        fullName: l.user?.employee?.fullName || code,
        department: l.user?.employee?.department?.name || "—",
        logins: 0,
        views: 0,
        actions: 0,
        lastActive: l.createdAt.toISOString(),
      };
      byUser.set(l.userId, u);
    }
    if (l.action === "LOGIN") u.logins++;
    else if (l.action === "VIEW") {
      u.views++;
      const m = moduleViews.get(l.entityId) || { views: 0, users: new Set<string>() };
      m.views++;
      m.users.add(l.userId);
      moduleViews.set(l.entityId, m);
    } else if (l.entityType === "API") {
      // Mọi tác vụ ghi qua API đều log entityType="API" (Phase 2) → đếm 1 lần.
      u.actions++;
    }
    u.lastActive = l.createdAt.toISOString();

    // Chi tiết thao tác (bỏ VIEW): gộp theo hành động + đối tượng.
    //   API/Module → entityId là tên module (dễ đọc); còn lại → dùng LOẠI đối tượng (tránh hiện UUID).
    if (l.action !== "VIEW") {
      const isModule = l.entityType === "API" || l.entityType === "Module";
      const target = l.action === "LOGIN" || l.action === "LOGOUT" ? ""
        : isModule ? (l.entityId || "")
        : (ENTITY_VI[l.entityType] || l.entityType || "");
      const key = `${l.userId}|${l.action}|${target}`;
      const row = actionAgg.get(key);
      if (row) row.count++;
      else actionAgg.set(key, { employeeCode: u.employeeCode, fullName: u.fullName, department: u.department, action: ACTION_VI[l.action] || l.action, target, count: 1 });
    }
  }

  const users = Array.from(byUser.values()).sort(
    (a, b) => b.logins + b.views + b.actions - (a.logins + a.views + a.actions)
  );
  const modules = Array.from(moduleViews.entries())
    .map(([name, v]) => ({ module: name, views: v.views, users: v.users.size }))
    .sort((a, b) => b.views - a.views);

  return NextResponse.json({
    data: {
      from,
      to,
      totals: {
        logins: users.reduce((s, u) => s + u.logins, 0),
        views: users.reduce((s, u) => s + u.views, 0),
        actions: users.reduce((s, u) => s + u.actions, 0),
        activeUsers: users.filter((u) => u.logins > 0 || u.views > 0 || u.actions > 0).length,
      },
      users,
      modules,
      // "Họ thao tác gì" — sắp theo tên, rồi số lần giảm dần.
      actionDetail: Array.from(actionAgg.values()).sort((a, b) => a.fullName.localeCompare(b.fullName) || b.count - a.count),
    },
  });
}
