"use client";

import { useState, useEffect } from "react";
import { PageTitle } from "@/components/layout/page-title";
import { DataTable, Column } from "@/components/shared/data-table";
import { formatDate, formatDateTime } from "@/lib/utils";
import { Plus, RefreshCw, X, Check, XCircle, Car, Droplets, Wrench } from "lucide-react";
import Link from "next/link";

type Vehicle = {
  id: string; licensePlate: string; model: string; type: string;
  seats: number; driverName?: string; status: string;
  nextMaintenanceDate?: string; currentMileage: number;
};
type FuelLog = {
  id: string; vehicleId: string; date: string; liters: number; cost: number; odometerKm: number; note: string | null;
};
type MaintenanceRecord = {
  id: string; vehicleId: string; type: string; description: string;
  cost: number; startDate: string; endDate: string | null; createdAt: string;
};
type VehicleBooking = {
  id: string; vehicleId: string; startDatetime: string; endDatetime: string;
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
  CAR: "Ô tô", VAN: "Van", TRUCK: "Xe tải", MOTORBIKE: "Xe máy",
};
const VEHICLE_PURPOSE_LABELS: Record<string, string> = {
  DELIVERY: "Giao hàng",
  CLIENT_PICKUP: "Đón khách",
  BUSINESS_TRIP: "Công tác",
  PROCUREMENT: "Mua vật tư",
  OTHER: "Khác",
};

