"use client";

import { useState, useEffect, useMemo } from "react";
import { PageTitle } from "@/components/layout/page-title";
import { apiError } from "@/lib/utils";
import { X, Calendar, ClipboardList, ChevronDown, ChevronRight, Check, XCircle, Download } from "lucide-react";
import { confirmDialog, alertDialog } from "@/lib/confirm-dialog";
import { canApproveRoomVehicle } from "@/lib/access";

type Room = { id: string; code: string; name: string; capacity: number; equipment: string[] };
type Booking = {
  id: string; roomId: string; title: string; description?: string; priorityNote?: string;
  startTime: string; endTime: string; status: string; rejectReason?: string; seriesId?: string | null;
  room: { id: string; name: string; code: string; capacity: number };
  requester: { id: string; code: string; fullName: string };
};

const BOOKING_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  PENDING_APPROVAL: { label: "Chờ duyệt", color: "var(--ibs-warning)", bg: "rgba(234,179,8,0.12)" },
  APPROVED:         { label: "Đã duyệt", color: "#10b981", bg: "rgba(16,185,129,0.12)" },
  REJECTED:         { label: "Từ chối", color: "var(--ibs-danger)", bg: "rgba(239,68,68,0.12)" },
  CANCELLED:        { label: "Đã huỷ", color: "#6b7280", bg: "rgba(107,114,128,0.12)" },
};

const SLOT_START_HOUR = 7;
const SLOT_END_HOUR = 18;
const SLOTS_PER_DAY = (SLOT_END_HOUR - SLOT_START_HOUR) * 2;

