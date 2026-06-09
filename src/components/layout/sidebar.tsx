"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, User, Building2, CalendarDays, Users, GraduationCap,
  Trophy, Banknote, FileText, AlertTriangle, Briefcase, Car,
  UtensilsCrossed, Sparkles, UserPlus, Calendar, BarChart3, Settings,
  DoorOpen, Wrench, Package, Inbox, Send,
  X, LogOut,
  type LucideIcon,
} from "lucide-react";
import { signOut } from "next-auth/react";
import { getInitials } from "@/lib/utils";

const iconMap: Record<string, LucideIcon> = {
  LayoutDashboard, User, Building2, CalendarDays, Users, GraduationCap,
  Trophy, Banknote, FileText, AlertTriangle, Briefcase, Car,
  UtensilsCrossed, Sparkles, UserPlus, Calendar, BarChart3, Settings,
  DoorOpen, Wrench, Package, Inbox, Send,
};

type NavItem = {
  icon: string;
  label: string;
  href: string;
  badge: number | null;
  badgeType?: "warn";
};

type NavSection = {
  section: string;
  items: readonly NavItem[];
  subItems?: readonly NavItem[];
};

const NAV_SECTIONS: NavSection[] = [
  {
    section: "Tổng quan",
    items: [
      { icon: "LayoutDashboard", label: "Dashboard", href: "/", badge: null },
    ],
  },
  {
    section: "Nhân sự (HR)",
    items: [
      { icon: "User", label: "M1 - Hồ sơ nhân sự", href: "/ho-so", badge: null },
      { icon: "Building2", label: "M2 - Sơ đồ tổ chức", href: "/so-do", badge: null },
      { icon: "CalendarDays", label: "M3 - Chấm công", href: "/cham-cong", badge: 2 },
      { icon: "Users", label: "M4 - Tuyển dụng", href: "/tuyen-dung", badge: 3, badgeType: "warn" },
      { icon: "GraduationCap", label: "M5 - Đào tạo", href: "/dao-tao", badge: null },
      { icon: "Trophy", label: "M6 - Đánh giá & KPI", href: "/kpi", badge: null },
      { icon: "Banknote", label: "M7 - Lương & Phúc lợi", href: "/luong", badge: null },
    ],
  },
  {
    section: "Quản trị",
    items: [
      { icon: "FileText", label: "M8 - Kỷ luật & Quy định", href: "/ky-luat", badge: null },
      { icon: "AlertTriangle", label: "M9 - HSE An toàn", href: "/hse", badge: 1 },
      { icon: "Briefcase", label: "M10 - Hành chính", href: "/hanh-chinh", badge: null },
    ],
    subItems: [
      { icon: "DoorOpen", label: "Đặt phòng họp", href: "/hanh-chinh/phong-hop", badge: null },
      { icon: "Car", label: "Quản lý xe", href: "/hanh-chinh/xe", badge: null },
      { icon: "Wrench", label: "Yêu cầu cấp phát, sửa chữa thiết bị VP", href: "/hanh-chinh/sua-chua", badge: null },
      { icon: "Package", label: "Văn phòng phẩm", href: "/hanh-chinh/vpp", badge: null },
      { icon: "UtensilsCrossed", label: "Nhà ăn", href: "/hanh-chinh/nha-an", badge: null },
      { icon: "Sparkles", label: "Vệ sinh", href: "/hanh-chinh/ve-sinh", badge: null },
      { icon: "UserPlus", label: "Đăng ký khách", href: "/hanh-chinh/khach", badge: 2, badgeType: "warn" },
      { icon: "Calendar", label: "Sự kiện & Audit", href: "/hanh-chinh/su-kien", badge: 1 },
      { icon: "Inbox", label: "Công văn đến", href: "/hanh-chinh/cong-van-den", badge: null },
      { icon: "Send", label: "Công văn đi", href: "/hanh-chinh/cong-van-di", badge: null },
    ],
  },
  {
    section: "Hệ thống",
    items: [
      { icon: "BarChart3", label: "Báo cáo", href: "/bao-cao", badge: null },
      { icon: "Settings", label: "Cài đặt", href: "/cai-dat", badge: null },
    ],
  },
];

const ROLE_LABELS: Record<string, string> = {
  BOM: "Ban Giám đốc",
  HR_ADMIN: "P. Hành chính NS",
  MANAGER: "Trưởng phòng",
  TEAM_LEAD: "Tổ trưởng",
  EMPLOYEE: "Nhân viên",
};