export default function XePage() {
  const [tab, setTab] = useState<"bookings" | "fleet" | "fuel" | "maintenance">("bookings");
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
  const [maintenanceRecords, setMaintenanceRecords] = useState<MaintenanceRecord[]>([]);
  const [maintenanceMeta, setMaintenanceMeta] = useState<{ totalCost: number; count: number } | null>(null);
  const [maintenanceVehicleId, setMaintenanceVehicleId] = useState("");
  const [showNewMaintenance, setShowNewMaintenance] = useState(false);
  const [filterStatus, setFilterStatus] = useState("");
  const [completingBooking, setCompletingBooking] = useState<VehicleBooking | null>(null);

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
    if (!vid) return;
    fetch(`/api/v1/vehicles/${vid}/fuel`)
      .then((r) => r.json()).then((res) => { setFuelLogs(res.data || []); setFuelMeta(res.meta || null); });
  }

  function fetchMaintenance(vehicleId?: string) {
    const vid = vehicleId ?? maintenanceVehicleId;
    if (!vid) return;
    fetch(`/api/v1/vehicles/${vid}/maintenance`)
      .then((r) => r.json()).then((res) => { setMaintenanceRecords(res.data || []); setMaintenanceMeta(res.meta || null); });
  }

  useEffect(() => {
    fetch("/api/v1/me").then((r) => r.json()).then((res) => setUserRole(res.data?.role || ""));
    // Always fetch vehicles for fuel tab dropdown
    fetch("/api/v1/vehicles").then((r) => r.json()).then((res) => setVehicles(res.data || []));
  }, []);

  useEffect(() => {
    if (tab === "bookings") fetchBookings();
    else if (tab === "fleet") fetchVehicles();
  }, [tab, filterStatus]);

  useEffect(() => {
    if (fuelVehicleId) fetchFuelLogs(fuelVehicleId);
  }, [fuelVehicleId]);

  useEffect(() => {
    if (maintenanceVehicleId) fetchMaintenance(maintenanceVehicleId);
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
    { key: "startDatetime", header: "Từ", render: (b) => <span className="text-[12px]">{formatDateTime(b.startDatetime)}</span> },
    { key: "endDatetime", header: "Đến", render: (b) => <span className="text-[12px]">{formatDateTime(b.endDatetime)}</span> },
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
        {(["bookings", "fleet", "fuel", "maintenance"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className="text-[13px] px-4 py-1.5 rounded-lg font-medium transition-colors"
            style={{ background: tab === t ? "var(--ibs-accent)" : "transparent", color: tab === t ? "#fff" : "var(--ibs-text-dim)" }}>
            {t === "bookings" ? "Đặt xe" : t === "fleet" ? "Đội xe" : t === "fuel" ? "Nhiên liệu" : "Bảo trì"}
          </button>
        ))}
      </div>

      {tab === "bookings" && (
        <div className="rounded-xl border" style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
          <div className="flex items-center gap-3 px-5 py-4 border-b flex-wrap" style={{ borderColor: "var(--ibs-border)" }}>
            <div className="text-[14px] font-semibold">Lịch đặt xe</div>
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
                <div key={v.id} className="rounded-xl border p-4" style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
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
                    <span>{v.currentMileage.toLocaleString()} km</span>
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
              <option value="">Chọn xe...</option>
              {vehicles.map((v) => <option key={v.id} value={v.id}>{v.licensePlate} — {v.model}</option>)}
            </select>
            <button onClick={() => fetchFuelLogs()} className="p-2 rounded-lg" style={{ color: "var(--ibs-text-dim)" }}><RefreshCw size={15} /></button>
            {canManage && fuelVehicleId && (
              <button onClick={() => setShowNewFuel(true)} className="flex items-center gap-1.5 text-[13px] px-3 py-2 rounded-lg font-semibold ml-auto" style={{ background: "var(--ibs-accent)", color: "#fff" }}>
                <Plus size={14} /> Nhập nhiên liệu
              </button>
            )}
          </div>
          {fuelMeta && fuelLogs.length > 0 && (
            <div className="grid grid-cols-2 gap-4 px-5 py-4 border-b" style={{ borderColor: "var(--ibs-border)" }}>
              <div><div className="text-[11px]" style={{ color: "var(--ibs-text-dim)" }}>Tổng lít</div><div className="text-[22px] font-bold" style={{ color: "var(--ibs-accent)" }}>{fuelMeta.totalLiters.toFixed(1)} L</div></div>
              <div><div className="text-[11px]" style={{ color: "var(--ibs-text-dim)" }}>Tổng chi phí</div><div className="text-[22px] font-bold" style={{ color: "var(--ibs-warning)" }}>{fuelMeta.totalCost.toLocaleString("vi-VN")}đ</div></div>
            </div>
          )}
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b" style={{ borderColor: "var(--ibs-border)" }}>
                <th className="text-left px-5 py-2.5 text-[11px] font-semibold" style={{ color: "var(--ibs-text-dim)" }}>Ngày</th>
                <th className="text-left px-3 py-2.5 text-[11px] font-semibold" style={{ color: "var(--ibs-text-dim)" }}>Số lít</th>
                <th className="text-left px-3 py-2.5 text-[11px] font-semibold" style={{ color: "var(--ibs-text-dim)" }}>Chi phí (VND)</th>
                <th className="text-left px-3 py-2.5 text-[11px] font-semibold" style={{ color: "var(--ibs-text-dim)" }}>Odometer</th>
                <th className="text-left px-3 py-2.5 text-[11px] font-semibold" style={{ color: "var(--ibs-text-dim)" }}>Ghi chú</th>
              </tr>
            </thead>
            <tbody>
              {fuelLogs.map((f) => (
                <tr key={f.id} className="border-b last:border-0" style={{ borderColor: "var(--ibs-border)" }}>
                  <td className="px-5 py-2.5">{formatDate(f.date)}</td>
                  <td className="px-3 py-2.5">{f.liters.toFixed(1)} L</td>
                  <td className="px-3 py-2.5">{f.cost.toLocaleString("vi-VN")}đ</td>
                  <td className="px-3 py-2.5">{f.odometerKm.toLocaleString()} km</td>
                  <td className="px-3 py-2.5 text-[12px]" style={{ color: "var(--ibs-text-dim)" }}>{f.note || "—"}</td>
                </tr>
              ))}
              {fuelLogs.length === 0 && !fuelVehicleId && (
                <tr><td colSpan={5} className="px-5 py-12 text-center text-[13px]" style={{ color: "var(--ibs-text-dim)" }}>Chọn xe để xem lịch sử nhiên liệu</td></tr>
              )}
              {fuelLogs.length === 0 && fuelVehicleId && (
                <tr><td colSpan={5} className="px-5 py-12 text-center text-[13px]" style={{ color: "var(--ibs-text-dim)" }}>Chưa có dữ liệu nhiên liệu</td></tr>
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
              <option value="">Chọn xe...</option>
              {vehicles.map((v) => <option key={v.id} value={v.id}>{v.licensePlate} — {v.model}</option>)}
            </select>
            <button onClick={() => fetchMaintenance()} className="p-2 rounded-lg" style={{ color: "var(--ibs-text-dim)" }}><RefreshCw size={15} /></button>
            {canManage && maintenanceVehicleId && (
              <button onClick={() => setShowNewMaintenance(true)} className="flex items-center gap-1.5 text-[13px] px-3 py-2 rounded-lg font-semibold ml-auto" style={{ background: "var(--ibs-accent)", color: "#fff" }}>
                <Plus size={14} /> Thêm bảo trì
              </button>
            )}
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
                <th className="text-left px-5 py-2.5 text-[11px] font-semibold" style={{ color: "var(--ibs-text-dim)" }}>Loại</th>
                <th className="text-left px-3 py-2.5 text-[11px] font-semibold" style={{ color: "var(--ibs-text-dim)" }}>Mô tả</th>
                <th className="text-left px-3 py-2.5 text-[11px] font-semibold" style={{ color: "var(--ibs-text-dim)" }}>Chi phí (VND)</th>
                <th className="text-left px-3 py-2.5 text-[11px] font-semibold" style={{ color: "var(--ibs-text-dim)" }}>Bắt đầu</th>
                <th className="text-left px-3 py-2.5 text-[11px] font-semibold" style={{ color: "var(--ibs-text-dim)" }}>Kết thúc</th>
              </tr>
            </thead>
            <tbody>
              {maintenanceRecords.map((r) => (
                <tr key={r.id} className="border-b last:border-0" style={{ borderColor: "var(--ibs-border)" }}>
                  <td className="px-5 py-2.5 font-medium">{r.type}</td>
                  <td className="px-3 py-2.5 text-[12px]" style={{ color: "var(--ibs-text-dim)" }}>{r.description}</td>
                  <td className="px-3 py-2.5">{r.cost.toLocaleString("vi-VN")}đ</td>
                  <td className="px-3 py-2.5">{formatDate(r.startDate)}</td>
                  <td className="px-3 py-2.5">{r.endDate ? formatDate(r.endDate) : <span style={{ color: "var(--ibs-warning)" }}>Đang bảo trì</span>}</td>
                </tr>
              ))}
              {maintenanceRecords.length === 0 && !maintenanceVehicleId && (
                <tr><td colSpan={5} className="px-5 py-12 text-center text-[13px]" style={{ color: "var(--ibs-text-dim)" }}>Chọn xe để xem lịch sử bảo trì</td></tr>
              )}
              {maintenanceRecords.length === 0 && maintenanceVehicleId && (
                <tr><td colSpan={5} className="px-5 py-12 text-center text-[13px]" style={{ color: "var(--ibs-text-dim)" }}>Chưa có dữ liệu bảo trì</td></tr>
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
      {showNewFuel && fuelVehicleId && (
        <NewFuelModal vehicleId={fuelVehicleId} onClose={() => setShowNewFuel(false)}
          onSuccess={() => { setShowNewFuel(false); fetchFuelLogs(); }} />
      )}
      {showNewMaintenance && maintenanceVehicleId && (
        <NewMaintenanceModal vehicleId={maintenanceVehicleId} onClose={() => setShowNewMaintenance(false)}
          onSuccess={() => { setShowNewMaintenance(false); fetchMaintenance(); }} />
      )}
    </div>
  );
}

function NewFuelModal({ vehicleId, onClose, onSuccess }: { vehicleId: string; onClose: () => void; onSuccess: () => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({ date: today, liters: "", cost: "", odometerKm: "", note: "" });
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setSaving(true);
    await fetch(`/api/v1/vehicles/${vehicleId}/fuel`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: form.date, liters: parseFloat(form.liters),
        cost: parseInt(form.cost), odometerKm: parseInt(form.odometerKm),
        note: form.note || null,
      }),
    });
    setSaving(false); onSuccess();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="rounded-2xl w-full max-w-sm mx-4 p-6" style={{ background: "var(--ibs-bg-card)", border: "1px solid var(--ibs-border)" }}>
        <div className="flex items-center justify-between mb-5"><div className="text-[16px] font-bold">Nhập nhiên liệu</div><button onClick={onClose}><X size={18} /></button></div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div>
            <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Ngày</label>
            <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })}
              className="w-full rounded-lg px-3 py-2 text-[13px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Số lít *</label>
              <input required type="number" step="0.1" min="0" value={form.liters} onChange={(e) => setForm({ ...form, liters: e.target.value })}
                className="w-full rounded-lg px-3 py-2 text-[13px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }} />
            </div>
            <div>
              <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Chi phí (VND) *</label>
              <input required type="number" min="0" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })}
                className="w-full rounded-lg px-3 py-2 text-[13px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }} />
            </div>
          </div>
          <div>
            <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Odometer (km) *</label>
            <input required type="number" min="0" value={form.odometerKm} onChange={(e) => setForm({ ...form, odometerKm: e.target.value })}
              className="w-full rounded-lg px-3 py-2 text-[13px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }} />
          </div>
          <div>
            <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Ghi chú</label>
            <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })}
              className="w-full rounded-lg px-3 py-2 text-[13px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }} />
          </div>
          <div className="flex gap-2 justify-end mt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-[13px] border" style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-dim)" }}>Hủy</button>
            <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg text-[13px] font-semibold" style={{ background: "var(--ibs-accent)", color: "#fff" }}>{saving ? "Đang lưu..." : "Lưu"}</button>
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
            <input
              type="time" value={returnTime}
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
  const [form, setForm] = useState({
    vehicleId: "", destination: "", purpose: "", passengers: "1",
    startDatetime: now.toISOString().slice(0, 16),
    endDatetime: new Date(now.getTime() + 3600000).toISOString().slice(0, 16),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setSaving(true);
    const res = await fetch("/api/v1/vehicles/bookings", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, passengers: parseInt(form.passengers) }),
    });
    setSaving(false);
    if (res.ok) { onSuccess(); } else { const d = await res.json(); setError(d.error?.message || "Có lỗi xảy ra"); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="rounded-2xl w-full max-w-lg mx-4 p-6 max-h-[90vh] overflow-y-auto" style={{ background: "var(--ibs-bg-card)", border: "1px solid var(--ibs-border)" }}>
        <div className="flex items-center justify-between mb-5"><div className="text-[16px] font-bold">Đặt xe công tác</div><button onClick={onClose}><X size={18} /></button></div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div>
            <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Xe *</label>
            <select required value={form.vehicleId} onChange={(e) => setForm({ ...form, vehicleId: e.target.value })}
              className="w-full rounded-lg px-3 py-2 text-[13px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }}>
              <option value="">Chọn xe...</option>
              {vehicles.map((v) => <option key={v.id} value={v.id}>{v.licensePlate} — {v.model} ({v.seats} chỗ)</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Từ *</label>
              <input required type="datetime-local" value={form.startDatetime} onChange={(e) => setForm({ ...form, startDatetime: e.target.value })}
                className="w-full rounded-lg px-3 py-2 text-[13px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }} />
            </div>
            <div>
              <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Đến *</label>
              <input required type="datetime-local" value={form.endDatetime} onChange={(e) => setForm({ ...form, endDatetime: e.target.value })}
                className="w-full rounded-lg px-3 py-2 text-[13px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }} />
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

function NewMaintenanceModal({ vehicleId, onClose, onSuccess }: { vehicleId: string; onClose: () => void; onSuccess: () => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({ type: "", description: "", cost: "", startDate: today, endDate: "" });
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setSaving(true);
    await fetch(`/api/v1/vehicles/${vehicleId}/maintenance`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: form.type,
        description: form.description,
        cost: parseInt(form.cost),
        startDate: form.startDate,
        endDate: form.endDate || null,
      }),
    });
    setSaving(false); onSuccess();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="rounded-2xl w-full max-w-sm mx-4 p-6" style={{ background: "var(--ibs-bg-card)", border: "1px solid var(--ibs-border)" }}>
        <div className="flex items-center justify-between mb-5">
          <div className="text-[16px] font-bold">Thêm bảo trì</div>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div>
            <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Loại bảo trì *</label>
            <input required value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}
              placeholder="Thay dầu, Thay lốp, Sửa chữa lớn..."
              className="w-full rounded-lg px-3 py-2 text-[13px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }} />
          </div>
          <div>
            <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Mô tả *</label>
            <textarea required value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={2} className="w-full rounded-lg px-3 py-2 text-[13px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }} />
          </div>
          <div>
            <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Chi phí (VND) *</label>
            <input required type="number" min="0" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })}
              className="w-full rounded-lg px-3 py-2 text-[13px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Ngày bắt đầu *</label>
              <input required type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                className="w-full rounded-lg px-3 py-2 text-[13px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }} />
            </div>
            <div>
              <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Ngày kết thúc</label>
              <input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                className="w-full rounded-lg px-3 py-2 text-[13px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }} />
            </div>
          </div>
          <div className="flex gap-2 justify-end mt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-[13px] border" style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-dim)" }}>Hủy</button>
            <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg text-[13px] font-semibold" style={{ background: "var(--ibs-accent)", color: "#fff" }}>{saving ? "Đang lưu..." : "Lưu"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
