import { PageTitle } from "@/components/layout/page-title";
import Link from "next/link";
import prisma from "@/lib/prisma";
import { formatDate } from "@/lib/utils";
import {
  CalendarDays, Banknote, FileEdit, AlertTriangle,
  Car, UtensilsCrossed, UserPlus, Calendar,
  Users, CheckCircle2, ClipboardList, ShieldAlert,
} from "lucide-react";

function StatCard({
  icon: Icon, iconBg, iconColor, value, label, change, changeType,
}: {
  icon: any; iconBg: string; iconColor: string;
  value: string | number; label: string; change?: string;
  changeType?: "up" | "down" | "neutral";
}) {
  const changeColors = {
    up:      { bg: "rgba(16,185,129,0.15)",  color: "var(--ibs-success)" },
    down:    { bg: "rgba(239,68,68,0.15)",   color: "var(--ibs-danger)" },
    neutral: { bg: "rgba(245,158,11,0.15)",  color: "var(--ibs-warning)" },
  };
  return (
    <div className="rounded-xl p-5 border transition-all duration-200 hover:translate-y-[-2px]"
      style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
      <div className="flex justify-between items-center mb-3">
        <div className="w-10 h-10 rounded-[10px] flex items-center justify-center"
          style={{ background: iconBg, color: iconColor }}>
          <Icon size={18} />
        </div>
        {change && changeType && (
          <span className="text-[11px] px-2 py-[3px] rounded-xl font-semibold"
            style={{ background: changeColors[changeType].bg, color: changeColors[changeType].color }}>
            {change}
          </span>
        )}
      </div>
      <div className="text-[28px] font-extrabold mb-1">{value}</div>
      <div className="text-xs" style={{ color: "var(--ibs-text-dim)" }}>{label}</div>
    </div>
  );
}

function QuickAction({ icon: Icon, label, href }: { icon: any; label: string; href: string }) {
  return (
    <Link href={href}
      className="rounded-xl p-4 text-center border transition-all duration-200 hover:translate-y-[-2px] block"
      style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
      <div className="text-2xl mb-2 flex justify-center">
        <Icon size={24} style={{ color: "var(--ibs-text-muted)" }} />
      </div>
      <div className="text-xs font-medium" style={{ color: "var(--ibs-text-muted)" }}>{label}</div>
    </Link>
  );
}

function AttendanceBar({ label, present, total, hasData }: { label: string; present: number; total: number; hasData: boolean }) {
  const pct = total > 0 ? Math.round((present / total) * 100) : 0;
  const color = pct === 100 ? "var(--ibs-accent)" : pct >= 90 ? "var(--ibs-success)" : "var(--ibs-warning)";
  return (
    <div className="flex items-center gap-3 mb-2.5">
      <div className="w-[110px] text-xs text-right flex-shrink-0" style={{ color: "var(--ibs-text-muted)" }}>{label}</div>
      <div className="flex-1 h-6 rounded relative overflow-hidden" style={{ background: "var(--ibs-bg)" }}>
        {hasData ? (
          <div className="h-full rounded flex items-center pl-2 text-[11px] font-semibold text-white transition-all duration-500"
            style={{ width: `${pct}%`, background: color, minWidth: "36px" }}>
            {pct}%
          </div>
        ) : (
          <div className="h-full flex items-center pl-2 text-[11px]" style={{ color: "var(--ibs-text-dim)" }}>
            Chưa chấm công
          </div>
        )}
      </div>
      <div className="w-[50px] text-xs font-semibold text-right flex-shrink-0" style={{ color: hasData ? color : "var(--ibs-text-dim)" }}>
        {hasData ? `${present}/${total}` : `—/${total}`}
      </div>
    </div>
  );
}

