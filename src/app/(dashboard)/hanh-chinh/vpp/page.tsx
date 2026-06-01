"use client";

import { useState, useEffect, useMemo } from "react";
import { PageHeader, Button, Badge } from "@/components/ui";
import { apiError } from "@/lib/utils";
import { confirmDialog, alertDialog } from "@/lib/confirm-dialog";
import { Plus, Upload, Check, X, ChevronDown, ChevronRight, FileText, Package } from "lucide-react";

type Supplier = { id: string; name: string };
type Item = { id: string; name: string; unit: string; note?: string | null; currentStock: number };
type StockIn = {
  id: string; importDate: string; notes?: string;
  supplier: { id: string; name: string };
  items: { quantity: number; item: { id: string; name: string; unit: string } }[];
};
type RequestItem = { quantity: number; note?: string; item: { id: string; name: string; unit: string; currentStock: number } };
type Request = {
  id: string; status: string; reason: string; fileUrl: string;
  createdAt: string; approvedAt?: string; completedAt?: string; rejectedReason?: string;
  createdById: string;
  requester: { id: string; code: string; fullName: string; department: { name: string }; position: { name: string } };
  items: RequestItem[];
};
type Employee = { id: string; code: string; fullName: string; department: { name: string } };

const STATUS_BADGE: Record<string, { label: string; variant: "warning" | "info" | "success" | "danger" | "default" }> = {
  PENDING_APPROVAL: { label: "Chờ duyệt", variant: "warning" },
  APPROVED: { label: "Đã duyệt", variant: "info" },
  COMPLETED: { label: "Đã cấp", variant: "success" },
  REJECTED: { label: "Từ chối", variant: "danger" },
};

const fmt = (n: number) => Number.isInteger(n) ? n.toString() : n.toFixed(2);

export default function VppPage() {
  const [tab, setTab] = useState<"stock" | "stockIn" | "requests">("stock");
  const [me, setMe] = useState<{ id: string; role: string } | null>(null);

  useEffect(() => {
    fetch("/api/v1/me").then((r) => r.json()).then((res) => {
      if (res?.id) setMe({ id: res.id, role: res.role });
    });
  }, []);

  return (
    <div>
      <PageHeader title="M10.3 — Văn phòng phẩm" subtitle="Danh sách VPP, tạo yêu cầu VPP, phiếu yêu cầu xuất VPP" />

      <div className="flex gap-2 mb-4">
        {[
          { k: "stock", label: "Danh sách VPP", icon: Package },
          { k: "stockIn", label: "Danh sách yêu cầu VPP", icon: FileText },
          { k: "requests", label: "Phiếu xuất VPP", icon: FileText },
        ].map((t) => {
          const Icon = t.icon;
          const active = tab === t.k;
          return (
            <button
              key={t.k}
              onClick={() => setTab(t.k as any)}
              className={`filter-pill${active ? " active" : ""}`}
            >
              <Icon size={14} /> {t.label}
            </button>
          );
        })}
      </div>

      {tab === "stock" && <StockTab />}
      {tab === "stockIn" && <StockInTab />}
      {tab === "requests" && <RequestsTab me={me} />}
    </div>
  );
}

