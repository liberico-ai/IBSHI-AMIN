"use client";

import { useState, useEffect, useMemo } from "react";
import { PageTitle } from "@/components/layout/page-title";
import { Check, X, ChevronDown, ChevronRight, Calendar, Mail, ClipboardList } from "lucide-react";

type Room = { id: string; code: string; name: string; capacity: number; equipment: string[] };
type Attendee = { id: string; employeeId: string; rsvp: string; employee: { id: string; code: string; fullName: string } };
type Booking = {
  id: string; roomId: string; title: string; description?: string; priorityNote?: string;
  startTime: string; endTime: string; status: string; rejectReason?: string;
  room: { id: string; name: string; code: string; capacity: number };
  requester: { id: string; code: string; fullName: string };
  attendees: Attendee[];
};
type Employee = { id: string; code: string; fullName: string; department: { name: string } };

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  PENDING_APPROVAL: { label: "Chờ duyệt", color: "var(--ibs-warning)" },
  APPROVED: { label: "Đã duyệt", color: "var(--ibs-success)" },
  REJECTED: { label: "Từ chối", color: "var(--ibs-danger)" },
  CANCELLED: { label: "Đã huỷ", color: "#6b7280" },
};

// Slot 30 phút: 7:00 → 18:00 (22 slots)
const SLOT_START_HOUR = 7;
const SLOT_END_HOUR = 18;
const SLOTS_PER_DAY = (SLOT_END_HOUR - SLOT_START_HOUR) * 2; // mỗi giờ 2 slot 30p