interface SidebarProps {
  userName?: string;
  userRole?: string;
  canViewPayroll?: boolean;
  open?: boolean;
  onClose?: () => void;
}

export function Sidebar({ userName = "Admin", userRole = "BOM", canViewPayroll = false, open = true, onClose }: SidebarProps) {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  return (
    <>
      {/* Mobile overlay — visible when sidebar is open on small screens */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`
          fixed md:relative z-50 md:z-auto
          w-[260px] flex flex-col flex-shrink-0 border-r h-screen overflow-hidden
          transition-transform duration-300
          ${open ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
        `}
        style={{
          background: "var(--ibs-bg-sidebar)",
          borderColor: "rgba(255,255,255,0.08)",
        }}
      >
        {/* Logo */}
        <div className="px-5 py-5 border-b flex items-center justify-between" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
          <div>
            <h1 className="text-lg font-extrabold tracking-tight text-white">
              IBS<span style={{ color: "var(--ibs-red)" }}>ONE</span>
            </h1>
            <p className="text-[11px] mt-0.5" style={{ color: "rgba(255,255,255,0.45)" }}>
              Admin Platform v1.2
            </p>
          </div>
          {/* Mobile close */}
          <button
            onClick={onClose}
            className="md:hidden p-1 rounded"
            style={{ color: "rgba(255,255,255,0.6)" }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-3">
          {NAV_SECTIONS.map((section) => (
            <div key={section.section}>
              <div
                className="px-5 py-2 text-[10px] uppercase tracking-[1.2px] font-semibold"
                style={{ color: "rgba(255,255,255,0.4)" }}
              >
                {section.section}
              </div>
              {section.items.filter((item) => canViewPayroll || item.href !== "/luong").map((item) => {
                const Icon = iconMap[item.icon];
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onClose}
                    className="flex items-center gap-3 px-5 py-2.5 text-[13.5px] transition-all border-l-[3px]"
                    style={{
                      color: active ? "#ffffff" : "rgba(255,255,255,0.7)",
                      background: active ? "rgba(230,57,70,0.18)" : "transparent",
                      borderLeftColor: active ? "var(--ibs-red)" : "transparent",
                      fontWeight: active ? 600 : 400,
                    }}
                  >
                    {Icon && <Icon size={20} />}
                    <span>{item.label}</span>
                    {item.badge && (
                      <span
                        className="ml-auto text-[10px] px-[7px] py-[2px] rounded-[10px] font-bold text-white"
                        style={{
                          background: item.badgeType === "warn" ? "var(--ibs-warning)" : "var(--ibs-danger)",
                        }}
                      >
                        {item.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
              {section.subItems?.map((item) => {
                const Icon = iconMap[item.icon];
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onClose}
                    className="flex items-center gap-3 py-2.5 text-[12.5px] transition-all border-l-[3px]"
                    style={{
                      paddingLeft: "44px",
                      color: active ? "#ffffff" : "rgba(255,255,255,0.7)",
                      background: active ? "rgba(230,57,70,0.18)" : "transparent",
                      borderLeftColor: active ? "var(--ibs-red)" : "transparent",
                      fontWeight: active ? 600 : 400,
                    }}
                  >
                    {Icon && <Icon size={16} />}
                    <span>{item.label}</span>
                    {item.badge && (
                      <span
                        className="ml-auto mr-5 text-[10px] px-[7px] py-[2px] rounded-[10px] font-bold text-white"
                        style={{
                          background: item.badgeType === "warn" ? "var(--ibs-warning)" : "var(--ibs-danger)",
                        }}
                      >
                        {item.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* User Card */}
        <div
          className="px-5 py-4 border-t flex items-center gap-3"
          style={{ borderColor: "rgba(255,255,255,0.08)" }}
        >
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
            style={{
              background: "var(--ibs-red)",
            }}
          >
            {getInitials(userName)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-semibold truncate text-white">
              {userName}
            </div>
            <div className="text-[11px]" style={{ color: "rgba(255,255,255,0.5)" }}>
              {ROLE_LABELS[userRole] || userRole}
            </div>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            title="Đăng xuất"
            className="flex-shrink-0 p-1.5 rounded-lg transition-colors"
            style={{ color: "rgba(255,255,255,0.5)" }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "var(--ibs-red)")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.5)")}
          >
            <LogOut size={15} />
          </button>
        </div>
      </aside>
    </>
  );
}