function slotToTime(slotIdx: number): string {
  const totalMin = SLOT_START_HOUR * 60 + slotIdx * 30;
  const h = Math.floor(totalMin / 60), m = totalMin % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function timeToSlot(date: Date): number {
  return (date.getHours() - SLOT_START_HOUR) * 2 + Math.floor(date.getMinutes() / 30);
}

// Xuất Excel lịch sử đặt phòng: gọi API export rồi dựng workbook tải về.
async function exportRoomBookings(roomId: string, from: string, to: string) {
  const res = await fetch(`/api/v1/room-bookings/export?roomId=${roomId}&from=${from}&to=${to}`);
  const json = await res.json();
  if (!res.ok) throw new Error(apiError(res.status, json?.error));
  const { title, columns, rows } = json.data as { title: string; columns: { header: string; key: string; width?: number }[]; rows: Record<string, unknown>[] };

  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "IBS ONE Platform";
  wb.created = new Date();
  const ws = wb.addWorksheet("Lịch sử đặt phòng");

  ws.mergeCells(1, 1, 1, columns.length);
  const tc = ws.getCell(1, 1);
  tc.value = title;
  tc.font = { bold: true, size: 14 };
  ws.addRow([]);
  const hr = ws.addRow(columns.map((c) => c.header));
  hr.font = { bold: true, color: { argb: "FFFFFFFF" } };
  hr.eachCell((cell) => { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E293B" } }; });
  for (const r of rows) ws.addRow(columns.map((c) => (r[c.key] ?? "") as any));
  columns.forEach((c, i) => { ws.getColumn(i + 1).width = c.width || 16; });

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `lich-su-dat-phong_${from}_${to}.xlsx`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function PhongHopPage() {
  const [tab, setTab] = useState<"book" | "list">("book");
  const [me, setMe] = useState<{ id: string; employeeId: string | null; employeeCode: string; role: string } | null>(null);

  useEffect(() => {
    fetch("/api/v1/me").then((r) => r.json()).then(async (res) => {
      if (!res?.id) return;
      const list = await fetch(`/api/v1/room-bookings`).then((r) => r.json());
      setMe({ id: res.id, employeeId: list.myEmployeeId, employeeCode: res.employeeCode || "", role: res.role || "" });
    });
  }, []);

  return (
    <div>
      <PageTitle title="M10.1 — Đặt phòng họp" description="Đặt phòng + xem danh sách lịch đặt phòng" />

      <div className="flex gap-2 mb-4 border-b" style={{ borderColor: "var(--ibs-border)" }}>
        {[
          { k: "book", label: "Đặt phòng", icon: Calendar },
          { k: "list", label: "Danh sách đặt phòng", icon: ClipboardList },
        ].map((t) => {
          const Icon = t.icon;
          const active = tab === t.k;
          return (
            <button key={t.k} onClick={() => setTab(t.k as any)}
              className="flex items-center gap-1.5 px-4 py-2 text-[13px] font-semibold transition-colors"
              style={{ color: active ? "var(--ibs-accent)" : "var(--ibs-text-dim)", borderBottom: active ? "2px solid var(--ibs-accent)" : "2px solid transparent" }}>
              <Icon size={14} /> {t.label}
            </button>
          );
        })}
      </div>

      {tab === "book" && <BookTab onCreated={() => setTab("list")} />}
      {tab === "list" && <ListTab me={me} />}
    </div>
  );
}

function BookTab({ onCreated }: { onCreated: () => void }) {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomId, setRoomId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [slotStart, setSlotStart] = useState<number | null>(null);
  const [slotEnd, setSlotEnd] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priorityNote, setPriorityNote] = useState("");
  const [recurrenceOn, setRecurrenceOn] = useState(false);
  const [recurrenceDays, setRecurrenceDays] = useState<number[]>([]); // 0=CN..6=T7
  const [recurrenceUntil, setRecurrenceUntil] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Preview list ngày của series — cap 60 ngày hiển thị
  const recurrencePreview = useMemo(() => {
    if (!recurrenceOn || recurrenceDays.length === 0) return null;
    const start = new Date(date);
    // Nếu không nhập "đến ngày" → dùng cap 365 ngày
    const until = recurrenceUntil
      ? new Date(recurrenceUntil + "T23:59:59")
      : new Date(start.getTime() + 365 * 86400_000);
    if (until <= start) return null;
    const allowed = new Set(recurrenceDays);
    const dates: Date[] = [];
    let d = new Date(start);
    while (d.getTime() <= until.getTime() && dates.length < 60) {
      if (allowed.has(d.getDay())) dates.push(new Date(d));
      d = new Date(d.getTime() + 86400_000);
    }
    return dates;
  }, [recurrenceOn, recurrenceDays, recurrenceUntil, date]);

  // Khi bật/tắt: mặc định check thứ của ngày bắt đầu (nếu là CN → fallback T2)
  function toggleRecurrence(on: boolean) {
    setRecurrenceOn(on);
    if (on && recurrenceDays.length === 0) {
      const dow = new Date(date).getDay();
      setRecurrenceDays([dow === 0 ? 1 : dow]);
    }
  }
  function toggleDay(d: number) {
    setRecurrenceDays((prev) => prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort());
  }

  useEffect(() => {
    fetch("/api/v1/meeting-rooms").then((r) => r.json()).then((res) => {
      setRooms(res.data || []);
      if (res.data?.[0]) setRoomId(res.data[0].id);
    });
  }, []);

  useEffect(() => {
    if (!roomId || !date) return;
    fetch(`/api/v1/room-bookings?roomId=${roomId}&date=${date}`).then((r) => r.json()).then((res) => {
      setBookings(res.data || []);
      setSlotStart(null); setSlotEnd(null);
    });
  }, [roomId, date]);

  const bookedSlots = useMemo(() => {
    const set = new Set<number>();
    for (const b of bookings) {
      const s = timeToSlot(new Date(b.startTime));
      const e = timeToSlot(new Date(b.endTime));
      for (let i = s; i < e; i++) set.add(i);
    }
    return set;
  }, [bookings]);

  function clickSlot(idx: number) {
    if (bookedSlots.has(idx)) return;
    if (slotStart === null) { setSlotStart(idx); setSlotEnd(idx + 1); }
    else if (idx < slotStart) { setSlotStart(idx); setSlotEnd(idx + 1); }
    else {
      for (let i = slotStart; i <= idx; i++) {
        if (bookedSlots.has(i)) { void alertDialog(`Khung ${slotToTime(i)} đã bận, chọn khoảng khác`); return; }
      }
      setSlotEnd(idx + 1);
    }
  }

  async function submit() {
    setError(null);
    if (!roomId) { setError("Chưa chọn phòng"); return; }
    if (slotStart === null || slotEnd === null) { setError("Chưa chọn khung giờ"); return; }
    if (!title.trim()) { setError("Chưa nhập tiêu đề"); return; }
    // Sanitize: chỉ giữ thứ trong khoảng 1..6 (KHÔNG cho CN=0)
    const cleanDays = recurrenceDays.filter((d) => d >= 1 && d <= 6);
    if (recurrenceOn) {
      if (cleanDays.length === 0) { setError("Chọn ít nhất 1 thứ trong tuần (T2–T7)"); return; }
    }
    setSubmitting(true);
    const dayDate = new Date(date);
    const start = new Date(dayDate); start.setHours(SLOT_START_HOUR + Math.floor(slotStart / 2), (slotStart % 2) * 30, 0, 0);
    const end = new Date(dayDate); end.setHours(SLOT_START_HOUR + Math.floor(slotEnd / 2), (slotEnd % 2) * 30, 0, 0);
    // Phải đặt trước tối thiểu 30 phút, không đặt giờ trong quá khứ.
    if (start.getTime() < Date.now() + 30 * 60_000) {
      setError("Phải đặt trước ít nhất 30 phút (không đặt giờ trong quá khứ)."); setSubmitting(false); return;
    }
    try {
      const res = await fetch("/api/v1/room-bookings", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomId, startTime: start.toISOString(), endTime: end.toISOString(),
          title: title.trim(), description: description.trim() || null, priorityNote: priorityNote.trim() || null,
          ...(recurrenceOn ? { recurrence: { daysOfWeek: cleanDays, ...(recurrenceUntil ? { until: recurrenceUntil } : {}) } } : {}),
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(apiError(res.status, d.error));
      if (recurrenceOn && d.data?.count) {
        await alertDialog(`Đã tạo ${d.data.count} phiếu (chờ duyệt). Phiếu cần được duyệt cả series trước khi sử dụng.`);
      }
      setTitle(""); setDescription(""); setPriorityNote("");
      setRecurrenceOn(false); setRecurrenceDays([]); setRecurrenceUntil("");
      setSlotStart(null); setSlotEnd(null);
      onCreated();
    } catch (e: any) { setError(String(e.message || e)); } finally { setSubmitting(false); }
  }

  const room = rooms.find((r) => r.id === roomId);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="rounded-xl border p-4" style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="text-[12px] mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Phòng *</label>
            <select value={roomId} onChange={(e) => setRoomId(e.target.value)} className="w-full px-3 py-2 rounded-lg border text-[13px]"
              style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)" }}>
              {rooms.map((r) => <option key={r.id} value={r.id}>{r.name} ({r.capacity} người)</option>)}
            </select>
          </div>
          <div>
            <label className="text-[12px] mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Ngày *</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full px-3 py-2 rounded-lg border text-[13px]"
              style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)" }} />
          </div>
        </div>

        {room && (
          <div className="mb-3 text-[12px]" style={{ color: "var(--ibs-text-dim)" }}>
            <span className="font-semibold" style={{ color: "var(--ibs-text)" }}>Tiện ích:</span>{" "}
            {Array.isArray(room.equipment) ? room.equipment.join(", ") : "—"}
          </div>
        )}

        <div className="mb-2 text-[12px] font-semibold">Chọn khung giờ (30 phút/ô — ô xám đã có người đặt):</div>
        <div className="grid grid-cols-4 gap-1.5">
          {Array.from({ length: SLOTS_PER_DAY }, (_, i) => {
            const isBusy = bookedSlots.has(i);
            const isSelected = slotStart !== null && slotEnd !== null && i >= slotStart && i < slotEnd;
            return (
              <button key={i} onClick={() => clickSlot(i)} disabled={isBusy}
                className="px-2 py-1.5 rounded text-[11px] font-semibold transition-colors"
                style={{
                  background: isBusy ? "rgba(0,0,0,0.15)" : isSelected ? "var(--ibs-accent)" : "var(--ibs-bg)",
                  color: isBusy ? "var(--ibs-text-dim)" : isSelected ? "white" : "var(--ibs-text)",
                  border: "1px solid var(--ibs-border)",
                  cursor: isBusy ? "not-allowed" : "pointer", opacity: isBusy ? 0.6 : 1,
                }}>
                {slotToTime(i)}
              </button>
            );
          })}
        </div>
        {slotStart !== null && slotEnd !== null && (
          <div className="mt-3 text-[13px]" style={{ color: "var(--ibs-accent)" }}>
            Đã chọn: <b>{slotToTime(slotStart)}</b> → <b>{slotToTime(slotEnd)}</b> ({(slotEnd - slotStart) * 30} phút)
          </div>
        )}
      </div>

      <div className="rounded-xl border p-4 space-y-3" style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
        <div>
          <label className="text-[12px] mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Tiêu đề *</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="VD: Họp tuần khối SX" className="w-full px-3 py-2 rounded-lg border text-[13px]"
            style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)" }} />
        </div>
        <div>
          <label className="text-[12px] mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Mô tả</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="w-full px-3 py-2 rounded-lg border text-[13px]"
            style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)" }} />
        </div>
        <div>
          <label className="text-[12px] mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Mức ưu tiên / ghi chú (tự do)</label>
          <input value={priorityNote} onChange={(e) => setPriorityNote(e.target.value)} placeholder="VD: Họp khẩn cấp với khách hàng" className="w-full px-3 py-2 rounded-lg border text-[13px]"
            style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)" }} />
        </div>

        {/* Lặp lại — đặt lịch cố định */}
        <div className="rounded-lg p-3 border" style={{ background: "rgba(0,180,216,0.04)", borderColor: "var(--ibs-border)" }}>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={recurrenceOn} onChange={(e) => toggleRecurrence(e.target.checked)} />
            <span className="text-[12px] font-semibold" style={{ color: "var(--ibs-accent)" }}>📅 Lặp lại lịch này</span>
          </label>
          {recurrenceOn && (
            <>
              <div className="mt-2">
                <div className="text-[11px] mb-1.5" style={{ color: "var(--ibs-text-dim)" }}>Vào các thứ:</div>
                <div className="flex gap-1 flex-wrap">
                  {[
                    { label: "T2", value: 1 },
                    { label: "T3", value: 2 },
                    { label: "T4", value: 3 },
                    { label: "T5", value: 4 },
                    { label: "T6", value: 5 },
                    { label: "T7", value: 6 },
                  ].map(({ label, value }) => {
                    const checked = recurrenceDays.includes(value);
                    return (
                      <button key={value} type="button" onClick={() => toggleDay(value)}
                        className="px-2.5 py-1 rounded text-[12px] font-semibold border transition-colors"
                        style={{
                          background: checked ? "var(--ibs-accent)" : "var(--ibs-bg)",
                          color: checked ? "#fff" : "var(--ibs-text)",
                          borderColor: checked ? "var(--ibs-accent)" : "var(--ibs-border)",
                        }}>
                        {label}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-1 flex gap-1.5 text-[10px]" style={{ color: "var(--ibs-text-dim)" }}>
                  <button type="button" onClick={() => setRecurrenceDays([1, 2, 3, 4, 5, 6])} className="underline">T2–T7</button>
                  <button type="button" onClick={() => setRecurrenceDays([1, 2, 3, 4, 5])} className="underline">T2–T6</button>
                  <button type="button" onClick={() => {
                    const dow = new Date(date).getDay();
                    setRecurrenceDays([dow === 0 ? 1 : dow]);
                  }} className="underline">Chỉ cùng thứ</button>
                </div>
              </div>
              <div className="mt-3">
                <label className="text-[11px] mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>
                  Lặp đến ngày <span style={{ color: "var(--ibs-text-dim)" }}>(để trống = lặp tối đa 365 ngày)</span>
                </label>
                <input type="date" value={recurrenceUntil} onChange={(e) => setRecurrenceUntil(e.target.value)}
                  min={date}
                  className="w-full px-2 py-1.5 rounded border text-[12px]"
                  style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)" }} />
              </div>
              {recurrencePreview && recurrencePreview.length > 0 && (
                <div className="mt-2 text-[11px]" style={{ color: "var(--ibs-text-dim)" }}>
                  📅 Lịch cố định:{" "}
                  <b style={{ color: "var(--ibs-accent)" }}>
                    {[...recurrenceDays].sort((a, b) => a - b).map((d) => ["CN", "T2", "T3", "T4", "T5", "T6", "T7"][d]).join(", ")}
                  </b> hàng tuần · từ <b>{recurrencePreview[0].toLocaleDateString("vi-VN")}</b> đến <b>{recurrencePreview[recurrencePreview.length - 1].toLocaleDateString("vi-VN")}</b>
                </div>
              )}
              <div className="mt-2 text-[10px] italic" style={{ color: "var(--ibs-warning)" }}>
                ⚠️ Phiếu cần được duyệt trước khi sử dụng. Approver có thể duyệt cả series 1 lần.
              </div>
            </>
          )}
        </div>

        {error && <div className="p-2 rounded text-[13px]" style={{ background: "rgba(239,68,68,0.1)", color: "var(--ibs-danger)" }}>{error}</div>}

        <button onClick={submit} disabled={submitting} className="w-full px-4 py-2.5 rounded-lg text-[13px] font-semibold"
          style={{ background: "var(--ibs-accent)", color: "white", opacity: submitting ? 0.5 : 1 }}>
          {submitting ? "Đang gửi..." : "Đặt phòng"}
        </button>
      </div>
    </div>
  );
}

function ListTab({ me }: { me: { id: string; employeeId: string | null; employeeCode: string; role: string } | null }) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "PENDING_APPROVAL" | "APPROVED" | "REJECTED" | "CANCELLED">("all");
  const [rejectTarget, setRejectTarget] = useState<Booking | null>(null);
  const [processing, setProcessing] = useState<string | null>(null);
  const [showExport, setShowExport] = useState(false);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [filterRoomId, setFilterRoomId] = useState("");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");

  const canApprove = canApproveRoomVehicle(me?.employeeCode, me?.role);

  function load() {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterRoomId) params.set("roomId", filterRoomId);
    if (filterFrom) params.set("from", filterFrom);
    if (filterTo) params.set("to", filterTo);
    fetch(`/api/v1/room-bookings?${params}`).then((r) => r.json())
      .then((res) => setBookings(res.data || [])).finally(() => setLoading(false));
  }
  useEffect(() => { load(); }, [filterRoomId, filterFrom, filterTo]);
  useEffect(() => {
    fetch("/api/v1/meeting-rooms").then((r) => r.json()).then((res) => setRooms(res.data || []));
  }, []);

  // Đếm theo SỐ DÒNG HIỂN THỊ: series gom thành 1 phiếu (giống danh sách), không đếm bản ghi gốc.
  const dedupeCount = (arr: Booking[]) => {
    const seen = new Set<string>();
    let n = 0;
    for (const b of arr) {
      if (b.seriesId) { if (seen.has(b.seriesId)) continue; seen.add(b.seriesId); }
      n++;
    }
    return n;
  };
  const filtered = useMemo(() => filter === "all" ? bookings : bookings.filter((b) => b.status === filter), [bookings, filter]);
  const pendingCount = useMemo(() => dedupeCount(bookings.filter((b) => b.status === "PENDING_APPROVAL")), [bookings]);

  // Gom series → 1 phiếu đại diện. Tính daysOfWeek + count cho từng series.
  const seriesInfo = useMemo(() => {
    const m: Record<string, { days: Set<number>; first: Date; last: Date; count: number }> = {};
    for (const b of bookings) {
      if (!b.seriesId) continue;
      const dt = new Date(b.startTime);
      if (!m[b.seriesId]) m[b.seriesId] = { days: new Set([dt.getDay()]), first: dt, last: dt, count: 1 };
      else {
        m[b.seriesId].days.add(dt.getDay());
        if (dt < m[b.seriesId].first) m[b.seriesId].first = dt;
        if (dt > m[b.seriesId].last) m[b.seriesId].last = dt;
        m[b.seriesId].count++;
      }
    }
    return m;
  }, [bookings]);
  const displayBookings = useMemo(() => {
    const seen = new Set<string>();
    const result: Booking[] = [];
    for (const b of filtered) {
      if (b.seriesId) {
        if (seen.has(b.seriesId)) continue;
        seen.add(b.seriesId);
      }
      result.push(b);
    }
    return result;
  }, [filtered]);
  const DOW_LABELS = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
  const pad2 = (n: number) => String(n).padStart(2, "0");

  async function cancelOne(id: string) {
    if (!(await confirmDialog("Huỷ phiếu này? (Các phiếu khác trong series vẫn giữ nguyên)"))) return;
    await fetch(`/api/v1/room-bookings/${id}/cancel`, { method: "POST" });
    load();
  }
  // Xác nhận cuộc họp đã xong sớm → rút giờ kết thúc về hiện tại, trả phòng về trống.
  async function completeOne(id: string) {
    if (!(await confirmDialog("Xác nhận cuộc họp đã XONG? Phòng sẽ được trả về trống cho khoảng thời gian còn lại."))) return;
    const res = await fetch(`/api/v1/room-bookings/${id}/complete`, { method: "POST" });
    if (!res.ok) { const d = await res.json().catch(() => ({})); void alertDialog(apiError(res.status, d?.error)); return; }
    load();
  }
  async function cancelEntireSeries(seriesId: string) {
    if (!(await confirmDialog({ message: "Huỷ TẤT CẢ phiếu trong series này?\n\nMọi phiếu Chờ duyệt / Đã duyệt sẽ chuyển sang Đã huỷ.", tone: "danger", confirmText: "Huỷ cả series" }))) return;
    await fetch(`/api/v1/room-bookings/series/${seriesId}/cancel`, { method: "POST" });
    load();
  }
  async function approve(id: string) {
    if (!(await confirmDialog("Duyệt phiếu đặt phòng này?"))) return;
    setProcessing(id);
    try {
      const res = await fetch(`/api/v1/room-bookings/${id}/approve`, { method: "POST" });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        await alertDialog(apiError(res.status, j?.error) || "Duyệt thất bại");
        return;
      }
      load();
    } finally { setProcessing(null); }
  }
  async function approveSeries(id: string, seriesId: string) {
    if (!(await confirmDialog("Duyệt cả series? Mỗi phiếu sẽ check conflict riêng — phiếu conflict được giữ chờ duyệt."))) return;
    setProcessing(id);
    let res: Response, j: any;
    try {
      res = await fetch(`/api/v1/room-bookings/series/${seriesId}/approve`, { method: "POST" });
      j = await res.json().catch(() => null);
    } finally { setProcessing(null); }
    if (!res.ok) { await alertDialog(apiError(res.status, j?.error) || "Duyệt series thất bại"); return; }
    const { approved, skipped, conflicts } = j.data || {};
    let msg = `✓ Đã duyệt ${approved} phiếu.`;
    if (skipped > 0) {
      msg += `\n\n⚠️ ${skipped} phiếu bị conflict, giữ trạng thái Chờ duyệt:`;
      for (const c of (conflicts || []).slice(0, 5)) {
        msg += `\n• Ngày ${c.date.split("-").reverse().join("/")} — trùng với "${c.conflictTitle}"`;
      }
      if ((conflicts || []).length > 5) msg += `\n... và ${conflicts.length - 5} phiếu khác`;
    }
    await alertDialog(msg);
    load();
  }
  function toggle(id: string) {
    const n = new Set(expanded);
    if (n.has(id)) n.delete(id); else n.add(id);
    setExpanded(n);
  }

  return (
    <>
    <div className="rounded-xl border" style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
      <div className="px-4 py-3 border-b flex items-center gap-2 flex-wrap" style={{ borderColor: "var(--ibs-border)" }}>
        <span className="text-[12px]" style={{ color: "var(--ibs-text-dim)" }}>{displayBookings.length} phiếu</span>
        <button onClick={() => setShowExport(true)} className="flex items-center gap-1 text-[12px] px-2.5 py-1 rounded-lg font-semibold border" style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text)", background: "var(--ibs-bg)" }}>
          <Download size={13} /> Export
        </button>
        <select value={filterRoomId} onChange={(e) => setFilterRoomId(e.target.value)} className="rounded-lg px-2 py-1 text-[12px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }}>
          <option value="">Tất cả phòng</option>
          {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        <div className="flex items-center gap-1">
          <span className="text-[11px]" style={{ color: "var(--ibs-text-dim)" }}>Từ</span>
          <input type="date" value={filterFrom} max={filterTo || undefined} onChange={(e) => setFilterFrom(e.target.value)} className="rounded-lg px-2 py-1 text-[12px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }} />
          <span className="text-[11px]" style={{ color: "var(--ibs-text-dim)" }}>đến</span>
          <input type="date" value={filterTo} min={filterFrom || undefined} onChange={(e) => setFilterTo(e.target.value)} className="rounded-lg px-2 py-1 text-[12px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }} />
        </div>
        {(filterRoomId || filterFrom || filterTo) && (
          <button onClick={() => { setFilterRoomId(""); setFilterFrom(""); setFilterTo(""); }} className="text-[11px]" style={{ color: "var(--ibs-accent)" }}>Xóa lọc</button>
        )}
        <div className="ml-auto flex items-center gap-1.5 flex-wrap">
          {([
            { k: "all", label: "Tất cả", count: dedupeCount(bookings) },
            { k: "PENDING_APPROVAL", label: "Chờ duyệt", count: pendingCount, highlight: pendingCount > 0 && canApprove },
            { k: "APPROVED", label: "Đã duyệt", count: dedupeCount(bookings.filter((b) => b.status === "APPROVED")) },
            { k: "REJECTED", label: "Từ chối", count: dedupeCount(bookings.filter((b) => b.status === "REJECTED")) },
            { k: "CANCELLED", label: "Đã huỷ", count: dedupeCount(bookings.filter((b) => b.status === "CANCELLED")) },
          ] as const).map((f: any) => {
            const active = filter === f.k;
            return (
              <button key={f.k} onClick={() => setFilter(f.k)}
                className="text-[11px] px-2.5 py-1 rounded-full font-semibold border"
                style={{
                  background: active ? "var(--ibs-accent)" : (f.highlight ? "rgba(234,179,8,0.12)" : "transparent"),
                  color: active ? "#fff" : (f.highlight ? "var(--ibs-warning)" : "var(--ibs-text-dim)"),
                  borderColor: active ? "var(--ibs-accent)" : "var(--ibs-border)",
                }}>
                {f.label} ({f.count})
              </button>
            );
          })}
        </div>
      </div>
      {loading ? <div className="px-4 py-8 text-center" style={{ color: "var(--ibs-text-dim)" }}>Đang tải...</div>
        : displayBookings.length === 0 ? <div className="px-4 py-8 text-center" style={{ color: "var(--ibs-text-dim)" }}>Không có phiếu nào</div>
        : displayBookings.map((b) => {
          const isOwner = me?.employeeId && me.employeeId === b.requester.id;
          const start = new Date(b.startTime), end = new Date(b.endTime);
          const st = BOOKING_STATUS[b.status] || { label: b.status, color: "#6b7280", bg: "rgba(0,0,0,0.05)" };
          const isPending = b.status === "PENDING_APPROVAL";
          // Đang diễn ra (đã duyệt + hiện tại nằm trong khung giờ) → cho phép "Xác nhận Xong" sớm.
          const isOngoing = b.status === "APPROVED" && start.getTime() <= Date.now() && Date.now() < end.getTime();
          const info = b.seriesId ? seriesInfo[b.seriesId] : null;
          // Format thời gian: series → "07:00–08:00 · T2, T4 hàng tuần"; lẻ → "06/06/2026 07:00–08:00"
          const timeStr = info
            ? `${pad2(start.getHours())}:${pad2(start.getMinutes())}–${pad2(end.getHours())}:${pad2(end.getMinutes())} · ${Array.from(info.days).sort().map((d) => DOW_LABELS[d]).join(", ")} hàng tuần`
            : `${start.toLocaleDateString("vi-VN")} ${pad2(start.getHours())}:${pad2(start.getMinutes())}–${pad2(end.getHours())}:${pad2(end.getMinutes())}`;
          return (
            <div key={b.id} className="border-b last:border-b-0" style={{ borderColor: "var(--ibs-border)" }}>
              <div className="px-4 py-3 flex items-center justify-between gap-4">
                <button onClick={() => toggle(b.id)} className="flex items-center gap-2 flex-1 text-left min-w-0">
                  {expanded.has(b.id) ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  <div className="min-w-0">
                    <div className="font-semibold truncate flex items-center gap-2">
                      {b.title}
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0" style={{ background: st.bg, color: st.color }}>{st.label}</span>
                      {b.seriesId
                        ? <span className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0" style={{ background: "rgba(0,180,216,0.15)", color: "var(--ibs-accent)", border: "1px solid var(--ibs-accent)" }}>📅 Cố định ({info?.count || 0})</span>
                        : <span className="text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0" style={{ background: "rgba(0,0,0,0.04)", color: "var(--ibs-text-dim)" }}>Lẻ</span>}
                    </div>
                    <div className="text-[11px] truncate" style={{ color: "var(--ibs-text-dim)" }}>
                      🏛 <b>{b.room.name}</b>
                      {" · "}🗓 {timeStr}
                      {" · "}👤 {b.requester.fullName}
                    </div>
                  </div>
                </button>

                <div className="flex items-center gap-1.5 shrink-0">
                  {canApprove && isPending && b.seriesId && (
                    <button onClick={() => approveSeries(b.id, b.seriesId!)} disabled={processing === b.id} className="px-2.5 py-1 rounded text-[11px] font-semibold flex items-center gap-1 text-white" style={{ background: "var(--ibs-accent)", opacity: processing === b.id ? 0.6 : 1 }} title="Duyệt cả series">
                      <Check size={12} /> {processing === b.id ? "Đang duyệt..." : "Duyệt series"}
                    </button>
                  )}
                  {canApprove && isPending && !b.seriesId && (
                    <>
                      <button onClick={() => approve(b.id)} disabled={processing === b.id} className="px-2.5 py-1 rounded text-[11px] font-semibold flex items-center gap-1 text-white" style={{ background: "#10b981", opacity: processing === b.id ? 0.6 : 1 }}>
                        <Check size={12} /> {processing === b.id ? "Đang duyệt..." : "Duyệt"}
                      </button>
                      <button onClick={() => setRejectTarget(b)} disabled={processing === b.id} className="px-2.5 py-1 rounded text-[11px] font-semibold flex items-center gap-1" style={{ background: "rgba(239,68,68,0.15)", color: "var(--ibs-danger)" }}>
                        <XCircle size={12} /> Từ chối
                      </button>
                    </>
                  )}
                  {isOwner && isOngoing && (
                    <button onClick={() => completeOne(b.id)} className="px-2.5 py-1 rounded text-[11px] font-semibold flex items-center gap-1 text-white" style={{ background: "#10b981" }} title="Xác nhận đã xong — trả phòng về trống cho thời gian còn lại">
                      <Check size={12} /> Xác nhận Xong
                    </button>
                  )}
                  {isOwner && (b.status === "PENDING_APPROVAL" || b.status === "APPROVED") && (
                    b.seriesId ? (
                      <button onClick={() => cancelEntireSeries(b.seriesId!)} className="px-2 py-1 rounded text-[11px] font-semibold flex items-center gap-1" style={{ background: "rgba(239,68,68,0.15)", color: "var(--ibs-danger)" }} title="Huỷ cả series (mọi phiếu trong lịch cố định)">
                        <X size={12} /> Huỷ series
                      </button>
                    ) : (
                      <button onClick={() => cancelOne(b.id)} className="px-2 py-1 rounded text-[11px] font-semibold flex items-center gap-1" style={{ background: "rgba(239,68,68,0.15)", color: "var(--ibs-danger)" }}>
                        <X size={12} /> Huỷ
                      </button>
                    )
                  )}
                </div>
              </div>

              {expanded.has(b.id) && (b.description || b.priorityNote || b.rejectReason || b.seriesId) && (
                <div className="px-4 pb-3 pl-10 text-[12px]" style={{ background: "rgba(0,0,0,0.03)", color: "var(--ibs-text-muted)" }}>
                  {b.description && <div className="mb-1">📝 {b.description}</div>}
                  {b.priorityNote && <div style={{ color: "var(--ibs-warning)" }}>⚡ Ưu tiên: {b.priorityNote}</div>}
                  {b.seriesId && <div className="mt-1" style={{ color: "var(--ibs-accent)" }}>📅 Phiếu thuộc lịch cố định (series #{b.seriesId.slice(0, 8)})</div>}
                  {b.rejectReason && <div className="mt-1" style={{ color: "var(--ibs-danger)" }}>❌ Lý do từ chối: {b.rejectReason}</div>}
                </div>
              )}
            </div>
          );
        })}
    </div>

    {rejectTarget && (
      <RejectModal booking={rejectTarget} onClose={() => setRejectTarget(null)} onDone={() => { setRejectTarget(null); load(); }} />
    )}
    {showExport && <ExportBookingsModal onClose={() => setShowExport(false)} />}
    </>
  );
}

function ExportBookingsModal({ onClose }: { onClose: () => void }) {
  const [rooms, setRooms] = useState<Room[]>([]);
  const today = new Date().toISOString().slice(0, 10);
  const [roomId, setRoomId] = useState("");
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/v1/meeting-rooms").then((r) => r.json()).then((res) => setRooms(res.data || []));
  }, []);

  async function doExport() {
    setError("");
    if (from > to) { setError("Từ ngày phải ≤ Đến ngày"); return; }
    setBusy(true);
    try {
      await exportRoomBookings(roomId, from, to);
      onClose();
    } catch (e: any) {
      setError(e?.message || "Có lỗi khi export");
    } finally { setBusy(false); }
  }

  const ic = "w-full rounded-lg px-3 py-2 text-[13px] border";
  const is = { background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" };
  const lc = "text-[12px] font-medium mb-1 block";
  const ls = { color: "var(--ibs-text-dim)" };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="rounded-2xl w-full max-w-md mx-4 p-6" style={{ background: "var(--ibs-bg-card)", border: "1px solid var(--ibs-border)" }}>
        <div className="flex items-center justify-between mb-5">
          <div className="text-[16px] font-bold">Export lịch sử đặt phòng</div>
          <button onClick={onClose} style={{ color: "var(--ibs-text-dim)" }}><X size={18} /></button>
        </div>
        <div className="flex flex-col gap-3">
          <div>
            <label className={lc} style={ls}>Phòng</label>
            <select value={roomId} onChange={(e) => setRoomId(e.target.value)} className={ic} style={is}>
              <option value="">Tất cả phòng</option>
              {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lc} style={ls}>Từ ngày *</label>
              <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className={ic} style={is} />
            </div>
            <div>
              <label className={lc} style={ls}>Đến ngày *</label>
              <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className={ic} style={is} />
            </div>
          </div>
          {error && <div className="text-[12px] text-red-500">{error}</div>}
          <div className="flex gap-2 justify-end mt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-[13px] border" style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-dim)" }}>Hủy</button>
            <button type="button" onClick={doExport} disabled={busy} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-semibold" style={{ background: "var(--ibs-accent)", color: "#fff", opacity: busy ? 0.5 : 1 }}>
              <Download size={14} /> {busy ? "Đang xuất..." : "Tải Excel"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function RejectModal({ booking, onClose, onDone }: { booking: Booking; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!reason.trim()) { setError("Vui lòng nhập lý do từ chối"); return; }
    setSaving(true);
    const res = await fetch(`/api/v1/room-bookings/${booking.id}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: reason.trim() }),
    });
    setSaving(false);
    if (!res.ok) {
      const j = await res.json().catch(() => null);
      setError(apiError(res.status, j?.error) || "Từ chối thất bại");
      return;
    }
    onDone();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)" }}>
      <div className="w-full max-w-md rounded-2xl p-5" style={{ background: "var(--ibs-bg-card)", border: "1px solid var(--ibs-border)" }}>
        <div className="flex items-center justify-between mb-3">
          <div className="text-[15px] font-bold">Từ chối phiếu đặt phòng</div>
          <button onClick={onClose} style={{ color: "var(--ibs-text-dim)" }}><X size={18} /></button>
        </div>
        <div className="text-[12px] mb-3" style={{ color: "var(--ibs-text-dim)" }}>
          Phiếu: <b style={{ color: "var(--ibs-text)" }}>{booking.title}</b>
        </div>
        <label className="block text-[12px] font-semibold mb-1.5" style={{ color: "var(--ibs-text-dim)" }}>
          Lý do từ chối <span style={{ color: "var(--ibs-danger)" }}>*</span>
        </label>
        <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)}
          placeholder="VD: Phòng đã được dùng cho cuộc họp ưu tiên cao hơn"
          className="w-full rounded-lg px-3 py-2 text-[13px] border resize-none mb-2"
          style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }} />
        {error && <div className="text-[12px] p-2 rounded mb-2" style={{ background: "rgba(239,68,68,0.12)", color: "var(--ibs-danger)" }}>{error}</div>}
        <div className="flex items-center justify-end gap-2">
          <button onClick={onClose} disabled={saving} className="px-3 py-2 rounded-lg text-[12px] font-semibold border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text-dim)" }}>Huỷ</button>
          <button onClick={submit} disabled={saving} className="px-4 py-2 rounded-lg text-[12px] font-semibold text-white" style={{ background: "var(--ibs-danger)", opacity: saving ? 0.7 : 1 }}>
            {saving ? "Đang gửi..." : "Xác nhận từ chối"}
          </button>
        </div>
      </div>
    </div>
  );
}