function slotToTime(slotIdx: number): string {
  const totalMin = SLOT_START_HOUR * 60 + slotIdx * 30;
  const h = Math.floor(totalMin / 60), m = totalMin % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function timeToSlot(date: Date): number {
  return (date.getHours() - SLOT_START_HOUR) * 2 + Math.floor(date.getMinutes() / 30);
}

export default function PhongHopPage() {
  const [tab, setTab] = useState<"book" | "mine" | "invites">("book");
  const [me, setMe] = useState<{ id: string; role: string; employeeId: string | null } | null>(null);

  useEffect(() => {
    fetch("/api/v1/me").then((r) => r.json()).then(async (res) => {
      if (!res?.id) return;
      const list = await fetch(`/api/v1/room-bookings?view=mine`).then((r) => r.json());
      setMe({ id: res.id, role: res.role, employeeId: list.myEmployeeId });
    });
  }, []);

  return (
    <div>
      <PageTitle title="M10.1 — Đặt phòng họp" description="Đặt phòng họp, mời đồng nghiệp, RSVP — phòng tự lock theo lịch trống" />

      <div className="flex gap-2 mb-4 border-b" style={{ borderColor: "var(--ibs-border)" }}>
        {[
          { k: "book", label: "Đặt phòng", icon: Calendar },
          { k: "mine", label: "Phiếu của tôi", icon: ClipboardList },
          { k: "invites", label: "Lời mời", icon: Mail },
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

      {tab === "book" && <BookTab />}
      {tab === "mine" && <ListTab view="mine" me={me} />}
      {tab === "invites" && <ListTab view="invites" me={me} />}
    </div>
  );
}

function BookTab() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [roomId, setRoomId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [slotStart, setSlotStart] = useState<number | null>(null);
  const [slotEnd, setSlotEnd] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priorityNote, setPriorityNote] = useState("");
  const [attendeeIds, setAttendeeIds] = useState<string[]>([]);
  const [attendeeFilter, setAttendeeFilter] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    fetch("/api/v1/meeting-rooms").then((r) => r.json()).then((res) => {
      setRooms(res.data || []);
      if (res.data?.[0]) setRoomId(res.data[0].id);
    });
    fetch("/api/v1/employees?limit=500").then((r) => r.json()).then((res) => setEmployees(res.data || []));
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
    else if (idx < slotStart) { setSlotStart(idx); }
    else {
      // Check không vướng slot busy giữa start..idx
      for (let i = slotStart; i <= idx; i++) {
        if (bookedSlots.has(i)) { alert(`Khung ${slotToTime(i)} đã bận, chọn khoảng khác`); return; }
      }
      setSlotEnd(idx + 1);
    }
  }

  async function submit() {
    setError(null); setSuccess(false);
    if (!roomId) { setError("Chưa chọn phòng"); return; }
    if (slotStart === null || slotEnd === null) { setError("Chưa chọn khung giờ"); return; }
    if (!title.trim()) { setError("Chưa nhập tiêu đề"); return; }
    setSubmitting(true);
    const dayDate = new Date(date);
    const start = new Date(dayDate); start.setHours(SLOT_START_HOUR + Math.floor(slotStart / 2), (slotStart % 2) * 30, 0, 0);
    const end = new Date(dayDate); end.setHours(SLOT_START_HOUR + Math.floor(slotEnd / 2), (slotEnd % 2) * 30, 0, 0);
    try {
      const res = await fetch("/api/v1/room-bookings", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomId, startTime: start.toISOString(), endTime: end.toISOString(),
          title: title.trim(), description: description.trim() || null, priorityNote: priorityNote.trim() || null,
          attendeeIds,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error?.message || "Lỗi");
      setSuccess(true);
      setTitle(""); setDescription(""); setPriorityNote(""); setAttendeeIds([]);
      setSlotStart(null); setSlotEnd(null);
      // Reload bookings để slot mới xuất hiện
      fetch(`/api/v1/room-bookings?roomId=${roomId}&date=${date}`).then((r) => r.json()).then((res) => setBookings(res.data || []));
    } catch (e: any) { setError(String(e.message || e)); } finally { setSubmitting(false); }
  }

  const room = rooms.find((r) => r.id === roomId);
  const filteredEmps = employees.filter((e) =>
    attendeeFilter ? e.fullName.toLowerCase().includes(attendeeFilter.toLowerCase()) || e.code.toLowerCase().includes(attendeeFilter.toLowerCase()) : true
  ).slice(0, 50);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* LEFT: chọn phòng + slot */}
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

      {/* RIGHT: nội dung */}
      <div className="rounded-xl border p-4 space-y-3" style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
        <div>
          <label className="text-[12px] mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Tiêu đề *</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="VD: Họp tuần khối SX" className="w-full px-3 py-2 rounded-lg border text-[13px]"
            style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)" }} />
        </div>
        <div>
          <label className="text-[12px] mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Mô tả</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="w-full px-3 py-2 rounded-lg border text-[13px]"
            style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)" }} />
        </div>
        <div>
          <label className="text-[12px] mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Mức ưu tiên / ghi chú quan trọng (tự do)</label>
          <input value={priorityNote} onChange={(e) => setPriorityNote(e.target.value)} placeholder="VD: Họp khẩn cấp với khách hàng" className="w-full px-3 py-2 rounded-lg border text-[13px]"
            style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)" }} />
        </div>
        <div>
          <label className="text-[12px] mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Mời đồng nghiệp ({attendeeIds.length} đã chọn)</label>
          <input value={attendeeFilter} onChange={(e) => setAttendeeFilter(e.target.value)} placeholder="Tìm NV theo tên / mã..." className="w-full px-3 py-2 rounded-lg border text-[13px] mb-2"
            style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)" }} />
          <div className="max-h-44 overflow-y-auto rounded border" style={{ borderColor: "var(--ibs-border)" }}>
            {filteredEmps.map((e) => {
              const checked = attendeeIds.includes(e.id);
              return (
                <label key={e.id} className="flex items-center gap-2 px-2 py-1 text-[12px] cursor-pointer hover:bg-black/5">
                  <input type="checkbox" checked={checked} onChange={() => setAttendeeIds(checked ? attendeeIds.filter((id) => id !== e.id) : [...attendeeIds, e.id])} />
                  <span>{e.fullName}</span>
                  <span style={{ color: "var(--ibs-text-dim)" }}>({e.code} — {e.department.name})</span>
                </label>
              );
            })}
          </div>
        </div>

        {error && <div className="p-2 rounded text-[13px]" style={{ background: "rgba(239,68,68,0.1)", color: "var(--ibs-danger)" }}>{error}</div>}
        {success && <div className="p-2 rounded text-[13px]" style={{ background: "rgba(16,185,129,0.1)", color: "var(--ibs-success)" }}>✓ Đã tạo phiếu đặt phòng. Chờ duyệt.</div>}

        <button onClick={submit} disabled={submitting} className="w-full px-4 py-2.5 rounded-lg text-[13px] font-semibold"
          style={{ background: "var(--ibs-accent)", color: "white", opacity: submitting ? 0.5 : 1 }}>
          {submitting ? "Đang gửi..." : "Gửi phiếu đặt phòng"}
        </button>
      </div>
    </div>
  );
}

