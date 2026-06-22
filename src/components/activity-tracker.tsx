"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

// Ghi log truy cập module mỗi khi NV điều hướng sang trang mới.
// Dedupe path liên tiếp giống nhau để tránh log trùng.
export function ActivityTracker() {
  const pathname = usePathname();
  const last = useRef<string>("");

  useEffect(() => {
    if (!pathname || pathname === last.current) return;
    last.current = pathname;
    try {
      fetch("/api/v1/activity-log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: pathname }),
        keepalive: true,
      }).catch(() => {});
    } catch {}
  }, [pathname]);

  return null;
}
