"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Search, Bell, Bot, HelpCircle, Check, CheckCheck, Menu } from "lucide-react";
import { formatDate } from "@/lib/utils";

type Notification = {
  id: string;
  title: string;
  message: string;
  type: string;
  isRead: boolean;
  createdAt: string;
  referenceType?: string;
  referenceId?: string;
};

const NOTIF_TYPE_ICON: Record<string, string> = {
  APPROVAL_REQUIRED: "🔔",
  APPROVED: "✅",
  REJECTED: "❌",
  EXPIRY_WARNING: "⚠️",
  HSE_ALERT: "🦺",
  SYSTEM: "ℹ️",
};

export function Header({ onMenuClick }: { onMenuClick?: () => void }) {
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  function fetchNotifications() {
    fetch("/api/v1/notifications?limit=20")
      .then((r) => r.json())
      .then((res) => {
        if (res.data) {
          setNotifications(res.data);
          setUnreadCount(res.unreadCount || 0);
        }
      })
      .catch(() => {});
  }

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000); // poll every 30s
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function getNotifRoute(n: Notification): string | null {
    switch (n.referenceType) {
      case "leave_request": return "/cham-cong";
      case "ot_request": return "/cham-cong";
      case "employee": return n.referenceId ? `/ho-so/${n.referenceId}` : "/ho-so";
      case "contract": return "/ho-so";
      case "certificate": return "/ho-so";
      case "vehicle_booking": return "/hanh-chinh/xe";
      case "visitor": return "/hanh-chinh/khach";
      case "hse": return "/hse";
      default: return null;
    }
  }

  async function markAsRead(id: string) {
    await fetch(`/api/v1/notifications/${id}`, { method: "PUT" });
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
    );
    setUnreadCount((c) => Math.max(0, c - 1));
  }

  function handleNotifClick(n: Notification) {
    if (!n.isRead) markAsRead(n.id);
    const route = getNotifRoute(n);
    if (route) {
      setOpen(false);
      router.push(route);
    }
  }

  async function markAllRead() {
    await fetch("/api/v1/notifications?readAll=true", { method: "PUT" });
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnreadCount(0);
  }

  return (
    <header
      className="h-[60px] flex items-center px-6 gap-4 border-b flex-shrink-0"
      style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}
    >
      {/* Mobile hamburger */}
      <button
        onClick={onMenuClick}
        className="md:hidden w-8 h-8 flex items-center justify-center rounded-lg flex-shrink-0"
        style={{ color: "var(--ibs-text-muted)" }}
      >
        <Menu size={18} />
      </button>

      {/* Search */}
      <div className="relative flex-1 max-w-[400px]">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2"
          style={{ color: "var(--ibs-text-dim)" }} />
        <input
          type="text"
          placeholder="Tìm kiếm nhân viên, quy trình, văn bản..."
          className="w-full pl-9 pr-3 py-2 rounded-lg text-[13px] outline-none transition-colors"
          style={{ background: "var(--ibs-bg)", border: "1px solid var(--ibs-border)", color: "var(--ibs-text)" }}
        />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 ml-auto">

        {/* Notifications */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setOpen((o) => !o)}
            className="relative w-9 h-9 rounded-lg border flex items-center justify-center transition-colors"
            style={{
              borderColor: open ? "var(--ibs-accent)" : "var(--ibs-border)",
              color: open ? "var(--ibs-accent)" : "var(--ibs-text-muted)",
              background: open ? "rgba(0,180,216,0.08)" : "transparent",
            }}
            title="Thông báo"
          >
            <Bell size={16} />
            {unreadCount > 0 && (
              <span
                className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-[9px] font-bold text-white flex items-center justify-center"
                style={{ background: "var(--ibs-danger)", border: "2px solid var(--ibs-bg-card)" }}
              >
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>

          {/* Dropdown */}
          {open && (
            <div
              className="absolute right-0 top-[44px] w-[360px] rounded-xl border shadow-2xl z-50 overflow-hidden"
              style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}
            >
              {/* Header */}
              <div className="px-4 py-3 border-b flex justify-between items-center"
                style={{ borderColor: "var(--ibs-border)" }}>
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-semibold">Thông báo</span>
                  {unreadCount > 0 && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                      style={{ background: "var(--ibs-danger)", color: "#fff" }}>
                      {unreadCount}
                    </span>
                  )}
                </div>
                {unreadCount > 0 && (
                  <button
                    onClick={markAllRead}
                    className="flex items-center gap-1 text-[11px] transition-colors"
                    style={{ color: "var(--ibs-accent)" }}
                  >
                    <CheckCheck size={12} /> Đọc tất cả
                  </button>
                )}
              </div>

              {/* List */}
              <div className="max-h-[360px] overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="text-center py-10 text-[13px]"
                    style={{ color: "var(--ibs-text-dim)" }}>
                    Không có thông báo nào
                  </div>
                ) : (
                  notifications.map((n) => (
                    <div
                      key={n.id}
                      onClick={() => handleNotifClick(n)}
                      className="flex gap-3 px-4 py-3 cursor-pointer transition-colors border-b"
                      style={{
                        borderColor: "rgba(51,65,85,0.4)",
                        background: n.isRead ? "transparent" : "rgba(0,180,216,0.04)",
                      }}
                      onMouseEnter={(e) =>
                        ((e.currentTarget as HTMLDivElement).style.background = "rgba(46,117,182,0.06)")
                      }
                      onMouseLeave={(e) =>
                        ((e.currentTarget as HTMLDivElement).style.background = n.isRead
                          ? "transparent"
                          : "rgba(0,180,216,0.04)")
                      }
                    >
                      <span className="text-[18px] mt-0.5 flex-shrink-0">
                        {NOTIF_TYPE_ICON[n.type] || "🔔"}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className={`text-[13px] font-medium truncate ${!n.isRead ? "text-white" : ""}`}>
                            {n.title}
                          </span>
                          {!n.isRead && (
                            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                              style={{ background: "var(--ibs-accent)" }} />
                          )}
                        </div>
                        <p className="text-[12px] leading-relaxed" style={{ color: "var(--ibs-text-muted)" }}>
                          {n.message}
                        </p>
                        <div className="text-[10px] mt-1" style={{ color: "var(--ibs-text-dim)" }}>
                          {formatDate(new Date(n.createdAt), "relative")}
                        </div>
                      </div>
                      {n.isRead && (
                        <Check size={12} className="flex-shrink-0 mt-1" style={{ color: "var(--ibs-text-dim)" }} />
                      )}
                    </div>
                  ))
                )}
              </div>

              {/* Footer */}
              <div className="px-4 py-2.5 border-t text-center"
                style={{ borderColor: "var(--ibs-border)" }}>
                <a href="/cai-dat" className="text-[11px]" style={{ color: "var(--ibs-accent)" }}>
                  Xem tất cả thông báo
                </a>
              </div>
            </div>
          )}
        </div>

        {/* Bot VP */}
        <button
          className="w-9 h-9 rounded-lg border flex items-center justify-center transition-colors"
          style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-muted)" }}
          title="Bot VP"
        >
          <Bot size={16} />
        </button>

        {/* Help */}
        <button
          className="w-9 h-9 rounded-lg border flex items-center justify-center transition-colors"
          style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-muted)" }}
          title="Trợ giúp"
        >
          <HelpCircle size={16} />
        </button>
      </div>
    </header>
  );
}
