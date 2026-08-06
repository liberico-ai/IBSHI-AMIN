"use client";

import { useState, useEffect, type CSSProperties } from "react";
import { OT_PROJECTS } from "@/lib/projects";

const KHAC = "__KHAC__";

// Ô chọn Mã dự án dùng chung: danh sách OT_PROJECTS + dòng "Khác" → hiện ô nhập tay tên dự án.
//   value = mã dự án (chuỗi tự do khi Khác); onChange trả về chuỗi cuối cùng.
export function ProjectSelect({ value, onChange, cls, style, wrapClassName, wrapStyle }: {
  value: string;
  onChange: (v: string) => void;
  cls?: string;          // class cho select + input
  style?: CSSProperties; // style nền cho select + input
  wrapClassName?: string;
  wrapStyle?: CSSProperties;
}) {
  const isKnown = OT_PROJECTS.includes(value);
  const [other, setOther] = useState(!isKnown && !!value); // giá trị lạ (không có trong list) → chế độ nhập tay
  useEffect(() => { if (isKnown) setOther(false); }, [isKnown]);
  const showOther = other || (!isKnown && !!value);
  const selVal = isKnown ? value : (showOther ? KHAC : "");
  const inner = { ...(style || {}), width: "100%" as const };
  return (
    <div className={wrapClassName} style={wrapStyle}>
      <select
        value={selVal}
        onChange={(e) => { const v = e.target.value; if (v === KHAC) { setOther(true); onChange(""); } else { setOther(false); onChange(v); } }}
        className={cls}
        style={inner}
      >
        <option value="">—</option>
        {OT_PROJECTS.map((x) => <option key={x} value={x}>{x}</option>)}
        <option value={KHAC}>✎ Khác (nhập tay)…</option>
      </select>
      {showOther && (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Nhập tên dự án…"
          className={cls}
          style={{ ...inner, marginTop: 4 }}
        />
      )}
    </div>
  );
}
