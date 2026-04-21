"use client";

import { useState, useEffect } from "react";
import { PageTitle } from "@/components/layout/page-title";
import { DataTable, Column } from "@/components/shared/data-table";
import { formatDate, formatDateTime } from "@/lib/utils";
import { Plus, RefreshCw, X, Check, XCircle, Car, Droplets, Wrench } from "lucide-react";
import Link from "next/link";
import { MonthCalendar } from "@/components/shared/month-calendar";
import { DateInput, TimeInput } from "@/components/shared/date-input";

// Vietnamese number formatting helpers
function fmtInt(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  return parseInt(digits, 10).toLocaleString("vi-VN");
}
function fmtFloat(raw: string): string {
  const clean = raw.replace(/[^\d,]/g, "");
  const [intPart = "", decPart] = clean.split(",");
  const formatted = intPart ? parseInt(intPart.replace(/\D/g, "") || "0", 10).toLocaleString("vi-VN") : "";
  return decPart !== undefined ? formatted + "," + decPart : formatted;
}
function parseVNInt(s: string): number { return parseInt(s.replace(/\./g, "").replace(/,/g, ""), 10) || 0; }
function parseVNFloat(s: string): number { return parseFloat(s.replace(/\./g, "").replace(",", ".")) || 0; }

type Vehicle = {
  id: string; licensePlate: string; model: string; type: string;
  seats: number; driverName?: string; status: string;
  nextMaintenanceDate?: string; currentMileage: number;
};
type FuelLog = {
  id: string; vehicleId: string; date: string; liters: number; cost: number; odometerKm: number; note: string | null; invoiceUrl?: string | null;
  vehicle?: { licensePlate: string; model: string };
};
type MaintenanceRecord = {
  id: string; vehicleId: string; type: string; description: string;
  cost: number; location?: string | null; odometerKm?: number | null;
  startDate: string; endDate: string | null; createdAt: string;
  vehicle?: { licensePlate: string; model: string };
};
type VehicleBooking = {
  id: string; vehicleId: string; startDate: string; endDate: string;
  startDatetime?: string; endDatetime?: string;
  destination: string; purpose: string; passengers: number; status: string;
  approvedAt?: string; actualKm?: number; returnTime?: string; notes?: string;
  vehicle: { licensePlate: string; model: string };
  requester: { code: string; fullName: string; department: { name: string } };
};

const VEHICLE_STATUS: Record<string, { label: string; color: string }> = {
  AVAILABLE: { label: "Sẵn sàng", color: "var(--ibs-success)" },
  IN_USE: { label: "Đang dùng", color: "var(--ibs-warning)" },
  MAINTENANCE: { label: "Bảo trì", color: "#6b7280" },
  OUT_OF_SERVICE: { label: "Hỏng/Ngừng SD", color: "var(--ibs-danger)" },
};
const BOOKING_STATUS: Record<string, { label: string; color: string }> = {
  PENDING: { label: "Chờ duyệt", color: "var(--ibs-warning)" },
  APPROVED: { label: "Đã duyệt", color: "var(--ibs-success)" },
  REJECTED: { label: "Từ chối", color: "var(--ibs-danger)" },
  CANCELLED: { label: "Đã hủy", color: "#6b7280" },
  COMPLETED: { label: "Hoàn thành", color: "#00B4D8" },
};
const VEHICLE_TYPE_LABELS: Record<string, string> = {
  CAR: "Ô tô con", VAN: "Van", TRUCK: "Xe tải", MOTORBIKE: "Xe máy",
  PICKUP_TRUCK: "Xe bán tải", CONTAINER: "Xe container", FORKLIFT: "Xe nâng",
};
const VEHICLE_PURPOSE_LABELS: Record<string, string> = {
  DELIVERY: "Giao hàng",
  CLIENT_PICKUP: "Đón khách",
  BUSINESS_TRIP: "Công tác",
  PROCUREMENT: "Mua vật tư",
  OTHER: "Khác",
};

