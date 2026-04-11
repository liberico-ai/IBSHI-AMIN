"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export type CalendarEvent = {
  date: string | Date; // ISO string or Date
  label: string;
  color?: string;
};

interface MonthCalendarProps {
  events: CalendarEvent[];
  onDayClick?: (date: string, events: CalendarEvent[]) => void;
}

const WEEKDAYS = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const MONTHS_VN = [
  "Tháng 1", "Tháng 2", "Tháng 3", "Tháng 4", "Tháng 5", "Tháng 6",
  "Tháng 7", "Tháng 8", "Tháng 9", "Tháng 10", "Tháng 11", "Tháng 12",
];

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function MonthCalendar({ events, onDayClick }: MonthCalendarProps) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth()); // 0-indexed

  // Build events map: dateKey → events[]
  const eventMap: Record<string, CalendarEvent[]> = {};
  for (const ev of events) {
    const d = new Date(ev.date);
    if (isNaN(d.getTime())) continue;
    const key = toDateKey(d);
    if (!eventMap[key]) eventMap[key] = [];
    eventMap[key].push(ev);
  }

  // Build calendar grid
  const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  // Pad to complete last row
  while (cells.length % 7 !== 0) cells.push(null);

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 11) { setMonth(0); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  }

  const todayKey = toDateKey(today);

  return (
    <div className="rounded-xl border overflow-hidden" style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b" style={{ borderColor: "var(--ibs-border)" }}>
        <button onClick={prevMonth} className="p-1.5 rounded-lg hover:opacity-80" style={{ color: "var(--ibs-text-dim)" }}>
          <ChevronLeft size={16} />
        </button>
        <span className="text-[14px] font-semibold">
          {MONTHS_VN[month]} {year}
        </span>
        <button onClick={nextMonth} className="p-1.5 rounded-lg hover:opacity-80" style={{ color: "var(--ibs-text-dim)" }}>
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 border-b" style={{ borderColor: "var(--ibs-border)" }}>
        {WEEKDAYS.map((d) => (
          <div key={d} className="text-center py-2 text-[11px] font-semibold" style={{ color: "var(--ibs-text-dim)" }}>
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7">
        {cells.map((day, idx) => {
          if (!day) return <div key={`empty-${idx}`} className="min-h-[64px] border-b border-r last:border-r-0" style={{ borderColor: "var(--ibs-border)", opacity: 0.3 }} />;

          const dateKey = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const dayEvents = eventMap[dateKey] || [];
          const isToday = dateKey === todayKey;
          const isWeekend = (idx % 7 === 0) || (idx % 7 === 6); // Sun or Sat

          return (
            <div
              key={dateKey}
              onClick={() => dayEvents.length > 0 && onDayClick?.(dateKey, dayEvents)}
              className={`min-h-[64px] p-1.5 border-b border-r last:border-r-0 transition-colors ${dayEvents.length > 0 ? "cursor-pointer hover:opacity-80" : ""}`}
              style={{
                borderColor: "var(--ibs-border)",
                background: isToday ? "color-mix(in srgb, var(--ibs-accent) 8%, transparent)" : "transparent",
              }}
            >
              <div className={`text-[12px] font-semibold w-6 h-6 flex items-center justify-center rounded-full mb-1 ${isToday ? "text-white" : isWeekend ? "" : ""}`}
                style={{
                  background: isToday ? "var(--ibs-accent)" : "transparent",
                  color: isToday ? "#fff" : isWeekend ? "var(--ibs-danger)" : "var(--ibs-text)",
                }}>
                {day}
              </div>

              {/* Event dots (max 3 shown) */}
              <div className="flex flex-col gap-0.5">
                {dayEvents.slice(0, 3).map((ev, i) => (
                  <div
                    key={i}
                    className="text-[10px] px-1 rounded truncate leading-4"
                    style={{
                      background: `${ev.color || "var(--ibs-accent)"}20`,
                      color: ev.color || "var(--ibs-accent)",
                      border: `1px solid ${ev.color || "var(--ibs-accent)"}40`,
                    }}
                    title={ev.label}
                  >
                    {ev.label}
                  </div>
                ))}
                {dayEvents.length > 3 && (
                  <div className="text-[10px]" style={{ color: "var(--ibs-text-dim)" }}>+{dayEvents.length - 3} more</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
