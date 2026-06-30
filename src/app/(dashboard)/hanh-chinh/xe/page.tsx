"use client";

import { useState, useEffect } from "react";
import { PageTitle } from "@/components/layout/page-title";
import { DataTable, Column } from "@/components/shared/data-table";
import { formatDate, formatDateTime, apiError } from "@/lib/utils";
import { viewUrl } from "@/lib/use-presigned-url";
import { Plus, RefreshCw, X, Check, XCircle, Car, Droplets, Wrench, Download } from "lucide-react";
import Link from "next/link";
import { MonthCalendar } from "@/components/shared/month-calendar";
import { DateInput, TimeInput } from "@/components/shared/date-input";
import { canApproveRoomVehicle } from "@/lib/access";
import { VEHICLE_DRIVERS } from "@/lib/constants";
import { alertDialog } from "@/lib/confirm-dialog";

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
  seats: number; driverName?: string; status: string; owner?: string;
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
  origin?: string | null; destination: string; purpose: string; passengers: number; status: string;
  approvedAt?: string; actualKm?: number; returnTime?: string; notes?: string; seriesId?: string | null;
  driverName?: string | null; priority?: string;
  vehicle: { licensePlate: string; model: string };
  requester: { id?: string; code: string; fullName: string; department: { name: string } };
};
// Chuyến của lái xe (tab "Chuyến của tôi") — từ /api/v1/vehicles/my-trips.
type MyTrip = {
  id: string; startDate: string; endDate: string; origin?: string | null; destination: string;
  purpose: string; passengers: number; status: string; priority?: string; returnTime?: string | null;
  odoStart?: number | null; odoEnd?: number | null; actualKm?: number | null; completedAt?: string | null; seriesId?: string | null;
  vehicle: { licensePlate: string; model: string; currentMileage: number };
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
const VEHICLE_PRIORITY: { value: string; label: string; color: string }[] = [
  { value: "NONE", label: "Không", color: "#6b7280" },
  { value: "NORMAL", label: "Bình thường", color: "var(--ibs-accent)" },
  { value: "PRIORITY", label: "Ưu tiên", color: "var(--ibs-danger)" },
];
const VEHICLE_PRIORITY_LABEL: Record<string, string> = Object.fromEntries(VEHICLE_PRIORITY.map((p) => [p.value, p.label]));

// Tải Excel từ 1 endpoint export trả {title, columns, rows}.
async function downloadExportExcel(url: string, sheetName: string, filename: string) {
  const res = await fetch(url);
  const json = await res.json();
  if (!res.ok) throw new Error(apiError(res.status, json?.error));
  const { title, columns, rows } = json.data as { title: string; columns: { header: string; key: string; width?: number }[]; rows: Record<string, unknown>[] };
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "IBS ONE Platform";
  wb.created = new Date();
  const ws = wb.addWorksheet(sheetName);
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
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

// Xuất Excel lịch sử đặt xe: gọi API export rồi dựng workbook tải về.
async function exportVehicleBookings(vehicleId: string, from: string, to: string) {
  const res = await fetch(`/api/v1/vehicles/bookings/export?vehicleId=${vehicleId}&from=${from}&to=${to}`);
  const json = await res.json();
  if (!res.ok) throw new Error(apiError(res.status, json?.error));
  const { title, columns, rows } = json.data as { title: string; columns: { header: string; key: string; width?: number }[]; rows: Record<string, unknown>[] };

  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "IBS ONE Platform";
  wb.created = new Date();
  const ws = wb.addWorksheet("Lịch sử đặt xe");

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
  a.download = `lich-su-dat-xe_${from}_${to}.xlsx`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function XePage() {
  const [tab, setTab] = useState<"bookings" | "fleet" | "fuel" | "maintenance" | "calendar" | "my-trips">("bookings");
  const [bookings, setBookings] = useState<VehicleBooking[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [fuelLogs, setFuelLogs] = useState<FuelLog[]>([]);
  const [fuelMeta, setFuelMeta] = useState<{ totalLiters: number; totalCost: number } | null>(null);
  const [fuelVehicleId, setFuelVehicleId] = useState("");
  const [fuelFrom, setFuelFrom] = useState("");
  const [fuelTo, setFuelTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState("");
  const [employeeCode, setEmployeeCode] = useState("");
  const [myEmployeeId, setMyEmployeeId] = useState<string | null>(null);
  const [showNewBooking, setShowNewBooking] = useState(false);
  const [assignTarget, setAssignTarget] = useState<VehicleBooking | null>(null);
  const [showExport, setShowExport] = useState(false);
  const [showNewVehicle, setShowNewVehicle] = useState(false);
  const [showNewFuel, setShowNewFuel] = useState(false);
  const [viewInvoice, setViewInvoice] = useState<string | null>(null);
  const [maintenanceRecords, setMaintenanceRecords] = useState<MaintenanceRecord[]>([]);
  const [maintenanceMeta, setMaintenanceMeta] = useState<{ totalCost: number; count: number } | null>(null);
  const [maintenanceVehicleId, setMaintenanceVehicleId] = useState("");
  const [maintFrom, setMaintFrom] = useState("");
  const [maintTo, setMaintTo] = useState("");
  const [showNewMaintenance, setShowNewMaintenance] = useState(false);
  const [filterStatus, setFilterStatus] = useState("");
  const [filterVehicleId, setFilterVehicleId] = useState("");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [completingBooking, setCompletingBooking] = useState<VehicleBooking | null>(null);
  const [vehicleHistoryModal, setVehicleHistoryModal] = useState<Vehicle | null>(null);
  // Lái xe: tab "Chuyến của tôi"
  const [isDriver, setIsDriver] = useState(false);
  const [myTrips, setMyTrips] = useState<{ pending: MyTrip[]; completed: MyTrip[] }>({ pending: [], completed: [] });
  const [confirmTrip, setConfirmTrip] = useState<MyTrip | null>(null);

  function fetchMyTrips() {
    setLoading(true);
    fetch("/api/v1/vehicles/my-trips")
      .then((r) => r.json()).then((res) => setMyTrips({ pending: res.data?.pending || [], completed: res.data?.completed || [] }))
      .finally(() => setLoading(false));
  }

  function fetchBookings() {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterStatus) params.set("status", filterStatus);
    if (filterVehicleId) params.set("vehicleId", filterVehicleId);
    if (filterFrom) params.set("from", filterFrom);
    if (filterTo) params.set("to", filterTo);
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

  function fetchFuelLogs() {
    const params = new URLSearchParams();
    if (fuelVehicleId) params.set("vehicleId", fuelVehicleId);
    if (fuelFrom) params.set("from", fuelFrom);
    if (fuelTo) params.set("to", fuelTo);
    fetch(`/api/v1/fuel-logs?${params}`)
      .then((r) => r.json()).then((res) => { setFuelLogs(res.data || []); setFuelMeta(res.meta || null); });
  }

  function fetchMaintenance() {
    const params = new URLSearchParams();
    if (maintenanceVehicleId) params.set("vehicleId", maintenanceVehicleId);
    if (maintFrom) params.set("from", maintFrom);
    if (maintTo) params.set("to", maintTo);
    fetch(`/api/v1/maintenance-records?${params}`)
      .then((r) => r.json()).then((res) => { setMaintenanceRecords(res.data || []); setMaintenanceMeta(res.meta || null); });
  }

  useEffect(() => {
    fetch("/api/v1/me").then((r) => r.json()).then((res) => { setUserRole(res.role || ""); setEmployeeCode(res.employeeCode || ""); setMyEmployeeId(res.employeeId || null); setIsDriver(!!res.isDriver); });
    // Always fetch vehicles for fuel tab dropdown
    fetch("/api/v1/vehicles").then((r) => r.json()).then((res) => setVehicles(res.data || []));
  }, []);

  useEffect(() => {
    if (tab === "bookings") fetchBookings();
    else if (tab === "fleet") fetchVehicles();
    else if (tab === "my-trips") fetchMyTrips();
  }, [tab, filterStatus, filterVehicleId, filterFrom, filterTo]);

  useEffect(() => {
    fetchFuelLogs();
  }, [fuelVehicleId, fuelFrom, fuelTo]);

  useEffect(() => {
    fetchMaintenance();
  }, [maintenanceVehicleId, maintFrom, maintTo]);

  const canManage = userRole === "HR_ADMIN" || userRole === "BOM" || userRole === "ADMIN" || userRole === "MANAGER";
  // Duyệt phiếu đặt xe: chỉ 3 NV được chỉ định (theo employeeCode), không theo role.
  const canApproveBooking = canApproveRoomVehicle(employeeCode, userRole);

  async function handleBookingAction(id: string, action: "APPROVE" | "REJECT", driverName?: string): Promise<boolean> {
    const res = await fetch(`/api/v1/vehicles/bookings/${id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...(driverName ? { driverName } : {}) }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => null);
      await alertDialog(apiError(res.status, j?.error) || "Thao tác thất bại");
      return false;
    }
    fetchBookings();
    return true;
  }
  async function approveSeries(seriesId: string) {
    const res = await fetch(`/api/v1/vehicles/bookings/series/${seriesId}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "APPROVE" }),
    });
    const j = await res.json().catch(() => null);
    if (!res.ok) { alert("Duyệt series thất bại: " + apiError(res.status, j?.error)); return; }
    const { approved, skipped, conflicts } = j.data || {};
    let msg = `Đã duyệt ${approved} phiếu.`;
    if (skipped > 0) {
      msg += `\n${skipped} phiếu conflict, giữ chờ duyệt:`;
      for (const c of (conflicts || []).slice(0, 5)) msg += `\n• ${c.date.split("-").reverse().join("/")} — trùng "${c.conflictDestination}"`;
    }
    alert(msg);
    fetchBookings();
  }
  async function cancelSeries(seriesId: string) {
    if (!confirm("Huỷ toàn bộ series? Mọi phiếu PENDING/APPROVED trong series sẽ huỷ.")) return;
    await fetch(`/api/v1/vehicles/bookings/series/${seriesId}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "CANCEL" }),
    });
    fetchBookings();
  }
  async function cancelOneBooking(id: string, hasSeries: boolean) {
    const msg = hasSeries
      ? "Huỷ phiếu này? (Các phiếu khác trong series giữ nguyên)"
      : "Huỷ phiếu đặt xe này?";
    if (!confirm(msg)) return;
    await fetch(`/api/v1/vehicles/bookings/${id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "CANCEL" }),
    });
    fetchBookings();
  }

  const pendingCount = bookings.filter((b) => b.status === "PENDING").length;
  const approvedCount = bookings.filter((b) => b.status === "APPROVED").length;

  // Gom series → 1 dòng tóm tắt. Mỗi seriesId chỉ giữ phiếu đầu tiên.
  // Tính daysOfWeek cho từng series từ các phiếu cùng seriesId.
  const seriesDays = (() => {
    const m: Record<string, Set<number>> = {};
    for (const b of bookings) {
      if (b.seriesId) {
        if (!m[b.seriesId]) m[b.seriesId] = new Set();
        m[b.seriesId].add(new Date(b.startDate).getDay());
      }
    }
    return m;
  })();
  const seriesStartEnd = (() => {
    const m: Record<string, { first: Date; last: Date; count: number }> = {};
    for (const b of bookings) {
      if (!b.seriesId) continue;
      const dt = new Date(b.startDate);
      const cur = m[b.seriesId];
      if (!cur) m[b.seriesId] = { first: dt, last: dt, count: 1 };
      else {
        if (dt < cur.first) cur.first = dt;
        if (dt > cur.last) cur.last = dt;
        cur.count++;
      }
    }
    return m;
  })();
  const displayBookings = (() => {
    const seen = new Set<string>();
    const result: VehicleBooking[] = [];
    for (const b of bookings) {
      if (b.seriesId) {
        if (seen.has(b.seriesId)) continue;
        seen.add(b.seriesId);
      }
      result.push(b);
    }
    return result;
  })();

  // Format thứ trong tuần: [1,3,5] → "T2, T4, T6"
  const DOW_LABELS = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
  function formatDaysOfWeek(days: number[]): string {
    return days.sort().map((d) => DOW_LABELS[d]).join(", ");
  }
  // Giờ HH:mm theo GIỜ VN (Asia/Ho_Chi_Minh) — không lệch theo múi giờ máy xem.
  function formatTimeHM(d: Date): string { return d.toLocaleTimeString("en-GB", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }); }
  // Ngày (theo giờ VN) để xác định buổi quá hạn.
  const vnDateStr = (d: string | Date) => new Date(d).toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
  const todayVNStr = vnDateStr(new Date());
  const availableVehicles = vehicles.filter((v) => v.status === "AVAILABLE").length;

  const bookingColumns: Column<VehicleBooking>[] = [
    { key: "requester", header: "Người đặt", render: (b) => (
      <div>
        <div className="font-semibold">{b.requester.fullName}</div>
        <div className="text-[11px]" style={{ color: "var(--ibs-text-dim)" }}>{b.requester.department.name}</div>
      </div>
    ) },
    { key: "type", header: "Loại", render: (b) => (
      b.seriesId
        ? <span className="text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap" style={{ background: "rgba(0,180,216,0.15)", color: "var(--ibs-accent)", border: "1px solid var(--ibs-accent)" }}>📅 Cố định</span>
        : <span className="text-[10px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap" style={{ background: "rgba(0,0,0,0.04)", color: "var(--ibs-text-dim)" }}>Lẻ</span>
    ) },
    { key: "vehicle", header: "Xe", render: (b) => <div><div className="font-mono font-semibold">{b.vehicle.licensePlate}</div><div className="text-[11px]" style={{ color: "var(--ibs-text-dim)" }}>{b.vehicle.model}</div>{b.driverName && <div className="text-[11px] mt-0.5" style={{ color: "var(--ibs-accent)" }}>🚗 LX: {b.driverName}</div>}</div> },
    { key: "time", header: "Thời gian", render: (b) => {
      if (b.seriesId) {
        const days = Array.from(seriesDays[b.seriesId] || []);
        const range = seriesStartEnd[b.seriesId];
        const st = new Date(b.startDate);
        const et = new Date(b.endDate);
        const dur = `${formatTimeHM(st)} → ${formatTimeHM(et)}`;
        return (
          <div className="text-[12px]">
            <div className="font-semibold">{dur}</div>
            <div className="text-[11px]" style={{ color: "var(--ibs-text-dim)" }}>
              {formatDaysOfWeek(days)} hàng tuần
            </div>
            {range && <div className="text-[10px]" style={{ color: "var(--ibs-text-dim)" }}>
              {range.first.toLocaleDateString("vi-VN")} → {range.last.toLocaleDateString("vi-VN")} · {range.count} phiếu
            </div>}
          </div>
        );
      }
      return (
        <div className="text-[12px]">
          <div>{formatDateTime(b.startDate)}</div>
          <div className="text-[11px]" style={{ color: "var(--ibs-text-dim)" }}>→ {formatDateTime(b.endDate)}</div>
        </div>
      );
    } },
    { key: "destination", header: "Hành trình", render: (b) => {
      const pr = VEHICLE_PRIORITY.find((p) => p.value === b.priority);
      return (
        <div>
          <div>{b.origin ? `${b.origin} → ` : ""}{b.destination}</div>
          <div className="text-[11px] flex items-center gap-1.5" style={{ color: "var(--ibs-text-dim)" }}>
            <span>{VEHICLE_PURPOSE_LABELS[b.purpose] ?? b.purpose}</span>
            {pr && b.priority !== "NORMAL" && <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold" style={{ background: `${pr.color}20`, color: pr.color }}>{pr.label}</span>}
          </div>
        </div>
      );
    } },
    { key: "passengers", header: "Hành khách", render: (b) => <span className="text-[12px]">{b.passengers} người</span> },
    { key: "status", header: "Trạng thái", render: (b) => {
      const s = BOOKING_STATUS[b.status] || { label: b.status, color: "#6b7280" };
      return <span className="text-[11px] font-semibold px-2 py-0.5 rounded-lg" style={{ background: `${s.color}20`, color: s.color }}>{s.label}</span>;
    }},
    { key: "actions", header: "", render: (b) => {
      const isOwner = !!myEmployeeId && b.requester?.id === myEmployeeId;
      const canCancel = (isOwner || canApproveBooking) && (b.status === "PENDING" || b.status === "APPROVED");
      return (
      <div className="flex gap-1 flex-wrap">
        {/* Duyệt cả series — chỉ 3 approver, phiếu PENDING có seriesId */}
        {canApproveBooking && b.status === "PENDING" && b.seriesId && (
          <button onClick={() => approveSeries(b.seriesId!)} className="text-[11px] px-2 py-0.5 rounded flex items-center gap-1" style={{ background: "rgba(0,180,216,0.15)", color: "var(--ibs-accent)" }} title="Duyệt cả series">
            <Check size={11} /> Duyệt series
          </button>
        )}
        {/* Người duyệt: Chỉ định lái xe → duyệt, hoặc Từ chối lịch (phiếu lẻ) */}
        {canApproveBooking && b.status === "PENDING" && !b.seriesId && (<>
          <button onClick={() => setAssignTarget(b)} className="text-[11px] px-2 py-0.5 rounded flex items-center gap-1" style={{ background: "rgba(34,197,94,0.15)", color: "var(--ibs-success)" }}><Check size={11} /> Chỉ định</button>
          <button onClick={async () => { if (!confirm("Từ chối lịch đặt xe này?")) return; handleBookingAction(b.id, "REJECT"); }} className="text-[11px] px-2 py-0.5 rounded flex items-center gap-1" style={{ background: "rgba(239,68,68,0.15)", color: "var(--ibs-danger)" }}><XCircle size={11} /> Từ chối</button>
        </>)}
        {/* Huỷ phiếu lẻ — dành cho CHỦ ĐƠN đổi ý (không phải người duyệt) */}
        {isOwner && (b.status === "PENDING" || b.status === "APPROVED") && !b.seriesId && (
          <button onClick={() => cancelOneBooking(b.id, false)} className="text-[11px] px-2 py-0.5 rounded flex items-center gap-1" style={{ background: "rgba(239,68,68,0.15)", color: "var(--ibs-danger)" }}>
            <X size={11} /> Huỷ
          </button>
        )}
        {/* Huỷ cả series */}
        {canCancel && b.seriesId && (
          <button onClick={() => cancelSeries(b.seriesId!)} className="text-[11px] px-2 py-0.5 rounded flex items-center gap-1" style={{ background: "rgba(239,68,68,0.15)", color: "var(--ibs-danger)" }} title="Huỷ cả series (mọi phiếu trong lịch cố định)">
            <X size={11} /> Huỷ series
          </button>
        )}
        {b.status === "COMPLETED" && b.actualKm != null && (
          <span className="text-[11px]" style={{ color: "var(--ibs-text-dim)" }}>{b.actualKm} km</span>
        )}
      </div>
      );
    } },
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
        {(["bookings", "calendar", "fleet", "fuel", "maintenance", "my-trips"] as const).filter((t) => t !== "my-trips" || isDriver).map((t) => (
          <button key={t} onClick={() => setTab(t)} className="text-[13px] px-4 py-1.5 rounded-lg font-medium transition-colors"
            style={{ background: tab === t ? "var(--ibs-accent)" : "transparent", color: tab === t ? "#fff" : "var(--ibs-text-dim)" }}>
            {t === "bookings" ? "Đặt xe" : t === "calendar" ? "Lịch" : t === "fleet" ? "Đội xe" : t === "fuel" ? "Nhiên liệu" : t === "maintenance" ? "Bảo trì" : "Chuyến của tôi"}
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
              <select value={filterVehicleId} onChange={(e) => setFilterVehicleId(e.target.value)}
                className="rounded-lg px-3 py-1.5 text-[12px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }}>
                <option value="">Tất cả xe</option>
                {vehicles.map((v) => <option key={v.id} value={v.id}>{v.licensePlate}</option>)}
              </select>
              <div className="flex items-center gap-1.5">
                <span className="text-[12px]" style={{ color: "var(--ibs-text-dim)" }}>Từ</span>
                <DateInput value={filterFrom} max={filterTo || undefined} onChange={(e) => setFilterFrom(e.target.value)}
                  className="rounded-lg px-2 py-1.5 text-[12px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }} />
                <span className="text-[12px]" style={{ color: "var(--ibs-text-dim)" }}>đến</span>
                <DateInput value={filterTo} min={filterFrom || undefined} onChange={(e) => setFilterTo(e.target.value)}
                  className="rounded-lg px-2 py-1.5 text-[12px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }} />
              </div>
              {(filterStatus || filterVehicleId || filterFrom || filterTo) && (
                <button onClick={() => { setFilterStatus(""); setFilterVehicleId(""); setFilterFrom(""); setFilterTo(""); }} className="text-[12px]" style={{ color: "var(--ibs-accent)" }}>Xóa lọc</button>
              )}
              <button onClick={fetchBookings} className="p-2 rounded-lg" style={{ color: "var(--ibs-text-dim)" }}><RefreshCw size={15} /></button>
              <button onClick={() => setShowExport(true)} className="flex items-center gap-1.5 text-[13px] px-3 py-2 rounded-lg font-semibold border ml-auto" style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text)", background: "var(--ibs-bg)" }}>
                <Download size={14} /> Export
              </button>
              <button onClick={() => setShowNewBooking(true)} className="flex items-center gap-1.5 text-[13px] px-3 py-2 rounded-lg font-semibold" style={{ background: "var(--ibs-accent)", color: "#fff" }}>
                <Plus size={14} /> Đặt xe
              </button>
            </div>
            <DataTable columns={bookingColumns} data={displayBookings} loading={loading} emptyText="Chưa có lịch đặt xe" />
          </div>
        </div>
      )}

      {tab === "calendar" && (
        <MonthCalendar
          events={bookings
            .filter((b) => b.status === "APPROVED" || b.status === "COMPLETED" || b.status === "PENDING")
            .map((b) => ({
              date: b.startDate,
              label: `${b.seriesId ? "📅 " : ""}${b.vehicle.licensePlate} — ${b.requester.fullName} → ${b.destination}${b.driverName ? ` · 🚗 LX: ${b.driverName}` : ""}${b.status === "PENDING" ? " (chờ duyệt)" : ""}`,
              color: BOOKING_STATUS[b.status]?.color,
            }))}
          onDayClick={(dateStr, evs) => void alertDialog({ title: dateStr, message: (<div className="space-y-1">{evs.map((e, i) => (<div key={i}>{e.label}</div>))}</div>) })}
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
                  </div>
                  {v.owner && <div className="text-[11px] mt-1" style={{ color: "var(--ibs-text-dim)" }}>Chủ sở hữu: <span style={{ color: "var(--ibs-text)" }}>{v.owner}</span></div>}
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
            <div className="flex items-center gap-1.5">
              <span className="text-[12px]" style={{ color: "var(--ibs-text-dim)" }}>Từ</span>
              <DateInput value={fuelFrom} max={fuelTo || undefined} onChange={(e) => setFuelFrom(e.target.value)} className="rounded-lg px-2 py-1.5 text-[12px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }} />
              <span className="text-[12px]" style={{ color: "var(--ibs-text-dim)" }}>đến</span>
              <DateInput value={fuelTo} min={fuelFrom || undefined} onChange={(e) => setFuelTo(e.target.value)} className="rounded-lg px-2 py-1.5 text-[12px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }} />
            </div>
            {(fuelVehicleId || fuelFrom || fuelTo) && (
              <button onClick={() => { setFuelVehicleId(""); setFuelFrom(""); setFuelTo(""); }} className="text-[12px]" style={{ color: "var(--ibs-accent)" }}>Xóa lọc</button>
            )}
            <button onClick={() => fetchFuelLogs()} className="p-2 rounded-lg" style={{ color: "var(--ibs-text-dim)" }}><RefreshCw size={15} /></button>
            <button onClick={() => downloadExportExcel(`/api/v1/fuel-logs/export?vehicleId=${fuelVehicleId}&from=${fuelFrom}&to=${fuelTo}`, "Nhiên liệu", "lich-su-nhien-lieu.xlsx").catch((e) => alertDialog(e?.message || "Export lỗi"))}
              className="flex items-center gap-1.5 text-[13px] px-3 py-2 rounded-lg font-semibold border ml-auto" style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text)", background: "var(--ibs-bg)" }}>
              <Download size={14} /> Export
            </button>
            <button onClick={() => setShowNewFuel(true)} className="flex items-center gap-1.5 text-[13px] px-3 py-2 rounded-lg font-semibold" style={{ background: "var(--ibs-accent)", color: "#fff" }}>
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
            <div className="flex items-center gap-1.5">
              <span className="text-[12px]" style={{ color: "var(--ibs-text-dim)" }}>Từ</span>
              <DateInput value={maintFrom} max={maintTo || undefined} onChange={(e) => setMaintFrom(e.target.value)} className="rounded-lg px-2 py-1.5 text-[12px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }} />
              <span className="text-[12px]" style={{ color: "var(--ibs-text-dim)" }}>đến</span>
              <DateInput value={maintTo} min={maintFrom || undefined} onChange={(e) => setMaintTo(e.target.value)} className="rounded-lg px-2 py-1.5 text-[12px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }} />
            </div>
            {(maintenanceVehicleId || maintFrom || maintTo) && (
              <button onClick={() => { setMaintenanceVehicleId(""); setMaintFrom(""); setMaintTo(""); }} className="text-[12px]" style={{ color: "var(--ibs-accent)" }}>Xóa lọc</button>
            )}
            <button onClick={() => fetchMaintenance()} className="p-2 rounded-lg" style={{ color: "var(--ibs-text-dim)" }}><RefreshCw size={15} /></button>
            <button onClick={() => downloadExportExcel(`/api/v1/maintenance-records/export?vehicleId=${maintenanceVehicleId}&from=${maintFrom}&to=${maintTo}`, "Bảo trì", "lich-su-bao-tri.xlsx").catch((e) => alertDialog(e?.message || "Export lỗi"))}
              className="flex items-center gap-1.5 text-[13px] px-3 py-2 rounded-lg font-semibold border ml-auto" style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text)", background: "var(--ibs-bg)" }}>
              <Download size={14} /> Export
            </button>
            <button onClick={() => setShowNewMaintenance(true)} className="flex items-center gap-1.5 text-[13px] px-3 py-2 rounded-lg font-semibold" style={{ background: "var(--ibs-accent)", color: "#fff" }}>
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

      {tab === "my-trips" && (
        <div className="flex flex-col gap-5">
          {/* Chuyến CẦN XÁC NHẬN */}
          <div className="rounded-xl border" style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
            <div className="px-5 py-4 border-b text-[14px] font-semibold flex items-center gap-2" style={{ borderColor: "var(--ibs-border)" }}>
              🚗 Chuyến cần xác nhận
              <span className="text-[12px] px-2 py-0.5 rounded-full font-semibold" style={{ background: "rgba(239,68,68,0.12)", color: "var(--ibs-danger)" }}>{myTrips.pending.length}</span>
            </div>
            {myTrips.pending.length === 0 ? (
              <div className="px-5 py-10 text-center text-[13px]" style={{ color: "var(--ibs-text-dim)" }}>Không có chuyến nào cần xác nhận.</div>
            ) : myTrips.pending.map((t) => {
              const overdue = vnDateStr(t.startDate) < todayVNStr;
              return (
                <div key={t.id} className="px-5 py-3 border-b last:border-0 flex items-center justify-between gap-4 flex-wrap" style={{ borderColor: "var(--ibs-border)" }}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold">{formatDate(t.startDate)}</span>
                      <span className="text-[12px]" style={{ color: "var(--ibs-text-dim)" }}>{formatTimeHM(new Date(t.startDate))} → {formatTimeHM(new Date(t.endDate))}</span>
                      {overdue && <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold" style={{ background: "rgba(245,158,11,0.15)", color: "var(--ibs-warning)" }}>Quá hạn</span>}
                      {t.seriesId && <span className="text-[11px]" style={{ color: "var(--ibs-text-dim)" }}>📅 Lịch cố định</span>}
                    </div>
                    <div className="text-[13px] mt-0.5">{t.origin || "Trụ sở Công ty"} → <span className="font-medium">{t.destination}</span></div>
                    <div className="text-[11px] mt-0.5" style={{ color: "var(--ibs-text-dim)" }}>{t.vehicle.licensePlate} · {t.vehicle.model} · {t.passengers} khách</div>
                  </div>
                  <button onClick={() => setConfirmTrip(t)} className="text-[13px] px-4 py-2 rounded-lg font-semibold text-white whitespace-nowrap" style={{ background: "var(--ibs-danger)" }}>
                    Xác nhận hoàn thành
                  </button>
                </div>
              );
            })}
          </div>
          {/* Chuyến ĐÃ HOÀN THÀNH */}
          <div className="rounded-xl border" style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
            <div className="px-5 py-4 border-b text-[14px] font-semibold" style={{ borderColor: "var(--ibs-border)" }}>✅ Đã hoàn thành</div>
            {myTrips.completed.length === 0 ? (
              <div className="px-5 py-10 text-center text-[13px]" style={{ color: "var(--ibs-text-dim)" }}>Chưa có chuyến đã hoàn thành.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b" style={{ borderColor: "var(--ibs-border)" }}>
                      <th className="text-left px-5 py-2.5 text-[11px] font-semibold" style={{ color: "var(--ibs-text-dim)" }}>NGÀY</th>
                      <th className="text-left px-3 py-2.5 text-[11px] font-semibold" style={{ color: "var(--ibs-text-dim)" }}>HÀNH TRÌNH</th>
                      <th className="text-left px-3 py-2.5 text-[11px] font-semibold" style={{ color: "var(--ibs-text-dim)" }}>XE</th>
                      <th className="text-right px-3 py-2.5 text-[11px] font-semibold" style={{ color: "var(--ibs-text-dim)" }}>ODO ĐI → VỀ</th>
                      <th className="text-right px-5 py-2.5 text-[11px] font-semibold" style={{ color: "var(--ibs-text-dim)" }}>SỐ KM</th>
                    </tr>
                  </thead>
                  <tbody>
                    {myTrips.completed.map((t) => (
                      <tr key={t.id} className="border-b last:border-0" style={{ borderColor: "var(--ibs-border)" }}>
                        <td className="px-5 py-2.5">{formatDate(t.startDate)}</td>
                        <td className="px-3 py-2.5">{t.origin || "Trụ sở"} → {t.destination}</td>
                        <td className="px-3 py-2.5 font-mono text-[12px]">{t.vehicle.licensePlate}</td>
                        <td className="px-3 py-2.5 text-right">{t.odoStart?.toLocaleString("vi-VN")} → {t.odoEnd?.toLocaleString("vi-VN")}</td>
                        <td className="px-5 py-2.5 text-right font-semibold">{(t.actualKm ?? 0).toLocaleString("vi-VN")} km</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {confirmTrip && (
        <DriverConfirmModal trip={confirmTrip}
          onClose={() => setConfirmTrip(null)}
          onSuccess={() => { setConfirmTrip(null); fetchMyTrips(); }} />
      )}

      {showNewBooking && (
        <NewBookingModal vehicles={vehicles.filter((v) => v.status === "AVAILABLE")}
          onClose={() => setShowNewBooking(false)}
          onSuccess={() => { setShowNewBooking(false); fetchBookings(); }} />
      )}
      {assignTarget && (
        <AssignDriverModal booking={assignTarget}
          onClose={() => setAssignTarget(null)}
          onApprove={async (driver) => { const ok = await handleBookingAction(assignTarget.id, "APPROVE", driver); if (ok) setAssignTarget(null); }} />
      )}
      {showExport && <ExportVehicleBookingsModal onClose={() => setShowExport(false)} />}
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
            <a href={viewUrl(url)} target="_blank" rel="noreferrer"
              className="text-[12px] px-3 py-1 rounded-lg"
              style={{ background: "rgba(0,180,216,0.12)", color: "var(--ibs-accent)" }}>
              Mở tab mới
            </a>
            <button onClick={onClose} style={{ color: "var(--ibs-text-dim)" }}><X size={18} /></button>
          </div>
        </div>
        <div className="overflow-auto flex-1 flex items-center justify-center p-4" style={{ background: "#111" }}>
          {isPdf ? (
            <iframe src={viewUrl(url)} className="w-full" style={{ height: "70vh", border: "none" }} />
          ) : (
            <img src={viewUrl(url)} alt="Hóa đơn" className="max-w-full max-h-[70vh] object-contain rounded-lg" />
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
    if (res.ok) { onSuccess(); } else { const d = await res.json(); setError(apiError(res.status, d.error)); }
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
  // Snap về mốc 30 phút gần nhất (giống form đặt xe).
  const _snap = (() => {
    const n = new Date();
    const pad2 = (x: number) => String(x).padStart(2, "0");
    const m = Math.ceil(n.getMinutes() / 30) * 30;
    const h = (n.getHours() + Math.floor(m / 60)) % 24;
    return `${pad2(h)}:${pad2(m % 60)}`;
  })();
  const [returnTime, setReturnTime] = useState(_snap);
  // 48 slot 30 phút (00:00 → 23:30)
  const _COMPLETE_TIME_SLOTS = (() => {
    const slots: string[] = [];
    for (let h = 0; h < 24; h++) for (let m = 0; m < 60; m += 30) slots.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    return slots;
  })();
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
      setError(apiError(res.status, data.error));
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
            <select
              value={returnTime}
              onChange={(e) => setReturnTime(e.target.value)}
              className="w-full rounded-lg px-3 py-2 text-[13px] border"
              style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }}
            >
              {_COMPLETE_TIME_SLOTS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
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

function AssignDriverModal({ booking, onClose, onApprove }: {
  booking: VehicleBooking; onClose: () => void; onApprove: (driver: string) => void | Promise<void>;
}) {
  const [driver, setDriver] = useState(booking.driverName || "");
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!driver) return;
    setSaving(true);
    try { await onApprove(driver); } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="rounded-2xl w-full max-w-sm mx-4 p-6" style={{ background: "var(--ibs-bg-card)", border: "1px solid var(--ibs-border)" }}>
        <div className="flex items-center justify-between mb-4">
          <div className="text-[16px] font-bold">Chỉ định lái xe</div>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <div className="text-[12px] mb-4 rounded-lg px-3 py-2" style={{ background: "var(--ibs-bg)", color: "var(--ibs-text-dim)" }}>
          <div><b style={{ color: "var(--ibs-text)" }}>{booking.vehicle.licensePlate}</b> · {booking.destination}</div>
          <div>{formatDateTime(booking.startDate)} → {formatDateTime(booking.endDate)}</div>
          <div>Người đặt: {booking.requester.fullName} ({booking.requester.department.name})</div>
        </div>
        <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Lái xe *</label>
        <select value={driver} onChange={(e) => setDriver(e.target.value)} className="w-full rounded-lg px-3 py-2 text-[13px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }}>
          <option value="">Chọn lái xe...</option>
          {VEHICLE_DRIVERS.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <div className="flex gap-2 justify-end mt-5">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-[13px] border" style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-dim)" }}>Hủy</button>
          <button type="button" onClick={submit} disabled={!driver || saving} className="px-4 py-2 rounded-lg text-[13px] font-semibold flex items-center gap-1" style={{ background: "var(--ibs-success)", color: "#fff", opacity: (!driver || saving) ? 0.5 : 1, cursor: (!driver || saving) ? "not-allowed" : "pointer" }}>
            <Check size={14} /> {saving ? "Đang duyệt..." : "Duyệt"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Modal LÁI XE xác nhận hoàn thành chuyến — bắt buộc nhập odo lúc đi + lúc về.
function DriverConfirmModal({ trip, onClose, onSuccess }: {
  trip: MyTrip; onClose: () => void; onSuccess: () => void;
}) {
  const [odoStart, setOdoStart] = useState("");
  const [odoEnd, setOdoEnd] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    if (odoStart.trim() === "" || odoEnd.trim() === "") { setError("Vui lòng nhập đầy đủ số odo lúc đi và lúc về."); return; }
    const s = parseInt(odoStart, 10), e = parseInt(odoEnd, 10);
    if (!Number.isFinite(s) || !Number.isFinite(e) || s < 0 || e < 0) { setError("Số odo không hợp lệ."); return; }
    if (e <= s) { setError("Odo lúc về phải lớn hơn odo lúc đi."); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/v1/vehicles/bookings/${trip.id}/complete-trip`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ odoStart: s, odoEnd: e }),
      });
      const json = await res.json();
      if (!res.ok) { setError(apiError(res.status, json?.error)); return; }
      if (json.warning) await alertDialog(json.warning);
      onSuccess();
    } catch { setError("Lỗi kết nối"); }
    finally { setSaving(false); }
  }

  const inputCls = "w-full rounded-lg px-3 py-2 text-[13px] border";
  const inputStyle = { background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" };
  const diff = odoStart !== "" && odoEnd !== "" ? parseInt(odoEnd, 10) - parseInt(odoStart, 10) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="rounded-2xl w-full max-w-sm mx-4 p-6" style={{ background: "var(--ibs-bg-card)", border: "1px solid var(--ibs-border)" }}>
        <div className="flex items-center justify-between mb-4">
          <div className="text-[16px] font-bold">Xác nhận hoàn thành chuyến</div>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <div className="text-[12px] mb-4 rounded-lg px-3 py-2 space-y-0.5" style={{ background: "var(--ibs-bg)", color: "var(--ibs-text-dim)" }}>
          <div><b style={{ color: "var(--ibs-text)" }}>{trip.vehicle.licensePlate}</b> · {trip.destination}</div>
          <div>{formatDate(trip.startDate)} · {trip.vehicle.model}</div>
          <div>Số km hiện tại của xe: <b style={{ color: "var(--ibs-text)" }}>{trip.vehicle.currentMileage.toLocaleString("vi-VN")} km</b></div>
        </div>
        <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Số odo lúc đi (km) *</label>
        <input type="number" inputMode="numeric" value={odoStart} onChange={(e) => setOdoStart(e.target.value)} placeholder="VD: 125000" className={inputCls} style={inputStyle} />
        <label className="text-[12px] font-medium mb-1 mt-3 block" style={{ color: "var(--ibs-text-dim)" }}>Số odo lúc về (km) *</label>
        <input type="number" inputMode="numeric" value={odoEnd} onChange={(e) => setOdoEnd(e.target.value)} placeholder="VD: 125042" className={inputCls} style={inputStyle} />
        {diff != null && diff > 0 && (
          <div className="text-[12px] mt-2" style={{ color: "var(--ibs-text-dim)" }}>Quãng đường: <b style={{ color: "var(--ibs-accent)" }}>{diff.toLocaleString("vi-VN")} km</b></div>
        )}
        {error && <div className="text-[12px] text-red-500 mt-2">{error}</div>}
        <div className="flex gap-2 justify-end mt-5">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-[13px] border" style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-dim)" }}>Hủy</button>
          <button type="button" onClick={submit} disabled={saving} className="px-4 py-2 rounded-lg text-[13px] font-semibold flex items-center gap-1 text-white" style={{ background: "var(--ibs-success)", opacity: saving ? 0.6 : 1 }}>
            <Check size={14} /> {saving ? "Đang lưu..." : "Xác nhận hoàn thành"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ExportVehicleBookingsModal({ onClose }: { onClose: () => void }) {
  const [vehicles, setVehicles] = useState<{ id: string; licensePlate: string; model: string }[]>([]);
  const today = new Date().toISOString().slice(0, 10);
  const [vehicleId, setVehicleId] = useState("");
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/v1/vehicles").then((r) => r.json()).then((res) => setVehicles(res.data || []));
  }, []);

  async function doExport() {
    setError("");
    if (from > to) { setError("Từ ngày phải ≤ Đến ngày"); return; }
    setBusy(true);
    try {
      await exportVehicleBookings(vehicleId, from, to);
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
          <div className="text-[16px] font-bold">Export lịch sử đặt xe</div>
          <button onClick={onClose} style={{ color: "var(--ibs-text-dim)" }}><X size={18} /></button>
        </div>
        <div className="flex flex-col gap-3">
          <div>
            <label className={lc} style={ls}>Xe</label>
            <select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} className={ic} style={is}>
              <option value="">Tất cả xe</option>
              {vehicles.map((v) => <option key={v.id} value={v.id}>{v.licensePlate} — {v.model}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lc} style={ls}>Từ ngày *</label>
              <DateInput value={from} max={to} onChange={(e) => setFrom(e.target.value)} className={ic} style={is} />
            </div>
            <div>
              <label className={lc} style={ls}>Đến ngày *</label>
              <DateInput value={to} min={from} onChange={(e) => setTo(e.target.value)} className={ic} style={is} />
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

function NewBookingModal({ vehicles, onClose, onSuccess }: { vehicles: Vehicle[]; onClose: () => void; onSuccess: () => void }) {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  // Snap về mốc 30 phút gần nhất.
  const snapMinutes = (mins: number) => Math.ceil(mins / 30) * 30;
  const startMins = now.getHours() * 60 + snapMinutes(now.getMinutes());
  const endMins = startMins + 30;
  const nowTime = `${pad(Math.floor(startMins / 60) % 24)}:${pad(startMins % 60)}`;
  const plusHour = `${pad(Math.floor(endMins / 60) % 24)}:${pad(endMins % 60)}`;

  // Sinh list slot 30 phút từ 00:00 → 23:30 (48 slot)
  const TIME_SLOTS = (() => {
    const slots: string[] = [];
    for (let h = 0; h < 24; h++) for (let m = 0; m < 60; m += 30) slots.push(`${pad(h)}:${pad(m)}`);
    return slots;
  })();

  const [form, setForm] = useState({
    vehicleId: "", origin: "Trụ sở Công ty", destination: "", purpose: "", passengers: "1", priority: "NORMAL",
    startDatePart: todayStr, startTimePart: nowTime,
    endDatePart: todayStr, endTimePart: plusHour,
  });
  const [recurrenceOn, setRecurrenceOn] = useState(false);
  const [recurrenceDays, setRecurrenceDays] = useState<number[]>([]);
  const [recurrenceUntil, setRecurrenceUntil] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function toggleRecurrence(on: boolean) {
    setRecurrenceOn(on);
    if (on && recurrenceDays.length === 0) {
      const dow = new Date(form.startDatePart).getDay();
      setRecurrenceDays([dow === 0 ? 1 : dow]);
    }
  }
  function toggleDay(d: number) {
    setRecurrenceDays((prev) => prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort());
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setSaving(true);
    // Gắn +07:00 để server LƯU đúng giờ VN bất kể múi giờ server/máy đặt (không lệch giữa các máy).
    const startDate = `${form.startDatePart}T${form.startTimePart}:00+07:00`;
    const endDate = `${form.endDatePart}T${form.endTimePart}:00+07:00`;
    // Ngày/giờ VỀ phải SAU ngày/giờ ĐI (chặn nhập ngược).
    if (new Date(endDate).getTime() <= new Date(startDate).getTime()) {
      setError("Ngày/giờ về phải sau ngày/giờ đi."); setSaving(false); return;
    }
    // Phải đặt trước tối thiểu 30 phút, không đặt giờ trong quá khứ.
    if (new Date(startDate).getTime() < Date.now() + 30 * 60_000) {
      setError("Phải đặt trước ít nhất 30 phút (không đặt giờ trong quá khứ)."); setSaving(false); return;
    }
    // Sanitize: chỉ giữ thứ 1..6 (KHÔNG cho CN=0)
    const cleanDays = recurrenceDays.filter((d) => d >= 1 && d <= 6);
    if (recurrenceOn) {
      if (cleanDays.length === 0) { setError("Chọn ít nhất 1 thứ trong tuần (T2–T7)"); setSaving(false); return; }
    }
    const res = await fetch("/api/v1/vehicles/bookings", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vehicleId: form.vehicleId, origin: form.origin, destination: form.destination,
        purpose: form.purpose, passengers: parseInt(form.passengers), priority: form.priority, startDate, endDate,
        ...(recurrenceOn ? { recurrence: { daysOfWeek: cleanDays, ...(recurrenceUntil ? { until: recurrenceUntil } : {}) } } : {}),
      }),
    });
    setSaving(false);
    if (res.ok) {
      const d = await res.json();
      if (recurrenceOn && d.data?.count) {
        alert(`Đã tạo ${d.data.count} phiếu (chờ duyệt). Approver có thể duyệt cả series 1 lần.`);
      }
      onSuccess();
    } else { const d = await res.json(); setError(apiError(res.status, d.error)); }
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
              <select required value={form.startTimePart} onChange={(e) => setForm({ ...form, startTimePart: e.target.value })}
                className={inputCls} style={inputStyle}>
                {TIME_SLOTS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
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
              <select required value={form.endTimePart} onChange={(e) => setForm({ ...form, endTimePart: e.target.value })}
                className={inputCls} style={inputStyle}>
                {TIME_SLOTS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Điểm đi *</label>
              <input required value={form.origin} onChange={(e) => setForm({ ...form, origin: e.target.value })}
                placeholder="Trụ sở Công ty"
                className="w-full rounded-lg px-3 py-2 text-[13px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }} />
            </div>
            <div>
              <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Điểm đến *</label>
              <input required value={form.destination} onChange={(e) => setForm({ ...form, destination: e.target.value })}
                className="w-full rounded-lg px-3 py-2 text-[13px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }} />
            </div>
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
          <div>
            <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Mức độ ưu tiên</label>
            <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}
              className="w-full rounded-lg px-3 py-2 text-[13px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }}>
              {VEHICLE_PRIORITY.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
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
                          className="px-2.5 py-1 rounded text-[12px] font-semibold border"
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
                      const dow = new Date(form.startDatePart).getDay();
                      setRecurrenceDays([dow === 0 ? 1 : dow]);
                    }} className="underline">Chỉ cùng thứ</button>
                  </div>
                </div>
                <div className="mt-3">
                  <label className="text-[11px] mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>
                    Lặp đến ngày <span style={{ color: "var(--ibs-text-dim)" }}>(để trống = lặp tối đa 365 ngày)</span>
                  </label>
                  <DateInput value={recurrenceUntil} onChange={(e) => setRecurrenceUntil(e.target.value)}
                    min={form.startDatePart}
                    className="w-full rounded-lg px-2 py-1.5 text-[12px] border"
                    style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }} />
                </div>
                <div className="mt-2 text-[10px] italic" style={{ color: "var(--ibs-warning)" }}>
                  ⚠️ Phiếu cần được duyệt trước khi sử dụng. Approver có thể duyệt cả series 1 lần.
                </div>
              </>
            )}
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
  const [form, setForm] = useState({ licensePlate: "", model: "", type: "CAR", seats: "5", owner: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setSaving(true);
    const res = await fetch("/api/v1/vehicles", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, seats: parseInt(form.seats) }),
    });
    setSaving(false);
    if (res.ok) { onSuccess(); } else { const d = await res.json(); setError(apiError(res.status, d.error)); }
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
          <div>
            <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Chủ sở hữu</label>
            <input value={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.value })}
              placeholder="VD: IBS HI / Lisemco / Địa Việt" className="w-full rounded-lg px-3 py-2 text-[13px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }} />
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
    if (res.ok) { onSuccess(); } else { const d = await res.json(); setError(apiError(res.status, d.error)); }
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