export default function XePage() {
  const [tab, setTab] = useState<"bookings" | "fleet" | "fuel" | "maintenance" | "calendar">("bookings");
  const [bookings, setBookings] = useState<VehicleBooking[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [fuelLogs, setFuelLogs] = useState<FuelLog[]>([]);
  const [fuelMeta, setFuelMeta] = useState<{ totalLiters: number; totalCost: number } | null>(null);
  const [fuelVehicleId, setFuelVehicleId] = useState("");
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState("");
  const [showNewBooking, setShowNewBooking] = useState(false);
  const [showNewVehicle, setShowNewVehicle] = useState(false);
  const [showNewFuel, setShowNewFuel] = useState(false);
  const [viewInvoice, setViewInvoice] = useState<string | null>(null);
  const [maintenanceRecords, setMaintenanceRecords] = useState<MaintenanceRecord[]>([]);
  const [maintenanceMeta, setMaintenanceMeta] = useState<{ totalCost: number; count: number } | null>(null);
  const [maintenanceVehicleId, setMaintenanceVehicleId] = useState("");
  const [showNewMaintenance, setShowNewMaintenance] = useState(false);
  const [filterStatus, setFilterStatus] = useState("");
  const [completingBooking, setCompletingBooking] = useState<VehicleBooking | null>(null);
  const [vehicleHistoryModal, setVehicleHistoryModal] = useState<Vehicle | null>(null);

  function fetchBookings() {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterStatus) params.set("status", filterStatus);
    fetch(`/api/v1/vehicles/bookings?${params}`)
      .then((r) => r.json()).then((res) => setBookings(res.data || []))
      .finally(() => setLoading(false));
  }

  function fetchVehicles() {
    setLoading(true);
    fetch("/api/v1/vehicles")
      .then((r) => r.json()).then((res) => { setVehicles(res.data || []); })
      .finally(() => setLoading(false));
  }

  function fetchFuelLogs(vehicleId?: string) {
    const vid = vehicleId ?? fuelVehicleId;
    if (!vid) {
      fetch("/api/v1/fuel-logs")
        .then((r) => r.json()).then((res) => { setFuelLogs(res.data || []); setFuelMeta(null); });
    } else {
      fetch(`/api/v1/vehicles/${vid}/fuel`)
        .then((r) => r.json()).then((res) => { setFuelLogs(res.data || []); setFuelMeta(res.meta || null); });
    }
  }

  function fetchMaintenance(vehicleId?: string) {
    const vid = vehicleId ?? maintenanceVehicleId;
    if (!vid) {
      fetch("/api/v1/maintenance-records")
        .then((r) => r.json()).then((res) => { setMaintenanceRecords(res.data || []); setMaintenanceMeta(null); });
    } else {
      fetch(`/api/v1/vehicles/${vid}/maintenance`)
        .then((r) => r.json()).then((res) => { setMaintenanceRecords(res.data || []); setMaintenanceMeta(res.meta || null); });
    }
  }

  useEffect(() => {
    fetch("/api/v1/me").then((r) => r.json()).then((res) => setUserRole(res.role || ""));
    // Always fetch vehicles for fuel tab dropdown
    fetch("/api/v1/vehicles").then((r) => r.json()).then((res) => setVehicles(res.data || []));
  }, []);

  useEffect(() => {
    if (tab === "bookings") fetchBookings();
    else if (tab === "fleet") fetchVehicles();
  }, [tab, filterStatus]);

  useEffect(() => {
    fetchFuelLogs(fuelVehicleId);
  }, [fuelVehicleId]);

  useEffect(() => {
    fetchMaintenance(maintenanceVehicleId);
  }, [maintenanceVehicleId]);

  const canManage = userRole === "HR_ADMIN" || userRole === "BOM" || userRole === "MANAGER";

  async function handleBookingAction(id: string, action: "APPROVE" | "REJECT") {
    await fetch(`/api/v1/vehicles/bookings/${id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    fetchBookings();
  }

  const pendingCount = bookings.filter((b) => b.status === "PENDING").length;
  const approvedCount = bookings.filter((b) => b.status === "APPROVED").length;
  const availableVehicles = vehicles.filter((v) => v.status === "AVAILABLE").length;

  const bookingColumns: Column<VehicleBooking>[] = [
    { key: "requester", header: "Người đặt", render: (b) => <div><div className="font-semibold">{b.requester.fullName}</div><div className="text-[11px]" style={{ color: "var(--ibs-text-dim)" }}>{b.requester.department.name}</div></div> },
    { key: "vehicle", header: "Xe", render: (b) => <div><div className="font-mono font-semibold">{b.vehicle.licensePlate}</div><div className="text-[11px]" style={{ color: "var(--ibs-text-dim)" }}>{b.vehicle.model}</div></div> },
    { key: "startDate", header: "Từ", render: (b) => <span className="text-[12px]">{formatDateTime(b.startDate)}</span> },
    { key: "endDate", header: "Đến", render: (b) => <span className="text-[12px]">{formatDateTime(b.endDate)}</span> },
    { key: "destination", header: "Điểm đến", render: (b) => <div><div>{b.destination}</div><div className="text-[11px]" style={{ color: "var(--ibs-text-dim)" }}>{VEHICLE_PURPOSE_LABELS[b.purpose] ?? b.purpose}</div></div> },
    { key: "passengers", header: "Hành khách", render: (b) => <span className="text-[12px]">{b.passengers} người</span> },
    { key: "status", header: "Trạng thái", render: (b) => {
      const s = BOOKING_STATUS[b.status] || { label: b.status, color: "#6b7280" };
      return <span className="text-[11px] font-semibold px-2 py-0.5 rounded-lg" style={{ background: `${s.color}20`, color: s.color }}>{s.label}</span>;
    }},
    { key: "actions", header: "", render: (b) => canManage ? (
      <div className="flex gap-1 flex-wrap">
        {b.status === "PENDING" && (<>
          <button onClick={() => handleBookingAction(b.id, "APPROVE")} className="text-[11px] px-2 py-0.5 rounded flex items-center gap-1" style={{ background: "rgba(34,197,94,0.15)", color: "var(--ibs-success)" }}><Check size={11} /> Duyệt</button>
          <button onClick={() => handleBookingAction(b.id, "REJECT")} className="text-[11px] px-2 py-0.5 rounded flex items-center gap-1" style={{ background: "rgba(239,68,68,0.15)", color: "var(--ibs-danger)" }}><XCircle size={11} /></button>
        </>)}
        {b.status === "APPROVED" && (
          <button onClick={() => setCompletingBooking(b)} className="text-[11px] px-2 py-0.5 rounded flex items-center gap-1" style={{ background: "rgba(0,180,216,0.15)", color: "var(--ibs-accent)" }}>✓ Hoàn thành</button>
        )}
        {b.status === "COMPLETED" && b.actualKm != null && (
          <span className="text-[11px]" style={{ color: "var(--ibs-text-dim)" }}>{b.actualKm} km</span>
        )}
      </div>
    ) : null },
  ];

  return (
    <div>
      <div className="flex items-center gap-3 mb-1">
        <Link href="/hanh-chinh" className="text-[12px]" style={{ color: "var(--ibs-text-dim)" }}>← Hành chính</Link>
      </div>
      <PageTitle title="Quản lý xe" description="Đặt xe công tác và theo dõi đội xe" />

      {/* Summary */}
      <div className="grid grid-cols-2 gap-4 mb-6 md:grid-cols-4">
        {[
          { label: "Chờ duyệt", value: pendingCount, color: "var(--ibs-warning)" },
          { label: "Đã duyệt (tuần này)", value: approvedCount, color: "var(--ibs-success)" },
          { label: "Xe sẵn sàng", value: availableVehicles, color: "#00B4D8" },
          { label: "Tổng xe", value: vehicles.length || "—", color: "var(--ibs-text)" },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border p-4" style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
            <div className="text-[11px] font-semibold mb-1" style={{ color: "var(--ibs-text-dim)" }}>{s.label}</div>
            <div className="text-[28px] font-bold" style={{ color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 p-1 rounded-xl w-fit" style={{ background: "var(--ibs-bg-card)", border: "1px solid var(--ibs-border)" }}>
        {(["bookings", "calendar", "fleet", "fuel", "maintenance"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className="text-[13px] px-4 py-1.5 rounded-lg font-medium transition-colors"
            style={{ background: tab === t ? "var(--ibs-accent)" : "transparent", color: tab === t ? "#fff" : "var(--ibs-text-dim)" }}>
            {t === "bookings" ? "Đặt xe" : t === "calendar" ? "Lịch" : t === "fleet" ? "Đội xe" : t === "fuel" ? "Nhiên liệu" : "Bảo trì"}
          </button>
        ))}
      </div>

      {tab === "bookings" && (
        <div className="flex flex-col gap-4">
          {/* All bookings list */}
          <div className="rounded-xl border" style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
            <div className="flex items-center gap-3 px-5 py-4 border-b flex-wrap" style={{ borderColor: "var(--ibs-border)" }}>
              <div className="text-[14px] font-semibold">Tất cả lịch đặt xe</div>
              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
                className="rounded-lg px-3 py-1.5 text-[12px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }}>
                <option value="">Tất cả trạng thái</option>
                {Object.entries(BOOKING_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
              <button onClick={fetchBookings} className="p-2 rounded-lg" style={{ color: "var(--ibs-text-dim)" }}><RefreshCw size={15} /></button>
              <button onClick={() => setShowNewBooking(true)} className="flex items-center gap-1.5 text-[13px] px-3 py-2 rounded-lg font-semibold ml-auto" style={{ background: "var(--ibs-accent)", color: "#fff" }}>
                <Plus size={14} /> Đặt xe
              </button>
            </div>
            <DataTable columns={bookingColumns} data={bookings} loading={loading} emptyText="Chưa có lịch đặt xe" />
          </div>
        </div>
      )}

      {tab === "calendar" && (
        <MonthCalendar
          events={bookings.filter((b) => b.status === "APPROVED" || b.status === "COMPLETED").map((b) => ({
            date: b.startDate,
            label: `${b.vehicle.licensePlate} — ${b.requester.fullName} → ${b.destination}`,
            color: BOOKING_STATUS[b.status]?.color,
          }))}
          onDayClick={(dateStr, evs) => alert(`${dateStr}\n${evs.map((e) => e.label).join("\n")}`)}
        />
      )}

      {tab === "fleet" && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="text-[14px] font-semibold">Đội xe</div>
            {canManage && (
              <button onClick={() => setShowNewVehicle(true)} className="flex items-center gap-1.5 text-[13px] px-3 py-2 rounded-lg font-semibold" style={{ background: "var(--ibs-accent)", color: "#fff" }}>
                <Plus size={14} /> Thêm xe
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {vehicles.map((v) => {
              const st = VEHICLE_STATUS[v.status] || { label: v.status, color: "#6b7280" };
              return (
                <div key={v.id} onClick={() => setVehicleHistoryModal(v)} className="rounded-xl border p-4 cursor-pointer hover:border-[var(--ibs-accent)] transition-colors" style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Car size={16} style={{ color: "var(--ibs-accent)" }} />
                      <span className="font-mono font-bold text-[14px]">{v.licensePlate}</span>
                    </div>
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-lg" style={{ background: `${st.color}20`, color: st.color }}>{st.label}</span>
                  </div>
                  <div className="text-[13px] font-medium mb-1">{v.model}</div>
                  <div className="flex gap-4 text-[11px]" style={{ color: "var(--ibs-text-dim)" }}>
                    <span>{VEHICLE_TYPE_LABELS[v.type] || v.type}</span>
                    <span>{v.seats} chỗ</span>
                    <span>{v.currentMileage.toLocaleString("vi-VN")} km</span>
                  </div>
                  {v.driverName && <div className="text-[11px] mt-1" style={{ color: "var(--ibs-text-dim)" }}>Lái xe: <span style={{ color: "var(--ibs-text)" }}>{v.driverName}</span></div>}
                  {v.nextMaintenanceDate && <div className="text-[11px]" style={{ color: "var(--ibs-text-dim)" }}>Bảo dưỡng: <span style={{ color: "var(--ibs-warning)" }}>{formatDate(v.nextMaintenanceDate)}</span></div>}
                </div>
              );
            })}
            {vehicles.length === 0 && !loading && (
              <div className="col-span-3 rounded-xl border flex items-center justify-center py-16" style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
                <span className="text-[13px]" style={{ color: "var(--ibs-text-dim)" }}>Chưa có xe nào trong đội</span>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "fuel" && (
        <div className="rounded-xl border" style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
          <div className="flex items-center gap-3 px-5 py-4 border-b flex-wrap" style={{ borderColor: "var(--ibs-border)" }}>
            <div className="text-[14px] font-semibold flex items-center gap-2"><Droplets size={15} style={{ color: "var(--ibs-accent)" }} /> Nhật ký nhiên liệu</div>
            <select value={fuelVehicleId} onChange={(e) => setFuelVehicleId(e.target.value)}
              className="rounded-lg px-3 py-1.5 text-[12px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }}>
              <option value="">Tất cả xe</option>
              {vehicles.map((v) => <option key={v.id} value={v.id}>{v.licensePlate} — {v.model}</option>)}
            </select>
            <button onClick={() => fetchFuelLogs()} className="p-2 rounded-lg" style={{ color: "var(--ibs-text-dim)" }}><RefreshCw size={15} /></button>
            <button onClick={() => setShowNewFuel(true)} className="flex items-center gap-1.5 text-[13px] px-3 py-2 rounded-lg font-semibold ml-auto" style={{ background: "var(--ibs-accent)", color: "#fff" }}>
              <Plus size={14} /> Thêm
            </button>
          </div>
          {fuelMeta && fuelLogs.length > 0 && (
            <div className="grid grid-cols-2 gap-4 px-5 py-4 border-b" style={{ borderColor: "var(--ibs-border)" }}>
              <div><div className="text-[11px]" style={{ color: "var(--ibs-text-dim)" }}>Tổng lít</div><div className="text-[22px] font-bold" style={{ color: "var(--ibs-accent)" }}>{fuelMeta.totalLiters.toLocaleString("vi-VN", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} L</div></div>
              <div><div className="text-[11px]" style={{ color: "var(--ibs-text-dim)" }}>Tổng chi phí</div><div className="text-[22px] font-bold" style={{ color: "var(--ibs-warning)" }}>{fuelMeta.totalCost.toLocaleString("vi-VN")}đ</div></div>
            </div>
          )}
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b" style={{ borderColor: "var(--ibs-border)" }}>
                {!fuelVehicleId && <th className="text-left px-5 py-2.5 text-[11px] font-semibold" style={{ color: "var(--ibs-text-dim)" }}>Xe</th>}
                <th className="text-left px-5 py-2.5 text-[11px] font-semibold" style={{ color: "var(--ibs-text-dim)" }}>Ngày</th>
                <th className="text-left px-3 py-2.5 text-[11px] font-semibold" style={{ color: "var(--ibs-text-dim)" }}>Số lít</th>
                <th className="text-left px-3 py-2.5 text-[11px] font-semibold" style={{ color: "var(--ibs-text-dim)" }}>Chi phí (VND)</th>
                <th className="text-left px-3 py-2.5 text-[11px] font-semibold" style={{ color: "var(--ibs-text-dim)" }}>Odometer</th>
                <th className="text-left px-3 py-2.5 text-[11px] font-semibold" style={{ color: "var(--ibs-text-dim)" }}>Ghi chú</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {fuelLogs.map((f) => (
                <tr key={f.id} className="border-b last:border-0" style={{ borderColor: "var(--ibs-border)" }}>
                  {!fuelVehicleId && (
                    <td className="px-5 py-2.5">
                      <div className="font-mono font-semibold text-[12px]">{f.vehicle?.licensePlate}</div>
                      <div className="text-[11px]" style={{ color: "var(--ibs-text-dim)" }}>{f.vehicle?.model}</div>
                    </td>
                  )}
                  <td className="px-5 py-2.5">{formatDate(f.date)}</td>
                  <td className="px-3 py-2.5">{f.liters.toLocaleString("vi-VN", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} L</td>
                  <td className="px-3 py-2.5">{f.cost.toLocaleString("vi-VN")}đ</td>
                  <td className="px-3 py-2.5">{f.odometerKm.toLocaleString("vi-VN")} km</td>
                  <td className="px-3 py-2.5 text-[12px]" style={{ color: "var(--ibs-text-dim)" }}>{f.note || "—"}</td>
                  <td className="px-3 py-2.5">
                    {f.invoiceUrl ? (
                      <button onClick={() => setViewInvoice(f.invoiceUrl!)}
                        className="text-[11px] font-semibold px-2 py-1 rounded"
                        style={{ background: "rgba(0,180,216,0.12)", color: "var(--ibs-accent)" }}>
                        Xem
                      </button>
                    ) : <span className="text-[11px]" style={{ color: "var(--ibs-text-dim)" }}>—</span>}
                  </td>
                </tr>
              ))}
              {fuelLogs.length === 0 && (
                <tr><td colSpan={7} className="px-5 py-12 text-center text-[13px]" style={{ color: "var(--ibs-text-dim)" }}>Chưa có dữ liệu nhiên liệu</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === "maintenance" && (
        <div className="rounded-xl border" style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
          <div className="flex items-center gap-3 px-5 py-4 border-b flex-wrap" style={{ borderColor: "var(--ibs-border)" }}>
            <div className="text-[14px] font-semibold flex items-center gap-2">
              <Wrench size={15} style={{ color: "var(--ibs-warning)" }} /> Lịch sử bảo trì
            </div>
            <select value={maintenanceVehicleId} onChange={(e) => setMaintenanceVehicleId(e.target.value)}
              className="rounded-lg px-3 py-1.5 text-[12px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }}>
              <option value="">Tất cả xe</option>
              {vehicles.map((v) => <option key={v.id} value={v.id}>{v.licensePlate} — {v.model}</option>)}
            </select>
            <button onClick={() => fetchMaintenance()} className="p-2 rounded-lg" style={{ color: "var(--ibs-text-dim)" }}><RefreshCw size={15} /></button>
            <button onClick={() => setShowNewMaintenance(true)} className="flex items-center gap-1.5 text-[13px] px-3 py-2 rounded-lg font-semibold ml-auto" style={{ background: "var(--ibs-accent)", color: "#fff" }}>
              <Plus size={14} /> Thêm
            </button>
          </div>
          {maintenanceMeta && maintenanceRecords.length > 0 && (
            <div className="grid grid-cols-2 gap-4 px-5 py-4 border-b" style={{ borderColor: "var(--ibs-border)" }}>
              <div><div className="text-[11px]" style={{ color: "var(--ibs-text-dim)" }}>Tổng chi phí bảo trì</div><div className="text-[22px] font-bold" style={{ color: "var(--ibs-warning)" }}>{maintenanceMeta.totalCost.toLocaleString("vi-VN")}đ</div></div>
              <div><div className="text-[11px]" style={{ color: "var(--ibs-text-dim)" }}>Số lần bảo trì</div><div className="text-[22px] font-bold">{maintenanceMeta.count}</div></div>
            </div>
          )}
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b" style={{ borderColor: "var(--ibs-border)" }}>
                {!maintenanceVehicleId && <th className="text-left px-5 py-2.5 text-[11px] font-semibold" style={{ color: "var(--ibs-text-dim)" }}>Xe</th>}
                <th className="text-left px-5 py-2.5 text-[11px] font-semibold" style={{ color: "var(--ibs-text-dim)" }}>Loại</th>
                <th className="text-left px-3 py-2.5 text-[11px] font-semibold" style={{ color: "var(--ibs-text-dim)" }}>Mô tả</th>
                <th className="text-left px-3 py-2.5 text-[11px] font-semibold" style={{ color: "var(--ibs-text-dim)" }}>Chi phí (VND)</th>
                <th className="text-left px-3 py-2.5 text-[11px] font-semibold" style={{ color: "var(--ibs-text-dim)" }}>Nơi BT</th>
                <th className="text-left px-3 py-2.5 text-[11px] font-semibold" style={{ color: "var(--ibs-text-dim)" }}>Odometer</th>
                <th className="text-left px-3 py-2.5 text-[11px] font-semibold" style={{ color: "var(--ibs-text-dim)" }}>Bắt đầu</th>
                <th className="text-left px-3 py-2.5 text-[11px] font-semibold" style={{ color: "var(--ibs-text-dim)" }}>Kết thúc</th>
              </tr>
            </thead>
            <tbody>
              {maintenanceRecords.map((r) => (
                <tr key={r.id} className="border-b last:border-0" style={{ borderColor: "var(--ibs-border)" }}>
                  {!maintenanceVehicleId && (
                    <td className="px-5 py-2.5">
                      <div className="font-mono font-semibold text-[12px]">{r.vehicle?.licensePlate}</div>
                      <div className="text-[11px]" style={{ color: "var(--ibs-text-dim)" }}>{r.vehicle?.model}</div>
                    </td>
                  )}
                  <td className="px-5 py-2.5 font-medium">{r.type}</td>
                  <td className="px-3 py-2.5 text-[12px]" style={{ color: "var(--ibs-text-dim)" }}>{r.description}</td>
                  <td className="px-3 py-2.5">{r.cost.toLocaleString("vi-VN")}đ</td>
                  <td className="px-3 py-2.5 text-[12px]">{r.location || "—"}</td>
                  <td className="px-3 py-2.5 text-[12px]">{r.odometerKm != null ? r.odometerKm.toLocaleString("vi-VN") + " km" : "—"}</td>
                  <td className="px-3 py-2.5">{formatDate(r.startDate)}</td>
                  <td className="px-3 py-2.5">{r.endDate ? formatDate(r.endDate) : <span style={{ color: "var(--ibs-warning)" }}>Đang BT</span>}</td>
                </tr>
              ))}
              {maintenanceRecords.length === 0 && (
                <tr><td colSpan={8} className="px-5 py-12 text-center text-[13px]" style={{ color: "var(--ibs-text-dim)" }}>Chưa có dữ liệu bảo trì</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showNewBooking && (
        <NewBookingModal vehicles={vehicles.filter((v) => v.status === "AVAILABLE")}
          onClose={() => setShowNewBooking(false)}
          onSuccess={() => { setShowNewBooking(false); fetchBookings(); }} />
      )}
      {showNewVehicle && (
        <NewVehicleModal onClose={() => setShowNewVehicle(false)}
          onSuccess={() => { setShowNewVehicle(false); fetchVehicles(); }} />
      )}
      {completingBooking && (
        <CompleteBookingModal
          booking={completingBooking}
          onClose={() => setCompletingBooking(null)}
          onSuccess={() => { setCompletingBooking(null); fetchBookings(); }}
        />
      )}
      {showNewFuel && (
        <NewFuelModal
          vehicles={vehicles}
          defaultVehicleId={fuelVehicleId}
          onClose={() => setShowNewFuel(false)}
          onSuccess={() => { setShowNewFuel(false); fetchFuelLogs(); }}
        />
      )}
      {showNewMaintenance && (
        <NewMaintenanceModal vehicles={vehicles} defaultVehicleId={maintenanceVehicleId}
          onClose={() => setShowNewMaintenance(false)}
          onSuccess={() => { setShowNewMaintenance(false); fetchMaintenance(); }} />
      )}
      {vehicleHistoryModal && (
        <VehicleHistoryModal vehicle={vehicleHistoryModal} onClose={() => setVehicleHistoryModal(null)} />
      )}
      {viewInvoice && (
        <InvoiceViewerModal url={viewInvoice} onClose={() => setViewInvoice(null)} />
      )}
    </div>
  );
}

function InvoiceViewerModal({ url, onClose }: { url: string; onClose: () => void }) {
  const isPdf = url.toLowerCase().includes(".pdf");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80" onClick={onClose}>
      <div className="relative max-w-3xl w-full mx-4 max-h-[90vh] flex flex-col rounded-2xl overflow-hidden"
        style={{ background: "var(--ibs-bg-card)", border: "1px solid var(--ibs-border)" }}
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b flex-shrink-0" style={{ borderColor: "var(--ibs-border)" }}>
          <div className="text-[14px] font-semibold">Hóa đơn nhiên liệu</div>
          <div className="flex items-center gap-3">
            <a href={url} target="_blank" rel="noreferrer"
              className="text-[12px] px-3 py-1 rounded-lg"
              style={{ background: "rgba(0,180,216,0.12)", color: "var(--ibs-accent)" }}>
              Mở tab mới
            </a>
            <button onClick={onClose} style={{ color: "var(--ibs-text-dim)" }}><X size={18} /></button>
          </div>
        </div>
        <div className="overflow-auto flex-1 flex items-center justify-center p-4" style={{ background: "#111" }}>
          {isPdf ? (
            <iframe src={url} className="w-full" style={{ height: "70vh", border: "none" }} />
          ) : (
            <img src={url} alt="Hóa đơn" className="max-w-full max-h-[70vh] object-contain rounded-lg" />
          )}
        </div>
      </div>
    </div>
  );
}

function NewFuelModal({ vehicles, defaultVehicleId, onClose, onSuccess }: {
  vehicles: Vehicle[];
  defaultVehicleId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({ vehicleId: defaultVehicleId, date: today, liters: "", cost: "", odometerKm: "", note: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [invoicePreview, setInvoicePreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setInvoiceFile(file);
    if (file.type.startsWith("image/")) {
      const url = URL.createObjectURL(file);
      setInvoicePreview(url);
    } else {
      setInvoicePreview(null);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.vehicleId) { setError("Vui lòng chọn xe"); return; }
    setSaving(true);
    let invoiceUrl: string | null = null;
    if (invoiceFile) {
      setUploading(true);
      const fd = new FormData();
      fd.append("file", invoiceFile);
      fd.append("folder", "fuel-invoices");
      const up = await fetch("/api/v1/upload", { method: "POST", body: fd });
      setUploading(false);
      if (up.ok) { const d = await up.json(); invoiceUrl = d.data?.url ?? null; }
    }
    const res = await fetch(`/api/v1/vehicles/${form.vehicleId}/fuel`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: form.date, liters: parseVNFloat(form.liters),
        cost: parseVNInt(form.cost), odometerKm: parseVNInt(form.odometerKm),
        note: form.note || null, invoiceUrl,
      }),
    });
    setSaving(false);
    if (res.ok) { onSuccess(); } else { const d = await res.json(); setError(d.error?.message || "Có lỗi xảy ra"); }
  }

  const ic = "w-full rounded-lg px-3 py-2 text-[13px] border";
  const is = { background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" };
  const lc = "text-[12px] font-medium mb-1 block";
  const ls = { color: "var(--ibs-text-dim)" };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="rounded-2xl w-full max-w-md mx-4 p-6 max-h-[90vh] overflow-y-auto" style={{ background: "var(--ibs-bg-card)", border: "1px solid var(--ibs-border)" }}>
        <div className="flex items-center justify-between mb-5">
          <div className="text-[16px] font-bold flex items-center gap-2"><Droplets size={16} style={{ color: "var(--ibs-accent)" }} /> Nhập nhiên liệu</div>
          <button onClick={onClose} style={{ color: "var(--ibs-text-dim)" }}><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div>
            <label className={lc} style={ls}>Xe *</label>
            <select required value={form.vehicleId} onChange={(e) => setForm({ ...form, vehicleId: e.target.value })} className={ic} style={is}>
              <option value="">Chọn xe...</option>
              {vehicles.map((v) => <option key={v.id} value={v.id}>{v.licensePlate} — {v.model}</option>)}
            </select>
          </div>
          <div>
            <label className={lc} style={ls}>Ngày *</label>
            <DateInput required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className={ic} style={is} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lc} style={ls}>Số lít *</label>
              <input required inputMode="decimal" placeholder="0,0" value={form.liters}
                onChange={(e) => setForm({ ...form, liters: fmtFloat(e.target.value) })}
                className={ic} style={is} />
            </div>
            <div>
              <label className={lc} style={ls}>Chi phí (VND) *</label>
              <input required inputMode="numeric" placeholder="0" value={form.cost}
                onChange={(e) => setForm({ ...form, cost: fmtInt(e.target.value) })}
                className={ic} style={is} />
            </div>
          </div>
          <div>
            <label className={lc} style={ls}>Odometer (km) *</label>
            <input required inputMode="numeric" placeholder="0" value={form.odometerKm}
              onChange={(e) => setForm({ ...form, odometerKm: fmtInt(e.target.value) })}
              className={ic} style={is} />
          </div>
          <div>
            <label className={lc} style={ls}>Ghi chú</label>
            <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className={ic} style={is} />
          </div>

          {/* Invoice upload */}
          <div className="rounded-xl border-2 border-dashed p-4" style={{ borderColor: "var(--ibs-border)" }}>
            <label className={lc} style={ls}>Import hóa đơn</label>
            <input type="file" accept="image/*,.pdf" onChange={handleFileChange}
              className="w-full text-[12px]" style={{ color: "var(--ibs-text-dim)" }} />
            {invoicePreview && (
              <div className="mt-3 rounded-lg overflow-hidden border" style={{ borderColor: "var(--ibs-border)" }}>
                <img src={invoicePreview} alt="Hóa đơn" className="w-full max-h-48 object-contain" style={{ background: "#fff" }} />
              </div>
            )}
            {invoiceFile && !invoicePreview && (
              <div className="mt-2 text-[12px] flex items-center gap-1" style={{ color: "var(--ibs-success)" }}>
                ✓ {invoiceFile.name}
              </div>
            )}
          </div>

          {error && <div className="text-[12px] text-red-500">{error}</div>}
          <div className="flex gap-2 justify-end mt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-[13px] border" style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-dim)" }}>Hủy</button>
            <button type="submit" disabled={saving || uploading} className="px-4 py-2 rounded-lg text-[13px] font-semibold" style={{ background: "var(--ibs-accent)", color: "#fff", opacity: saving || uploading ? 0.7 : 1 }}>
              {uploading ? "Đang upload..." : saving ? "Đang lưu..." : "Lưu"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CompleteBookingModal({ booking, onClose, onSuccess }: {
  booking: VehicleBooking;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [actualKm, setActualKm] = useState("");
  const [returnTime, setReturnTime] = useState(new Date().toTimeString().slice(0, 5));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch(`/api/v1/vehicles/bookings/${booking.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "COMPLETE",
        actualKm: actualKm ? Number(actualKm) : undefined,
        returnTime: returnTime || undefined,
      }),
    });
    setSaving(false);
    if (res.ok) {
      onSuccess();
    } else {
      const data = await res.json();
      setError(data.error?.message || "Có lỗi xảy ra");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="rounded-2xl w-full max-w-sm mx-4 p-6" style={{ background: "var(--ibs-bg-card)", border: "1px solid var(--ibs-border)" }}>
        <div className="flex items-center justify-between mb-5">
          <div className="text-[16px] font-bold">Hoàn thành chuyến xe</div>
          <button onClick={onClose} style={{ color: "var(--ibs-text-dim)" }}><X size={18} /></button>
        </div>
        <div className="mb-4 text-[13px]" style={{ color: "var(--ibs-text-dim)" }}>
          {booking.vehicle.licensePlate} — {booking.destination}
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>
              Số km thực tế
            </label>
            <input
              type="number" min={0} value={actualKm}
              onChange={(e) => setActualKm(e.target.value)}
              placeholder="VD: 45"
              className="w-full rounded-lg px-3 py-2 text-[13px] border"
              style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }}
            />
          </div>
          <div>
            <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>
              Giờ về thực tế
            </label>
            <TimeInput
              value={returnTime}
              onChange={(e) => setReturnTime(e.target.value)}
              className="w-full rounded-lg px-3 py-2 text-[13px] border"
              style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }}
            />
          </div>
          {error && <div className="text-[12px] text-red-500">{error}</div>}
          <div className="flex gap-2 justify-end mt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-[13px] border"
              style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-dim)" }}>Hủy</button>
            <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg text-[13px] font-semibold"
              style={{ background: "var(--ibs-accent)", color: "#fff", opacity: saving ? 0.7 : 1 }}>
              {saving ? "Đang lưu..." : "Xác nhận hoàn thành"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function NewBookingModal({ vehicles, onClose, onSuccess }: { vehicles: Vehicle[]; onClose: () => void; onSuccess: () => void }) {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const nowTime = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const plusHour = `${pad((now.getHours() + 1) % 24)}:${pad(now.getMinutes())}`;

  const [form, setForm] = useState({
    vehicleId: "", destination: "", purpose: "", passengers: "1",
    startDatePart: todayStr, startTimePart: nowTime,
    endDatePart: todayStr, endTimePart: plusHour,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setSaving(true);
    const startDate = `${form.startDatePart}T${form.startTimePart}`;
    const endDate = `${form.endDatePart}T${form.endTimePart}`;
    const res = await fetch("/api/v1/vehicles/bookings", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vehicleId: form.vehicleId, destination: form.destination, purpose: form.purpose, passengers: parseInt(form.passengers), startDate, endDate }),
    });
    setSaving(false);
    if (res.ok) { onSuccess(); } else { const d = await res.json(); setError(d.error?.message || "Có lỗi xảy ra"); }
  }

  const inputCls = "w-full rounded-lg px-3 py-2 text-[13px] border";
  const inputStyle = { background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" };
  const labelCls = "text-[12px] font-medium mb-1 block";
  const labelStyle = { color: "var(--ibs-text-dim)" };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="rounded-2xl w-full max-w-lg mx-4 p-6 max-h-[90vh] overflow-y-auto" style={{ background: "var(--ibs-bg-card)", border: "1px solid var(--ibs-border)" }}>
        <div className="flex items-center justify-between mb-5"><div className="text-[16px] font-bold">Đặt xe công tác</div><button onClick={onClose}><X size={18} /></button></div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div>
            <label className={labelCls} style={labelStyle}>Xe *</label>
            <select required value={form.vehicleId} onChange={(e) => setForm({ ...form, vehicleId: e.target.value })}
              className={inputCls} style={inputStyle}>
              <option value="">Chọn xe...</option>
              {vehicles.map((v) => <option key={v.id} value={v.id}>{v.licensePlate} — {v.model} ({v.seats} chỗ)</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls} style={labelStyle}>Ngày đi *</label>
              <DateInput required value={form.startDatePart} onChange={(e) => setForm({ ...form, startDatePart: e.target.value })}
                className={inputCls} style={inputStyle} />
            </div>
            <div>
              <label className={labelCls} style={labelStyle}>Giờ đi *</label>
              <TimeInput required value={form.startTimePart} onChange={(e) => setForm({ ...form, startTimePart: e.target.value })}
                className={inputCls} style={inputStyle} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls} style={labelStyle}>Ngày về *</label>
              <DateInput required value={form.endDatePart} onChange={(e) => setForm({ ...form, endDatePart: e.target.value })}
                className={inputCls} style={inputStyle} />
            </div>
            <div>
              <label className={labelCls} style={labelStyle}>Giờ về *</label>
              <TimeInput required value={form.endTimePart} onChange={(e) => setForm({ ...form, endTimePart: e.target.value })}
                className={inputCls} style={inputStyle} />
            </div>
          </div>
          <div>
            <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Điểm đến *</label>
            <input required value={form.destination} onChange={(e) => setForm({ ...form, destination: e.target.value })}
              className="w-full rounded-lg px-3 py-2 text-[13px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Mục đích *</label>
              <select required value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })}
                className="w-full rounded-lg px-3 py-2 text-[13px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }}>
                <option value="">-- Chọn --</option>
                {Object.entries(VEHICLE_PURPOSE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Số hành khách</label>
              <input type="number" min="1" value={form.passengers} onChange={(e) => setForm({ ...form, passengers: e.target.value })}
                className="w-full rounded-lg px-3 py-2 text-[13px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }} />
            </div>
          </div>
          {error && <div className="text-[12px] text-red-500">{error}</div>}
          <div className="flex gap-2 justify-end mt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-[13px] border" style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-dim)" }}>Hủy</button>
            <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg text-[13px] font-semibold" style={{ background: "var(--ibs-accent)", color: "#fff" }}>{saving ? "Đang lưu..." : "Đặt xe"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function NewVehicleModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState({ licensePlate: "", model: "", type: "CAR", seats: "5" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setSaving(true);
    const res = await fetch("/api/v1/vehicles", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, seats: parseInt(form.seats) }),
    });
    setSaving(false);
    if (res.ok) { onSuccess(); } else { const d = await res.json(); setError(d.error?.message || "Có lỗi xảy ra"); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="rounded-2xl w-full max-w-md mx-4 p-6" style={{ background: "var(--ibs-bg-card)", border: "1px solid var(--ibs-border)" }}>
        <div className="flex items-center justify-between mb-5"><div className="text-[16px] font-bold">Thêm xe</div><button onClick={onClose}><X size={18} /></button></div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Biển số *</label>
              <input required value={form.licensePlate} onChange={(e) => setForm({ ...form, licensePlate: e.target.value })}
                className="w-full rounded-lg px-3 py-2 text-[13px] border font-mono" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }} />
            </div>
            <div>
              <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Model *</label>
              <input required value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })}
                className="w-full rounded-lg px-3 py-2 text-[13px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Loại xe</label>
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}
                className="w-full rounded-lg px-3 py-2 text-[13px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }}>
                {Object.entries(VEHICLE_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Số chỗ</label>
              <input type="number" min="1" value={form.seats} onChange={(e) => setForm({ ...form, seats: e.target.value })}
                className="w-full rounded-lg px-3 py-2 text-[13px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }} />
            </div>
          </div>
          {error && <div className="text-[12px] text-red-500">{error}</div>}
          <div className="flex gap-2 justify-end mt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-[13px] border" style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-dim)" }}>Hủy</button>
            <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg text-[13px] font-semibold" style={{ background: "var(--ibs-accent)", color: "#fff" }}>{saving ? "Đang lưu..." : "Thêm xe"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Vehicle History Modal ──────────────────────────────────────────────────
function VehicleHistoryModal({ vehicle, onClose }: { vehicle: Vehicle; onClose: () => void }) {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [statusFilter, setStatusFilter] = useState("");
  const [bookings, setBookings] = useState<VehicleBooking[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/v1/vehicles/bookings?vehicleId=${vehicle.id}`)
      .then((r) => r.json())
      .then((res) => setBookings(res.data || []))
      .finally(() => setLoading(false));
  }, [vehicle.id]);

  const filtered = bookings.filter((b) => {
    const d = new Date(b.startDate);
    const matchMonth = d.getMonth() + 1 === month && d.getFullYear() === year;
    const matchStatus = !statusFilter || b.status === statusFilter;
    return matchMonth && matchStatus;
  });

  const months = Array.from({ length: 12 }, (_, i) => i + 1);
  const years = [year - 1, year, year + 1];
  const st = VEHICLE_STATUS[vehicle.status] || { label: vehicle.status, color: "#6b7280" };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="rounded-2xl w-full max-w-3xl mx-4 flex flex-col max-h-[90vh]" style={{ background: "var(--ibs-bg-card)", border: "1px solid var(--ibs-border)" }}>
        <div className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0" style={{ borderColor: "var(--ibs-border)" }}>
          <div className="flex items-center gap-3">
            <Car size={18} style={{ color: "var(--ibs-accent)" }} />
            <div>
              <div className="font-bold text-[15px] font-mono">{vehicle.licensePlate}</div>
              <div className="text-[12px]" style={{ color: "var(--ibs-text-dim)" }}>{vehicle.model} · {VEHICLE_TYPE_LABELS[vehicle.type] || vehicle.type}</div>
            </div>
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-lg ml-2" style={{ background: `${st.color}20`, color: st.color }}>{st.label}</span>
          </div>
          <button onClick={onClose} style={{ color: "var(--ibs-text-dim)" }}><X size={18} /></button>
        </div>

        <div className="flex items-center gap-3 px-6 py-3 border-b flex-shrink-0 flex-wrap" style={{ borderColor: "var(--ibs-border)" }}>
          <span className="text-[12px] font-medium" style={{ color: "var(--ibs-text-dim)" }}>Tháng:</span>
          <select value={month} onChange={(e) => setMonth(Number(e.target.value))}
            className="rounded-lg px-2 py-1.5 text-[12px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }}>
            {months.map((m) => <option key={m} value={m}>Tháng {m}</option>)}
          </select>
          <select value={year} onChange={(e) => setYear(Number(e.target.value))}
            className="rounded-lg px-2 py-1.5 text-[12px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }}>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg px-2 py-1.5 text-[12px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }}>
            <option value="">Tất cả trạng thái</option>
            {Object.entries(BOOKING_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <span className="ml-auto text-[12px]" style={{ color: "var(--ibs-text-dim)" }}>{filtered.length} chuyến</span>
        </div>

        <div className="overflow-y-auto flex-1">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-[13px]" style={{ color: "var(--ibs-text-dim)" }}>Đang tải...</div>
          ) : filtered.length === 0 ? (
            <div className="flex items-center justify-center py-16 text-[13px]" style={{ color: "var(--ibs-text-dim)" }}>Không có lịch đặt trong tháng {month}/{year}</div>
          ) : (
            <table className="w-full text-[13px]">
              <thead className="sticky top-0" style={{ background: "var(--ibs-bg-card)" }}>
                <tr className="border-b" style={{ borderColor: "var(--ibs-border)" }}>
                  <th className="text-left px-6 py-2.5 text-[11px] font-semibold" style={{ color: "var(--ibs-text-dim)" }}>Người đặt</th>
                  <th className="text-left px-3 py-2.5 text-[11px] font-semibold" style={{ color: "var(--ibs-text-dim)" }}>Từ</th>
                  <th className="text-left px-3 py-2.5 text-[11px] font-semibold" style={{ color: "var(--ibs-text-dim)" }}>Đến</th>
                  <th className="text-left px-3 py-2.5 text-[11px] font-semibold" style={{ color: "var(--ibs-text-dim)" }}>Điểm đến</th>
                  <th className="text-left px-3 py-2.5 text-[11px] font-semibold" style={{ color: "var(--ibs-text-dim)" }}>Mục đích</th>
                  <th className="text-left px-3 py-2.5 text-[11px] font-semibold" style={{ color: "var(--ibs-text-dim)" }}>Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((b) => {
                  const bs = BOOKING_STATUS[b.status] || { label: b.status, color: "#6b7280" };
                  return (
                    <tr key={b.id} className="border-b last:border-0" style={{ borderColor: "var(--ibs-border)" }}>
                      <td className="px-6 py-3">
                        <div className="font-semibold">{b.requester.fullName}</div>
                        <div className="text-[11px]" style={{ color: "var(--ibs-text-dim)" }}>{b.requester.department.name}</div>
                      </td>
                      <td className="px-3 py-3 text-[12px]">{formatDateTime(b.startDate)}</td>
                      <td className="px-3 py-3 text-[12px]">{formatDateTime(b.endDate)}</td>
                      <td className="px-3 py-3">{b.destination}</td>
                      <td className="px-3 py-3 text-[12px]" style={{ color: "var(--ibs-text-dim)" }}>{VEHICLE_PURPOSE_LABELS[b.purpose] ?? b.purpose}</td>
                      <td className="px-3 py-3">
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-lg" style={{ background: `${bs.color}20`, color: bs.color }}>{bs.label}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

function NewMaintenanceModal({ vehicles, defaultVehicleId, onClose, onSuccess }: {
  vehicles: Vehicle[];
  defaultVehicleId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({ vehicleId: defaultVehicleId, type: "", description: "", cost: "", location: "", odometerKm: "", startDate: today, endDate: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.vehicleId) { setError("Vui lòng chọn xe"); return; }
    setSaving(true);
    const res = await fetch(`/api/v1/vehicles/${form.vehicleId}/maintenance`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: form.type,
        description: form.description,
        cost: parseVNInt(form.cost),
        location: form.location || null,
        odometerKm: form.odometerKm ? parseVNInt(form.odometerKm) : null,
        startDate: form.startDate,
        endDate: form.endDate || null,
      }),
    });
    setSaving(false);
    if (res.ok) { onSuccess(); } else { const d = await res.json(); setError(d.error?.message || "Có lỗi xảy ra"); }
  }

  const ic = "w-full rounded-lg px-3 py-2 text-[13px] border";
  const is = { background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" };
  const lc = "text-[12px] font-medium mb-1 block";
  const ls = { color: "var(--ibs-text-dim)" };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="rounded-2xl w-full max-w-md mx-4 p-6 max-h-[90vh] overflow-y-auto" style={{ background: "var(--ibs-bg-card)", border: "1px solid var(--ibs-border)" }}>
        <div className="flex items-center justify-between mb-5">
          <div className="text-[16px] font-bold flex items-center gap-2"><Wrench size={16} style={{ color: "var(--ibs-warning)" }} /> Thêm bảo trì</div>
          <button onClick={onClose} style={{ color: "var(--ibs-text-dim)" }}><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div>
            <label className={lc} style={ls}>Xe *</label>
            <select required value={form.vehicleId} onChange={(e) => setForm({ ...form, vehicleId: e.target.value })} className={ic} style={is}>
              <option value="">Chọn xe...</option>
              {vehicles.map((v) => <option key={v.id} value={v.id}>{v.licensePlate} — {v.model}</option>)}
            </select>
          </div>
          <div>
            <label className={lc} style={ls}>Loại bảo trì *</label>
            <input required value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}
              placeholder="Thay dầu, Thay lốp, Sửa chữa lớn..." className={ic} style={is} />
          </div>
          <div>
            <label className={lc} style={ls}>Mô tả *</label>
            <textarea required value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={2} className={ic} style={is} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lc} style={ls}>Chi phí (VND) *</label>
              <input required inputMode="numeric" placeholder="0" value={form.cost}
                onChange={(e) => setForm({ ...form, cost: fmtInt(e.target.value) })} className={ic} style={is} />
            </div>
            <div>
              <label className={lc} style={ls}>Odometer bảo trì (km)</label>
              <input inputMode="numeric" placeholder="0" value={form.odometerKm}
                onChange={(e) => setForm({ ...form, odometerKm: fmtInt(e.target.value) })} className={ic} style={is} />
            </div>
          </div>
          <div>
            <label className={lc} style={ls}>Nơi bảo trì</label>
            <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })}
              placeholder="Tên garage, địa chỉ..." className={ic} style={is} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lc} style={ls}>Ngày bắt đầu *</label>
              <DateInput required value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} className={ic} style={is} />
            </div>
            <div>
              <label className={lc} style={ls}>Ngày kết thúc</label>
              <DateInput value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} className={ic} style={is} />
            </div>
          </div>
          {error && <div className="text-[12px] text-red-500">{error}</div>}
          <div className="flex gap-2 justify-end mt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-[13px] border" style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-dim)" }}>Hủy</button>
            <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg text-[13px] font-semibold" style={{ background: "var(--ibs-accent)", color: "#fff", opacity: saving ? 0.7 : 1 }}>
              {saving ? "Đang lưu..." : "Lưu"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
