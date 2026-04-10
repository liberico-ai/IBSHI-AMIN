"use client";

import { useState, useEffect } from "react";
import { PageTitle } from "@/components/layout/page-title";
import { formatDate } from "@/lib/utils";
import { Plus, RefreshCw, X, Trash2, CheckSquare, Square } from "lucide-react";
import Link from "next/link";

type CompanyEvent = {
  id: string; title: string; type: string; startDate: string; endDate: string;
  location?: string; description?: string; status: string; organizer?: string;
  createdAt: string;
};

const EVENT_TYPE: Record<string, { label: string; color: string }> = {
  INTERNAL: { label: "Nội bộ", color: "#00B4D8" },
  AUDIT_INTERNAL: { label: "Audit nội bộ", color: "#8b5cf6" },
  AUDIT_EXTERNAL: { label: "Audit bên ngoài", color: "var(--ibs-warning)" },
  CUSTOMER_VISIT: { label: "Khách hàng thăm", color: "var(--ibs-success)" },
  TRAINING: { label: "Đào tạo", color: "#f59e0b" },
  OTHER: { label: "Khác", color: "#6b7280" },
};

const EVENT_STATUS: Record<string, { label: string; color: string }> = {
  UPCOMING: { label: "Sắp diễn ra", color: "#00B4D8" },
  ONGOING: { label: "Đang diễn ra", color: "var(--ibs-success)" },
  COMPLETED: { label: "Đã hoàn thành", color: "#6b7280" },
  CANCELLED: { label: "Đã hủy", color: "var(--ibs-danger)" },
};

