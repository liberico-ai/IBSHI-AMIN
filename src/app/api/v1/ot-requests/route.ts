import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { isInPast } from "@/lib/validation";
import { getDirectedKhoiIds, departmentIdsOfKhois, directorsOfDepartment } from "@/lib/ot-khoi";
import { resolveScope, scopeWhere, applyScope } from "@/lib/data-scope.server";

const CreateOTSchema = z.object({
  date: z.string().transform((s) => new Date(s)),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, "Giờ bắt đầu không hợp lệ (HH:mm)"),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, "Giờ kết thúc không hợp lệ (HH:mm)"),
  reason: z.string().min(1, "Vui lòng nhập lý do"),   // lý do gộp từ các NV (chi tiết theo từng NV ở memberProjects)
  otRate: z.number().optional(),
  teamId: z.string().optional().nullable(),
  teamName: z.string().optional().nullable(),
  // Chế độ khai: "byEmployee" (theo nhân sự — mỗi NV chia giờ, tổng = giờ OT) | "byProject" (theo dự án —
  //   mỗi khối dự án chọn nhiều NV + 1 số giờ; các NV có thể khác giờ nhau → KHÔNG ép tổng = giờ OT).
  allocMode: z.enum(["byEmployee", "byProject"]).optional(),
  projectCode: z.string().optional().nullable(),   // (cũ) Dự án chung của đợt — giữ tương thích
  memberIds: z.array(z.string()).optional(),
  memberNames: z.array(z.string()).optional(),
  // MỚI: mỗi NV × dự án × giờ (1 NV có thể nhiều dự án). Tổng giờ mỗi NV = giờ OT của đơn.
  memberProjects: z.array(z.object({
    employeeId: z.string(),
    employeeName: z.string().optional().nullable(),
    projectCode: z.string().min(1),
    hours: z.number().positive(),
    reason: z.string().optional().nullable(),   // lý do OT theo từng NV
    startTime: z.string().optional().nullable(), // khung giờ RIÊNG của dự án/khối (tab theo dự án)
    endTime: z.string().optional().nullable(),
  })).optional(),
});

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}
// Phút kết thúc: "00:00" = CUỐI ngày (24:00) để nhập được khung "22:00–00:00".
function endToMinutes(t: string): number {
  const m = timeToMinutes(t);
  return m === 0 ? 1440 : m;
}

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }

  const userRole = (session.user as any).role;
  const userId = (session.user as any).id;
  const { searchParams } = new URL(request.url);
  const statusFilter = searchParams.get("status") || "";

  const where: Record<string, unknown> = {};

  if (userRole === "EMPLOYEE" || userRole === "TEAM_LEAD" || userRole === "MANAGER") {
    // Phạm vi dữ liệu (Tăng ca) cho role thường; mặc định MANAGER=phòng mình, còn lại=chỉ mình.
    const scope = await resolveScope(userId, userRole, "m3.tangca");
    applyScope(where, scopeWhere(scope, {
      deptPath: (ids) => ({ employee: { departmentId: { in: ids } } }),
      selfPath: (empId) => ({ employeeId: empId }),
    }));
  } else {
    // BOM/HR_ADMIN/ADMIN: nếu là GIÁM ĐỐC KHỐI → CHỈ thấy đơn của phòng ban thuộc (các) khối mình.
    const khoiIds = await getDirectedKhoiIds(userId);
    if (khoiIds.length) {
      const deptIds = await departmentIdsOfKhois(khoiIds);
      where.employee = { departmentId: { in: deptIds } };
    }
    // ADMIN/HC không phải giám đốc khối → xem tất cả (phục vụ vận hành/lương).
  }

  if (statusFilter) where.status = statusFilter;

  const data = await prisma.oTRequest.findMany({
    where,
    include: { employee: { include: { department: true } }, memberProjects: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json({ data });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }

  const userId = (session.user as any).id;
  const body = await request.json();
  const parsed = CreateOTSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", details: parsed.error.issues } },
      { status: 400 }
    );
  }

  const { date, startTime, endTime, reason, otRate, teamId, teamName, allocMode, projectCode, memberIds, memberNames, memberProjects } = parsed.data;

  if (endToMinutes(endTime) <= timeToMinutes(startTime)) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Giờ kết thúc phải sau giờ bắt đầu. Nếu làm qua nửa đêm, hãy tách 2 đơn: …→00:00 và 00:00→…" } },
      { status: 400 }
    );
  }

  // Allow OT submission up to 3 days in the past (grace period for missed submissions)
  const threeDaysAgo = new Date();
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
  threeDaysAgo.setHours(0, 0, 0, 0);
  if (date < threeDaysAgo) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Chỉ được kê khai OT trong vòng 3 ngày trước" } },
      { status: 400 }
    );
  }

  const employee = await prisma.employee.findFirst({ where: { userId }, include: { department: true } });
  if (!employee) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "Không tìm thấy nhân viên" } }, { status: 404 });
  }

  // (Đã bỏ chặn trùng đơn OT theo người gửi — đầu mối gửi nhiều đề xuất cùng ngày là bình thường.)

  const hours = (endToMinutes(endTime) - timeToMinutes(startTime)) / 60;

  // MỚI: nếu có phân bổ dự án theo NV → validate tổng giờ mỗi NV = giờ OT của đơn (sai số nhỏ cho float).
  let finalMemberIds = memberIds ?? [];
  let finalMemberNames = memberNames ?? [];
  if (memberProjects && memberProjects.length > 0) {
    const byEmp = new Map<string, { name: string; sum: number }>();
    for (const mp of memberProjects) {
      const cur = byEmp.get(mp.employeeId) ?? { name: mp.employeeName || "", sum: 0 };
      cur.sum += mp.hours;
      if (mp.employeeName) cur.name = mp.employeeName;
      byEmp.set(mp.employeeId, cur);
    }
    // Chế độ THEO NHÂN SỰ: ép tổng giờ mỗi NV = giờ OT của đơn. Chế độ THEO DỰ ÁN: bỏ qua (mỗi NV
    //   có thể khác giờ — vd người 2h người 3h trên cùng/khác dự án).
    if (allocMode !== "byProject") {
      for (const [empId, v] of Array.from(byEmp.entries())) {
        if (Math.abs(v.sum - hours) > 0.01) {
          return NextResponse.json(
            { error: { code: "VALIDATION_ERROR", message: `Tổng giờ dự án của ${v.name || empId} (${v.sum}h) phải bằng giờ OT của đơn (${hours}h)` } },
            { status: 400 }
          );
        }
      }
    }
    // Danh sách NV suy ra từ phân bổ (đồng bộ memberIds/memberNames để tương thích hiển thị cũ).
    finalMemberIds = Array.from(byEmp.keys());
    finalMemberNames = Array.from(byEmp.values()).map((v) => v.name);
  }

  // Determine OT rate: weekend = 2.0, normal = 1.5
  const dayOfWeek = date.getDay();
  const rate = otRate || (dayOfWeek === 0 || dayOfWeek === 6 ? 2.0 : 1.5);

  const otRequest = await prisma.oTRequest.create({
    data: {
      employeeId: employee.id,
      date,
      startTime,
      endTime,
      hours,
      reason,
      otRate: rate,
      teamId: teamId || null,
      teamName: teamName || null,
      projectCode: projectCode || null,
      memberIds: finalMemberIds,
      memberNames: finalMemberNames,
      status: "PENDING",
      ...(memberProjects && memberProjects.length > 0 ? {
        memberProjects: {
          create: memberProjects.map((mp) => ({
            employeeId: mp.employeeId,
            employeeName: mp.employeeName || "",
            projectCode: mp.projectCode,
            hours: mp.hours,
            reason: mp.reason || null,
            startTime: mp.startTime || null,
            endTime: mp.endTime || null,
          })),
        },
      } : {}),
    },
    include: { employee: { include: { department: true } }, memberProjects: true },
  });

  // Báo TẤT CẢ giám đốc của khối phụ trách phòng ban người đề xuất (luồng A — GĐ khối duyệt thẳng).
  const directors = await directorsOfDepartment(employee.departmentId);
  if (directors) {
    await Promise.all(
      directors.directorUserIds.map((uid) =>
        prisma.notification.create({
          data: {
            userId: uid,
            title: "Đề xuất OT chờ duyệt",
            message: `${employee.fullName} (${employee.department?.name || ""}) đề xuất OT ${hours.toFixed(1)} giờ ngày ${date.toLocaleDateString("vi-VN")}`,
            type: "APPROVAL_REQUIRED",
            referenceType: "ot_request",
            referenceId: otRequest.id,
          },
        })
      )
    );
  }

  return NextResponse.json({ data: otRequest }, { status: 201 });
}
