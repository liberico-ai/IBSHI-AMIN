"use client";
import React, { useEffect, useRef, useState } from "react";

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">;

export function DateInput({ onClick, ...props }: Props) {
  return (
    <input
      type="date"
      {...props}
      onClick={(e) => {
        (e.currentTarget as HTMLInputElement).showPicker?.();
        onClick?.(e);
      }}
    />
  );
}

// TimeInput — luôn ĐỊNH DẠNG 24H, không phụ thuộc locale trình duyệt.
// Cho phép: GÕ TAY (HH:mm) hoặc KÉO CHỌN từ dropdown Giờ/Phút.
type TimeProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange"> & {
  value?: string;
  onChange?: (e: { target: { value: string } }) => void;
};

export function TimeInput({ value = "", onChange, onFocus, className, style, ...props }: TimeProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hh, mm] = (value || "").split(":");
  const emit = (v: string) => onChange?.({ target: { value: v } });

  useEffect(() => {
    if (!open) return;
    const h = (ev: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(ev.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  // Gõ tay: chỉ giữ số + dấu ":" (tối đa "HH:mm"). Chuẩn hoá đầy đủ khi rời ô.
  function handleType(e: React.ChangeEvent<HTMLInputElement>) {
    emit(e.target.value.replace(/[^\d:]/g, "").slice(0, 5));
  }
  function normalize() {
    const m = (value || "").match(/^(\d{1,2}):?(\d{0,2})$/);
    if (!m) { if (value) emit(""); return; }
    const H = Math.min(23, parseInt(m[1] || "0", 10) || 0);
    const M = Math.min(59, parseInt(m[2] || "0", 10) || 0);
    emit(`${String(H).padStart(2, "0")}:${String(M).padStart(2, "0")}`);
  }

  const hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
  const mins = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));
  const cell = (active: boolean): React.CSSProperties => ({
    padding: "4px 0", cursor: "pointer", fontSize: 13, textAlign: "center", borderRadius: 6,
    background: active ? "var(--ibs-accent)" : "transparent",
    color: active ? "#fff" : "var(--ibs-text)", fontWeight: active ? 700 : 400,
  });
  const colHead: React.CSSProperties = {
    fontSize: 10, textAlign: "center", color: "var(--ibs-text-dim)", padding: "2px 0",
    position: "sticky", top: 0, background: "var(--ibs-bg-card)",
  };

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <input
        type="text"
        inputMode="numeric"
        placeholder="HH:mm"
        value={value}
        className={className}
        style={style}
        onChange={handleType}
        onFocus={(e) => { setOpen(true); onFocus?.(e); }}
        onBlur={normalize}
        {...props}
      />
      {open && (
        <div
          style={{
            position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 70,
            display: "flex", gap: 4, padding: 6, borderRadius: 10,
            background: "var(--ibs-bg-card)", border: "1px solid var(--ibs-border)",
            boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
          }}
        >
          <div style={{ maxHeight: 176, overflowY: "auto", width: 52 }}>
            <div style={colHead}>Giờ</div>
            {hours.map((h) => (
              <div key={h} style={cell(h === hh)} onMouseDown={(e) => { e.preventDefault(); emit(`${h}:${mm || "00"}`); }}>{h}</div>
            ))}
          </div>
          <div style={{ maxHeight: 176, overflowY: "auto", width: 52 }}>
            <div style={colHead}>Phút</div>
            {mins.map((m) => (
              <div key={m} style={cell(m === mm)} onMouseDown={(e) => { e.preventDefault(); emit(`${hh || "00"}:${m}`); }}>{m}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