export default function SuKienPage() {
  const [events, setEvents] = useState<CompanyEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [filterType, setFilterType] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [checklistEventId, setChecklistEventId] = useState<string | null>(null);

  function fetchEvents() {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterType) params.set("type", filterType);
    if (filterStatus) params.set("status", filterStatus);
    fetch(`/api/v1/events?${params}`)
      .then((r) => r.json()).then((res) => setEvents(res.data || []))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    fetch("/api/v1/me").then((r) => r.json()).then((res) => setUserRole(res.data?.role || ""));
  }, []);
  useEffect(() => { fetchEvents(); }, [filterType, filterStatus]);

  const canManage = userRole === "HR_ADMIN" || userRole === "BOM" || userRole === "MANAGER";

  async function handleDelete(id: string) {
    if (!confirm("Xóa sự kiện này?")) return;
    await fetch(`/api/v1/events/${id}`, { method: "DELETE" });
    fetchEvents();
  }

  async function handleStatusChange(id: string, status: string) {
    await fetch(`/api/v1/events/${id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    fetchEvents();
  }

  const upcomingCount = events.filter((e) => e.status === "UPCOMING").length;
  const ongoingCount = events.filter((e) => e.status === "ONGOING").length;
  const auditCount = events.filter((e) => e.type === "AUDIT_INTERNAL" || e.type === "AUDIT_EXTERNAL").length;

  return (
    <div>
      <div className="flex items-center gap-3 mb-1">
        <Link href="/hanh-chinh" className="text-[12px]" style={{ color: "var(--ibs-text-dim)" }}>← Hành chính</Link>
      </div>
      <PageTitle title="Sự kiện & Audit" description="Lịch sự kiện công ty, audit nội bộ và bên ngoài" />

      {/* Summary */}
      <div className="grid grid-cols-2 gap-4 mb-6 md:grid-cols-4">
        {[
          { label: "Tổng sự kiện", value: events.length, color: "var(--ibs-text)" },
          { label: "Sắp diễn ra", value: upcomingCount, color: "#00B4D8" },
          { label: "Đang diễn ra", value: ongoingCount, color: "var(--ibs-success)" },
          { label: "Audit (tất cả)", value: auditCount, color: "#8b5cf6" },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border p-4" style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
            <div className="text-[11px] font-semibold mb-1" style={{ color: "var(--ibs-text-dim)" }}>{s.label}</div>
            <div className="text-[28px] font-bold" style={{ color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border" style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
        <div className="flex items-center gap-3 px-5 py-4 border-b flex-wrap" style={{ borderColor: "var(--ibs-border)" }}>
          <div className="text-[14px] font-semibold">Danh sách sự kiện</div>
          <select value={filterType} onChange={(e) => setFilterType(e.target.value)}
            className="rounded-lg px-3 py-1.5 text-[12px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }}>
            <option value="">Tất cả loại</option>
            {Object.entries(EVENT_TYPE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
            className="rounded-lg px-3 py-1.5 text-[12px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }}>
            <option value="">Tất cả trạng thái</option>
            {Object.entries(EVENT_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <button onClick={fetchEvents} className="p-2 rounded-lg" style={{ color: "var(--ibs-text-dim)" }}><RefreshCw size={15} /></button>
          {canManage && (
            <button onClick={() => setShowNew(true)} className="flex items-center gap-1.5 text-[13px] px-3 py-2 rounded-lg font-semibold ml-auto" style={{ background: "var(--ibs-accent)", color: "#fff" }}>
              <Plus size={14} /> Tạo sự kiện
            </button>
          )}
        </div>

        <div className="divide-y" style={{ borderColor: "var(--ibs-border)" }}>
          {events.map((ev) => {
            const type = EVENT_TYPE[ev.type] || { label: ev.type, color: "#6b7280" };
            const status = EVENT_STATUS[ev.status] || { label: ev.status, color: "#6b7280" };
            return (
              <div key={ev.id} className="px-5 py-4 flex items-start gap-4" style={{ borderColor: "var(--ibs-border)" }}>
                <div className="w-1 h-full rounded-full self-stretch min-h-[40px]" style={{ background: type.color, minWidth: 3 }} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="font-semibold text-[14px]">{ev.title}</span>
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-lg" style={{ background: `${type.color}20`, color: type.color }}>{type.label}</span>
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-lg" style={{ background: `${status.color}20`, color: status.color }}>{status.label}</span>
                  </div>
                  <div className="flex gap-4 text-[12px] flex-wrap" style={{ color: "var(--ibs-text-dim)" }}>
                    <span>{formatDate(ev.startDate)} — {formatDate(ev.endDate)}</span>
                    {ev.location && <span>{ev.location}</span>}
                    {ev.organizer && <span>BTC: {ev.organizer}</span>}
                  </div>
                  {ev.description && <div className="text-[12px] mt-1" style={{ color: "var(--ibs-text-dim)" }}>{ev.description}</div>}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => setChecklistEventId(ev.id)} className="text-[11px] px-2 py-0.5 rounded flex items-center gap-1" style={{ background: "rgba(0,180,216,0.12)", color: "var(--ibs-accent)" }}>
                    <CheckSquare size={11} /> Checklist
                  </button>
                  {canManage && <>
                    {ev.status === "UPCOMING" && (
                      <button onClick={() => handleStatusChange(ev.id, "ONGOING")} className="text-[11px] px-2 py-0.5 rounded" style={{ background: "rgba(34,197,94,0.15)", color: "var(--ibs-success)" }}>Bắt đầu</button>
                    )}
                    {ev.status === "ONGOING" && (
                      <button onClick={() => handleStatusChange(ev.id, "COMPLETED")} className="text-[11px] px-2 py-0.5 rounded" style={{ background: "rgba(107,114,128,0.15)", color: "#6b7280" }}>Kết thúc</button>
                    )}
                    {userRole === "BOM" && (
                      <button onClick={() => handleDelete(ev.id)} className="p-1 rounded" style={{ color: "var(--ibs-danger)" }}><Trash2 size={13} /></button>
                    )}
                  </>}
                </div>
              </div>
            );
          })}
          {events.length === 0 && !loading && (
            <div className="px-5 py-16 text-center text-[13px]" style={{ color: "var(--ibs-text-dim)" }}>Chưa có sự kiện nào</div>
          )}
          {loading && (
            <div className="px-5 py-8 text-center text-[13px]" style={{ color: "var(--ibs-text-dim)" }}>Đang tải...</div>
          )}
        </div>
      </div>

      {showNew && (
        <NewEventModal onClose={() => setShowNew(false)} onSuccess={() => { setShowNew(false); fetchEvents(); }} />
      )}
      {checklistEventId && (
        <ChecklistModal eventId={checklistEventId} canManage={canManage} onClose={() => setChecklistEventId(null)} />
      )}
    </div>
  );
}

type ChecklistItem = {
  id: string; eventId: string; item: string; assignedTo: string | null;
  isCompleted: boolean; completedAt: string | null; note: string | null; sortOrder: number;
};

function ChecklistModal({ eventId, canManage, onClose }: { eventId: string; canManage: boolean; onClose: () => void }) {
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [newItem, setNewItem] = useState("");
  const [adding, setAdding] = useState(false);

  function fetchItems() {
    setLoading(true);
    fetch(`/api/v1/events/${eventId}/checklist`)
      .then((r) => r.json()).then((res) => setItems(res.data || []))
      .finally(() => setLoading(false));
  }

  useEffect(() => { fetchItems(); }, [eventId]);

  async function toggleItem(item: ChecklistItem) {
    await fetch(`/api/v1/events/${eventId}/checklist/${item.id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isCompleted: !item.isCompleted }),
    });
    fetchItems();
  }

  async function deleteItem(itemId: string) {
    if (!confirm("Xóa mục này?")) return;
    await fetch(`/api/v1/events/${eventId}/checklist/${itemId}`, { method: "DELETE" });
    fetchItems();
  }

  async function addItem(e: React.FormEvent) {
    e.preventDefault();
    if (!newItem.trim()) return;
    setAdding(true);
    await fetch(`/api/v1/events/${eventId}/checklist`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item: newItem.trim(), sortOrder: items.length }),
    });
    setNewItem(""); setAdding(false);
    fetchItems();
  }

  const completedCount = items.filter((i) => i.isCompleted).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="rounded-2xl w-full max-w-lg mx-4 p-6 max-h-[85vh] flex flex-col" style={{ background: "var(--ibs-bg-card)", border: "1px solid var(--ibs-border)" }}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-[16px] font-bold">Checklist sự kiện</div>
            <div className="text-[12px] mt-0.5" style={{ color: "var(--ibs-text-dim)" }}>
              {completedCount}/{items.length} mục hoàn thành
            </div>
          </div>
          <button onClick={onClose}><X size={18} /></button>
        </div>

        {items.length > 0 && (
          <div className="w-full rounded-full h-1.5 mb-4" style={{ background: "var(--ibs-border)" }}>
            <div className="h-1.5 rounded-full transition-all" style={{ background: "var(--ibs-success)", width: `${items.length ? (completedCount / items.length) * 100 : 0}%` }} />
          </div>
        )}

        <div className="flex-1 overflow-y-auto divide-y" style={{ borderColor: "var(--ibs-border)" }}>
          {loading && <div className="py-8 text-center text-[13px]" style={{ color: "var(--ibs-text-dim)" }}>Đang tải...</div>}
          {!loading && items.length === 0 && (
            <div className="py-8 text-center text-[13px]" style={{ color: "var(--ibs-text-dim)" }}>Chưa có mục nào</div>
          )}
          {items.map((item) => (
            <div key={item.id} className="flex items-center gap-3 py-3">
              <button onClick={() => toggleItem(item)} className="shrink-0" style={{ color: item.isCompleted ? "var(--ibs-success)" : "var(--ibs-text-dim)" }}>
                {item.isCompleted ? <CheckSquare size={18} /> : <Square size={18} />}
              </button>
              <span className="flex-1 text-[13px]" style={{ textDecoration: item.isCompleted ? "line-through" : "none", color: item.isCompleted ? "var(--ibs-text-dim)" : "var(--ibs-text)" }}>
                {item.item}
              </span>
              {item.isCompleted && item.completedAt && (
                <span className="text-[11px] shrink-0" style={{ color: "var(--ibs-text-dim)" }}>
                  {new Date(item.completedAt).toLocaleDateString("vi-VN")}
                </span>
              )}
              {canManage && (
                <button onClick={() => deleteItem(item.id)} className="shrink-0 p-1 rounded" style={{ color: "var(--ibs-danger)" }}><Trash2 size={13} /></button>
              )}
            </div>
          ))}
        </div>

        {canManage && (
          <form onSubmit={addItem} className="flex gap-2 mt-4 pt-4 border-t" style={{ borderColor: "var(--ibs-border)" }}>
            <input
              value={newItem} onChange={(e) => setNewItem(e.target.value)}
              placeholder="Thêm mục checklist..."
              className="flex-1 rounded-lg px-3 py-2 text-[13px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }}
            />
            <button type="submit" disabled={adding || !newItem.trim()} className="px-3 py-2 rounded-lg text-[13px] font-semibold" style={{ background: "var(--ibs-accent)", color: "#fff", opacity: adding || !newItem.trim() ? 0.5 : 1 }}>
              <Plus size={14} />
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function NewEventModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({ title: "", type: "INTERNAL", startDate: today, endDate: today, location: "", description: "", organizer: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setSaving(true);
    const body: any = { ...form };
    if (!body.location) delete body.location;
    if (!body.description) delete body.description;
    if (!body.organizer) delete body.organizer;
    const res = await fetch("/api/v1/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setSaving(false);
    if (res.ok) { onSuccess(); } else { const d = await res.json(); setError(d.error?.message || "Có lỗi xảy ra"); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="rounded-2xl w-full max-w-lg mx-4 p-6 max-h-[90vh] overflow-y-auto" style={{ background: "var(--ibs-bg-card)", border: "1px solid var(--ibs-border)" }}>
        <div className="flex items-center justify-between mb-5"><div className="text-[16px] font-bold">Tạo sự kiện</div><button onClick={onClose}><X size={18} /></button></div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div>
            <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Tên sự kiện *</label>
            <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full rounded-lg px-3 py-2 text-[13px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Loại sự kiện</label>
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}
                className="w-full rounded-lg px-3 py-2 text-[13px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }}>
                {Object.entries(EVENT_TYPE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Ban tổ chức</label>
              <input value={form.organizer} onChange={(e) => setForm({ ...form, organizer: e.target.value })}
                className="w-full rounded-lg px-3 py-2 text-[13px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Ngày bắt đầu *</label>
              <input required type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                className="w-full rounded-lg px-3 py-2 text-[13px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }} />
            </div>
            <div>
              <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Ngày kết thúc *</label>
              <input required type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                className="w-full rounded-lg px-3 py-2 text-[13px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }} />
            </div>
          </div>
          <div>
            <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Địa điểm</label>
            <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })}
              className="w-full rounded-lg px-3 py-2 text-[13px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }} />
          </div>
          <div>
            <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Mô tả</label>
            <textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full rounded-lg px-3 py-2 text-[13px] border resize-none" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }} />
          </div>
          {error && <div className="text-[12px] text-red-500">{error}</div>}
          <div className="flex gap-2 justify-end mt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-[13px] border" style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-dim)" }}>Hủy</button>
            <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg text-[13px] font-semibold" style={{ background: "var(--ibs-accent)", color: "#fff" }}>{saving ? "Đang lưu..." : "Tạo"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