export default async function DashboardPage() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const thirtyDaysOut = new Date(today);
  thirtyDaysOut.setDate(thirtyDaysOut.getDate() + 30);

  // Real-time stats
  const [totalEmployees, presentTodayCount, pendingLeaveCount, expiringCount] = await Promise.all([
    prisma.employee.count({ where: { status: { in: ["ACTIVE", "PROBATION"] } } }),
    prisma.attendanceRecord.count({
      where: {
        date: { gte: today, lt: tomorrow },
        status: { in: ["PRESENT", "LATE", "HALF_DAY"] },
      },
    }),
    prisma.leaveRequest.count({ where: { status: "PENDING" } }),
    prisma.certificate.count({
      where: {
        expiryDate: { gte: today, lte: thirtyDaysOut },
        status: { notIn: ["REVOKED", "EXPIRED"] },
      },
    }),
  ]);

  const presentToday = presentTodayCount;
  const presentRate = totalEmployees > 0 ? ((presentToday / totalEmployees) * 100).toFixed(1) : "0.0";

  // Attendance by department
  const departments = await prisma.department.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
  });

  const attendanceSummary = await Promise.all(
    departments.map(async (dept) => {
      const total = await prisma.employee.count({
        where: { departmentId: dept.id, status: { in: ["ACTIVE", "PROBATION"] } },
      });
      const present = await prisma.attendanceRecord.count({
        where: {
          employee: { departmentId: dept.id },
          date: { gte: today, lt: tomorrow },
          status: { in: ["PRESENT", "LATE", "HALF_DAY"] },
        },
      });
      return {
        name: dept.name,
        present,
        total,
        hasData: present > 0,
      };
    })
  );

  // Pending items for "Cần xử lý"
  const [pendingLeaves, expiringContracts, expiringCerts] = await Promise.all([
    prisma.leaveRequest.findMany({
      where: { status: "PENDING" },
      include: { employee: true },
      take: 3,
      orderBy: { createdAt: "desc" },
    }),
    prisma.contract.findMany({
      where: { endDate: { lte: thirtyDaysOut }, status: { notIn: ["TERMINATED", "EXPIRED"] } },
      include: { employee: true },
      take: 2,
      orderBy: { endDate: "asc" },
    }),
    prisma.certificate.findMany({
      where: { expiryDate: { lte: thirtyDaysOut }, status: { notIn: ["REVOKED"] } },
      include: { employee: true },
      take: 2,
      orderBy: { expiryDate: "asc" },
    }),
  ]);

  type BadgeColor = "badge-yellow" | "badge-red" | "badge-blue";
  const pendingItems: { badge: string; badgeColor: BadgeColor; desc: string; time: string }[] = [
    ...pendingLeaves.map((lr) => ({
      badge: "Chờ duyệt", badgeColor: "badge-yellow" as BadgeColor,
      desc: `${lr.employee.fullName} - Đơn nghỉ ${lr.totalDays} ngày`,
      time: formatDate(lr.createdAt, "relative"),
    })),
    ...expiringContracts.map((c) => ({
      badge: c.endDate && c.endDate < today ? "Quá hạn" : "Cảnh báo",
      badgeColor: "badge-red" as BadgeColor,
      desc: `${c.employee.fullName} - HĐ hết hạn ${c.endDate ? formatDate(c.endDate) : "—"}`,
      time: "",
    })),
    ...expiringCerts.map((cert) => ({
      badge: cert.expiryDate && cert.expiryDate < today ? "Hết hạn" : "Cảnh báo",
      badgeColor: "badge-red" as BadgeColor,
      desc: `CC ${cert.name} - ${cert.employee.fullName}`,
      time: cert.expiryDate ? formatDate(cert.expiryDate) : "",
    })),
  ].slice(0, 6);

  const todayStr = formatDate(today);

  return (
    <div>
      <PageTitle title="Dashboard" description="Tổng quan Admin Platform - IBS Heavy Industry JSC" />

      {/* Phase Indicator */}
      <div className="flex gap-2 mb-5 flex-wrap">
        {[
          "Phase 1: Foundation (Q2/2026)",
          "Phase 2: Lifecycle (Q3/2026)",
          "Phase 3: Payroll (Q4/2026)",
          "Phase 4: Performance (Q1/2027)",
        ].map((p) => (
          <span key={p} className="px-3.5 py-1.5 rounded-[20px] text-[11px] font-semibold text-white"
            style={{ background: "var(--ibs-success)" }}>
            ✓ {p}
          </span>
        ))}
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard icon={Users} iconBg="rgba(0,180,216,0.15)" iconColor="var(--ibs-accent)"
          value={totalEmployees} label="Tổng CBNV" change="+5" changeType="up" />
        <StatCard icon={CheckCircle2} iconBg="rgba(16,185,129,0.15)" iconColor="var(--ibs-success)"
          value={presentToday} label="Có mặt hôm nay" change={`${presentRate}%`} changeType="up" />
        <StatCard icon={ClipboardList} iconBg="rgba(245,158,11,0.15)" iconColor="var(--ibs-warning)"
          value={pendingLeaveCount} label="Đơn nghỉ phép chờ duyệt"
          change={pendingLeaveCount > 0 ? `${pendingLeaveCount} chờ duyệt` : "Đã xử lý"}
          changeType="neutral" />
        <StatCard icon={ShieldAlert} iconBg="rgba(239,68,68,0.15)" iconColor="var(--ibs-danger)"
          value={expiringCount} label="Chứng chỉ sắp hết hạn"
          change={expiringCount > 0 ? `${expiringCount} cảnh báo` : "OK"}
          changeType={expiringCount > 0 ? "down" : "up"} />
      </div>

      {/* Quick Actions */}
      <h3 className="text-[15px] font-semibold mb-3">Self-Service: Thao tác nhanh</h3>
      <div className="grid grid-cols-4 gap-3 mb-4">
        <QuickAction icon={CalendarDays} label="Nộp đơn nghỉ phép" href="/cham-cong" />
        <QuickAction icon={Banknote} label="Xem Slip lương" href="/luong" />
        <QuickAction icon={FileEdit} label="Cập nhật hồ sơ" href="/ho-so" />
        <QuickAction icon={AlertTriangle} label="Báo cáo sự cố HSE" href="/hse" />
      </div>
      <div className="grid grid-cols-4 gap-3 mb-6">
        <QuickAction icon={Car} label="Đặt xe công tác" href="/hanh-chinh/xe" />
        <QuickAction icon={UtensilsCrossed} label="Đăng ký suất ăn" href="/hanh-chinh/nha-an" />
        <QuickAction icon={UserPlus} label="Đăng ký khách" href="/hanh-chinh/khach" />
        <QuickAction icon={Calendar} label="Lịch Audit / Sự kiện" href="/hanh-chinh/su-kien" />
      </div>

      {/* Two-column grid */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        {/* Attendance Chart */}
        <div className="rounded-xl border overflow-hidden"
          style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
          <div className="px-5 py-4 border-b flex justify-between items-center"
            style={{ borderColor: "var(--ibs-border)" }}>
            <h3 className="text-sm font-semibold">📅 Chấm công hôm nay - {todayStr}</h3>
            <span className="text-[11px] font-semibold px-2.5 py-[3px] rounded-xl"
              style={{ background: "rgba(16,185,129,0.15)", color: "var(--ibs-success)" }}>
              ● Live
            </span>
          </div>
          <div className="p-5">
            {attendanceSummary.map((s) => (
              <AttendanceBar key={s.name} label={s.name} present={s.present} total={s.total} hasData={s.hasData} />
            ))}
          </div>
        </div>

        {/* Pending Items */}
        <div className="rounded-xl border overflow-hidden"
          style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
          <div className="px-5 py-4 border-b flex justify-between items-center"
            style={{ borderColor: "var(--ibs-border)" }}>
            <h3 className="text-sm font-semibold">🔔 Cần xử lý</h3>
            <Link href="/cham-cong"
              className="text-[11px] px-2.5 py-1 rounded-lg border transition-colors"
              style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-muted)" }}>
              Xem tất cả
            </Link>
          </div>
          <div>
            {pendingItems.length === 0 ? (
              <div className="text-center py-8 text-[13px]" style={{ color: "var(--ibs-text-dim)" }}>
                Không có mục nào cần xử lý
              </div>
            ) : (
              <div className="overflow-x-auto">
              <table className="w-full">
                <tbody>
                  {pendingItems.map((item, i) => {
                    const badgeStyles: Record<string, { bg: string; color: string }> = {
                      "badge-yellow": { bg: "rgba(245,158,11,0.15)", color: "var(--ibs-warning)" },
                      "badge-red":    { bg: "rgba(239,68,68,0.15)",  color: "var(--ibs-danger)" },
                      "badge-blue":   { bg: "rgba(0,180,216,0.15)",  color: "var(--ibs-accent)" },
                    };
                    const style = badgeStyles[item.badgeColor] || badgeStyles["badge-yellow"];
                    return (
                      <tr key={i} className="hover:bg-[rgba(46,117,182,0.04)]">
                        <td className="px-4 py-3 text-[13px]"
                          style={{ borderBottom: "1px solid rgba(51,65,85,0.5)" }}>
                          <span className="text-[11px] font-semibold px-2.5 py-[3px] rounded-xl"
                            style={{ background: style.bg, color: style.color }}>
                            {item.badge}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-[13px]"
                          style={{ borderBottom: "1px solid rgba(51,65,85,0.5)" }}>
                          {item.desc}
                        </td>
                        <td className="px-4 py-3 text-[11px] whitespace-nowrap"
                          style={{ borderBottom: "1px solid rgba(51,65,85,0.5)", color: "var(--ibs-text-dim)" }}>
                          {item.time}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Module Status */}
      <h3 className="text-[15px] font-semibold mb-3">Truy cập nhanh — Tất cả modules</h3>
      <div className="grid grid-cols-5 gap-3 mb-6">
        {[
          { icon: "👤", name: "M1 Hồ sơ NV",     pct: 100, color: "var(--ibs-success)", status: "Hoàn thiện", href: "/ho-so" },
          { icon: "🏢", name: "M2 Sơ đồ TC",     pct: 100, color: "var(--ibs-success)", status: "Hoàn thiện", href: "/so-do" },
          { icon: "📅", name: "M3 Chấm công",    pct: 100, color: "var(--ibs-success)", status: "Hoàn thiện", href: "/cham-cong" },
          { icon: "👥", name: "M4 Tuyển dụng",   pct: 100, color: "var(--ibs-success)", status: "Hoàn thiện", href: "/tuyen-dung" },
          { icon: "🎓", name: "M5 Đào tạo",      pct: 100, color: "var(--ibs-success)", status: "Hoàn thiện", href: "/dao-tao" },
          { icon: "🏆", name: "M6 KPI",          pct: 100, color: "var(--ibs-success)", status: "Hoàn thiện", href: "/kpi" },
          { icon: "💰", name: "M7 Lương",        pct: 100, color: "var(--ibs-success)", status: "Hoàn thiện", href: "/luong" },
          { icon: "📋", name: "M8 Kỷ luật",      pct: 100, color: "var(--ibs-success)", status: "Hoàn thiện", href: "/ky-luat" },
          { icon: "🦺", name: "M9 HSE",          pct: 100, color: "var(--ibs-success)", status: "Hoàn thiện", href: "/hse" },
          { icon: "🏢", name: "M10 Hành chính",  pct: 100, color: "var(--ibs-success)", status: "Hoàn thiện", href: "/hanh-chinh" },
        ].map((mod) => (
          <Link key={mod.name} href={mod.href}
            className="rounded-[10px] p-4 border transition-all duration-200 hover:translate-y-[-2px] block"
            style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
            <div className="text-[22px] mb-2">{mod.icon}</div>
            <div className="text-xs font-semibold mb-1">{mod.name}</div>
            <div className="h-1.5 rounded-full overflow-hidden mb-1" style={{ background: "var(--ibs-bg)" }}>
              <div className="h-full rounded-full transition-all duration-500"
                style={{ width: `${mod.pct}%`, background: mod.color }} />
            </div>
            <div className="text-[10px] mt-1" style={{ color: mod.color }}>{mod.status}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