function StockTab() {
  const [items, setItems] = useState<Item[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [showRequest, setShowRequest] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/v1/stationery/items${q ? `?q=${encodeURIComponent(q)}` : ""}`)
      .then((r) => r.json()).then((res) => setItems(res.data || []))
      .finally(() => setLoading(false));
  }, [q]);

  return (
    <div>
      <div className="flex gap-3 mb-4 items-center">
        <input
          value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Tìm theo tên VPP..."
          className="px-3 py-2 rounded-lg border text-[13px] flex-1 max-w-md"
          style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}
        />
        <span className="text-[12px]" style={{ color: "var(--ibs-text-dim)" }}>{items.length} mặt hàng</span>
        <button onClick={() => setShowRequest(true)}
          className="ml-auto flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-semibold text-white"
          style={{ background: "var(--ibs-accent)" }}>
          <Plus size={14} /> Tạo yêu cầu VPP
        </button>
      </div>
      <div className="rounded-xl border overflow-hidden" style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
        <table className="w-full text-[13px]">
          <thead style={{ background: "rgba(0,180,216,0.05)" }}>
            <tr>
              <th className="px-4 py-3 text-left font-semibold">Tên VPP</th>
              <th className="px-4 py-3 text-left font-semibold">Đơn vị tính</th>
              <th className="px-4 py-3 text-left font-semibold">Ghi chú</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={3} className="px-4 py-8 text-center" style={{ color: "var(--ibs-text-dim)" }}>Đang tải...</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={3} className="px-4 py-8 text-center" style={{ color: "var(--ibs-text-dim)" }}>Chưa có VPP nào</td></tr>
            ) : items.map((it) => (
              <tr key={it.id} className="border-t" style={{ borderColor: "var(--ibs-border)" }}>
                <td className="px-4 py-2.5 font-medium">{it.name}</td>
                <td className="px-4 py-2.5" style={{ color: "var(--ibs-text-dim)" }}>{it.unit}</td>
                <td className="px-4 py-2.5 text-[12px]" style={{ color: "var(--ibs-text-dim)" }}>{it.note || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {showRequest && <RequestVPPModal onClose={() => setShowRequest(false)} onSuccess={() => setShowRequest(false)} />}
    </div>
  );
}

// Modal tạo yêu cầu VPP cho user phòng ban: trái = danh sách VPP (tích chọn), phải = đã chọn + nhập số lượng.
function RequestVPPModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [items, setItems] = useState<Item[]>([]);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Record<string, { name: string; unit: string; quantity: string }>>({});
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/v1/stationery/items${q ? `?q=${encodeURIComponent(q)}` : ""}`)
      .then((r) => r.json()).then((res) => setItems(res.data || []));
  }, [q]);

  const toggle = (it: Item) => setSelected((prev) => {
    const next = { ...prev };
    if (next[it.id]) delete next[it.id];
    else next[it.id] = { name: it.name, unit: it.unit, quantity: "1" };
    return next;
  });
  const setQty = (id: string, v: string) => setSelected((prev) => ({ ...prev, [id]: { ...prev[id], quantity: v.replace(/[^\d.]/g, "") } }));
  const selectedEntries = Object.entries(selected);

  async function save() {
    const payload = selectedEntries.filter(([, s]) => Number(s.quantity) > 0).map(([id, s]) => ({ itemId: id, quantity: Number(s.quantity) }));
    if (payload.length === 0) { setError("Vui lòng chọn ít nhất 1 VPP và nhập số lượng > 0"); return; }
    setSaving(true); setError("");
    const res = await fetch("/api/v1/stationery/requests", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: payload, reason: reason || null }),
    });
    setSaving(false);
    if (res.ok) setDone(true);
    else { const d = await res.json(); setError(apiError(res.status, d.error)); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="rounded-2xl w-full max-w-3xl p-6 max-h-[92vh] overflow-hidden flex flex-col" style={{ background: "var(--ibs-bg-card)", border: "1px solid var(--ibs-border)" }}>
        <div className="flex items-center justify-between mb-4">
          <div className="text-[16px] font-bold">Tạo yêu cầu Văn phòng phẩm</div>
          <button onClick={onClose}><X size={18} /></button>
        </div>

        {done ? (
          <div className="py-10 text-center">
            <div className="text-[14px] font-semibold mb-1" style={{ color: "var(--ibs-success)" }}>✅ Đã gửi yêu cầu VPP</div>
            <div className="text-[12px] mb-4" style={{ color: "var(--ibs-text-dim)" }}>Yêu cầu đang chờ HCNS duyệt.</div>
            <button onClick={onSuccess} className="px-4 py-2 rounded-lg text-[13px] font-semibold text-white" style={{ background: "var(--ibs-accent)" }}>Xong</button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 flex-1 min-h-0">
              {/* TRÁI: danh sách VPP để tích chọn */}
              <div className="flex flex-col min-h-0">
                <div className="text-[12px] font-semibold mb-2" style={{ color: "var(--ibs-text-dim)" }}>Danh sách VPP</div>
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm VPP..."
                  className="px-3 py-2 rounded-lg border text-[13px] mb-2" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)" }} />
                <div className="rounded-lg border overflow-y-auto" style={{ borderColor: "var(--ibs-border)", maxHeight: 340 }}>
                  {items.length === 0 ? <div className="px-3 py-6 text-center text-[12px]" style={{ color: "var(--ibs-text-dim)" }}>Không có VPP</div> :
                    items.map((it) => (
                      <label key={it.id} className="flex items-center gap-2 px-3 py-2 border-b cursor-pointer text-[13px]" style={{ borderColor: "rgba(51,65,85,0.2)" }}>
                        <input type="checkbox" checked={!!selected[it.id]} onChange={() => toggle(it)} style={{ accentColor: "var(--ibs-accent)" }} />
                        <span className="flex-1">{it.name}</span>
                        <span className="text-[11px]" style={{ color: "var(--ibs-text-dim)" }}>{it.unit}</span>
                      </label>
                    ))}
                </div>
              </div>

              {/* PHẢI: đã chọn + nhập số lượng */}
              <div className="flex flex-col min-h-0">
                <div className="text-[12px] font-semibold mb-2" style={{ color: "var(--ibs-text-dim)" }}>Đã chọn — nhập số lượng ({selectedEntries.length})</div>
                <div className="rounded-lg border overflow-y-auto flex-1" style={{ borderColor: "var(--ibs-border)", maxHeight: 300 }}>
                  {selectedEntries.length === 0 ? <div className="px-3 py-6 text-center text-[12px]" style={{ color: "var(--ibs-text-dim)" }}>Tích chọn VPP ở danh sách bên trái</div> :
                    selectedEntries.map(([id, s]) => (
                      <div key={id} className="flex items-center gap-2 px-3 py-2 border-b text-[13px]" style={{ borderColor: "rgba(51,65,85,0.2)" }}>
                        <span className="flex-1 min-w-0 truncate">{s.name}</span>
                        <input value={s.quantity} onChange={(e) => setQty(id, e.target.value)} inputMode="numeric"
                          className="w-16 px-2 py-1 rounded border text-[13px] text-right" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)" }} />
                        <span className="text-[11px] w-8" style={{ color: "var(--ibs-text-dim)" }}>{s.unit}</span>
                        <button onClick={() => toggle({ id, name: s.name, unit: s.unit, currentStock: 0 } as Item)} style={{ color: "var(--ibs-danger)" }}><X size={14} /></button>
                      </div>
                    ))}
                </div>
                <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Lý do (tuỳ chọn)..."
                  className="px-3 py-2 rounded-lg border text-[13px] mt-2" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)" }} />
              </div>
            </div>

            {error && <div className="text-[12px] text-red-500 mt-2">{error}</div>}
            <div className="flex gap-2 justify-end mt-4">
              <button onClick={onClose} className="px-4 py-2 rounded-lg text-[13px] border" style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-dim)" }}>Hủy</button>
              <button onClick={save} disabled={saving} className="px-4 py-2 rounded-lg text-[13px] font-semibold text-white" style={{ background: "var(--ibs-accent)", opacity: saving ? 0.7 : 1 }}>
                {saving ? "Đang lưu..." : "Lưu yêu cầu"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function StockInTab() {
  const [requests, setRequests] = useState<any[]>([]);
  const [canApprove, setCanApprove] = useState(false);
  const [loading, setLoading] = useState(true);
  const [issuing, setIssuing] = useState(false);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [qty, setQty] = useState<Record<string, string>>({});

  function load() {
    setLoading(true);
    fetch("/api/v1/stationery/requests").then((r) => r.json())
      .then((res) => { setRequests(res.data || []); setCanApprove(!!res.canApprove); setSelected({}); setQty({}); })
      .finally(() => setLoading(false));
  }
  useEffect(() => { load(); }, []);

  // Cộng dồn VPP còn thiếu (quantity − đã cấp) từ các yêu cầu chưa hoàn thành
  const pending = requests.filter((r) => ["PENDING_APPROVAL", "APPROVED"].includes(r.status));
  const aggMap = new Map<string, { id: string; name: string; unit: string; note?: string | null; remaining: number; requesters: Set<string> }>();
  for (const r of pending) {
    for (const it of r.items) {
      const rem = (it.quantity || 0) - (it.issuedQuantity || 0);
      if (rem <= 0) continue;
      const cur = aggMap.get(it.item.id) || { id: it.item.id, name: it.item.name, unit: it.item.unit, note: it.item.note, remaining: 0, requesters: new Set<string>() };
      cur.remaining += rem;
      cur.requesters.add(r.requester?.fullName || "—");
      aggMap.set(it.item.id, cur);
    }
  }
  const agg = Array.from(aggMap.values()).filter((a) => a.remaining > 0).sort((a, b) => a.name.localeCompare(b.name, "vi"));

  const toggle = (it: typeof agg[number]) => setSelected((prev) => {
    const next = { ...prev };
    if (next[it.id]) delete next[it.id];
    else { next[it.id] = true; setQty((q) => ({ ...q, [it.id]: q[it.id] ?? String(it.remaining) })); }
    return next;
  });
  const checkedCount = agg.filter((a) => selected[a.id]).length;

  async function issueSelected() {
    const items = agg.filter((a) => selected[a.id]).map((a) => {
      let n = Number(qty[a.id] ?? a.remaining);
      if (!(n > 0)) n = 0;
      if (n > a.remaining) n = a.remaining; // không cấp quá số yêu cầu
      return { itemId: a.id, quantity: n };
    }).filter((x) => x.quantity > 0);
    if (items.length === 0) { await alertDialog("Chọn ít nhất 1 VPP và nhập số lượng cấp > 0"); return; }
    setIssuing(true);
    const res = await fetch("/api/v1/stationery/requests/issue", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items }) });
    setIssuing(false);
    if (res.ok) load();
    else { const d = await res.json(); await alertDialog(apiError(res.status, d.error)); }
  }

  async function issueAll() {
    if (!(await confirmDialog({ title: "Cấp phát toàn bộ", tone: "default", confirmText: "Cấp phát", message: `Cấp phát TOÀN BỘ ${agg.length} loại VPP (${pending.length} yêu cầu)? Danh sách sẽ trống sau khi cấp.` }))) return;
    setIssuing(true);
    const res = await fetch("/api/v1/stationery/requests/issue-all", { method: "POST" });
    setIssuing(false);
    if (res.ok) load();
    else { const d = await res.json(); await alertDialog(apiError(res.status, d.error)); }
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4 gap-2">
        <span className="text-[12px]" style={{ color: "var(--ibs-text-dim)" }}>
          {agg.length} loại VPP chờ cấp (đã cộng dồn){checkedCount > 0 ? ` · đã chọn ${checkedCount}` : ""}
        </span>
        {canApprove && agg.length > 0 && (
          <div className="flex gap-2">
            <button onClick={issueSelected} disabled={issuing || checkedCount === 0}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-semibold border disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ borderColor: "var(--ibs-accent)", color: "var(--ibs-accent)", background: "transparent" }}>
              <Check size={14} /> Cấp phát{checkedCount > 0 ? ` (${checkedCount})` : ""}
            </button>
            <button onClick={issueAll} disabled={issuing}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: "var(--ibs-accent)" }}>
              <Check size={14} /> Cấp phát toàn bộ
            </button>
          </div>
        )}
      </div>

      <div className="rounded-xl border overflow-hidden" style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
        <table className="w-full text-[13px]">
          <thead style={{ background: "rgba(0,180,216,0.05)" }}>
            <tr>
              <th className="px-3 py-3 w-10"></th>
              <th className="px-4 py-3 text-left font-semibold">Tên VPP</th>
              <th className="px-4 py-3 text-left font-semibold">ĐVT</th>
              <th className="px-4 py-3 text-right font-semibold">SL yêu cầu</th>
              <th className="px-4 py-3 text-right font-semibold">SL cấp phát</th>
              <th className="px-4 py-3 text-left font-semibold">Phòng/Người yêu cầu</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center" style={{ color: "var(--ibs-text-dim)" }}>Đang tải...</td></tr>
            ) : agg.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center" style={{ color: "var(--ibs-text-dim)" }}>Chưa có yêu cầu VPP nào chờ cấp</td></tr>
            ) : agg.map((it) => {
              const checked = !!selected[it.id];
              return (
                <tr key={it.id} className="border-t" style={{ borderColor: "var(--ibs-border)", background: checked ? "rgba(0,180,216,0.04)" : undefined }}>
                  <td className="px-3 py-2.5 text-center">
                    <input type="checkbox" checked={checked} onChange={() => toggle(it)} style={{ accentColor: "var(--ibs-accent)", width: 16, height: 16 }} />
                  </td>
                  <td className="px-4 py-2.5 font-medium">{it.name}{it.note ? <span className="text-[11px] ml-1" style={{ color: "var(--ibs-text-dim)" }}>({it.note})</span> : null}</td>
                  <td className="px-4 py-2.5" style={{ color: "var(--ibs-text-dim)" }}>{it.unit}</td>
                  <td className="px-4 py-2.5 text-right font-semibold">{fmt(it.remaining)}</td>
                  <td className="px-4 py-2.5 text-right">
                    {checked ? (
                      <input value={qty[it.id] ?? String(it.remaining)} onChange={(e) => setQty((q) => ({ ...q, [it.id]: e.target.value.replace(/[^\d.]/g, "") }))}
                        inputMode="numeric" className="w-20 px-2 py-1 rounded border text-[13px] text-right"
                        style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)" }} />
                    ) : <span style={{ color: "var(--ibs-text-dim)" }}>—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-[12px]" style={{ color: "var(--ibs-text-dim)" }}>{Array.from(it.requesters).join(", ")}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StockInModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierName, setSupplierName] = useState("");
  const [showSupplierList, setShowSupplierList] = useState(false);
  const [importDate, setImportDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<{ name: string; unit: string; quantity: string; itemId?: string }[]>([{ name: "", unit: "", quantity: "" }]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Record<number, Item[]>>({});

  useEffect(() => {
    fetch("/api/v1/stationery/suppliers").then((r) => r.json()).then((res) => setSuppliers(res.data || []));
  }, []);

  async function searchItem(idx: number, q: string) {
    if (q.length < 2) { setSuggestions((s) => ({ ...s, [idx]: [] })); return; }
    const res = await fetch(`/api/v1/stationery/items?q=${encodeURIComponent(q)}`).then((r) => r.json());
    setSuggestions((s) => ({ ...s, [idx]: res.data || [] }));
  }

  function updateRow(i: number, k: "name" | "unit" | "quantity", v: string) {
    const next = [...items];
    next[i] = { ...next[i], [k]: v };
    if (k === "name") { next[i].itemId = undefined; searchItem(i, v); }
    setItems(next);
  }
  function selectSuggestion(i: number, it: Item) {
    const next = [...items];
    next[i] = { name: it.name, unit: it.unit, quantity: next[i].quantity, itemId: it.id };
    setItems(next);
    setSuggestions((s) => ({ ...s, [i]: [] }));
  }

  async function submit() {
    setError(null);
    const valid = items.filter((it) => it.name.trim() && it.unit.trim() && Number(it.quantity) > 0);
    if (valid.length === 0) { setError("Cần ít nhất 1 item"); return; }
    if (!supplierName.trim()) { setError("Chưa nhập tên NCC"); return; }
    setSubmitting(true);
    try {
      const res = await fetch("/api/v1/stationery/stock-in", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierName: supplierName.trim(), importDate, notes: notes || null,
          items: valid.map((it) => ({ itemId: it.itemId, name: it.name.trim(), unit: it.unit.trim(), quantity: Number(it.quantity) })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(apiError(res.status, data.error));
      onSuccess();
    } catch (e: any) { setError(String(e.message || e)); } finally { setSubmitting(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.5)" }}>
      <div className="rounded-xl p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto" style={{ background: "var(--ibs-bg-card)" }}>
        <div className="flex justify-between mb-4">
          <h3 className="text-[16px] font-semibold">Nhập kho VPP mới</h3>
          <button onClick={onClose}><X size={20} /></button>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="relative">
            <label className="text-[12px] mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>NCC *</label>
            <input
              value={supplierName}
              onChange={(e) => { setSupplierName(e.target.value); setShowSupplierList(true); }}
              onFocus={() => setShowSupplierList(true)}
              onBlur={() => setTimeout(() => setShowSupplierList(false), 200)}
              placeholder="Nhập tên NCC (vd: Super MRO)"
              className="w-full px-3 py-2 rounded-lg border text-[13px]"
              style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)" }}
            />
            {showSupplierList && suppliers.filter((s) => s.name.toLowerCase().includes(supplierName.toLowerCase())).length > 0 && (
              <div className="absolute top-full left-0 right-0 z-10 mt-1 rounded-lg border shadow-lg max-h-40 overflow-y-auto"
                style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
                {suppliers.filter((s) => s.name.toLowerCase().includes(supplierName.toLowerCase())).map((s) => (
                  <button key={s.id} type="button" onMouseDown={() => { setSupplierName(s.name); setShowSupplierList(false); }}
                    className="block w-full text-left px-3 py-1.5 text-[12px] hover:bg-black/5">{s.name}</button>
                ))}
              </div>
            )}
          </div>
          <div>
            <label className="text-[12px] mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Ngày nhập *</label>
            <input type="date" value={importDate} onChange={(e) => setImportDate(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border text-[13px]"
              style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)" }} />
          </div>
        </div>

        <div className="mb-2 text-[12px] font-semibold">Danh sách VPP nhập:</div>
        <div className="space-y-2 mb-3">
          {items.map((it, i) => (
            <div key={i} className="relative grid gap-2" style={{ gridTemplateColumns: "3fr 1fr 1fr auto" }}>
              <div className="relative">
                <input value={it.name} onChange={(e) => updateRow(i, "name", e.target.value)}
                  placeholder="Tên VPP (vd: Giấy A4)" className="w-full px-2 py-1.5 rounded border text-[13px]"
                  style={{ background: "var(--ibs-bg)", borderColor: it.itemId ? "var(--ibs-success)" : "var(--ibs-border)" }} />
                {suggestions[i]?.length > 0 && (
                  <div className="absolute top-full left-0 right-0 z-10 mt-1 rounded-lg border shadow-lg max-h-40 overflow-y-auto"
                    style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
                    {suggestions[i].map((s) => (
                      <button key={s.id} onClick={() => selectSuggestion(i, s)} className="block w-full text-left px-3 py-1.5 text-[12px] hover:bg-black/5">
                        {s.name} <span style={{ color: "var(--ibs-text-dim)" }}>({s.unit}, tồn {fmt(s.currentStock)})</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <input value={it.unit} onChange={(e) => updateRow(i, "unit", e.target.value)} placeholder="ĐVT" className="px-2 py-1.5 rounded border text-[13px]"
                style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)" }} />
              <input type="number" value={it.quantity} onChange={(e) => updateRow(i, "quantity", e.target.value)} placeholder="SL" className="px-2 py-1.5 rounded border text-[13px]"
                style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)" }} />
              <button onClick={() => setItems(items.filter((_, j) => j !== i))} disabled={items.length === 1}
                className="px-2 text-[18px] opacity-60 hover:opacity-100 disabled:opacity-20">×</button>
            </div>
          ))}
        </div>
        <button onClick={() => setItems([...items, { name: "", unit: "", quantity: "" }])}
          className="text-[12px] mb-4" style={{ color: "var(--ibs-accent)" }}>+ Thêm dòng</button>

        <div className="mb-4">
          <label className="text-[12px] mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Ghi chú</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full px-3 py-2 rounded-lg border text-[13px]"
            style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)" }} />
        </div>

        {error && <div className="mb-3 p-2 rounded text-[13px]" style={{ background: "rgba(239,68,68,0.1)", color: "var(--ibs-danger)" }}>{error}</div>}

        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>Hủy</Button>
          <Button variant="accent" size="sm" loading={submitting} onClick={submit}>
            {submitting ? "Đang lưu..." : "Lưu phiếu nhập"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function RequestsTab({ me }: { me: { id: string; role: string } | null }) {
  const [requests, setRequests] = useState<Request[]>([]);
  const [canApprove, setCanApprove] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true);
    fetch("/api/v1/stationery/requests").then((r) => r.json()).then((res) => {
      setRequests(res.data || []); setCanApprove(!!res.canApprove);
    }).finally(() => setLoading(false));
  }
  useEffect(() => { load(); }, []);

  async function approve(id: string) {
    await fetch(`/api/v1/stationery/requests/${id}/approve`, { method: "POST" });
    load();
  }
  async function reject(id: string) {
    const reason = prompt("Lý do từ chối:");
    if (!reason) return;
    await fetch(`/api/v1/stationery/requests/${id}/reject`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason }),
    });
    load();
  }
  async function complete(id: string) {
    if (!(await confirmDialog("Xác nhận đã cấp VPP cho nhân viên?"))) return;
    const res = await fetch(`/api/v1/stationery/requests/${id}/complete`, { method: "POST" });
    if (!res.ok) {
      const d = await res.json();
      await alertDialog("Lỗi: " + apiError(res.status, d.error));
      return;
    }
    load();
  }
  function toggle(id: string) {
    const n = new Set(expanded);
    if (n.has(id)) n.delete(id); else n.add(id);
    setExpanded(n);
  }

  // Phiếu đã cấp → gom theo NGÀY bấm nút Cấp phát (completedAt). Mỗi nhóm = 1 đợt cấp phát.
  const others = requests.filter((r) => r.status !== "COMPLETED");
  const dateGroups = useMemo(() => {
    const map = new Map<string, Request[]>();
    for (const r of requests.filter((x) => x.status === "COMPLETED")) {
      const d = new Date(r.completedAt || r.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return Array.from(map.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([key, reqs]) => ({ key, label: key.split("-").reverse().join("/"), reqs }));
  }, [requests]);

  return (
    <div>
      <div className="flex justify-between mb-4">
        <span className="text-[12px]" style={{ color: "var(--ibs-text-dim)" }}>
          {requests.length} phiếu — {canApprove ? "Xem tất cả (quyền duyệt)" : "Chỉ phiếu bạn tạo"}
        </span>
        <button onClick={() => setShowNew(true)}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-semibold text-white"
          style={{ background: "var(--ibs-accent)" }}>
          <Plus size={14} /> Tạo phiếu xuất
        </button>
      </div>

      {loading ? (
        <div className="rounded-xl border px-4 py-8 text-center" style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)", color: "var(--ibs-text-dim)" }}>Đang tải...</div>
      ) : requests.length === 0 ? (
        <div className="rounded-xl border px-4 py-8 text-center" style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)", color: "var(--ibs-text-dim)" }}>Chưa có phiếu xuất nào</div>
      ) : (
        <>
          {/* Yêu cầu đang chờ duyệt / chờ cấp */}
          {others.length > 0 && (
            <div className="rounded-xl border mb-4" style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
              <div className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--ibs-text-dim)", borderBottom: "1px solid var(--ibs-border)" }}>Đang xử lý</div>
              {others.map((r) => {
                const st = STATUS_BADGE[r.status] || { label: r.status, variant: "default" as const };
                const isOwner = me?.id === r.createdById;
                return (
                  <div key={r.id} className="border-b last:border-b-0" style={{ borderColor: "var(--ibs-border)" }}>
                    <div className="px-4 py-3 flex items-center justify-between gap-4">
                      <button onClick={() => toggle(r.id)} className="flex items-center gap-2 flex-1 text-left min-w-0">
                        {expanded.has(r.id) ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        <div className="min-w-0">
                          <div className="font-semibold truncate">
                            {r.requester.fullName}
                            <span className="ml-2 text-[12px] font-normal" style={{ color: "var(--ibs-text-dim)" }}>
                              ({r.requester.code} — {r.requester.department.name})
                            </span>
                          </div>
                          <div className="text-[11px] truncate" style={{ color: "var(--ibs-text-dim)" }}>
                            {new Date(r.createdAt).toLocaleString("vi-VN")} · {r.items.length} mặt hàng{r.reason ? ` · Lý do: ${r.reason}` : ""}
                          </div>
                        </div>
                      </button>

                      <Badge variant={st.variant}>{st.label}</Badge>

                      <div className="flex gap-2 shrink-0 items-center">
                        {r.fileUrl && <a href={r.fileUrl} target="_blank" rel="noreferrer" className="text-[11px] underline" style={{ color: "var(--ibs-accent)" }}>📎 File</a>}
                        {r.status === "PENDING_APPROVAL" && canApprove && r.createdById !== me?.id && (
                          <>
                            <Button size="sm" onClick={() => approve(r.id)} style={{ background: "var(--success)" }}>
                              <Check size={12} /> Duyệt
                            </Button>
                            <Button variant="danger" size="sm" onClick={() => reject(r.id)}>
                              <X size={12} /> Từ chối
                            </Button>
                          </>
                        )}
                        {r.status === "APPROVED" && (isOwner || me?.role === "BOM") && (
                          <Button variant="accent" size="sm" onClick={() => complete(r.id)}>
                            <Check size={12} /> Hoàn thành
                          </Button>
                        )}
                      </div>
                    </div>

                    {expanded.has(r.id) && (
                      <div className="px-4 pb-3 pl-10" style={{ background: "rgba(0,0,0,0.03)" }}>
                        <table className="w-full text-[12px]">
                          <thead>
                            <tr style={{ color: "var(--ibs-text-dim)" }}>
                              <th className="px-2 py-1 text-left">VPP</th>
                              <th className="px-2 py-1 text-right">SL</th>
                              <th className="px-2 py-1 text-left">ĐVT</th>
                              <th className="px-2 py-1 text-left">Ghi chú</th>
                            </tr>
                          </thead>
                          <tbody>
                            {r.items.map((it, i) => (
                              <tr key={i} className="border-t" style={{ borderColor: "var(--ibs-border)" }}>
                                <td className="px-2 py-1">{it.item.name}</td>
                                <td className="px-2 py-1 text-right font-semibold">{fmt(it.quantity)}</td>
                                <td className="px-2 py-1">{it.item.unit}</td>
                                <td className="px-2 py-1" style={{ color: "var(--ibs-text-dim)" }}>{it.note || "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {r.rejectedReason && <div className="mt-2 text-[12px]" style={{ color: "var(--ibs-danger)" }}>❌ Lý do từ chối: {r.rejectedReason}</div>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Lịch sử cấp phát — gom theo ngày bấm nút Cấp phát */}
          {dateGroups.map((g) => {
            const totalItems = g.reqs.reduce((s, r) => s + r.items.length, 0);
            return (
              <div key={g.key} className="rounded-xl border mb-3" style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
                <button onClick={() => toggle(g.key)} className="w-full px-4 py-3 flex items-center gap-2 text-left">
                  {expanded.has(g.key) ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  <Package size={15} style={{ color: "var(--ibs-accent)" }} />
                  <span className="font-semibold">Cấp phát vật tư ngày {g.label}</span>
                  <span className="ml-auto text-[12px]" style={{ color: "var(--ibs-text-dim)" }}>{g.reqs.length} nhân viên · {totalItems} mặt hàng</span>
                </button>

                {expanded.has(g.key) && (
                  <div className="px-4 pb-4" style={{ borderTop: "1px solid var(--ibs-border)" }}>
                    {g.reqs.map((r) => (
                      <div key={r.id} className="pt-3">
                        <div className="font-semibold text-[13px]">
                          {r.requester.fullName}
                          <span className="ml-2 text-[12px] font-normal" style={{ color: "var(--ibs-text-dim)" }}>
                            ({r.requester.code} — {r.requester.department.name})
                          </span>
                        </div>
                        <table className="w-full text-[12px] mt-1">
                          <thead>
                            <tr style={{ color: "var(--ibs-text-dim)" }}>
                              <th className="px-2 py-1 text-left">VPP</th>
                              <th className="px-2 py-1 text-right">SL</th>
                              <th className="px-2 py-1 text-left">ĐVT</th>
                              <th className="px-2 py-1 text-left">Ghi chú</th>
                            </tr>
                          </thead>
                          <tbody>
                            {r.items.map((it, i) => (
                              <tr key={i} className="border-t" style={{ borderColor: "var(--ibs-border)" }}>
                                <td className="px-2 py-1">{it.item.name}</td>
                                <td className="px-2 py-1 text-right font-semibold">{fmt(it.quantity)}</td>
                                <td className="px-2 py-1">{it.item.unit}</td>
                                <td className="px-2 py-1" style={{ color: "var(--ibs-text-dim)" }}>{it.note || "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}

      {showNew && <RequestModal onClose={() => setShowNew(false)} onSuccess={() => { setShowNew(false); load(); }} />}
    </div>
  );
}

function RequestModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [requesterId, setRequesterId] = useState("");
  const [reason, setReason] = useState("");
  const [fileUrl, setFileUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [items, setItems] = useState<{ itemId?: string; name: string; unit: string; quantity: string; note: string; currentStock?: number }[]>([{ name: "", unit: "", quantity: "", note: "" }]);
  const [suggestions, setSuggestions] = useState<Record<number, Item[]>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/v1/employees?limit=500").then((r) => r.json()).then((res) => setEmployees(res.data || []));
  }, []);

  async function searchItem(idx: number, q: string) {
    if (q.length < 2) { setSuggestions((s) => ({ ...s, [idx]: [] })); return; }
    const res = await fetch(`/api/v1/stationery/items?q=${encodeURIComponent(q)}`).then((r) => r.json());
    setSuggestions((s) => ({ ...s, [idx]: res.data || [] }));
  }
  function updateRow(i: number, k: "name" | "unit" | "quantity" | "note", v: string) {
    const next = [...items];
    next[i] = { ...next[i], [k]: v };
    if (k === "name") { next[i].itemId = undefined; next[i].currentStock = undefined; searchItem(i, v); }
    setItems(next);
  }
  function selectSuggestion(i: number, it: Item) {
    const next = [...items];
    next[i] = { itemId: it.id, name: it.name, unit: it.unit, quantity: next[i].quantity, note: next[i].note, currentStock: it.currentStock };
    setItems(next);
    setSuggestions((s) => ({ ...s, [i]: [] }));
  }

  async function uploadFile(f: File) {
    setUploading(true);
    setError(null);
    const fd = new FormData();
    fd.append("file", f);
    fd.append("bucket", "hr-documents");
    fd.append("folder", "stationery-requests");
    try {
      const res = await fetch("/api/v1/upload", { method: "POST", body: fd });
      const d = await res.json();
      if (!res.ok) throw new Error(apiError(res.status, d.error));
      setFileUrl(d.data?.url || d.url || "");
    } catch (e: any) { setError(String(e.message || e)); } finally { setUploading(false); }
  }

  async function submit() {
    setError(null);
    if (!requesterId) { setError("Chưa chọn NV yêu cầu"); return; }
    if (!reason.trim()) { setError("Chưa nhập lý do"); return; }
    if (!fileUrl) { setError("Bắt buộc upload file Đề nghị VPP"); return; }
    const valid = items.filter((it) => it.itemId && Number(it.quantity) > 0);
    if (valid.length === 0) { setError("Chọn ít nhất 1 mặt hàng có sẵn trong kho"); return; }
    for (const it of valid) {
      if ((it.currentStock ?? 0) < Number(it.quantity)) {
        setError(`"${it.name}" chỉ còn ${it.currentStock} ${it.unit} (yêu cầu ${it.quantity})`);
        return;
      }
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/v1/stationery/requests", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requesterEmployeeId: requesterId, reason: reason.trim(), fileUrl,
          items: valid.map((it) => ({ itemId: it.itemId, quantity: Number(it.quantity), note: it.note || null })),
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(apiError(res.status, d.error));
      onSuccess();
    } catch (e: any) { setError(String(e.message || e)); } finally { setSubmitting(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.5)" }}>
      <div className="rounded-xl p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto" style={{ background: "var(--ibs-bg-card)" }}>
        <div className="flex justify-between mb-4">
          <h3 className="text-[16px] font-semibold">Tạo phiếu xuất VPP</h3>
          <button onClick={onClose}><X size={20} /></button>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="text-[12px] mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>NV yêu cầu *</label>
            <select value={requesterId} onChange={(e) => setRequesterId(e.target.value)} className="w-full px-3 py-2 rounded-lg border text-[13px]"
              style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)" }}>
              <option value="">-- Chọn NV --</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.fullName} ({e.code} — {e.department.name})</option>)}
            </select>
          </div>
          <div>
            <label className="text-[12px] mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>File Đề nghị VPP * (Word/PDF)</label>
            <input type="file" accept=".doc,.docx,.pdf,.jpg,.png" onChange={(e) => e.target.files?.[0] && uploadFile(e.target.files[0])}
              className="w-full text-[13px]" />
            {uploading && <div className="text-[11px] mt-1" style={{ color: "var(--ibs-text-dim)" }}>Đang upload...</div>}
            {fileUrl && <div className="text-[11px] mt-1" style={{ color: "var(--ibs-success)" }}>✓ Đã upload</div>}
          </div>
        </div>

        <div className="mb-4">
          <label className="text-[12px] mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Lý do đề xuất *</label>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} className="w-full px-3 py-2 rounded-lg border text-[13px]"
            style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)" }} placeholder="VD: Phục vụ in tài liệu họp tháng" />
        </div>

        <div className="mb-2 text-[12px] font-semibold">Danh sách VPP yêu cầu (gõ ≥2 ký tự để tìm trong kho):</div>
        <div className="space-y-2 mb-3">
          {items.map((it, i) => (
            <div key={i} className="relative grid gap-2" style={{ gridTemplateColumns: "3fr 1fr 1fr 2fr auto" }}>
              <div className="relative">
                <input value={it.name} onChange={(e) => updateRow(i, "name", e.target.value)}
                  placeholder="Tìm tên VPP trong kho..." className="w-full px-2 py-1.5 rounded border text-[13px]"
                  style={{ background: "var(--ibs-bg)", borderColor: it.itemId ? "var(--ibs-success)" : "var(--ibs-border)" }} />
                {suggestions[i]?.length > 0 && (
                  <div className="absolute top-full left-0 right-0 z-10 mt-1 rounded-lg border shadow-lg max-h-40 overflow-y-auto"
                    style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
                    {suggestions[i].map((s) => (
                      <button key={s.id} onClick={() => selectSuggestion(i, s)} className="block w-full text-left px-3 py-1.5 text-[12px] hover:bg-black/5">
                        {s.name} <span style={{ color: "var(--ibs-text-dim)" }}>({s.unit}, tồn {fmt(s.currentStock)})</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <input value={it.unit} readOnly placeholder="ĐVT" className="px-2 py-1.5 rounded border text-[13px]"
                style={{ background: "rgba(0,0,0,0.05)", borderColor: "var(--ibs-border)" }} />
              <input type="number" value={it.quantity} onChange={(e) => updateRow(i, "quantity", e.target.value)} placeholder="SL" className="px-2 py-1.5 rounded border text-[13px]"
                style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)" }} />
              <input value={it.note} onChange={(e) => updateRow(i, "note", e.target.value)} placeholder="Ghi chú" className="px-2 py-1.5 rounded border text-[13px]"
                style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)" }} />
              <button onClick={() => setItems(items.filter((_, j) => j !== i))} disabled={items.length === 1}
                className="px-2 text-[18px] opacity-60 hover:opacity-100 disabled:opacity-20">×</button>
            </div>
          ))}
        </div>
        <button onClick={() => setItems([...items, { name: "", unit: "", quantity: "", note: "" }])}
          className="text-[12px] mb-4" style={{ color: "var(--ibs-accent)" }}>+ Thêm dòng</button>

        {error && <div className="mb-3 p-2 rounded text-[13px]" style={{ background: "rgba(239,68,68,0.1)", color: "var(--ibs-danger)" }}>{error}</div>}

        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>Hủy</Button>
          <Button variant="accent" size="sm" loading={submitting} onClick={submit}>
            {submitting ? "Đang gửi..." : "Gửi phiếu xuất"}
          </Button>
        </div>
      </div>
    </div>
  );
}
