"use client";
// Modal xác nhận / thông báo dùng chung — gọi imperative (await) từ bất kỳ event handler nào,
// thay cho window.confirm()/alert() mặc định của trình duyệt.
//   const ok = await confirmDialog("Xoá mục này?");        // → true/false
//   await confirmDialog({ title, message, tone: "danger", confirmText });
//   await alertDialog("Đã lưu thành công");                // 1 nút OK
import React from "react";
import { createRoot } from "react-dom/client";

export interface ConfirmOptions {
  title?: string;
  message: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  tone?: "default" | "danger";
}

function Dialog({ opts, mode, onClose }: { opts: ConfirmOptions; mode: "confirm" | "alert"; onClose: (v: boolean) => void }) {
  const danger = opts.tone === "danger";
  const accent = danger ? "var(--ibs-danger, #dc2626)" : "var(--ibs-accent)";
  React.useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(false); if (e.key === "Enter") onClose(true); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4" onClick={() => onClose(false)}>
      <div className="rounded-2xl w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}
        style={{ background: "var(--ibs-bg-card)", border: "1px solid var(--ibs-border)", boxShadow: "0 20px 60px rgba(0,0,0,0.25)" }}>
        {opts.title && <div className="text-[15px] font-bold mb-1.5" style={{ color: "var(--ibs-text)" }}>{opts.title}</div>}
        <div className="text-[13px] leading-relaxed mb-5" style={{ color: "var(--ibs-text-muted)" }}>{opts.message}</div>
        <div className="flex justify-end gap-2">
          {mode === "confirm" && (
            <button onClick={() => onClose(false)} className="px-4 py-2 rounded-lg text-[13px] font-medium border"
              style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-dim)", background: "var(--ibs-bg)" }}>
              {opts.cancelText || "Huỷ"}
            </button>
          )}
          <button onClick={() => onClose(true)} autoFocus className="px-4 py-2 rounded-lg text-[13px] font-semibold text-white"
            style={{ background: accent }}>
            {opts.confirmText || (mode === "alert" ? "OK" : "Xác nhận")}
          </button>
        </div>
      </div>
    </div>
  );
}

function show(opts: ConfirmOptions, mode: "confirm" | "alert"): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof document === "undefined") { resolve(mode === "alert"); return; }
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const close = (v: boolean) => { try { root.unmount(); } catch {} host.remove(); resolve(v); };
    root.render(<Dialog opts={opts} mode={mode} onClose={close} />);
  });
}

export function confirmDialog(opts: ConfirmOptions | string): Promise<boolean> {
  return show(typeof opts === "string" ? { message: opts } : opts, "confirm");
}

export function alertDialog(opts: ConfirmOptions | string): Promise<boolean> {
  return show(typeof opts === "string" ? { message: opts } : opts, "alert");
}