function ListTab({ view, me }: { view: "mine" | "invites"; me: { id: string; role: string; employeeId: string | null } | null }) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true);
    fetch(`/api/v1/room-bookings?view=${view}`).then((r) => r.json())
      .then((res) => setBookings(res.data || [])).finally(() => setLoading(false));
  }
  useEffect(() => { load(); }, [view]);

  async function cancel(id: string) {
    if (!confirm("Huỷ phiếu này?")) return;
    await fetch(`/api/v1/room-bookings/${id}/cancel`, { method: "POST" });
    load();
  }
  async function rsvp(id: string, choice: "ACCEPTED" | "DECLINED") {
    await fetch(`/api/v1/room-bookings/${id}/rsvp`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rsvp: choice }) });
    load();
  }
  function toggle(id: string) {
    const n = new Set(expanded);
    if (n.has(id)) n.delete(id); else n.add(id);
    setExpanded(n);
  }

  return (
    <div className="rounded-xl border" style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
      {loading ? <div className="px-4 py-8 text-center" style={{ color: "var(--ibs-text-dim)" }}>Đang tải...</div>
        : bookings.length === 0 ? <div className="px-4 py-8 text-center" style={{ color: "var(--ibs-text-dim)" }}>Chưa có phiếu nào</div>
        : bookings.map((b) => {
          const st = STATUS_LABEL[b.status] || { label: b.status, color: "#6b7280" };
          const isOwner = me?.employeeId && me.employeeId === b.requester.id;
          const myAttendee = b.attendees.find((a) => a.employeeId === me?.employeeId);
          const start = new Date(b.startTime), end = new Date(b.endTime);
          return (
            <div key={b.id} className="border-b last:border-b-0" style={{ borderColor: "var(--ibs-border)" }}>
              <div className="px-4 py-3 flex items-center justify-between gap-4">
                <button onClick={() => toggle(b.id)} className="flex items-center gap-2 flex-1 text-left min-w-0">
                  {expanded.has(b.id) ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{b.title}</div>
                    <div className="text-[11px] truncate" style={{ color: "var(--ibs-text-dim)" }}>
                      📅 {start.toLocaleDateString("vi-VN")} {start.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}-{end.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}
                      {" · "}🏛 {b.room.name}
                      {" · "}👤 {b.requester.fullName}
                      {b.attendees.length > 0 && ` · 👥 ${b.attendees.length} người được mời`}
                    </div>
                  </div>
                </button>

                <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap" style={{ background: st.color + "22", color: st.color }}>{st.label}</span>

                <div className="flex gap-2 shrink-0">
                  {view === "mine" && b.status === "APPROVED" && isOwner && (
                    <button onClick={() => cancel(b.id)} className="px-2 py-1 rounded text-[11px] font-semibold flex items-center gap-1" style={{ background: "rgba(239,68,68,0.15)", color: "var(--ibs-danger)" }}>
                      <X size={12} /> Huỷ
                    </button>
                  )}
                  {view === "invites" && myAttendee && b.status === "APPROVED" && (
                    <>
                      <button onClick={() => rsvp(b.id, "ACCEPTED")} disabled={myAttendee.rsvp === "ACCEPTED"} className="px-2 py-1 rounded text-[11px] font-semibold flex items-center gap-1" style={{ background: myAttendee.rsvp === "ACCEPTED" ? "var(--ibs-success)" : "rgba(16,185,129,0.15)", color: myAttendee.rsvp === "ACCEPTED" ? "white" : "var(--ibs-success)" }}>
                        <Check size={12} /> {myAttendee.rsvp === "ACCEPTED" ? "Đã nhận" : "Tham gia"}
                      </button>
                      <button onClick={() => rsvp(b.id, "DECLINED")} disabled={myAttendee.rsvp === "DECLINED"} className="px-2 py-1 rounded text-[11px] font-semibold flex items-center gap-1" style={{ background: myAttendee.rsvp === "DECLINED" ? "var(--ibs-danger)" : "rgba(239,68,68,0.15)", color: myAttendee.rsvp === "DECLINED" ? "white" : "var(--ibs-danger)" }}>
                        <X size={12} /> {myAttendee.rsvp === "DECLINED" ? "Đã từ chối" : "Từ chối"}
                      </button>
                    </>
                  )}
                </div>
              </div>

              {expanded.has(b.id) && (
                <div className="px-4 pb-3 pl-10 text-[12px]" style={{ background: "rgba(0,0,0,0.03)", color: "var(--ibs-text-muted)" }}>
                  {b.description && <div className="mb-1">📝 {b.description}</div>}
                  {b.priorityNote && <div className="mb-1" style={{ color: "var(--ibs-warning)" }}>⚡ Ưu tiên: {b.priorityNote}</div>}
                  {b.rejectReason && <div className="mb-1" style={{ color: "var(--ibs-danger)" }}>❌ Lý do từ chối: {b.rejectReason}</div>}
                  {b.attendees.length > 0 && (
                    <div>
                      <div className="font-semibold mb-1">Đồng nghiệp được mời:</div>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-x-3 gap-y-0.5">
                        {b.attendees.map((a) => (
                          <div key={a.id}>
                            • {a.employee.fullName}
                            {a.rsvp === "ACCEPTED" && <span style={{ color: "var(--ibs-success)" }}> ✓</span>}
                            {a.rsvp === "DECLINED" && <span style={{ color: "var(--ibs-danger)" }}> ✗</span>}
                            {a.rsvp === "PENDING" && <span style={{ color: "var(--ibs-text-dim)" }}> ?</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
    </div>
  );
}
